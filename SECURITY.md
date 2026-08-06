# Security Policy

## Supported versions

The latest minor release receives security updates.

## Reporting a vulnerability

Email support@vynix.in with:

- affected version
- reproduction steps
- impact assessment
- proof-of-concept (if available)

Do not open public issues for undisclosed vulnerabilities.

## Security practices

- Use `VYNIX_API_TOKEN` from environment variables.
- Rotate tokens regularly.
- Avoid logging secrets in client or server output.
- Restrict MCP client write-tool permissions when possible.
