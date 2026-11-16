---
description: Run TDD workflow — write failing tests, implement, verify. For bugs, use the Prove-It pattern.
disable-model-invocation: true
---

## ZenCode integration

Run in the current ZenCode workspace using the user's selected model and existing permission controls. Use only the skills relevant to the current stage. Treat upstream Claude/Codex UI examples as references, not host configuration commands. Use ZenCode's current plugin and tool catalog; do not assume persona aliases or external tools are installed. Model selection follows ZenCode's user-configured roles, not a fixed vendor. Never infer a passing test, completed review or successful deployment from selecting a stage. Existing task authorization governs publishing and external changes.


Invoke the knowledge-engineering:test-driven-development skill.

For new features:
1. Write tests that describe the expected behavior (they should FAIL)
2. Implement the code to make them pass
3. Refactor while keeping tests green

For bug fixes (Prove-It pattern):
1. Write a test that reproduces the bug (must FAIL)
2. Confirm the test fails
3. Implement the fix
4. Confirm the test passes
5. Run the full test suite for regressions

For browser-related issues, also invoke knowledge-engineering:browser-testing-with-devtools to verify with Chrome DevTools MCP.
