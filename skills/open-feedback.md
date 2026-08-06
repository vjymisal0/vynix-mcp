# Skill: Find Open Feedback

Goal: answer "what is still open" with accurate counts.

Steps:
1. Resolve project with `list_projects`.
2. Call `list_annotations` with `status=open` (paginate).
3. Group by priority and type.
4. Return concise summary and top 10 items.
