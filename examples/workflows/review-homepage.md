# Workflow: Review Homepage

User: Review acme.io homepage feedback.

Agent workflow:
1. Resolve project via `list_projects`.
2. Call `list_annotations` and filter items by homepage URL.
3. Use `get_annotation_screenshots` for top issues.
4. Return prioritized fixes with UX rationale.
