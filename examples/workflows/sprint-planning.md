# Workflow: Generate Sprint Planning Tasks

User: Generate sprint planning tasks for frontend bugs.

Agent workflow:
1. Call `list_annotations` with `status=open`, `type=bug`.
2. For top items, call `get_annotation` and `get_annotation_analysis`.
3. Build task cards with acceptance criteria and risk notes.
4. Optionally call `create_github_issue` for selected tasks.
