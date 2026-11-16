---
description: Simplify code for clarity and maintainability — reduce complexity without changing behavior
disable-model-invocation: true
---

## ZenCode integration

Run in the current ZenCode workspace using the user's selected model and existing permission controls. Use only the skills relevant to the current stage. Treat upstream Claude/Codex UI examples as references, not host configuration commands. Use ZenCode's current plugin and tool catalog; do not assume persona aliases or external tools are installed. Model selection follows ZenCode's user-configured roles, not a fixed vendor. Never infer a passing test, completed review or successful deployment from selecting a stage. Existing task authorization governs publishing and external changes.


Invoke the knowledge-engineering:code-simplification skill.

Simplify recently changed code (or the specified scope) while preserving exact behavior:

1. Read CLAUDE.md and study project conventions
2. Identify the target code — recent changes unless a broader scope is specified
3. Understand the code's purpose, callers, edge cases, and test coverage before touching it
4. Scan for simplification opportunities:
   - Deep nesting → guard clauses or extracted helpers
   - Long functions → split by responsibility
   - Nested ternaries → if/else or switch
   - Generic names → descriptive names
   - Duplicated logic → shared functions
   - Dead code → remove after confirming
5. Apply each simplification incrementally — run tests after each change
6. Verify all tests pass, the build succeeds, and the diff is clean

If tests fail after a simplification, revert that change and reconsider. Use `code-review-and-quality` to review the result.
