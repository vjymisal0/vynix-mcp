# Changelog

## 0.1.4

- Registered in the official MCP Registry as `in.vynix/vynix-mcp` (DNS-verified).
- Added `server.json` and an `mcpName` field for registry ownership verification.
- Corrected the repository and bugs URLs to `github.com/UseVynix/vynix-mcp`.

## 0.1.3

- Repository metadata and documentation fixes.

## 0.1.2

- Added a Streamable HTTP transport mode (`VYNIX_MCP_MODE=http`) alongside stdio,
  so the same server powers both local editor installs and the hosted
  `https://mcp.vynix.in/mcp` endpoint.
- Every tool now returns `structuredContent` with a declared `outputSchema`.

## 0.1.1

- npx-based install (`npx -y @usevynix/mcp-server`) and default API URL
  `https://www.vynix.in`.

## 0.1.0

- First public release of the Vynix MCP server.
- Read tools: list_projects, list_annotations, get_annotation, list_comments,
  get_annotation_analysis, get_annotation_screenshots, list_annotation_issues,
  list_project_issues, generate_prompt, get_metrics, list_members, get_activity.
- Write tools (client should confirm): update_annotation_status, add_comment,
  diagnose_annotation, create_github_issue, create_share_link.
- Guided `fix_annotation` prompt that walks an agent from a note to a fix.
- Auth via VYNIX_API_TOKEN, or VYNIX_API_EMAIL + VYNIX_API_PASSWORD.
