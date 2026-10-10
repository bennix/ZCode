import type { ModelCatalogEntry, ModelSelection } from "@zcode/contracts";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";

export interface ModelDispatchDecision {
  kind: "keep" | "switch";
  selection?: ModelSelection;
}

/** 候选列表有界，但当前执行模型与判断模型不能被目录顺序挤掉。 */
export function selectModelDispatchCandidates(input: {
  candidates: readonly ModelCatalogEntry[];
  current: ModelSelection;
  dispatcher: ModelSelection;
  limit: number;
}): ModelCatalogEntry[] {
  const available = input.candidates.filter((entry) => !entry.disabledReason);
  const selected: ModelCatalogEntry[] = [];
  const add = (selection: ModelSelection) => {
    const match = available.find(
      (entry) => entry.providerId === selection.providerId && entry.modelId === selection.modelId,
    );
    if (match && !selected.includes(match)) selected.push(match);
  };
  add(input.current);
  add(input.dispatcher);
  for (const candidate of available) {
    if (selected.length >= input.limit) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected.slice(0, input.limit);
}

/** Judge 只能从当前活目录选完整的 provider/model/effort，不能凭字符串造新模型。 */
export function parseModelDispatchDecision(
  text: string,
  candidates: readonly ModelCatalogEntry[],
  current: ModelSelection,
): ModelDispatchDecision | null {
  let raw: unknown;
  try {
    raw = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const decision = raw as Record<string, unknown>;
  // 修复依据：完整 provider/model 名在判断提示词和 JSON 回复中重复消耗 Token；
  // 短序号只在本次有界候选列表内解释，越界或非法值不能成为可执行模型。
  const compact = "i" in decision;
  if (compact && decision.i === -1 && decision.e === undefined && decision.kind === undefined)
    return { kind: "keep" };
  if (!compact && decision.kind === "keep") return { kind: "keep" };
  let candidate: ModelCatalogEntry | undefined;
  let reasoningLevel: unknown;
  if (compact) {
    if (
      decision.kind !== undefined ||
      typeof decision.i !== "number" ||
      !Number.isInteger(decision.i) ||
      decision.i < 0 ||
      decision.i >= candidates.length
    ) return null;
    candidate = candidates[decision.i];
    reasoningLevel = decision.e;
  } else {
    if (
      decision.kind !== "switch" ||
      typeof decision.providerId !== "string" ||
      typeof decision.modelId !== "string"
    ) return null;
    candidate = candidates.find(
      (entry) =>
        !entry.disabledReason &&
        entry.providerId === decision.providerId &&
        entry.modelId === decision.modelId,
    );
    reasoningLevel = decision.reasoningLevel;
  }
  if (!candidate) return null;
  if (candidate.disabledReason) return null;
  if (
    reasoningLevel !== undefined &&
    (typeof reasoningLevel !== "string" || !candidate.reasoningLevels.includes(reasoningLevel))
  ) {
    return null;
  }
  // 修复依据：同模型 effort 变更只在目录明确承诺缓存不失效时生效；未知 Provider 保留原档位。
  if (candidate.providerId === current.providerId && candidate.modelId === current.modelId) {
    if (
      !reasoningLevel ||
      reasoningLevel === current.options?.reasoningLevel ||
      candidate.effortChangePreservesCache !== true
    )
      return { kind: "keep" };
  }
  return {
    kind: "switch",
    selection: {
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      ...(reasoningLevel ? { options: { reasoningLevel } } : {}),
    },
  };
}

/** 首轮以外沿用实际执行模型；长续接不能仅按字符数误判为新任务。 */
export function shouldJudgeModelDispatch(input: {
  text: string;
  turnNumber: number;
  candidates: readonly ModelCatalogEntry[];
}): boolean {
  if (input.candidates.filter((entry) => !entry.disabledReason).length < 2) return false;
  // 修复依据：旧的 80 字阈值会在同一任务的长续接中再次付判断成本，甚至半途切模。
  return input.turnNumber === 0;
}

/** 续接默认沿用上一次真正响应的模型，而非未被自动调度改写的 Session Selection。 */
export function continuationModelSelection(input: {
  entries: readonly RuntimeMessageEntry[];
  candidates: readonly ModelCatalogEntry[];
  fallback: ModelSelection;
}): ModelSelection {
  const response = input.entries.findLast(
    (entry) =>
      entry.kind !== "attachment" &&
      entry.message.role === "assistant" &&
      Boolean(entry.message.providerId && entry.message.modelId),
  );
  if (!response || response.kind === "attachment") return input.fallback;
  const providerId = String(response.message.providerId);
  const modelId = String(response.message.modelId);
  if (
    !input.candidates.some(
      (entry) =>
        !entry.disabledReason && entry.providerId === providerId && entry.modelId === modelId,
    )
  )
    return input.fallback;
  const candidate = input.candidates.find(
    (entry) =>
      !entry.disabledReason && entry.providerId === providerId && entry.modelId === modelId,
  );
  const reasoningLevel = response.executionReasoningLevel;
  if (reasoningLevel && candidate?.reasoningLevels.includes(reasoningLevel)) {
    return { providerId, modelId, options: { reasoningLevel } };
  }
  return {
    providerId,
    modelId,
    ...(providerId === input.fallback.providerId &&
    modelId === input.fallback.modelId &&
    input.fallback.options
      ? { options: input.fallback.options }
      : {}),
  };
}
