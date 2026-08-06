# Agent Discovery and Listing Readiness

This file describes what helps top AI agents and MCP directories discover and list this server.

## Implemented files

- `server.json`: Canonical MCP metadata for the official MCP registry ecosystem.
- `glama.json`: Ownership and claiming metadata for Glama.
- `smithery.yaml`: Smithery project metadata.
- `llms.txt`: LLM-readable index for crawler-based inference tools.

## Why this matters

- Registry-based clients rely on structured metadata (`server.json`, registry-specific files).
- Search and browse agents rely heavily on clear README + topics + release history.
- LLM inference crawlers can consume `llms.txt` to locate high-signal docs quickly.

## Additional operational actions (outside code)

- Ensure GitHub topics include: `mcp`, `mcp-server`, `model-context-protocol`, `ai-tools`.
- Publish stable GitHub releases and keep changelog current.
- Keep CI green for trust signals.
- Submit/update listings in major directories when available.
