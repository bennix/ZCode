import type { ConversationSnapshot } from "@zcode/shared/zcode-protocol-v4";

/** 仅根据已报告的主请求用量提示；缺失缓存数据不能推断为缓存失效。 */
export function sharedModelContextHealth(usage: ConversationSnapshot["usage"]): {
  contextNearLimit: boolean;
  latestCacheHitLow: boolean;
} {
  const window = usage.contextWindow;
  const cache = window?.cache;
  return {
    contextNearLimit: Boolean(window && window.maxTokens > 0 && window.usedTokens / window.maxTokens >= 0.8),
    latestCacheHitLow: Boolean(
      cache &&
      (cache.hitRateRequestCount ?? 0) >= 2 &&
      cache.inputTokens >= 2_000 &&
      cache.latestHitRate !== null &&
      cache.latestHitRate !== undefined &&
      cache.latestHitRate < 0.1
    ),
  };
}
