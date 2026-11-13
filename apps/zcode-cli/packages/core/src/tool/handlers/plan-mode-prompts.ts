// 计划工具描述会随每轮请求发送，去除重复示例以减少固定上下文开销。
export function createEnterPlanModeProviderDescription(
  options: {
    embeddedSearchEnabled?: boolean;
  } = {},
): string {
  const explorationTools = options.embeddedSearchEnabled
    ? "`find`/Glob, `grep`/Grep, and Read"
    : "Glob, Grep, and Read";
  return `Enter read-only planning mode before non-trivial implementation: new features, architectural choices, multi-file behavior changes, or unclear requirements. Explore using ${explorationTools}, understand existing patterns, clarify material questions with AskUserQuestion, and design an implementation plan. Submit the complete plan through ExitPlanMode for user approval before coding. Skip this for simple obvious fixes, a clearly specified function, detailed user instructions, or pure research. EnterPlanMode changes session planning state; ExitPlanMode requests approval.`;
}

export const ENTER_PLAN_MODE_PROVIDER_DESCRIPTION = createEnterPlanModeProviderDescription();

export const EXIT_PLAN_MODE_MODEL_INSTRUCTIONS = [
  "When in plan mode and ready to implement, pass the complete, unambiguous implementation plan in the required plan parameter. The user reviews and approves that content before implementation. Resolve unanswered requirements with AskUserQuestion first. Use ExitPlanMode itself to request plan approval. Use this for implementation planning, not pure research or codebase exploration.",
] as const;
