import {
  CoreErrorType,
  ZENCODE_PRESENT_PLAN_TOOL_NAME,
  ZencodePresentPlanAnsweredInputSchema,
  ZencodePresentPlanInputJsonSchema,
  ZencodePresentPlanOutputJsonSchema,
  ZencodePresentPlanOutputSchema,
  createCoreError,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const presentPlanHandler: ToolHandler = async (input, context) => {
  if (context.runtimeScope === "subagent") {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Only the foreground task may request file selection", {
      context: { toolCallId: context.toolCallId, toolName: ZENCODE_PRESENT_PLAN_TOOL_NAME },
      recoverable: true,
    });
  }
  // 根因：模型可构造工具 input，但不能替用户勾选文件。permission broker 必须先
  // 收到交互回执并注入 selectedPaths；运行时再验证它确为冻结候选集的子集。
  const answered = ZencodePresentPlanAnsweredInputSchema.parse(input);
  const activeTasks = Object.values(context.runtimeTaskRegistry?.all() ?? {}).filter(
    (task) => !["completed", "failed", "cancelled", "killed", "stopped", "lost"].includes(task.status),
  );
  if (activeTasks.length > 0) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Finish active background tasks before selecting files", {
      recoverable: true,
    });
  }
  if (!context.fileSelectionGuard) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "File selection guard is unavailable", {
      recoverable: true,
    });
  }
  // 用户确认后立即激活执行边界，后续工具调用只能写入本轮勾选的文件。
  await context.fileSelectionGuard.activate(context.turnId, answered.selectedPaths);
  return { status: "confirmed", selectedPaths: answered.selectedPaths };
};

export const zencodePresentPlanToolEntry: ToolEntry = {
  capability: "Present a file change plan and continue only with the user's selected files",
  requiresUserInteraction: true,
  metadata: {
    name: ZENCODE_PRESENT_PLAN_TOOL_NAME,
    description:
      "Show a structured file selection card before a large multi-file change. The user selects the files to work on; a selection is not permission to edit files. Do not call for routine small edits.",
    readOnly: true,
    destructive: false,
    concurrentSafe: false,
    requiresUserInteraction: true,
    timeoutMs: 30_000,
    maxOutputBytes: 2_048,
    sideEffectScope: "userInteraction",
    riskLevel: "low",
    needsApproval: true,
  },
  handler: presentPlanHandler,
  inputSchema: ZencodePresentPlanInputJsonSchema,
  outputSchema: ZencodePresentPlanOutputJsonSchema,
  runtimeInputSchema: ZencodePresentPlanAnsweredInputSchema,
  runtimeOutputSchema: ZencodePresentPlanOutputSchema,
  permission: {
    permission: "userInteraction.askQuestion",
    reason: "Collect the user's file selection before the tool returns",
    riskLevel: "low",
    sideEffectScope: "userInteraction",
    needsApproval: true,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 2_048,
    maxModelBytes: 2_048,
    strategy: "truncate",
    preview: { maxBytes: 2_048, direction: "head" },
  },
  timeout: { defaultMs: 30_000, maxMs: 30_000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "File selection was cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
