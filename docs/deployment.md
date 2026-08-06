# Deployment

## Stdio deployment

Best for local editor MCP clients.

- command: `npx -y @usevynix/mcp-server`
- mode: default (`VYNIX_MCP_MODE=stdio`)

## Self-hosted Streamable HTTP

Set:

- `VYNIX_MCP_MODE=http`
- `VYNIX_MCP_HOST=0.0.0.0`
- `VYNIX_MCP_PORT=8787`
- `VYNIX_MCP_PATH=/mcp`

Run:

```bash
node dist/index.js
```

Health endpoint:

- `GET /health`

## Docker self-hosted example

```bash
docker build -t vynix-mcp:local .
docker run --rm -p 8787:8787 \
  -e VYNIX_MCP_MODE=http \
  -e VYNIX_MCP_HOST=0.0.0.0 \
  -e VYNIX_MCP_PORT=8787 \
  -e VYNIX_API_TOKEN=PASTE_YOUR_TOKEN_HERE \
  vynix-mcp:local
```
