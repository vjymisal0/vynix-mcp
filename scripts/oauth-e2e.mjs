// End-to-end verification for the hosted MCP + OAuth 2.1 (PKCE) flow.
//
// Phase 1 (always): checks the public discovery documents and that the hosted MCP
// endpoint answers an `initialize` handshake. No credentials needed.
//
// Phase 2 (optional): runs the full Authorization Code + PKCE exchange the way a
// connector does, then proves the issued access token authenticates against the
// REST API. Enable it by passing a dashboard session JWT (the value the dashboard
// stores in localStorage as `vynix.token`) via VYNIX_SESSION_TOKEN.
//
// Usage:
//   node scripts/oauth-e2e.mjs                     # phase 1 against https://mcp.vynix.in
//   BASE=https://mcp.vynix.in node scripts/oauth-e2e.mjs
//   VYNIX_SESSION_TOKEN=<jwt> node scripts/oauth-e2e.mjs   # phase 1 + phase 2
//
// Env:
//   BASE                 OAuth + MCP origin (default https://mcp.vynix.in)
//   API                  REST API origin used for the token check (default: BASE)
//   VYNIX_SESSION_TOKEN  dashboard session JWT to authorize with (enables phase 2)
//   CLIENT_ID            OAuth client id to present (default vynix-chatgpt-mcp)
//   REDIRECT_URI         redirect URI to bind the code to (default a chatgpt.com URL)

import { createHash, randomBytes } from 'node:crypto';

const BASE = (process.env.BASE || 'https://mcp.vynix.in').replace(/\/+$/, '');
const API = (process.env.API || BASE).replace(/\/+$/, '');
const SESSION = process.env.VYNIX_SESSION_TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || 'vynix-chatgpt-mcp';
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://chatgpt.com/connector/oauth/e2e-test';

let pass = 0;
let fail = 0;
let registeredClientId = '';
function ok(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`${status}  ${label}${detail ? `  (${detail})` : ''}`);
  condition ? pass++ : fail++;
  return condition;
}
function info(label) {
  console.log(`....  ${label}`);
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* leave json null */
  }
  return { res, json, text };
}

async function phase1() {
  console.log(`\n=== Phase 1: discovery + reachability (${BASE}) ===`);

  const as = await getJson(`${BASE}/.well-known/oauth-authorization-server`);
  if (ok('oauth-authorization-server is valid JSON', as.res.ok && as.json !== null, `HTTP ${as.res.status}`)) {
    ok('  advertises token_endpoint', typeof as.json.token_endpoint === 'string');
    ok('  advertises authorization_endpoint', typeof as.json.authorization_endpoint === 'string');
    ok('  supports S256 PKCE', Array.isArray(as.json.code_challenge_methods_supported) && as.json.code_challenge_methods_supported.includes('S256'));
    ok('  does NOT advertise a jwks_uri (tokens are HS256)', as.json.jwks_uri === undefined);
  }

  const pr = await getJson(`${BASE}/.well-known/oauth-protected-resource`);
  if (ok('oauth-protected-resource is valid JSON', pr.res.ok && pr.json !== null, `HTTP ${pr.res.status}`)) {
    ok('  lists an authorization server', Array.isArray(pr.json.authorization_servers) && pr.json.authorization_servers.length > 0);
  }

  const card = await getJson(`${BASE}/.well-known/mcp/server-card.json`);
  ok('mcp/server-card.json is valid JSON', card.res.ok && card.json !== null, `HTTP ${card.res.status}`);

  // Dynamic Client Registration (RFC 7591): connectors like Claude/Gemini self-register.
  const reg = await fetch(`${BASE}/api/v1/mcp/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'oauth-e2e', token_endpoint_auth_method: 'none' }),
  });
  const regJson = await reg.json().catch(() => null);
  if (ok('Dynamic Client Registration issues a client_id', reg.status === 201 && typeof regJson?.client_id === 'string', `HTTP ${reg.status}`)) {
    registeredClientId = regJson.client_id;
    ok('  registered client is public (token_endpoint_auth_method none)', regJson.token_endpoint_auth_method === 'none');
  }

  // The hosted MCP endpoint should answer an initialize handshake (200), or challenge
  // with 401 if it enforces auth at the transport. Either is a healthy, reachable server.
  const init = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'oauth-e2e', version: '1' } },
    }),
  });
  ok('MCP endpoint answers initialize', init.status === 200 || init.status === 401, `HTTP ${init.status}`);
}

async function phase2() {
  console.log(`\n=== Phase 2: Authorization Code + PKCE exchange ===`);

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(8));

  // Prefer a dynamically registered client (proves the Claude/Gemini path); fall back to the
  // configured CLIENT_ID when DCR did not run or CLIENT_ID was overridden.
  const clientId = (CLIENT_ID !== 'vynix-chatgpt-mcp' ? CLIENT_ID : registeredClientId) || CLIENT_ID;
  info(`using client_id: ${clientId}`);

  // 1) Consent decision (what the browser authorize page POSTs once the user clicks Allow).
  const decisionRes = await fetch(`${BASE}/api/v1/mcp/oauth/authorize/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SESSION}` },
    body: JSON.stringify({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state,
      scope: 'mcp',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }),
  });
  const decision = await decisionRes.json().catch(() => null);
  if (!ok('authorize/decision returned a redirect', decisionRes.ok && decision?.data?.redirect_uri, `HTTP ${decisionRes.status}`)) {
    info(`response: ${JSON.stringify(decision)}`);
    return;
  }

  const target = new URL(decision.data.redirect_uri);
  const code = target.searchParams.get('code');
  ok('redirect carries state back unchanged', target.searchParams.get('state') === state);
  if (!ok('redirect carries an authorization code', Boolean(code))) {
    return;
  }

  // 2) Token exchange (form-encoded, PKCE verifier, no client secret).
  const tokenRes = await fetch(`${BASE}/api/v1/mcp/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  const token = await tokenRes.json().catch(() => null);
  if (!ok('token endpoint issued an access_token', tokenRes.ok && typeof token?.access_token === 'string', `HTTP ${tokenRes.status}`)) {
    info(`response: ${JSON.stringify(token)}`);
    return;
  }
  ok('token_type is Bearer', token.token_type === 'Bearer');
  ok('scope is mcp', token.scope === 'mcp');
  ok('expires_in is a positive number', typeof token.expires_in === 'number' && token.expires_in > 0);

  // 3) Replay protection: the one-time code must not be redeemable twice.
  const replay = await fetch(`${BASE}/api/v1/mcp/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT_URI }).toString(),
  });
  ok('authorization code cannot be reused', replay.status === 400, `HTTP ${replay.status}`);

  // 4) The issued token must authenticate against the REST API the MCP tools call.
  const projects = await fetch(`${API}/api/v1/projects`, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
  });
  ok('issued token authenticates against the API', projects.status === 200, `HTTP ${projects.status} at ${API}/api/v1/projects`);
}

await phase1();
if (SESSION) {
  await phase2();
} else {
  console.log('\n(Phase 2 skipped: set VYNIX_SESSION_TOKEN to run the full PKCE exchange.)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
