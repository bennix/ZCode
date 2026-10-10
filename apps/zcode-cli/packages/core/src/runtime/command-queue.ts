import type { MessageId, TraceContext, TurnState } from "./deps.js";
import type { BackgroundResultOriginMeta, WorkflowLaunchMeta } from "@zcode/contracts";
import { uuidv7 } from "@zcode/shared";
import type {
  ActiveTurnStartReservation,
  ContinueActiveTargetLoopOptions,
  ExecuteTurnOptions,
  TurnResult,
} from "./types.js";

export type RuntimeCommandPriority = "now" | "next" | "later";
export type RuntimeCommandMode =
  | "prompt"
  | "target-continuation"
  | "target-continuation-loop"
  | "task-notification"
  | "background-response-continuation"
  | "subagent-message"
  | "control-only-turn";
export type RuntimeCommandId = string & {
  readonly __runtimeCommandId: unique symbol;
};

export interface RuntimeCommandBase {
  readonly createdAt: Date;
  readonly id: RuntimeCommandId;
  readonly mode: RuntimeCommandMode;
  readonly priority: RuntimeCommandPriority;
  readonly traceContext: TraceContext;
}

export interface PromptRuntimeCommand extends RuntimeCommandBase {
  readonly attachments?: TurnState["attachments"];
  readonly input: string;
  readonly mode: "prompt";
  readonly options?: ExecuteTurnOptions;
  /** admission 已建立的 reservation；执行阶段不得再次创建/竞争 turn。 */
  readonly startReservation?: ActiveTurnStartReservation;
  readonly reject: (error: unknown) => void;
  readonly resolve: (result: TurnResult) => void;
}

export interface TargetContinuationRuntimeCommandOptions {
  readonly abortSignal?: AbortSignal;
  readonly inputId?: string;
  readonly intent?: ExecuteTurnOptions["intent"];
  readonly traceContext: TraceContext;
  readonly verifyBeforeContinue?: boolean;
}

export interface TargetContinuationRuntimeCommand extends RuntimeCommandBase {
  readonly mode: "target-continuation";
  readonly options: TargetContinuationRuntimeCommandOptions;
  readonly reject: (error: unknown) => void;
  readonly resolve: (result: TurnResult | null) => void;
}

export interface TargetContinuationLoopRuntimeCommand extends RuntimeCommandBase {
  readonly mode: "target-continuation-loop";
  readonly options: ContinueActiveTargetLoopOptions & {
    readonly traceContext: TraceContext;
  };
  readonly reject: (error: unknown) => void;
  readonly resolve: (result: TurnResult | null) => void;
}

export interface TaskNotificationRuntimeCommand extends RuntimeCommandBase {
  readonly branchGeneration: number;
  readonly mode: "task-notification";
  readonly source: "background_task";
  readonly originMeta?: BackgroundResultOriginMeta;
  readonly taskId?: string;
  readonly text: string;
  readonly toolName?: string;
}

/** `promoted` 后崩溃、尚无任何 assistant 时只续模型轮，不再合成第二条 user 输入。 */
export interface BackgroundResponseContinuationRuntimeCommand extends RuntimeCommandBase {
  readonly branchGeneration: number;
  readonly mode: "background-response-continuation";
  readonly promotedMessageId: MessageId;
  readonly text: string;
  readonly originMeta?: BackgroundResultOriginMeta;
  readonly backgroundSource?: BackgroundResultOriginMeta["backgroundSource"];
  readonly backgroundSubagentResultConsumed?: boolean;
  readonly workflowResultConsumed?: boolean;
}

export interface SubagentMessageRuntimeCommand extends RuntimeCommandBase {
  readonly branchGeneration: number;
  readonly mode: "subagent-message";
  readonly source: "subagent_message";
  readonly responseId: string;
  readonly agentId: string;
  readonly agentType: string;
  readonly childSessionId: string;
  readonly childToolCallId: string;
  readonly parentToolCallId?: string;
  readonly summary: string;
  readonly messageLength: number;
  readonly text: string;
}

/**
 * 一条排队的 controlOnly 用户轮：GUI「配置」
 * 已经把 run 修订掉了，这条命令只负责把这件事记进会话。它不进模型轮，却要落一条 user 消息，而
 * user 消息插不进一个正在跑的 turn（provider 语法：assistant 的 tool_use 与 tool_result 之间
 * 不能夹 user），所以它排在队列里、等当前 turn 结束。与通知同一个优先级，因而落在新 run 的任何
 * 通知之前；带 branchGeneration，rewind 后丢弃。
 */
export interface ControlOnlyTurnRuntimeCommand extends RuntimeCommandBase {
  readonly branchGeneration: number;
  readonly mode: "control-only-turn";
  /** 进 runtime history 与持久消息的规范句（模型下一回合读它）。 */
  readonly text: string;
  /** `ensureSessionPersisted` 的首输入标题种子。 */
  readonly titleInput: string;
  readonly inputId?: string;
  /** 轮与消息上的同一份元数据（冷热同形）。 */
  readonly workflowLaunch: WorkflowLaunchMeta;
}

