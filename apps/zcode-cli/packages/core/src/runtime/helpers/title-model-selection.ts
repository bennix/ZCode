import type { AgentRuntimeConfig } from "../types.js";
import type { ModelSelection } from "../deps.js";

export function resolveTitleModelSelection(
  config: AgentRuntimeConfig,
  sessionSelection: ModelSelection | undefined,
): ModelSelection | undefined {
  // 标题属于轻量辅助任务，复用已配置的检索模型，避免默认消耗主会话昂贵模型。
  return (
    config.titleGeneration?.modelSelection ??
    config.subagents?.builtInModelSelectionOverrides?.Explore ??
    sessionSelection
  );
}
