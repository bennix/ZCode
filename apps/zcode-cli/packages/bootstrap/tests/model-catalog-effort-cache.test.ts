import assert from "node:assert/strict";
import test from "node:test";
import { createModelCatalogPort, effortChangePreservesCache } from "../src/app/model-catalog-port.ts";

test("same-model effort cache compatibility requires official Anthropic Opus or Sonnet", () => {
  assert.equal(effortChangePreservesCache({ apiType: "anthropic-messages", modelId: "claude-opus-5-5" }), true);
  assert.equal(effortChangePreservesCache({ apiType: "anthropic-messages", modelId: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com/v1" }), true);
  assert.equal(effortChangePreservesCache({ apiType: "anthropic-messages", modelId: "claude-opus-5-5", baseUrl: "https://proxy.example.com" }), false);
  assert.equal(effortChangePreservesCache({ apiType: "openai-chat-completions", modelId: "anthropic/claude-opus-5.5" }), false);
  assert.equal(effortChangePreservesCache({ apiType: "anthropic-messages", modelId: "fable-1" }), false);
});

test("model catalog reads cache behavior from the live provider registry", () => {
  let baseUrl = "https://api.anthropic.com/v1";
  const port = createModelCatalogPort({
    registry: {
      getView: () => ({ providers: [{
        providerId: "direct",
        config: { api: { baseUrl, resolveModelApiType: () => "anthropic-messages" } },
        models: [{ modelId: "claude-sonnet-5-5", config: {
          optionSpecs: { reasoningLevel: { values: ["low", "high"] } },
          properties: { contextWindow: 200_000 },
        } }],
      }] }),
    } as never,
    currentSelection: () => ({ providerId: "direct", modelId: "claude-sonnet-5-5" }),
  });
  assert.equal(port.listModels()[0]?.effortChangePreservesCache, true);
  baseUrl = "https://proxy.example.com";
  assert.equal(port.listModels()[0]?.effortChangePreservesCache, undefined);
});
