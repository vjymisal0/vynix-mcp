# Prompt Reference

## Prompts

- `fix_annotation`: guided fix workflow for one annotation.
- `critical_issues`: identify and rank critical/high open issues.
- `summarize_feedback`: summarize open feedback by type and impact.
- `jira_ready_tasks`: convert open annotations into implementation tasks.
- `release_notes`: generate release notes from completed work.
- `group_by_severity`: build severity matrix for open issues.
- `review_homepage`: focus analysis on homepage-related findings.
- `qa_report`: QA-oriented status report for release confidence.
- `accessibility_review`: summarize accessibility defects and action items.
- `client_comments_summary`: summarize client decisions from comments.
- `release_blockers`: list unresolved blockers and exit criteria.
- `sprint_report`: sprint progress summary from activity and issues.
- `engineering_tasks`: produce engineering-ready task breakdown.
- `regression_summary`: identify likely regressions and test gaps.
- `pm_briefing`: stakeholder-ready product management briefing.

## Design principles

- Prompts are workflow-level and tool-orchestrating.
- Prompts avoid hidden side effects unless explicit.
- Prompts focus on actionable outputs (tasks, risk summaries, next steps).
