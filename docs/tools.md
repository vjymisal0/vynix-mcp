# Tool Reference

## Read tools

- `list_projects`: list all projects available to the authenticated account.
- `list_annotations`: list annotations for a project with filters (`status`, `type`, `priority`, pagination).
- `get_annotation`: fetch full annotation context (page + element + diagnostics payload).
- `list_comments`: list discussion comments on one annotation.
- `get_annotation_analysis`: fetch latest stored AI diagnosis for one annotation.
- `get_annotation_screenshots`: return attached screenshots as viewable image content.
- `list_annotation_issues`: list tracker issues linked to one annotation.
- `list_project_issues`: list issues across a project with summary counts.
- `generate_prompt`: generate deterministic coding prompt text for one annotation.
- `get_metrics`: account overview metrics and activity trends.
- `list_members`: list project team members.
- `get_activity`: list recent project activity.

## Write tools

- `update_annotation_status`: update annotation state.
- `add_comment`: add a new comment to an annotation thread.
- `diagnose_annotation`: run AI diagnosis and store the resulting analysis.
- `create_github_issue`: create a GitHub issue from annotation context.
- `create_share_link`: create a public read-only review link.

## Notes

- Write tools should be confirmation-gated in MCP clients.
- `diagnose_annotation` and `create_github_issue` are open-world operations.
- Outputs include `structuredContent` and human-readable text.
