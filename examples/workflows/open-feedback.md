# Workflow: What Feedback Is Open?

User: What feedback is open for acme.io?

Agent workflow:
1. Call `list_projects` and resolve project by `website_url`.
2. Call `list_annotations` with `status=open`.
3. Group by severity and type.
4. Return summary with top blockers.
