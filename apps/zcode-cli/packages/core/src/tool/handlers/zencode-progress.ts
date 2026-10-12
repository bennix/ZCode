import {
  CoreErrorType,
  ZENCODE_MARK_PROGRESS_TOOL_NAME,
  ZencodeMarkProgressInputJsonSchema,
  ZencodeMarkProgressInputSchema,
  ZencodeMarkProgressOutputJsonSchema,
  ZencodeMarkProgressOutputSchema,
  createCoreError,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const markProgressHandler: ToolHandler = async (input, context) => {
  if (context.runtimeScope === "subagent") {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Only the foreground task may mark progress", {
      context: { toolCallId: context.toolCallId, toolName: ZENCODE_MARK_PROGRESS_TOOL_NAME },
      recoverable: true,
    });
  }
  // 根因：并行保存一份进度状态会与 replayable tool-call 流分叉；返回校验结果，
  // 由现有 tool-call 事件和 toolCallId 成为唯一、可重放的阶段事实。
  return ZencodeMarkProgressInputSchema.parse(input);
};

export const zencodeMarkProgressToolEntry: ToolEntry = {
  capability: "Mark a visible milestone in the current foreground coding task",
  metadata: {
    name: ZENCODE_MARK_PROGRESS_TOOL_NAME,
    description:
      "Report a concise task milestone. Use analysis, editing, verification, or complete. The milestone appears in the conversation timeline; do not use it for every tool call.",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 30_000,
    maxOutputBytes: 1_024,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: markProgressHandler,
  inputSchema: ZencodeMarkProgressInputJsonSchema,
  outputSchema: ZencodeMarkProgressOutputJsonSchema,
  runtimeInputSchema: ZencodeMarkProgressInputSchema,
  runtimeOutputSchema: ZencodeMarkProgressOutputSchema,
  permission: {
    permission: "todo.write",
    reason: "Records a milestone in the existing session tool-call stream",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 1_024,
    maxModelBytes: 1_024,
    strategy: "truncate",
    preview: { maxBytes: 1_024, direction: "head" },
  },
  timeout: { defaultMs: 30_000, maxMs: 30_000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "The milestone was cancelled before it was recorded",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
