import assert from "node:assert/strict";
import test from "node:test";
import { sharedModelContextHealth } from "../src/v4/sharedModelContextHealth.ts";

test("context health uses reported main request usage and suppresses missing cache data", () => {
  const cumulative = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  assert.deepEqual(sharedModelContextHealth({ cumulative, contextWindow: null }), {
    contextNearLimit: false,
    latestCacheHitLow: false,
  });
  const base = {
    usedTokens: 8_000,
    maxTokens: 10_000,
    autoCompactThresholdTokens: null,
  };
  assert.deepEqual(sharedModelContextHealth({ cumulative, contextWindow: base }), {
    contextNearLimit: true,
    latestCacheHitLow: false,
  });
  assert.deepEqual(sharedModelContextHealth({
    cumulative,
    contextWindow: {
      ...base,
      cache: {
        inputTokens: 3_000,
        cacheReadTokens: 100,
        cacheWriteTokens: 0,
        latestHitRate: 0.03,
        hitRateRequestCount: 2,
        hitRate: 0.2,
      },
    },
  }), {
    contextNearLimit: true,
    latestCacheHitLow: true,
  });
});
