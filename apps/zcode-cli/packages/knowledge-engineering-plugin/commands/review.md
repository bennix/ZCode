---
description: Conduct a five-axis code review — correctness, readability, architecture, security, performance
disable-model-invocation: true
---

## ZenCode integration

Run in the current ZenCode workspace using the user's selected model and existing permission controls. Use only the skills relevant to the current stage. Treat upstream Claude/Codex UI examples as references, not host configuration commands. Use ZenCode's current plugin and tool catalog; do not assume persona aliases or external tools are installed. Model selection follows ZenCode's user-configured roles, not a fixed vendor. Never infer a passing test, completed review or successful deployment from selecting a stage. Existing task authorization governs publishing and external changes.


Invoke the knowledge-engineering:code-review-and-quality skill.

Review the current changes (staged or recent commits) across all five axes:

1. **Correctness** — Does it match the spec? Edge cases handled? Tests adequate?
2. **Readability** — Clear names? Straightforward logic? Well-organized?
3. **Architecture** — Follows existing patterns? Clean boundaries? Right abstraction level?
4. **Security** — Input validated? Secrets safe? Auth checked? (Use security-and-hardening skill)
5. **Performance** — No N+1 queries? No unbounded ops? (Use performance-optimization skill)

Categorize findings as Critical, Required, Optional, or Nit.
Output a structured review with specific file:line references and fix recommendations.
