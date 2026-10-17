import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReferenceStages,
  runReferenceStages,
} from "../src/v4/composer/studio/studioReferenceStages.js";
const references = [
  { id: "f", url: "face", kind: "face" as const, person: 2 },
  { id: "b", url: "body", kind: "body" as const },
  { id: "s", url: "scene", kind: "scene" as const },
  { id: "c", url: "clothes", kind: "clothing" as const },
];
test("references isolate roles and apply clothing, background, identity in order", () => {
  const stages = buildReferenceStages(references);
  assert.deepEqual(
    stages.map((s) => s.reference.url),
    ["clothes", "scene", "face"],
  );
  assert.match(stages[2]!.prompt, /person 2/);
  assert.match(stages[1]!.prompt, /ENTIRE background/);
  assert.doesNotMatch(stages[1]!.prompt, /Preserve identity, face, hair, pose and background/);
});
test("each stage receives only the preceding output and its dedicated reference", async () => {
  const calls: string[][] = [];
  const result = await runReferenceStages({
    initial: "base",
    references,
    signal: new AbortController().signal,
    onStage() {},
    generate: async (working, ref) => {
      calls.push([working, ref.url]);
      return ref.url;
    },
  });
  assert.deepEqual(calls, [
    ["base", "clothes"],
    ["clothes", "scene"],
    ["scene", "face"],
  ]);
  assert.equal(result, "face");
});
test("cancellation after a response prevents later paid requests and final result", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    runReferenceStages({
      initial: "base",
      references,
      signal: controller.signal,
      onStage() {},
      generate: async () => {
        calls++;
        controller.abort();
        return "late";
      },
    }),
  );
  assert.equal(calls, 1);
});
