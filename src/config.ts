export interface VynixConfig {
  apiUrl: string;
  token?: string;
  email?: string;
  password?: string;
}

function normalizeApiUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid VYNIX_API_URL: "${rawUrl}". Expected a valid absolute URL such as https://www.vynix.in.`,
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Invalid VYNIX_API_URL protocol "${parsed.protocol}". Use http:// or https://.`,
    );
  }

  return parsed.toString().replace(/\/+$/, '');
}

/** Reads connection settings from the environment. */
export function loadConfig(): VynixConfig {
  const apiUrl = normalizeApiUrl(process.env.VYNIX_API_URL || 'https://www.vynix.in');

  return {
    apiUrl,
    token: process.env.VYNIX_API_TOKEN?.trim() || undefined,
    email: process.env.VYNIX_API_EMAIL?.trim() || undefined,
    password: process.env.VYNIX_API_PASSWORD || undefined,
  };
}

/**
 * Validate that credentials are present, throwing a clear, actionable error at startup
 * rather than failing on the first tool call. A token alone is enough; otherwise both an
 * email and a password are required for the login + refresh flow.
 */
export function assertConfigured(config: VynixConfig): void {
  const mode = (process.env.VYNIX_MCP_MODE || 'stdio').toLowerCase();
  if (mode === 'http' || mode === 'streamable-http') {
    return;
  }

  if (config.token) {
    return;
  }
  if (config.email && config.password) {
    return;
  }

  if (config.email && !config.password) {
    throw new Error('VYNIX_API_EMAIL is set but VYNIX_API_PASSWORD is missing. Set both values together.');
  }

  if (!config.email && config.password) {
    throw new Error('VYNIX_API_PASSWORD is set but VYNIX_API_EMAIL is missing. Set both values together.');
  }

  throw new Error(
    'Vynix MCP server is not configured. Set VYNIX_API_TOKEN, or both VYNIX_API_EMAIL and ' +
      'VYNIX_API_PASSWORD, in the server environment.',
  );
}
