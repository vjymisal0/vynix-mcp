# Workflow: What Blocks Deployment?

User: What blocks deployment this week?

Agent workflow:
1. Call `list_annotations` with `status=open` and `status=review`.
2. Call `list_project_issues`.
3. Prioritize critical/high defects and open issue states.
4. Return blocker list with exit criteria.
