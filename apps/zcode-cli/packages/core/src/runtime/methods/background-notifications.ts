import { createMessageId, traceContextToLogContext } from "../deps.js";
import type { MessageId, TraceContext } from "../deps.js";
import type { BackgroundResultOriginMeta, SessionInputRecord } from "@zcode/contracts";
import {
  createRuntimeCommandId,
  type RuntimeCommandId,
  type TaskNotificationRuntimeCommand,
} from "../command-queue.js";
import { runtimeInputMetadata } from "../../agent/runtime-input-presentation.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { SealBackgroundTaskNotificationsInput } from "../types.js";
import { shouldSuppressSealedSubagentBashNotification } from "../../runtime-task/notification-policy.js";

export async function enqueueBackgroundTaskNotification(
  this: AgentRuntimeInternal,
  notification: {
    originMeta?: BackgroundResultOriginMeta;
    requestId?: string;
    taskId?: string;
    text: string;
    toolName?: string;
    traceContext: TraceContext;
  },
): Promise<boolean> {
  if (this.shuttingDown) {
    // 防御直接调用路径：session teardown 期间只允许任务状态收口，不能再启动模型轮次。
    this.logger?.info?.("Dropped background task notification during runtime shutdown", {
      ...traceContextToLogContext(notification.traceContext),
      event: "runtime.background_task_notification.shutdown_dropped",
      module: "core.runtime",
      taskId: notification.taskId,
      toolName: notification.toolName,
    });
    return false;
  }
  if (
    (notification.requestId && !this.sessionStore) ||
    (this.sessionStore &&
      (!this.sessionStore.saveSessionInput ||
        !this.sessionStore.getSessionInputById ||
        !this.sessionStore.promoteSessionInputBatch))
  ) {
    // 持久化通知必须可入账、回读和原子 promotion；旧 Host 不能谎称跨崩溃交付。
    return false;
  }
  const task = notification.taskId ? this.runtimeTaskRegistry.get(notification.taskId) : undefined;
  const branchGeneration = task?.branchGeneration ?? this.branchGeneration;
  if (branchGeneration !== this.branchGeneration) {
    this.logger?.debug("Dropped stale-branch background task notification", {
      ...traceContextToLogContext(notification.traceContext),
      branchGeneration,
      currentBranchGeneration: this.branchGeneration,
      event: "runtime.background_task_notification.stale_branch_dropped",
      module: "core.runtime",
      taskId: notification.taskId,
    });
    return false;
  }
  const commandId = notification.requestId
    ? (notification.requestId as RuntimeCommandId)
    : createRuntimeCommandId();
  // wake 先入账本（admitted）。runtime 命令队列是纯内存投递视图；
  // 崩溃重启后从账本恢复同分支通知，并保留原 requestId。
  const admission = this.sessionStore?.saveSessionInput?.({
    id: String(commandId),
    sessionID: this.sessionId,
    kind: "backgroundNotification",
    delivery: "queue",
    payload: {
      text: notification.text,
      branchGeneration,
      ...(notification.taskId ? { taskId: notification.taskId } : {}),
      ...(notification.toolName ? { toolName: notification.toolName } : {}),
      ...(notification.originMeta ? { originMeta: notification.originMeta } : {}),
    },
  });
  if (admission) {
    try {
      await this.trackResidencyBlockingWork(admission);
    } catch (error) {
      this.logger?.warn("Failed to admit background notification to ledger", {
        ...traceContextToLogContext(notification.traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session_input.admit_failed",
        module: "core.runtime",
        status: "failed",
      });
      return false;
    }
  }
  if (notification.requestId) {
    const durable = await this.sessionStore?.getSessionInputById?.(notification.requestId);
    if (durable && durable.status !== "admitted") {
      // 已结算的生命周期通知不可重新入队；SQLite 的 conflict 写入也不再覆盖终态载荷。
      return false;
    }
  }
  if (this.shuttingDown || this.branchGeneration !== branchGeneration) {
    await this.sessionStore?.settleSessionInput?.({
      id: String(commandId),
      sessionID: this.sessionId,
      status: "discarded",
      reason: this.shuttingDown ? "runtime_shutdown" : "stale_branch",
    });
    return false;
  }
  if (
    notification.originMeta?.backgroundSource === "subagent" &&
    notification.taskId &&
    this.runtimeTaskRegistry.get(notification.taskId)?.notified
  ) {
    // TaskOutput 可能在异步入账期间先认领结果；此时收口账本，避免恢复后重复唤醒父 Agent。
    await this.sessionStore?.settleSessionInput?.({
      id: String(commandId),
      sessionID: this.sessionId,
      status: "discarded",
      reason: "task_output_consumed",
    });
    return false;
  }
  if (
    notification.requestId &&
    this.runtimeCommandQueue.snapshot().some((command) => command.id === commandId)
  ) {
    return true;
  }
  // 修复依据：enqueue 会同步启动 drain；等待 Store admission，避免原子
  // promotion 抢在本条账本记录创建前执行。
  this.enqueueRuntimeCommand({
    branchGeneration,
    createdAt: new Date(),
    id: commandId,
    mode: "task-notification",
    priority: "next",
    source: "background_task",
    originMeta: notification.originMeta,
    taskId: notification.taskId,
    text: notification.text,
    toolName: notification.toolName,
    traceContext: notification.traceContext,
  });
  return true;
}

export function recoverAdmittedBackgroundNotification(
  record: SessionInputRecord,
  branchGeneration: number,
  traceContext: TraceContext,
): { command?: TaskNotificationRuntimeCommand; reason?: string } {
  const payload = record.payload;
  if (
    record.kind !== "backgroundNotification" ||
    record.delivery !== "queue" ||
    !record.id ||
    typeof payload.text !== "string" ||
    !payload.text.trim() ||
    !Number.isInteger(payload.branchGeneration) ||
    !Number.isInteger(record.time.created)
  )
    return { reason: "invalid_notification_payload" };
  if (payload.branchGeneration !== branchGeneration) return { reason: "stale_branch" };
  if (payload.taskId !== undefined && typeof payload.taskId !== "string") {
    return { reason: "invalid_notification_payload" };
  }
  if (payload.toolName !== undefined && typeof payload.toolName !== "string") {
    return { reason: "invalid_notification_payload" };
  }
  let originMeta: BackgroundResultOriginMeta | undefined;
  if (payload.originMeta !== undefined) {
    const raw = payload.originMeta;
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      !["bash", "subagent", "workflow"].includes(
        String((raw as Record<string, unknown>).backgroundSource),
      ) ||
      typeof (raw as Record<string, unknown>).workId !== "string" ||
      typeof (raw as Record<string, unknown>).title !== "string"
    )
      return { reason: "invalid_notification_payload" };
    originMeta = raw as BackgroundResultOriginMeta;
  }
  return {
    command: {
      branchGeneration,
      createdAt: new Date(record.time.created),
      id: record.id as RuntimeCommandId,
      mode: "task-notification",
      priority: "next",
      source: "background_task",
      ...(originMeta ? { originMeta } : {}),
      ...(typeof payload.taskId === "string" ? { taskId: payload.taskId } : {}),
      text: payload.text,
      ...(typeof payload.toolName === "string" ? { toolName: payload.toolName } : {}),
      traceContext,
    },
  };
}

