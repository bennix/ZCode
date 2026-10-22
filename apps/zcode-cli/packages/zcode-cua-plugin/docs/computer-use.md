# ZenCode Computer Use

ZenCode uses the macOS Accessibility executor, the Windows UIA/Win32 executor, or the Linux AT-SPI/portal executor for the current desktop. The model uses `mcp__node_repl__js` and imports this plugin's `scripts/computer-use-client.mjs` in every call. The plugin is installed by default and manually enabled by the user.

Read `skills/computer-use/SKILL.md` for the supported workflow. macOS speaks `maka.cu/2` over stdio and returns one-use element tokens and digests. Windows and Linux use native MCP stdio; `platformCall("get_app_state", ...)` returns a `zcodeSnapshotId` text block that must accompany the next mutating call. Each action consumes that snapshot. Reobserve before another action and never retry a result whose outcome is unknown.

Windows/Linux observations expire after 120 seconds and permit one action. Reobserve after each action or expiration. Coordinate click/scroll/drag requires an actual image in the observation; AX-only element actions remain available without an image. Explicit action targets must match the observed target fields. Windows inherits an omitted `app`; Linux actions use their own returned schemas and do not accept the observation-only `app_name_or_bundle_identifier`. Observe the intended window before changing targets.
