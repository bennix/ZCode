import assert from "node:assert/strict";
import { test } from "node:test";
import { streamZenMuxChatCompletion } from "../src/zenmux.js";

function response(frames: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames)
          controller.enqueue(
            encoder.encode(
              `data: ${typeof frame === "string" ? frame : JSON.stringify(frame)}\n\n`,
            ),
          );
        controller.close();
      },
    }),
  );
}
const stop = { choices: [{ delta: { content: "done" }, finish_reason: "stop" }] };
const usage = (input: unknown, output: unknown) => ({
  choices: [],
  usage: { prompt_tokens: input, completion_tokens: output },
});
const base = {
  apiKey: "synthetic-key",
  model: "test-model",
  messages: [],
  onDelta: () => {},
  requireComplete: true,
};

test("reads usage after finish_reason and reports the final cumulative snapshot once", async () => {
  const reports: unknown[] = [];
  let body: Record<string, unknown> = {};
  await streamZenMuxChatCompletion({
    ...base,
    onUsage: (value) => reports.push(value),
    fetchImpl: async (_url, options) => {
      body = JSON.parse(String(options?.body));
      return response([stop, usage(10, 2), usage(12, 3), "[DONE]"]);
    },
  });
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.deepEqual(reports, [{ inputTokens: 12, outputTokens: 3 }]);
});

test("without a subscriber preserves the existing request and finish behavior", async () => {
  let body: Record<string, unknown> = {};
  await streamZenMuxChatCompletion({
    ...base,
    fetchImpl: async (_url, options) => {
      body = JSON.parse(String(options?.body));
      return response([stop, { error: { message: "late error" } }]);
    },
  });
  assert.equal(body.stream_options, undefined);
});

test("missing, negative and nonnumeric usage remain unknown", async () => {
  const reports: unknown[] = [];
  await streamZenMuxChatCompletion({
    ...base,
    onUsage: (value) => reports.push(value),
    fetchImpl: async () => response([stop, usage(-1, 3), usage("10", 3), usage(null, 3), "[DONE]"]),
  });
  assert.deepEqual(reports, []);
});

test("keeps reported usage from a failed request for retry cost accounting", async () => {
  const reports: unknown[] = [];
  await assert.rejects(
    streamZenMuxChatCompletion({
      ...base,
      onUsage: (value) => reports.push(value),
      fetchImpl: async () =>
        response([usage(8, 1), { error: { message: "overloaded", status: 503 } }]),
    }),
    /overloaded/u,
  );
  assert.deepEqual(reports, [{ inputTokens: 8, outputTokens: 1 }]);
});
