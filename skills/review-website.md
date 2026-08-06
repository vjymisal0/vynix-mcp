# Skill: Review Website

Goal: produce a prioritized issue review for a target site.

Steps:
1. Call `list_projects` and resolve project by `website_url`.
2. Call `list_annotations` with `status=open` and paginate as needed.
3. For top impact items, call `get_annotation`, `get_annotation_screenshots`, and `get_annotation_analysis`.
4. Group by page and severity, then provide a fix order.
5. If asked, move started items to `in_progress`.
