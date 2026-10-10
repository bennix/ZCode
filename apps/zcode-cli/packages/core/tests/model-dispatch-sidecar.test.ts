import assert from "node:assert/strict";
import test from "node:test";
import { createRootTraceContext } from "@zcode/contracts";
import { judgeTurnModel } from "../src/runtime/methods/model-dispatch-sidecar.ts";

const candidates = [
  { providerId: "p", modelId: "judge", reasoningLevels: [], current: false },
  { providerId: "p", modelId: "fast", reasoningLevels: [], current: true },
  { providerId: "p", modelId: "strong", reasoningLevels: ["low"], current: false },
];

function fakeRuntime(answer: string) {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const history = [{ message: { role: "user", content: "已有任务约束" } }];
  const requests: Array<{
    options?: { maxOutputTokens?: number };
    messages?: Array<{ content: string }>;
  }> = [];
  const factorySelections: Array<{ options?: { reasoningLevel?: string } }> = [];
  const model = {
    providerId: "p",
    modelId: "judge",
    displayName: "Judge",
    properties: {},
    optionSpecs: { reasoningLevel: { values: [] }, maxOutputTokens: { max: 4096 } },
    options: {},
    bind() {
      return this;
    },
    async generateText(request: {
      options?: { maxOutputTokens?: number };
      messages?: Array<{ content: string }>;
    }) {
      requests.push(request);
      return { text: answer, finishReason: "stop", usage: { inputTokens: 15, outputTokens: 7 } };
    },
    async streamText() {
      throw new Error("unused");
    },
  };
  return {
    runtime: {
      config: {},
      turnNumber: 0,
      modelCatalogPort: { listModels: () => candidates },
      modelFactory: (input?: { selection: { options?: { reasoningLevel?: string } } }) => {
        if (input) factorySelections.push(input.selection);
        return model;
      },
      messageHistory: { borrowReadOnlyRuntimeEntries: () => history },
      createEvent: (type: string, payload: Record<string, unknown>) => ({
        type,
        payload,
        timestamp: new Date(),
      }),
      appendEvent: async (event: { type: string; payload: Record<string, unknown> }) => {
        events.push(event);
      },
      createModelStatusSink: () => undefined,
      logger: { warn() {} },
    },
    events,
    history,
    requests,
    factorySelections,
  };
}

test("judge uses the lowest catalog effort when settings select only a model", async () => {
  const { runtime, factorySelections } = fakeRuntime('{"kind":"keep"}');
  runtime.modelCatalogPort = {
    listModels: () => [
      { ...candidates[0], reasoningLevels: ["low", "high"], defaultReasoningLevel: "high" },
      candidates[1],
    ],
  };
  await judgeTurnModel(runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast" },
    text: "检查登录状态同步并修复断线后重复提交已接受输入的问题",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.equal(factorySelections[0]?.options?.reasoningLevel, "low");

  const explicit = fakeRuntime('{"kind":"keep"}');
  explicit.runtime.modelCatalogPort = runtime.modelCatalogPort;
  await judgeTurnModel(explicit.runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge", options: { reasoningLevel: "high" } },
    current: { providerId: "p", modelId: "fast" },
    text: "检查登录状态同步并修复断线后重复提交已接受输入的问题",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.equal(explicit.factorySelections[0]?.options?.reasoningLevel, "high");
});

test("judge output is bounded by both the dispatch budget and its model limit", async () => {
  const { runtime, requests } = fakeRuntime('{"kind":"keep"}');
  const originalModelFactory = runtime.modelFactory;
  runtime.modelFactory = () => ({
    ...originalModelFactory(),
    optionSpecs: { reasoningLevel: { values: [] }, maxOutputTokens: { max: 640 } },
  });
  await judgeTurnModel(runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast" },
    text: "检查登录状态同步并修复断线后重复提交已接受输入的问题",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.options?.maxOutputTokens, 128);

  const regular = fakeRuntime('{"kind":"keep"}');
  await judgeTurnModel(regular.runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast" },
    text: "检查登录状态同步并修复断线后重复提交已接受输入的问题",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.equal(regular.requests[0]?.options?.maxOutputTokens, 128);
  assert.match(String(regular.requests[0]?.messages?.[1]?.content), /\{"i":-1\}/);
  assert.match(String(regular.requests[0]?.messages?.[1]?.content), /do not perform it/);
});

test("judge selects an available execution model without modifying shared history", async () => {
  const { runtime, events, history } = fakeRuntime(
    '{"kind":"switch","providerId":"p","modelId":"strong","reasoningLevel":"low"}',
  );
  const selected = await judgeTurnModel(runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast" },
    text: "修复登录页面在断网后重新连接时丢失已提交输入的问题",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.deepEqual(selected, {
    providerId: "p",
    modelId: "strong",
    options: { reasoningLevel: "low" },
  });
  assert.equal(history.length, 1);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.payload.querySource, "model_dispatch");
});

test("invalid judge output falls back to submitted model", async () => {
  const { runtime } = fakeRuntime('{"kind":"switch","providerId":"p","modelId":"missing"}');
  const selected = await judgeTurnModel(runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast" },
    text: "修复登录页面在断网后重新连接时丢失已提交输入的问题",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.equal(selected, null);
});

test("opaque attachments skip the judge instead of routing from incomplete text", async () => {
  const { runtime, events } = fakeRuntime('{"kind":"switch","providerId":"p","modelId":"strong"}');
  const selected = await judgeTurnModel(runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast" },
    text: "修复这个",
    hasAttachments: true,
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.equal(selected, null);
  assert.equal(events.length, 0);
});

test("judge token usage is recorded separately from the execution turn", async () => {
  const { runtime } = fakeRuntime('{"kind":"keep"}');
  const recorded: Array<Record<string, unknown>> = [];
  runtime.sessionId = "session";
  runtime.sessionStore = {
    recordModelUsage: async (fact: Record<string, unknown>) => {
      recorded.push(fact);
    },
    upsertTurnUsage: async () => {},
    upsertToolUsage: async () => {},
    pruneUsage: async () => {},
  };
  await judgeTurnModel(runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast" },
    text: "整理这个大型工作区中的登录状态，检查断线后是否会重复提交已接受的用户输入",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.querySource, "model_dispatch");
  assert.equal(recorded[0]?.modelId, "judge");
  assert.equal(recorded[0]?.inputTokens, 15);
  assert.equal(recorded[0]?.outputTokens, 7);
});

test("judge can lower effort on the current model only when the catalog allows it", async () => {
  const { runtime } = fakeRuntime(
    '{"kind":"switch","providerId":"p","modelId":"fast","reasoningLevel":"low"}',
  );
  runtime.modelCatalogPort = {
    listModels: () => [
      candidates[0],
      { ...candidates[1], reasoningLevels: ["low", "high"], effortChangePreservesCache: true },
      candidates[2],
    ],
  };
  const selected = await judgeTurnModel(runtime as never, {
    dispatcher: { providerId: "p", modelId: "judge" },
    current: { providerId: "p", modelId: "fast", options: { reasoningLevel: "high" } },
    text: "请检查复杂的登录状态同步并选合适的推理档位",
    traceContext: createRootTraceContext(),
    abortSignal: new AbortController().signal,
  });
  assert.deepEqual(selected, {
    providerId: "p",
    modelId: "fast",
    options: { reasoningLevel: "low" },
  });
});
