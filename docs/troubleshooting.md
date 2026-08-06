# Troubleshooting

Client-specific setup issues, in symptom → cause → fix format. For general
connection/auth errors that aren't client-specific, see the
[Troubleshooting section in the README](../README.md#troubleshooting).

## Claude Desktop

### Symptom: Vynix doesn't appear in the tools list after editing the config

**Cause:** Claude Desktop only reads `claude_desktop_config.json` on startup.
Editing the file while the app is running has no effect until it's
restarted.

**Fix:** Fully quit Claude Desktop (not just close the window) and reopen
it. On macOS, quit from the menu bar or `Cmd+Q`; on Windows, check the
system tray for a still-running instance after closing the window.

### Symptom: the server fails to start, or Claude Desktop shows a generic connection error, with no obvious cause

**Cause:** `claude_desktop_config.json` has invalid JSON — most often a
trailing comma after the last entry in `mcpServers`, or a missing comma
between server blocks when adding Vynix alongside an existing server.
Claude Desktop won't launch any configured server if the file doesn't
parse.

**Fix:** Validate the file (`cat claude_desktop_config.json | jq .` or any
JSON validator) before restarting. A minimal, valid single-server config:

```json
{
  "mcpServers": {
    "vynix": {
      "command": "npx",
      "args": ["-y", "@usevynix/mcp-server"],
      "env": {
        "VYNIX_API_TOKEN": "PASTE_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Symptom: `spawn npx ENOENT`, or the server never connects, even though `npx -y @usevynix/mcp-server` works fine in a terminal

**Cause:** Claude Desktop launches server processes without your shell's
`PATH`, so if `npx` was installed via nvm, Volta, or a version manager
that only wires up `PATH` in interactive shells, Desktop can't find it.

**Fix:** Use an absolute path to `npx` in `command` (find it with
`which npx` / `where npx`), for example:

```json
{
  "mcpServers": {
    "vynix": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "@usevynix/mcp-server"],
      "env": { "VYNIX_API_TOKEN": "PASTE_YOUR_TOKEN_HERE" }
    }
  }
}
```

Or install globally (`npm install -g @usevynix/mcp-server`) and point
`command` at the resulting `vynix-mcp` binary instead of `npx`.

### Symptom: `Vynix MCP server is not configured. Set VYNIX_API_TOKEN, or both VYNIX_API_EMAIL and VYNIX_API_PASSWORD...`

**Cause:** This is the server's own startup check (`assertConfigured` in
`src/config.ts`) — no credentials were found in the `env` block of the
server's config entry. Note this only runs in stdio mode; it's skipped
when `VYNIX_MCP_MODE=http`.

**Fix:** Add `VYNIX_API_TOKEN` (generate one at
<https://www.vynix.in/mcp>) to the `env` object for the `vynix` server
entry, as shown in the config examples above. Setting it in your shell's
profile isn't enough — Claude Desktop doesn't inherit your interactive
shell environment, so it has to be in the config file's `env` block.

## Gemini

Gemini CLI reads MCP server definitions from `~/.gemini/settings.json`
(global) or `.gemini/settings.json` in a project directory (project-level,
takes precedence), under an `mcpServers` key with the same shape as
Claude Desktop's config.

### Symptom: `vynix` tools aren't available in a Gemini CLI session

**Cause:** Most commonly, the config is in the wrong file, or under the
wrong top-level key (`servers` is what VS Code's `.vscode/mcp.json`
uses — Gemini CLI, like Claude Desktop and Cursor, expects `mcpServers`).

**Fix:** Confirm the file path and key:

```json
{
  "mcpServers": {
    "vynix": {
      "command": "npx",
      "args": ["-y", "@usevynix/mcp-server"],
      "env": {
        "VYNIX_API_TOKEN": "PASTE_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Run `gemini mcp list` (or the equivalent status command for your Gemini
CLI version) to confirm the server was picked up and check its reported
state.

### Symptom: `Vynix MCP server is not configured...` in a Gemini CLI session

**Cause:** Same root cause as the Claude Desktop case above — the `env`
block in `settings.json` is missing `VYNIX_API_TOKEN` (or the
email/password pair).

**Fix:** Add the token to the `env` object exactly as shown above, then
restart the Gemini CLI session (`/mcp refresh` or exiting and
re-launching, depending on your CLI version) so it re-reads the config.
