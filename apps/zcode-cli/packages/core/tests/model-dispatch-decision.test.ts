import assert from "node:assert/strict";
import test from "node:test";
import {
  continuationModelSelection,
  parseModelDispatchDecision,
  selectModelDispatchCandidates,
  shouldJudgeModelDispatch,
} from "../src/runtime/methods/model-dispatch-decision.ts";
import { createMessageHistory, createRuntimeAssistantEntry } from "../src/agent/message-history.ts";
import { hydrateMessageHistoryFromSession } from "../src/agent/session-history-hydrator.ts";
import { persistAssistantMessage } from "../src/runtime/methods/message-persistence.ts";

const candidates = [
  { providerId: "p", modelId: "fast", reasoningLevels: ["low", "high"], current: true },
  { providerId: "p", modelId: "strong", reasoningLevels: ["low", "high"], current: false },
];
const current = { providerId: "p", modelId: "fast", options: { reasoningLevel: "high" } };

test("judge output must name an available model and supported effort", () => {
  assert.deepEqual(
    parseModelDispatchDecision(
      '{"kind":"switch","providerId":"p","modelId":"strong","reasoningLevel":"low"}',
      candidates,
      current,
    ),
    {
      kind: "switch",
      selection: { providerId: "p", modelId: "strong", options: { reasoningLevel: "low" } },
    },
  );
  assert.equal(
    parseModelDispatchDecision(
      '{"kind":"switch","providerId":"p","modelId":"unknown"}',
      candidates,
      current,
    ),
    null,
  );
  assert.equal(
    parseModelDispatchDecision(
      '{"kind":"switch","providerId":"p","modelId":"strong","reasoningLevel":"invalid"}',
      candidates,
      current,
    ),
    null,
  );
  assert.deepEqual(
    parseModelDispatchDecision(
      '{"kind":"switch","providerId":"p","modelId":"fast","reasoningLevel":"low"}',
      candidates,
      current,
    ),
    { kind: "keep" },
  );
  assert.deepEqual(
    parseModelDispatchDecision(
      '{"kind":"switch","providerId":"p","modelId":"fast","reasoningLevel":"low"}',
      [{ ...candidates[0]!, effortChangePreservesCache: true }, candidates[1]!],
      current,
    ),
    {
      kind: "switch",
      selection: { providerId: "p", modelId: "fast", options: { reasoningLevel: "low" } },
    },
  );
  assert.deepEqual(
    parseModelDispatchDecision(
      '{"kind":"switch","providerId":"p","modelId":"fast","reasoningLevel":"high"}',
      [{ ...candidates[0]!, effortChangePreservesCache: true }, candidates[1]!],
      current,
    ),
    { kind: "keep" },
  );
});

test("compact judge indices map only to this request's bounded catalog", () => {
  assert.deepEqual(
    parseModelDispatchDecision('{"i":1,"e":"low"}', candidates, current),
    { kind: "switch", selection: { providerId: "p", modelId: "strong", options: { reasoningLevel: "low" } } },
  );
  assert.deepEqual(parseModelDispatchDecision('{"i":-1}', candidates, current), { kind: "keep" });
  assert.equal(parseModelDispatchDecision('{"i":2}', candidates, current), null);
  assert.equal(parseModelDispatchDecision('{"i":0.5}', candidates, current), null);
  assert.equal(parseModelDispatchDecision('{"i":1,"e":"invalid"}', candidates, current), null);
  assert.deepEqual(parseModelDispatchDecision('{"i":0,"e":"low"}', candidates, current), { kind: "keep" });
});

test("continuation follows the last executed assistant model, then falls back if removed", () => {
  const entries = [
    {
      message: { role: "assistant", content: "done", providerId: "p", modelId: "strong" },
      executionReasoningLevel: "low",
    },
    { message: { role: "user", content: "continue" } },
  ];
  assert.deepEqual(
    continuationModelSelection({ entries: entries as never, candidates, fallback: current }),
    { providerId: "p", modelId: "strong", options: { reasoningLevel: "low" } },
  );
  assert.deepEqual(
    continuationModelSelection({
      entries: entries as never,
      candidates: candidates.slice(0, 1),
      fallback: current,
    }),
    current,
  );
});

test("continuation keeps the actual effort in live and cold-restored history", async () => {
  const live = createRuntimeAssistantEntry("done", undefined, undefined, {
    providerId: "p" as never,
    modelId: "strong" as never,
    options: { reasoningLevel: "low" },
  });
  assert.equal(live.executionReasoningLevel, "low");
  assert.equal("executionReasoningLevel" in live.message, false);
  const history = createMessageHistory();
  await hydrateMessageHistoryFromSession({
    history,
    messages: [
      {
        info: {
          id: "assistant" as never,
          role: "assistant",
          modelId: "strong",
          providerId: "p",
          reasoningLevel: "low",
          tokens: { total: 1, input: 0, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
        },
        parts: [{ type: "text", text: "done" }],
      },
    ] as never,
  });
  assert.deepEqual(
    continuationModelSelection({
      entries: history.borrowReadOnlyRuntimeEntries(),
      candidates,
      fallback: current,
    }),
    { providerId: "p", modelId: "strong", options: { reasoningLevel: "low" } },
  );
  assert.deepEqual(
    continuationModelSelection({
      entries: history.borrowReadOnlyRuntimeEntries(),
      candidates: [{ ...candidates[1]!, reasoningLevels: ["high"] }],
      fallback: current,
    }),
    { providerId: "p", modelId: "strong" },
  );
});

test("assistant persistence records the actual execution effort", async () => {
  let stored: { reasoningLevel?: string } | undefined;
  await persistAssistantMessage.call(
    {
      sessionId: "session",
      sessionStore: {},
      config: {},
      workingDirectory: "/workspace",
      workspaceRoot: "/workspace",
      getSessionModelSelection: () => current,
      getPlanEnabled: () => false,
      persistMessage: async (message: { reasoningLevel?: string }) => {
        stored = message;
      },
    } as never,
    "assistant" as never,
    "user" as never,
    1,
    undefined,
    {} as never,
    {
      providerId: "p",
      modelId: "strong",
      options: { reasoningLevel: "low" },
    } as never,
  );
  assert.equal(stored?.reasoningLevel, "low");
});

test("short and long continuations do not spend another judge request", () => {
  assert.equal(shouldJudgeModelDispatch({ text: "继续", turnNumber: 2, candidates }), false);
  assert.equal(
    shouldJudgeModelDispatch({
      text: "修复这部分状态同步问题并验证重连后两条链路的事件顺序".repeat(4),
      turnNumber: 2,
      candidates,
    }),
    false,
  );
  assert.equal(shouldJudgeModelDispatch({ text: "新会话第一轮", turnNumber: 0, candidates }), true);
});

test("large catalog still offers the current and dispatcher models", () => {
  const catalog = Array.from({ length: 30 }, (_, index) => ({
    providerId: "p",
    modelId: `model-${index}`,
    reasoningLevels: ["low"],
    current: index === 29,
  }));
  const offered = selectModelDispatchCandidates({
    candidates: catalog,
    current: { providerId: "p", modelId: "model-29" },
    dispatcher: { providerId: "p", modelId: "model-28" },
    limit: 24,
  });
  assert.equal(offered.length, 24);
  assert.deepEqual(
    offered.slice(0, 2).map((entry) => entry.modelId),
    ["model-29", "model-28"],
  );
});
