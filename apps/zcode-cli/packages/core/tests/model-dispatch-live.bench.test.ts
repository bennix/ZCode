import assert from "node:assert/strict";
import test from "node:test";
import { modelMessageContentToText } from "@zcode/contracts";
import { AgentRuntime } from "../src/runtime/agent-runtime.ts";

const BASE_URL = "https://zenmux.ai/api/v1/chat/completions";
const FAST = "anthropic/claude-haiku-5.5";
const STRONG = "anthropic/claude-sonnet-5.5";
const JUDGE = process.env.ZENCODE_BENCH_JUDGE_MODEL?.trim() || FAST;
const TASK =
  "Refactor this JavaScript function without changing behavior. Return only the revised code: function double(value) { return value * 2; }";

interface RequestUsage {
  model: string;
  reasoningLevel?: string;
  decisionPreview?: string;
  querySource: string;
  status: "pending" | "completed" | "http_error" | "empty_response" | "network_error";
  httpStatus?: number;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reportedCostUsd: number | null;
}

async function executeCase(label: "off" | "on", apiKey: string) {
  const requests: RequestUsage[] = [];
  const requestFingerprints: string[] = [];
  const responseTexts: Array<string | undefined> = [];
  const fingerprint = (
    messages: Array<{ role: string; content: Parameters<typeof modelMessageContentToText>[0] }>,
  ) =>
    JSON.stringify(
      messages.map((message) => [message.role, modelMessageContentToText(message.content)]),
    );
  const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];
  const eventStore = {
    append: async (event: (typeof events)[number]) => {
      events.push(event);
      return { ...event, sequenceNumber: events.length };
    },
    getEvents: async () => events,
    getEventsAfter: async () => [],
    getLatestSequenceNumber: async () => events.length,
    deleteSession: async () => {},
  };
  const modelFactory = ({
    selection,
  }: {
    selection: { modelId: string; options?: { reasoningLevel?: string } };
  }) => {
    const modelId = String(selection.modelId);
    const reasoningLevel = selection.options?.reasoningLevel;
    const model = {
      providerId: "zenmux",
      modelId,
      displayName: modelId,
      properties: {
        contextWindow: 128_000,
        inputFormat: { supportsImage: false, supportsPdf: false, supportsVideo: false },
      },
      optionSpecs: {
        maxOutputTokens: { max: 512 },
        reasoningLevel: { values: modelId === FAST ? ["low"] : [] },
      },
      options: reasoningLevel ? { reasoningLevel } : {},
      bind() {
        return this;
      },
      async generateText(request: {
        messages: Array<{ role: string; content: Parameters<typeof modelMessageContentToText>[0] }>;
        abortSignal?: AbortSignal;
        options?: { maxOutputTokens?: number };
      }) {
        // 根因：会话标题请求可能与调度请求并行，完成顺序不能作为事件归因依据。
        const row: RequestUsage = {
          model: modelId,
          ...(reasoningLevel ? { reasoningLevel } : {}),
          querySource: "unclassified",
          status: "pending",
          promptTokens: 0,
          completionTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reportedCostUsd: null,
        };
        requests.push(row);
        requestFingerprints.push(fingerprint(request.messages));
        responseTexts.push(undefined);
        let response: Response;
        try {
          response = await fetch(BASE_URL, {
            method: "POST",
            signal: request.abortSignal,
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId,
              max_tokens: Math.min(request.options?.maxOutputTokens ?? 512, 512),
              ...(reasoningLevel ? { reasoning_effort: reasoningLevel } : {}),
              messages: request.messages.map((message) => ({
                role: message.role,
                content: modelMessageContentToText(message.content),
              })),
            }),
          });
        } catch (error) {
          row.status = "network_error";
          throw error;
        }
        const body = (await response.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            cost?: string;
            prompt_tokens_details?: {
              cached_tokens?: number;
              cacheCreationInputTokens?: number;
            };
          };
        };
        row.httpStatus = response.status;
        row.promptTokens = body.usage?.prompt_tokens ?? 0;
        row.completionTokens = body.usage?.completion_tokens ?? 0;
        row.cacheReadTokens = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
        row.cacheWriteTokens = body.usage?.prompt_tokens_details?.cacheCreationInputTokens ?? 0;
        row.reportedCostUsd = body.usage?.cost === undefined ? null : Number(body.usage.cost);
        if (response.status !== 200) {
          row.status = "http_error";
          throw new Error(`${modelId} request failed with HTTP ${response.status}`);
        }
        const text = body.choices?.[0]?.message?.content;
        if (typeof text !== "string" || text.length === 0) {
          row.status = "empty_response";
          throw new Error(`${modelId} returned no text`);
        }
        row.status = "completed";
        responseTexts[requests.indexOf(row)] = text;
        return {
          text,
          finishReason: body.choices?.[0]?.finish_reason ?? "stop",
          usage: {
            inputTokens: row.promptTokens,
            outputTokens: row.completionTokens,
            totalTokens: body.usage?.total_tokens ?? row.promptTokens + row.completionTokens,
            cacheReadTokens: row.cacheReadTokens,
            cacheWriteTokens: row.cacheWriteTokens,
          },
          toolCalls: [],
        };
      },
      async *streamText(): AsyncGenerator<never> {
        throw new Error("Live comparison runs without streaming");
      },
    };
    return model;
  };
  const runtime = new AgentRuntime(
    `dispatch-live-${label}` as never,
    {
      modelSelection: { providerId: "zenmux", modelId: STRONG },
      modelStreaming: "off",
      maxTurns: 1,
      toolAllowlist: [],
      workingDirectory: "/tmp",
      systemPrompt: "You are a concise JavaScript coding assistant.",
    },
    {
      eventStore: eventStore as never,
      modelFactory: modelFactory as never,
      modelCatalogPort: {
        listModels: () => [
          { providerId: "zenmux", modelId: FAST, reasoningLevels: ["low"], current: false },
          { providerId: "zenmux", modelId: STRONG, reasoningLevels: [], current: true },
          ...(JUDGE === FAST || JUDGE === STRONG
            ? []
            : [{ providerId: "zenmux", modelId: JUDGE, reasoningLevels: [], current: false }]),
        ],
      },
    },
  );
  const result = await runtime.executeTurn(TASK, undefined, {
    intent: { modelSelection: { providerId: "zenmux", modelId: STRONG } },
    ...(label === "on"
      ? {
          modelExecution: {
            dispatcher: { providerId: "zenmux", modelId: JUDGE },
            selectionScope: "execution",
          },
        }
      : {}),
  } as never);
  assert.ok(result.response.trim().length > 0);
  const modelRequestEvents = events.filter((event) => event.type === "model_request");
  const unmatchedEvents = [...modelRequestEvents];
  for (const [index, row] of requests.entries()) {
    const eventIndex = unmatchedEvents.findIndex(
      (event) =>
        event.payload?.modelId === row.model &&
        Array.isArray(event.payload?.messages) &&
        fingerprint(event.payload.messages as Parameters<typeof fingerprint>[0]) ===
          requestFingerprints[index],
    );
    assert.notEqual(eventIndex, -1, `No ModelRequest matches ${row.model} call ${index}`);
    const [event] = unmatchedEvents.splice(eventIndex, 1);
    row.querySource = String(event.payload?.querySource ?? "unknown");
    if (process.env.ZENCODE_BENCH_DEBUG === "1" && row.querySource === "model_dispatch") {
      row.decisionPreview = responseTexts[index]?.slice(0, 256);
    }
  }
  assert.equal(
    unmatchedEvents.length,
    0,
    "All Core ModelRequest events must reach the provider wrapper",
  );
  return {
    label,
    requests,
    executionModel: requests.findLast((row) => row.querySource === "main_turn")?.model,
    requestTotalTokens: requests.reduce(
      (sum, row) => sum + row.promptTokens + row.completionTokens,
      0,
    ),
    dispatchRequestTokens: requests
      .filter((row) => row.querySource === "model_dispatch")
      .reduce((sum, row) => sum + row.promptTokens + row.completionTokens, 0),
    cacheReadTokens: requests.reduce((sum, row) => sum + row.cacheReadTokens, 0),
    cacheWriteTokens: requests.reduce((sum, row) => sum + row.cacheWriteTokens, 0),
    reportedCostUsd: requests.every((row) => row.reportedCostUsd !== null)
      ? requests.reduce((sum, row) => sum + row.reportedCostUsd!, 0)
      : null,
  };
}

test(
  "live ZenMux dispatch comparison reports both full Core turns",
  {
    timeout: 120_000,
    skip: process.env.ZENCODE_LIVE_DISPATCH_BENCH !== "1",
  },
  async () => {
    const apiKey = process.env.ZENMUX_API_KEY;
    assert.ok(apiKey, "ZENMUX_API_KEY is required for the opt-in live comparison");
    const off = await executeCase("off", apiKey);
    const on = await executeCase("on", apiKey);
    assert.equal(off.requests.length, 1);
    assert.ok(on.requests.length >= 1);
    assert.equal(off.executionModel, STRONG);
    // 只输出合成任务的模型和用量，不输出凭据或请求正文。
    process.stdout.write(`${JSON.stringify({ off, on })}\n`);
  },
);
