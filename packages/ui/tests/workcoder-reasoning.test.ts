import assert from "node:assert/strict";
import { test } from "node:test";
import { reasoningBody, supportedEfforts } from "../src/v4/composer/reasoningEffort.js";

test("an explicitly empty parameter map exposes no-reasoning even for Astra", () => {
  assert.deepEqual(supportedEfforts("openai/gpt-6-astra", ["none"], "{}"), ["none"]);
  assert.deepEqual(supportedEfforts("openai/gpt-6-astra", ["none", "high"]), ["high"]);
});

test("none does not accidentally enable Claude thinking or send unsupported OpenAI effort", () => {
  for (const model of [
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-opus-5.5",
    "openai/gpt-6-astra",
    "custom/model",
  ]) {
    assert.equal(reasoningBody(model, "none"), undefined);
  }
  assert.deepEqual(reasoningBody("anthropic/claude-opus-5.5", "low"), {
    thinking: { type: "enabled", budget_tokens: 4000 },
  });
});
