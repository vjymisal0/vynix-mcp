# MCP Directory and Agent Listing Tracker

Updated: 2026-08-06

## Current status

- Glama: live and claimed.
- LobeHub Marketplace: live.
- MCP.so: live.
- Smithery: not listed yet.
- PulseMCP: not listed yet in search, but supports submit flow and official registry ingestion.

## Live listing links

- Glama: https://glama.ai/mcp/servers/UseVynix/vynix-mcp
- LobeHub: https://market.lobehub.com/s/plugins/vynix-in-vynix-mcp
- MCP.so: https://mcp.so/servers/vynix-mcp

## Submission links

- Smithery publish: https://smithery.ai/new
- Smithery docs: https://smithery.ai/docs/build/publish
- Pulse submit: https://www.pulsemcp.com/submit
- MCP.so submit: https://mcp.so/submit

## What we already implemented in this repo

- `server.json` with MCP registry metadata.
- `glama.json` maintainers configured for org and maintainer.
- `smithery.yaml` present for Smithery metadata.
- `llms.txt` at repo root for LLM-friendly discovery.
- Release tags and changelog updates.
- CI and CodeQL workflows active.

## Next actions for full coverage

1. Smithery listing
- Open https://smithery.ai/new
- Publish by URL using `https://mcp.vynix.in/mcp` or by local bundle flow.
- Complete verification in Smithery settings after publish.

2. PulseMCP listing
- Open https://www.pulsemcp.com/submit
- Submit server URL: https://github.com/UseVynix/vynix-mcp
- If metadata does not sync after one week, email hello@pulsemcp.com with server URL.

3. MCP Registry refresh
- Ensure latest `server.json` and release version are reflected in registry submission process.
- If needed, republish using MCP registry publisher workflow.

## Agent discovery notes (Gemini and other top agents)

There is no universal auto-listing switch for all top agents. Discovery generally comes from:

- Registry ingestion (MCP ecosystem directories).
- Structured metadata files (`server.json`, provider-specific files).
- Repository quality signals (releases, CI health, issue activity, docs depth).
- LLM-friendly index files (`llms.txt`) for crawler-based inference tools.

This repository now includes all major file-level signals that are commonly required.
