# Changelog

## Unreleased

- No unreleased changes yet.

## 1.0.0 - 2026-08-06

- Added MCP resources for server metadata, tool/prompt catalogs, workflow starters, project summaries, and annotation briefs.
- Expanded prompt catalog with workflow-oriented prompts for QA, release, product, accessibility, and engineering planning.
- Rewrote README with full install matrix (NPX, npm, Docker, Claude Desktop, Cursor, VS Code, Windsurf, ChatGPT).
- Added comprehensive docs: tool reference, prompt reference, resource reference, skills, registry compatibility, and audit report.
- Added workflow and config examples, plus a prompt library with 100+ production prompts.
- Added CI workflows and example config validation script.
- Improved `VYNIX_API_URL` validation and credential error clarity.

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
