import assert from "node:assert/strict";
import test from "node:test";
import { zcodeTaskTokenUsageResultSchema } from "../src/zcode-protocol/index.ts";
import { v4ConversationUsageResultSchema } from "../src/zcode-protocol-v4/transport.ts";

const previousHostResult = {
  sessionId: "session",
  totalTokens: 162,
  inputTokens: 130,
  outputTokens: 32,
  reasoningTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  modelRequestCount: 3,
  modelErrorCount: 0,
  inputBaselineBySource: { main_turn: 120 },
};

test("usage protocols preserve missing request totals from older hosts", () => {
  for (const schema of [zcodeTaskTokenUsageResultSchema, v4ConversationUsageResultSchema]) {
    const parsed = schema.parse(previousHostResult);
    assert.equal(parsed.requestTotalTokens, undefined);
    assert.equal(parsed.dispatchRequestTokens, undefined);
  }
});

test("usage protocols validate separate request and dispatcher totals", () => {
  const result = {
    ...previousHostResult,
    requestTotalTokens: 262,
    requestInputTokens: 230,
    requestOutputTokens: 32,
    requestCacheCreationTokens: 5,
    requestCacheReadTokens: 100,
    mainRequestTokens: 250,
    dispatchRequestTokens: 12,
  };
  for (const schema of [zcodeTaskTokenUsageResultSchema, v4ConversationUsageResultSchema]) {
    assert.deepEqual(schema.parse(result), result);
    assert.equal(schema.safeParse({ ...result, dispatchRequestTokens: -1 }).success, false);
  }
});
