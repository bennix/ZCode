import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntime } from "../src/runtime/agent-runtime.ts";

test("one Core turn lets the judge select an execution model without changing session selection", async () => {
  const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];
  const requests: Array<{ modelId: string; messages: unknown[] }> = [];
  const eventStore = {
    append: async (event: { type: string; payload?: Record<string, unknown> }) => {
      events.push(event);
      return { ...event, sequenceNumber: events.length };
    },
    getEvents: async () => events,
    getEventsAfter: async () => [],
    getLatestSequenceNumber: async () => events.length,
    deleteSession: async () => {},
  };
  const makeModel = (modelId: string) => ({
    providerId: "mock",
    modelId,
    displayName: modelId,
    properties: {
      contextWindow: 128_000,
      inputFormat: { supportsImage: false, supportsPdf: false, supportsVideo: false },
    },
    optionSpecs: { maxOutputTokens: { max: 4096 }, reasoningLevel: { values: [] } },
    options: {},
    bind() {
      return this;
    },
    async generateText(request: { messages: unknown[] }) {
      requests.push({ modelId, messages: request.messages });
      return {
        text:
          modelId === "judge"
            ? '{"kind":"switch","providerId":"mock","modelId":"strong"}'
            : "completed by strong",
        finishReason: "stop",
        usage: { inputTokens: 12, outputTokens: 5 },
        toolCalls: [],
      };
    },
    async *streamText() {
      throw new Error("streaming is disabled in this test");
    },
  });
  const runtime = new AgentRuntime(
    "session" as never,
    {
      modelSelection: { providerId: "mock", modelId: "fast" },
      modelStreaming: "off",
      maxTurns: 1,
      toolAllowlist: [],
      workingDirectory: "/tmp",
    },
    {
      eventStore: eventStore as never,
      modelFactory: ({ selection }) => makeModel(String(selection.modelId)) as never,
      modelCatalogPort: {
        listModels: () => [
          { providerId: "mock", modelId: "judge", reasoningLevels: [], current: false },
          { providerId: "mock", modelId: "fast", reasoningLevels: [], current: true },
          { providerId: "mock", modelId: "strong", reasoningLevels: [], current: false },
        ],
      },
    },
  );
  const result = await runtime.executeTurn(
    "修复登录状态同步，并确认断线重连后不会重复提交已接受的输入",
    undefined,
    {
      intent: { modelSelection: { providerId: "mock", modelId: "fast" } },
      modelExecution: {
        dispatcher: { providerId: "mock", modelId: "judge" },
        selectionScope: "execution",
      },
    } as never,
  );
  assert.equal(result.response, "completed by strong");
  assert.deepEqual(
    requests.map((request) => request.modelId),
    ["judge", "strong"],
  );
  assert.deepEqual(runtime.getSessionModelSelection(), { providerId: "mock", modelId: "fast" });
  const mainRequest = events.find(
    (event) => event.type === "model_request" && event.payload?.querySource === "main_turn",
  );
  assert.equal(mainRequest?.payload?.modelId, "strong");

  await runtime.executeTurn("继续验证", undefined, {
    intent: { modelSelection: { providerId: "mock", modelId: "fast" } },
    modelExecution: {
      dispatcher: { providerId: "mock", modelId: "judge" },
      selectionScope: "execution",
    },
  } as never);
  assert.deepEqual(
    requests.map((request) => request.modelId),
    ["judge", "strong", "strong"],
  );
  const continuation = JSON.stringify(requests[2]?.messages);
  assert.match(continuation, /修复登录状态同步/);
  assert.match(continuation, /completed by strong/);
  assert.match(continuation, /继续验证/);

  await runtime.executeTurn(
    "继续完成同一任务，确认断线重连后所有已接受输入都按原顺序投递，并检查跨 Host 路由的 owner lease 是否正确收敛。".repeat(
      3,
    ),
    undefined,
    {
      intent: { modelSelection: { providerId: "mock", modelId: "fast" } },
      modelExecution: {
        dispatcher: { providerId: "mock", modelId: "judge" },
        selectionScope: "execution",
      },
    } as never,
  );
  assert.deepEqual(
    requests.map((request) => request.modelId),
    ["judge", "strong", "strong", "strong"],
  );
  assert.deepEqual(runtime.getSessionModelSelection(), { providerId: "mock", modelId: "fast" });
});
