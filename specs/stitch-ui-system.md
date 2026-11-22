# Stitch UI integration

## Rules and ownership
The shared UI module owns presentation primitives. Existing hooks, services and stores retain all business and locale state. No routing, approval, network or task-admission semantics change. DESIGN.md remains authoritative over upstream stylistic defaults.

## Permanent installation
All 16 upstream skills are installed in ~/.codex/skills and ~/.zcode/skills at revision 62fdcd679747aca0792e5dd6591b10ddfad56825. Load only task-relevant skills. Cloud generation/upload requires a configured Stitch MCP and explicit selection of assets; installation alone does not provide it.

## Foundation acceptance
- Shared buttons expose a visible keyboard focus indicator in both themes.
- Dialog close controls and command palette fallback labels use the existing locale provider, with Chinese and English parity. Preserve explicit caller labels.
- Command dialog accessible title/description belong inside the content portal.
- Settings rows collapse to one column below sm, retaining full-width controls and wrapping long translations.
- Resource list headers wrap; shared dialog headings have a consistent visual hierarchy.

## Coverage and verification
Foundation changes propagate to existing consumers across workspace, conversation, WorkCoder, settings, automation, plugins and dialogs. This is not evidence of a completed page-by-page visual audit. Validate language switching, keyboard opening/closing, narrow settings and light/dark appearances. Required gates: typecheck, lint, architecture. Track subsequent page-specific changes and visual evidence separately.

## Guided-workspace presentation refactor
WorkCoder and knowledge workflows share a stateless GuidedWorkspaceFrame (title, description, steps and content). Each existing workspace retains its local draft and step state; hooks retain admission ownership. Steps keep existing gating and probe events. Domain display names move from catalog data to locale dictionaries; stable domain IDs and skill names remain unchanged. Visually distinguish completed/current/upcoming steps with numbered neutral indicators, consistent spacing and wrapping labels. Acceptance: existing bilingual knowledge and WorkCoder browser scenarios still pass.

## Global keyboard focus correction
Runtime browser evidence showed the global important outline/box-shadow reset defeated component focus styling, including forced-colors mode. Replace it with focus-visible outlines using the foreground token and Highlight in forced-colors. Pointer focus stays quiet; do not remove component shadows or keyboard indicators. Verify real computed outline in both themes.

## Verified 2026-11-22
- pnpm typecheck: passed.
- pnpm lint: 0 errors, 76 existing warnings.
- pnpm architecture:check --changed: 0 violations.
- stitch-foundation.browser.mjs: Chinese/English close and command labels, Escape, responsive settings at 390/1280 and keyboard focus in light/dark passed.
- knowledge-work.browser.mjs: Chinese/English domain workflow, six engineering stages, retry and model selection passed.
- workcoder.browser.mjs: Chinese/English launch, model assignment, retry, probe deduplication/export/charts and responsive layout passed. Inspected narrow-screen screenshot.
- No cloud-generated Stitch screens or full page-by-page application audit claimed. react-components cloud conversion workflow awaits configured MCP; local work uses extract-design-md and shadcn-ui guidance.

## Professional workflow localization
Workflow option labels resolve chat.knowledge.workflow.<skill-id> through the existing locale provider. Internal option values and submitted skill IDs remain unchanged. All catalog skills must have Chinese and English labels. Changing locale in a mounted workspace immediately updates labels without resetting domain, workflow, step or task draft. Connector product names and model identifiers remain proper names. Regression must cover every domain and live locale switching, not just separate initial-language mounts.
