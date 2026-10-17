# Profile menu upgrade entry

## Product rule
The profile dropdown in the workspace sidebar exposes interface preferences, usage statistics, and account actions. It does not expose a separate generic upgrade row. Users can still reach plan purchase/renewal from the relevant Coding Plan cards and contextual quota prompts.

## Ownership and interface
`WorkspaceSidebarFooterUsageSummaryContent` owns rendering of the usage-statistics and plan-upgrade rows in the profile dropdown. Remove only the generic plan-upgrade row from this menu; keep usage statistics, plan badge, plan cards, quota actions, and their existing callbacks elsewhere unchanged. No new state or service interface is introduced.

## Acceptance scenarios
- Opening the profile dropdown shows the localized usage-statistics row. The visible label is exactly `使用统计` or `Usage stats`.
- The profile dropdown has no dedicated plan upgrade/renew row.
- Coding Plan status cards and contextual quota prompts continue to offer their existing plan actions.
