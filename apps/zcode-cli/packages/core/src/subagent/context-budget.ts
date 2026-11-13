import type { AutoCompactPolicyConfig } from "../compact/policy.js";

const DEFAULT_SUBAGENT_CONTEXT_WINDOW = 96_000;

function positiveWindow(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : undefined;
}

export function resolveSubagentCompactConfig(
  parent: AutoCompactPolicyConfig | undefined,
  modelContextWindow: number | undefined,
): AutoCompactPolicyConfig {
  // 子任务会反复发送工具历史，不能沿用百万级模型容量才开始清理。
  // 显式压缩策略继续生效，并始终受实际模型容量约束。
  return {
    ...parent,
    contextWindow: Math.min(
      positiveWindow(parent?.contextWindow) ?? DEFAULT_SUBAGENT_CONTEXT_WINDOW,
      positiveWindow(modelContextWindow) ?? DEFAULT_SUBAGENT_CONTEXT_WINDOW,
    ),
    microcompact: {
      enabled: true,
      keepRecentToolResults: 3,
      ...parent?.microcompact,
    },
  };
}
