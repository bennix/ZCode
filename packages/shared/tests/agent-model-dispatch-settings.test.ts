import assert from "node:assert/strict";
import test from "node:test";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.ts";
import { modelExecutionSchema } from "../src/model-execution.ts";

test("automatic model dispatch is disabled for existing settings", () => {
  const settings = appSettingsSchema.parse({});
  assert.equal(settings.agentModelDispatchEnabled, false);
  assert.equal(settings.agentModelDispatcher, undefined);
});

test("turn-scoped dispatch config requires a complete dispatcher selection", () => {
  assert.deepEqual(
    modelExecutionSchema.parse({
      selectionScope: "execution",
      dispatcher: { providerId: "provider", modelId: "judge" },
    }).dispatcher,
    { providerId: "provider", modelId: "judge" },
  );
  assert.equal(
    modelExecutionSchema.safeParse({
      selectionScope: "execution",
      dispatcher: { providerId: "provider" },
    }).success,
    false,
  );
});

test("dispatcher selection is validated as a complete provider and model pair", () => {
  const selected = appSettingsPatchSchema.parse({
    agentModelDispatchEnabled: true,
    agentModelDispatcher: { providerId: "provider", modelId: "judge" },
  });
  assert.deepEqual(selected.agentModelDispatcher, { providerId: "provider", modelId: "judge" });
  assert.equal(
    appSettingsPatchSchema.safeParse({
      agentModelDispatcher: { providerId: "", modelId: "judge" },
    }).success,
    false,
  );
});
