---
description: Break work into small verifiable tasks with acceptance criteria and dependency ordering
disable-model-invocation: true
---

## ZenCode integration

Run in the current ZenCode workspace using the user's selected model and existing permission controls. Use only the skills relevant to the current stage. Treat upstream Claude/Codex UI examples as references, not host configuration commands. Use ZenCode's current plugin and tool catalog; do not assume persona aliases or external tools are installed. Model selection follows ZenCode's user-configured roles, not a fixed vendor. Never infer a passing test, completed review or successful deployment from selecting a stage. Existing task authorization governs publishing and external changes.


Invoke the knowledge-engineering:planning-and-task-breakdown skill.

Read the existing spec (SPEC.md or equivalent) and the relevant codebase sections. Then:

1. Enter plan mode — read only, no code changes
2. Identify the dependency graph between components
3. Slice work vertically (one complete path per task, not horizontal layers)
4. Write tasks with acceptance criteria and verification steps
5. Add checkpoints between phases
6. Present the plan for human review

Save the plan to tasks/plan.md and task list to tasks/todo.md.

If tasks/plan.md or tasks/todo.md already exists with unchecked tasks for different work, stop and ask before writing — never silently overwrite an incomplete plan.
