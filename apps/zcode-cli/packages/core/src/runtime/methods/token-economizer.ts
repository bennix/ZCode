import { SessionEventType } from "../deps.js";
import type { ModelToolCall, TraceContext, ToolExecutionResult } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import { TokenEconomizerSession, economizerOptions } from "../../token-economizer/session.js";
import { digest, observeFailure } from "../../token-economizer/policy.js";
import { systemReminderAttachmentEntry } from "../../agent/message-history.js";
import { commitTurnRequestEntries } from "./turn-output-token-continuation.js";
import { isErrorForToolResult } from "../helpers/tool-result.js";

export async function prepareTokenEconomizer(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
): Promise<void> {
  if (
    runtime.tokenEconomizer ||
    runtime.config.subagentContext ||
    runtime.config.workflowActor ||
    runtime.config.taskType === "subagent_child" ||
    runtime.config.taskType === "workflow_child"
  )
    return;
  const session = new TokenEconomizerSession(economizerOptions(), runtime.sessionId);
  runtime.tokenEconomizer = session;
  try {
    await session.initialize(
      runtime.config.memory?.cliStorageRoot,
      runtime.config.workspaceIdentity?.trim() || runtime.config.memory?.workspaceIdentity,
      runtime.config.workspacePath || runtime.workspaceRoot,
    );
  } catch {
    // 节流证据不是任务执行的前置条件；磁盘异常不应中止会话，也不输出包含用户路径的异常。
    runtime.logger?.warn("TokenEconomizer evidence unavailable; continuing without prior evidence");
  }
  const reminder = session.environmentReminder();
  if (reminder)
    commitTurnRequestEntries(runtime, state.turnRequestState, [
      systemReminderAttachmentEntry("diagnostics", reminder),
    ]);
}

export async function observeTokenEconomizerResults(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  results: ToolExecutionResult[],
  calls: ModelToolCall[],
  trace: TraceContext,
): Promise<void> {
  const session = runtime.tokenEconomizer;
  if (!session?.options.enabled) return;
  const guard = (state.economizerFailures ??= { total: 0, failures: [], nudged: false });
  const seen = (state.economizerResultIds ??= new Set<string>());
  let nudge: ToolExecutionResult | undefined;
  for (const result of results) {
    if (seen.has(result.toolCallId)) continue;
    seen.add(result.toolCallId);
    const record =
      result.output && typeof result.output === "object"
        ? (result.output as Record<string, unknown>)
        : {};
    // Bash 的非零退出码并不总映射为协议 isError；失败学习必须读取真实进程结果。
    const failed =
      isErrorForToolResult(result) ||
      (typeof record.exitCode === "number" && record.exitCode !== 0);
    const call = calls.find((item) => item.id === result.toolCallId);
    // 后台启动不等于命令执行成功，不能用它撤销已确认的缺失命令事实。
    const settled = !(record.backgroundTaskId || record.taskId || record.status === "running");
    if (settled) session.observeTool(result.toolName, call?.input, failed, result.output);
    const errorText =
      result.error?.message ??
      [record.stderr, record.stdout, typeof result.output === "string" ? result.output : ""]
        .filter((part) => typeof part === "string")
        .join("\n");
    if (
      session.options.loopguard &&
      observeFailure(guard, failed, digest(`${result.toolName}:${errorText.slice(0, 16_384)}`))
    )
      nudge = result;
  }
  if (
    !nudge ||
    state.anomalyWarningsInjected >=
      (runtime.config.modelAnomalyGuard?.maxBudgetWarningsPerTurn ?? 3)
  )
    return;
  state.anomalyWarningsInjected++;
  session.stats.nudges++;
  commitTurnRequestEntries(runtime, state.turnRequestState, [
    systemReminderAttachmentEntry(
      "model_anomaly",
      "TokenEconomizer: repeated identical failures persist without a successful tool result. Reconsider the hypothesis, inspect the failing expectation, and verify a materially different approach before repeating work. Do not stop solely because of this reminder; keep existing permissions and task requirements.",
    ),
  ]);
  const event = runtime.createEvent(
    SessionEventType.ModelAnomalyWarning,
    {
      category: "repeated_tool_call",
      severity: "warning",
      observedCount: guard.failures.length,
      threshold: 6,
      toolName: nudge.toolName,
      warningInjected: true,
    },
    trace,
  );
  await runtime.appendEvent(event, trace);
  state.events.push(event);
}

export async function saveTokenEconomizer(runtime: AgentRuntimeInternal): Promise<void> {
  const session = runtime.tokenEconomizer;
  if (!session?.options.enabled) return;
  try {
    await session.save();
  } catch {
    runtime.logger?.warn("TokenEconomizer summary could not be saved; task continues");
  }
  runtime.logger?.debug("TokenEconomizer session statistics", { ...session.stats });
}
