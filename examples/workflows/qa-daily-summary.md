# Workflow: Summarize Today's QA

User: Summarize today's QA results.

Agent workflow:
1. Call `get_activity`.
2. Call `list_annotations` for `open`, `review`, and `completed`.
3. Identify newly opened issues and resolved items.
4. Return concise QA daily report.