/** 只恢复尚无子 assistant 的 promoted 输入；此时模型请求尚未开始，重放无工具副作用。 */
export async function restorePromotedBackgroundResponses(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<number> {
  if (!this.sessionStore?.listSessionInputs) return 0;
  const promoted = (await this.sessionStore.listSessionInputs({
    sessionID: this.sessionId,
    status: "promoted",
  })).filter((record) => record.status === "promoted" && record.kind === "backgroundNotification");
  if (promoted.length === 0) return 0;
  const messages = await this.sessionStore.messages({ sessionID: this.sessionId });
  let restored = 0;
  const seenMessageIds = new Set<string>();
  for (const record of promoted) {
    const messageId = record.promotedMessageID;
    if (!messageId || seenMessageIds.has(messageId)) continue;
    seenMessageIds.add(messageId);
    const batch = promoted.filter((item) => item.promotedMessageID === messageId);
    const recovered = batch.map((item) =>
      recoverAdmittedBackgroundNotification(item, this.branchGeneration, traceContext).command
    );
    if (recovered.some((command) => !command)) continue;
    const user = messages.find((message) => message.info.id === messageId &&
      message.info.role === "user" && message.info.source === "background_task");
    const text = user?.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n\n");
    if (!text?.trim()) continue;
    if (messages.some((message) => message.info.role === "assistant" &&
      message.info.parentID === messageId)) continue;
    if (this.runtimeCommandQueue.snapshot().some((command) => command.id === record.id ||
      (command.mode === "background-response-continuation" && command.promotedMessageId === messageId))) continue;
    const sources = recovered.map((command) => command?.originMeta?.backgroundSource);
    const backgroundSource = sources[0] && sources.every((source) => source === sources[0])
      ? sources[0]
      : undefined;
    this.runtimeCommandQueue.enqueue({
      branchGeneration: this.branchGeneration,
      createdAt: new Date(record.time.created),
      id: record.id as RuntimeCommandId,
      mode: "background-response-continuation",
      priority: "next",
      promotedMessageId: messageId,
      text,
      ...(batch.length === 1 && recovered[0]?.originMeta ? { originMeta: recovered[0].originMeta } : {}),
      ...(backgroundSource ? { backgroundSource } : {}),
      backgroundSubagentResultConsumed: sources.includes("subagent"),
      workflowResultConsumed: sources.includes("workflow"),
      traceContext,
    });
    restored++;
  }
  return restored;
}

export function sealBackgroundTaskNotifications(
  this: AgentRuntimeInternal,
  input: SealBackgroundTaskNotificationsInput,
): void {
  if (this.config.taskType !== "subagent_child") return;
  this.backgroundTaskNotificationsSealed = true;
  this.backgroundTaskNotificationSealReason = input.reason;
  this.logger?.info?.("Subagent runtime background task notifications sealed", {
    ...traceContextToLogContext(input.traceContext ?? this.rootTraceContext),
    event: "runtime.background_task_notifications.sealed",
    module: "core.runtime",
    reason: input.reason,
  });
}

export async function persistBackgroundTaskNotificationCommand(
  this: AgentRuntimeInternal,
  command: TaskNotificationRuntimeCommand,
): Promise<MessageId> {
  const persisted = await persistBackgroundTaskNotificationBatch.call(this, [command], true);
  return persisted.messageId;
}

interface PersistedBackgroundTaskNotificationBatch {
  /** 仅整批来源一致时存在；混合/缺失来源不能从代表任务推断。 */
  backgroundSource?: BackgroundResultOriginMeta["backgroundSource"];
  messageId: MessageId;
  originMeta?: BackgroundResultOriginMeta;
  text: string;
}

const MAX_BACKGROUND_RESULT_TITLES = 3;

function resolveBackgroundTaskNotificationSource(
  commands: readonly [TaskNotificationRuntimeCommand, ...TaskNotificationRuntimeCommand[]],
): BackgroundResultOriginMeta["backgroundSource"] | undefined {
  const source = commands[0].originMeta?.backgroundSource;
  if (!source || commands.some((command) => command.originMeta?.backgroundSource !== source)) {
    // 展示 metadata 只保留代表任务，不能把首项来源当作整批因果来源；
    // 混合或缺失来源留空，避免 notification 到达顺序改变 message_source。
    return undefined;
  }
  return source;
}

function resolveBackgroundTaskNotificationOriginMeta(
  commands: readonly [TaskNotificationRuntimeCommand, ...TaskNotificationRuntimeCommand[]],
): BackgroundResultOriginMeta | undefined {
  // 单条：originMeta 整体透传，workflowNotification 载荷免费搭车（manifest 渲染的唯一数据源）。
  if (commands.length === 1) return commands[0].originMeta;

  const originMetas: BackgroundResultOriginMeta[] = [];
  for (const command of commands) {
    const originMeta = command.originMeta;
    if (!originMeta?.workId.trim() || !originMeta.title.trim()) return undefined;
    originMetas.push(originMeta);
  }

  const representative = originMetas[0];
  if (!representative) return undefined;
  const visibleTitles = originMetas
    .slice(0, MAX_BACKGROUND_RESULT_TITLES)
    .map((originMeta) => originMeta.title.trim());
  const remainingCount = originMetas.length - visibleTitles.length;
  const title = [...visibleTitles, ...(remainingCount > 0 ? [`+${remainingCount}`] : [])].join(
    " · ",
  );

  // 多 notification 共用一个 turn 后若直接丢弃 originMeta，后台结果会退化为
  // 普通 assistant 渲染。这里复用首个任务的展示锚点并只合成 title，不引入 batch schema。
  //
  // workflowNotification 载荷**刻意不合成**：manifest 是「一轮 ↔ 一张」的对应，批量下这条关系不成立——谎报第一条的
  // 载荷比整轮退化成裸标题行更坏。只保留 {backgroundSource, title, workId} 三个基字段，
  // 整轮据此退回现状标题行。
  return {
    backgroundSource: representative.backgroundSource,
    title,
    workId: representative.workId,
  };
}

export async function persistBackgroundTaskNotificationBatch(
  this: AgentRuntimeInternal,
  commands: readonly [TaskNotificationRuntimeCommand, ...TaskNotificationRuntimeCommand[]],
  midTurn = false,
): Promise<PersistedBackgroundTaskNotificationBatch> {
  const firstCommand = commands[0];
  const backgroundSource = resolveBackgroundTaskNotificationSource(commands);
  const originMeta = resolveBackgroundTaskNotificationOriginMeta(commands);
  const text = commands.map((command) => command.text).join("\n\n");
  await this.ensureContextInitialized(firstCommand.traceContext);
  const messageID = createMessageId();
  const inputPresentation = midTurn ? "task_notification_steer" : "task_notification";
  if (this.sessionStore && !this.sessionStore.promoteSessionInputBatch) {
    throw new Error("Background notification batch promotion is unavailable");
  }
  const atomicBatch = Boolean(this.sessionStore);
  await this.persistSyntheticUserNoticeForSession({
    messageID,
    metadata: {
      inputPresentation,
      ...(originMeta ? { originMeta } : {}),
      visibility: "model-only",
    },
    sessionId: this.sessionId,
    source: "background_task",
    text,
    traceContext: firstCommand.traceContext,
    visibility: "model-only",
    ...(atomicBatch ? { sessionInputIds: commands.map((command) => String(command.id)) } : {}),
  });
  // 修复依据：持久 promotion 失败时不应先把通知加入模型历史；重放仍从 admitted 账本恢复。
  this.messageHistory.addUser(text, runtimeInputMetadata(inputPresentation));
  // outer drain 过去逐条持久化并逐条启动模型轮，pending 数量会线性放大
  // request 数。整批只写一条 synthetic message，同时仍逐项结算 ledger 身份。
  return {
    ...(backgroundSource ? { backgroundSource } : {}),
    messageId: messageID,
    ...(originMeta ? { originMeta } : {}),
    text,
  };
}

export function shouldSuppressTaskNotificationRuntimeCommand(
  this: AgentRuntimeInternal,
  command: TaskNotificationRuntimeCommand,
): boolean {
  const registryTask = command.taskId ? this.runtimeTaskRegistry.get(command.taskId) : undefined;
  if (
    !shouldSuppressSealedSubagentBashNotification({
      isSubagentChildRuntime: this.config.taskType === "subagent_child",
      notificationSealed: this.backgroundTaskNotificationsSealed,
      registryTask,
      toolName: command.toolName,
    })
  ) {
    return false;
  }

  this.logger?.info?.("Suppressed sealed subagent background Bash notification", {
    ...traceContextToLogContext(command.traceContext),
    commandId: command.id,
    event: "runtime.background_task_notification.suppressed",
    module: "core.runtime",
    reason: this.backgroundTaskNotificationSealReason,
    taskId: command.taskId,
    toolName: command.toolName,
  });
  return true;
}
