import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  coDesignDocumentSchema,
  validateCoDesignState,
  EMPTY_CODESIGN,
} from "../../shared/src/studio-codesign.js";

test("CoDesign rejects CSS injection, duplicate plans and out-of-range controls", () => {
  const tweak = {
    id: "accent",
    label: "Accent",
    token: "--accent",
    kind: "color",
    value: "#112233",
  };
  assert.throws(() =>
    validateCoDesignState({
      ...EMPTY_CODESIGN,
      tweaks: [{ ...tweak, value: "red;}body{display:none}" }],
    }),
  );
  assert.throws(() =>
    validateCoDesignState({ ...EMPTY_CODESIGN, tweaks: [tweak, { ...tweak, id: "second" }] }),
  );
  assert.throws(() =>
    validateCoDesignState({
      ...EMPTY_CODESIGN,
      tweaks: [{ ...tweak, kind: "number", value: 12, min: 0, max: 10, unit: "px" }],
    }),
  );
  assert.throws(() => validateCoDesignState({ ...EMPTY_CODESIGN, secret: "unexpected" }));
  assert.deepEqual(validateCoDesignState(EMPTY_CODESIGN), EMPTY_CODESIGN);
});
test("builtin CoDesign schema matches runtime schema and is required in bundle", async () => {
  const prefix = "apps/zcode-cli/packages/bundled-skills/skills/codesign/";
  assert.deepEqual(
    JSON.parse(await readFile(prefix + "schema.json", "utf8")),
    z.toJSONSchema(coDesignDocumentSchema),
  );
  const bundle = await readFile(
    "apps/zcode-cli/packages/bootstrap/src/app/bundled-skills.ts",
    "utf8",
  );
  assert.ok(bundle.includes('"skills/codesign/SKILL.md"'));
  assert.ok(bundle.includes('"skills/codesign/schema.json"'));
});
