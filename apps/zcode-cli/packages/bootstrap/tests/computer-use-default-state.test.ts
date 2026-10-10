import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS,
  OFFICIAL_CUA_PLUGIN_ID,
  OFFICIAL_PLUGIN_DEFINITIONS,
} from "../src/app/official-plugin-definitions.ts";

test("Computer Use is bundled but requires manual enablement", () => {
  const definition = OFFICIAL_PLUGIN_DEFINITIONS.find((item) => item.name === "computer-use");
  assert.ok(definition, "official Computer Use definition must remain available for seeding");
  assert.equal(definition.defaultEnabled, undefined);
  assert.equal(DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(OFFICIAL_CUA_PLUGIN_ID), false);
  assert.ok(definition.requiredSeedPaths?.includes(".zcode-plugin/plugin.json"));
  assert.ok(definition.runtimeTopLevelPaths?.includes("bin"));
});
