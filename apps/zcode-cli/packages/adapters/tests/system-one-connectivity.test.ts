import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiKeyAccessConfig,
  ProviderApiConfig,
  ProviderConfig,
  createRegistryProviderConfig,
  type RegistryModelConfig,
} from "@zcode/provider";
import { ZENMUX_SYSTEM_ONE_MODEL_ID } from "@zcode/shared";
import { AiSdkModelAdapter } from "../src/model/runner.js";

test("System One connectivity probe posts to /systemone", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    url = String(input);
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ready: "ok" }), {
      headers: { "content-type": "application/json" },
    });
  };
  const adapter = new AiSdkModelAdapter({
    runtime: {
      generateText: async () => {
        throw new Error("chat generate should not run");
      },
      streamText: () => {
        throw new Error("chat stream should not run");
      },
    },
  });
  const provider = createRegistryProviderConfig(
    new ProviderConfig({
      group: "standard-personal",
      access: new ApiKeyAccessConfig({ apiKey: "test-key" }),
      api: new ProviderApiConfig({
        type: "openai-chat-completions",
        baseUrl: "https://zenmux.ai/api/v1",
      }),
    }),
  );
  if (!provider.ok) throw new Error("invalid provider fixture");
  const model = adapter.createModel({
    providerId: "zenmux",
    modelId: ZENMUX_SYSTEM_ONE_MODEL_ID,
    providerConfig: provider.config,
    modelConfig: {
      properties: {
        supportsJsonSchemaOutput: false,
        supportsToolCall: false,
        inputFormat: {
          supportsText: true,
          supportsImage: false,
          supportsPdf: false,
          supportsVideo: false,
          supportsAudio: false,
        },
      },
      optionSpecs: {
        reasoningLevel: { values: ["low"], map: '{"reasoning_effort": reasoningLevel}' },
        maxOutputTokens: { max: 16, map: "{'max_tokens': maxOutputTokens}" },
      },
    } as RegistryModelConfig,
  });
  try {
    const events = [];
    for await (const event of model.streamText({
      messages: [
        { role: "system", content: "You are ZCode connectivity probe." },
        { role: "user", content: "hi" },
      ],
    })) {
      events.push(event.type);
    }
    assert.deepEqual(events, ["finish"]);
    assert.equal(url, "https://zenmux.ai/api/v1/systemone");
    assert.equal(body.model, ZENMUX_SYSTEM_ONE_MODEL_ID);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
