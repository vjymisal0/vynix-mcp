# Skill: Find Critical Issues

Goal: identify defects that threaten release quality.

Steps:
1. Call `list_annotations` with `status=open`, `priority=critical`.
2. Call `list_annotations` with `status=open`, `priority=high`.
3. Use `get_annotation_analysis` for top items.
4. Return ranked blockers with impact and recommended owner.
