# Skill: Generate Sprint Report

Goal: summarize progress for sprint review.

Steps:
1. Call `get_activity` for recent movement.
2. Call `list_annotations` for open/review/completed.
3. Call `list_project_issues` for issue lifecycle state.
4. Return completed work, carry-over, blockers, and focus for next sprint.
