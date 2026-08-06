# Skill Workflows

This repository treats skills as complete, repeatable workflows rather than thin endpoint wrappers.

## Core skills

- Review website
- Find critical issues
- Find open feedback
- Summarize feedback
- Generate sprint report
- Generate engineering tasks
- Accessibility review
- UX review
- Release readiness
- QA summary
- Regression summary
- Client approval summary
- Product manager briefing

## Suggested flow

1. Resolve project via `list_projects`.
2. Pull scoped feedback via `list_annotations`.
3. Deep-dive selected items via `get_annotation`, screenshots, analysis, comments.
4. Produce decisions/tasks/report.
5. Optionally update status and add comments.
