# Resource Reference

## Static resources

- `vynix://meta/server`: server metadata, transports, and auth env variables.
- `vynix://reference/tools`: catalog of read/write tools.
- `vynix://reference/prompts`: catalog of prompt names.
- `vynix://reference/skills`: markdown list of high-level skills/workflows.
- `vynix://examples/questions`: starter questions for users and agents.

## Dynamic resources

- `vynix://projects/{project_id}/summary`: project-level open counts, issue summary, and blockers.
- `vynix://annotations/{annotation_id}/brief`: annotation summary, diagnosis state, and comment context.

## Why resources matter

Resources provide persistent context to agents without forcing additional tool calls for common reference material.
