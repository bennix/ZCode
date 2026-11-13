import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTitleModelSelection } from "../src/runtime/helpers/title-model-selection.js";
import {
  createEnterPlanModeProviderDescription,
  EXIT_PLAN_MODE_MODEL_INSTRUCTIONS,
} from "../src/tool/handlers/plan-mode-prompts.js";
import { cronCreateToolEntry } from "../src/tool/handlers/cron.js";

test("title selection respects explicit settings, configured research role, and session fallback", () => {
  const main = { providerId: "test", modelId: "main" };
  const research = { providerId: "test", modelId: "small" };
  const explicit = { providerId: "test", modelId: "title" };
  assert.equal(resolveTitleModelSelection({}, main), main);
  assert.equal(resolveTitleModelSelection({}, undefined), undefined);
  const subagents = { builtInModelSelectionOverrides: { Explore: research } };
  assert.equal(resolveTitleModelSelection({ subagents }, main), research);
  assert.equal(
    resolveTitleModelSelection({ subagents, titleGeneration: { modelSelection: explicit } }, main),
    explicit,
  );
});

test("compact plan instructions retain tool variants and approval rules", () => {
  const standard = createEnterPlanModeProviderDescription();
  const embedded = createEnterPlanModeProviderDescription({ embeddedSearchEnabled: true });
  assert.ok(standard.length < 1000);
  assert.ok(embedded.includes("`find`/Glob"));
  assert.ok(standard.includes("ExitPlanMode for user approval"));
  assert.ok(EXIT_PLAN_MODE_MODEL_INSTRUCTIONS[0].includes("required plan parameter"));
});

test("compact scheduling instructions preserve relative, interval, and finite-run rules", () => {
  const text = cronCreateToolEntry.metadata.modelInstructions?.join("\n") ?? "";
  for (const rule of [
    "delayMinutes",
    "real clock",
    "intervalUnit",
    "1-200",
    "maxRuns=N",
    "Never ask the scheduled run",
  ]) {
    assert.ok(text.includes(rule), rule);
  }
  assert.equal(cronCreateToolEntry.metadata.needsApproval, true);
});
