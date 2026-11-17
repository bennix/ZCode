# Workspace visual refresh

## Product intent
Use the supplied T3 Code and Codex screenshots as visual references for a quiet,
compact application workspace: distinct navigation, readable conversation, and a
cohesive rounded composer. Preserve ZenCode branding and semantic theme tokens.

## Ownership and boundaries
This is a presentation-only change in packages/ui. WorkspaceShellLayout retains
panel sizing; WorkspaceSidebar and TaskListItem retain navigation; existing
composer navigation retains entry selection. No new state, services, IO, async
ordering, permissions, protocol, or persistence. Existing commands and handlers
remain the only interaction path. IDE focus mode and native window chrome remain
unchanged. No migration is needed.

## Visual rules
- Sidebar uses the sidebar surface; conversation stays opaque background.
- Task selection gains a subtle inset outline and comfortable row spacing.
- Entry buttons form a compact wrapping strip with a clear selected state.
- Composer remains opaque when scrolling or opening guided tasks, with a quiet
  rounded input surface. User bubbles use consistent rounded corners.
- Use semantic colors and text-ui typography; retain resize hit targets,
  keyboard focus, mobile drawers, and independently scrollable guided panels.

## Acceptance
Verify light and dark themes at phone and desktop widths. Entry controls wrap
without horizontal overflow; selected entry remains identifiable. Switching
WorkCoder repeatedly while scrolling must not reveal history through the dock.
Existing task navigation and submission handlers remain unchanged. Run the dock
and workspace-navigation browser regressions, typecheck, lint, and architecture
checks. Failures must be reported rather than hidden by changing baselines.
