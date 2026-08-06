# Skill: Accessibility Review

Goal: produce an accessibility-focused remediation plan.

Steps:
1. Call `list_annotations` with `type=accessibility` and `status=open`.
2. Inspect details and screenshots for critical items.
3. Group by WCAG-like concern (contrast, keyboard, semantics, labels).
4. Return fix priorities and suggested QA checks.