export type RuntimeCommand =
  | PromptRuntimeCommand
  | TargetContinuationRuntimeCommand
  | TargetContinuationLoopRuntimeCommand
  | TaskNotificationRuntimeCommand
  | BackgroundResponseContinuationRuntimeCommand
  | SubagentMessageRuntimeCommand
  | ControlOnlyTurnRuntimeCommand;

export interface RuntimeCommandQueue {
  clearCancelPending(id: RuntimeCommandId): void;
  consumeCancelPending(id: RuntimeCommandId): boolean;
  dequeue(): RuntimeCommand | undefined;
  dequeueNextBatch(): readonly RuntimeCommand[];
  enqueue(command: RuntimeCommand): void;
  getByMaxPriority(maxPriority: RuntimeCommandPriority): readonly RuntimeCommand[];
  hasPending(): boolean;
  markCancelPending(id: RuntimeCommandId): void;
  removeById(id: RuntimeCommandId): RuntimeCommand | undefined;
  size(): number;
  snapshot(): readonly RuntimeCommand[];
}

const RUNTIME_COMMAND_PRIORITY_ORDER: Record<RuntimeCommandPriority, number> = {
  now: 0,
  next: 1,
  later: 2,
};

export function createRuntimeCommandId(): RuntimeCommandId {
  // 修复依据：通知 ID 同时是 durable session_input 主键；进程内序号重启后会
  // 从 1 重用并覆盖旧账本 payload，恢复命令必须保留原 ID，新命令须全局唯一。
  return `runtime_command_${uuidv7()}` as RuntimeCommandId;
}

export function createRuntimeCommandQueue(): RuntimeCommandQueue {
  const commands: RuntimeCommand[] = [];
  const cancelPendingCommandIds = new Set<RuntimeCommandId>();

  const selectNextIndex = (maxPriority?: RuntimeCommandPriority): number => {
    let selectedIndex = -1;
    let selectedPriority = Number.POSITIVE_INFINITY;
    const maxPriorityRank =
      maxPriority === undefined
        ? Number.POSITIVE_INFINITY
        : RUNTIME_COMMAND_PRIORITY_ORDER[maxPriority];

    for (const [index, command] of commands.entries()) {
      const priority = RUNTIME_COMMAND_PRIORITY_ORDER[command.priority];
      if (priority > maxPriorityRank) continue;
      if (priority < selectedPriority) {
        selectedIndex = index;
        selectedPriority = priority;
      }
    }

    return selectedIndex;
  };

  return {
    clearCancelPending(id: RuntimeCommandId): void {
      cancelPendingCommandIds.delete(id);
    },

    consumeCancelPending(id: RuntimeCommandId): boolean {
      return cancelPendingCommandIds.delete(id);
    },

    dequeue(): RuntimeCommand | undefined {
      const index = selectNextIndex();
      if (index === -1) return undefined;
      const [command] = commands.splice(index, 1);
      return command;
    },

    dequeueNextBatch(): readonly RuntimeCommand[] {
      const index = selectNextIndex();
      if (index === -1) return Object.freeze([]);
      const selected = commands[index];
      if (selected?.mode !== "task-notification") {
        const [command] = commands.splice(index, 1);
        return Object.freeze(command ? [command] : []);
      }

      const batch = commands.filter(
        (command) => command.mode === "task-notification" && command.priority === selected.priority,
      );
      for (let commandIndex = commands.length - 1; commandIndex >= 0; commandIndex -= 1) {
        const command = commands[commandIndex];
        if (command?.mode === "task-notification" && command.priority === selected.priority) {
          commands.splice(commandIndex, 1);
        }
      }
      return Object.freeze(batch);
    },

    enqueue(command: RuntimeCommand): void {
      commands.push(command);
    },

    getByMaxPriority(maxPriority: RuntimeCommandPriority): readonly RuntimeCommand[] {
      const maxPriorityRank = RUNTIME_COMMAND_PRIORITY_ORDER[maxPriority];
      return Object.freeze(
        commands.filter(
          (command) => RUNTIME_COMMAND_PRIORITY_ORDER[command.priority] <= maxPriorityRank,
        ),
      );
    },

    hasPending(): boolean {
      return commands.length > 0;
    },

    markCancelPending(id: RuntimeCommandId): void {
      cancelPendingCommandIds.add(id);
    },

    removeById(id: RuntimeCommandId): RuntimeCommand | undefined {
      const index = commands.findIndex((command) => command.id === id);
      if (index === -1) return undefined;
      const [command] = commands.splice(index, 1);
      return command;
    },

    size(): number {
      return commands.length;
    },

    snapshot(): readonly RuntimeCommand[] {
      return Object.freeze([...commands]);
    },
  };
}
