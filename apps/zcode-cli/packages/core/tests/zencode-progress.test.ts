import assert from "node:assert/strict";
import test from "node:test";
import { zencodeMarkProgressToolEntry } from "../src/tool/handlers/zencode-progress.ts";

test("milestone tool validates and returns only the accepted stage", async () => {
  const context = { runtimeScope: "main", toolCallId: "tool-1" } as never;
  const result = await zencodeMarkProgressToolEntry.handler(
    { stage: "verification", summary: "  Typecheck passed  " },
    context,
  );
  assert.deepEqual(result, { stage: "verification", summary: "Typecheck passed" });
  await assert.rejects(
    zencodeMarkProgressToolEntry.handler({ stage: "verification", summary: "x".repeat(241) }, context),
  );
});

test("child runtime cannot claim the foreground milestone", async () => {
  await assert.rejects(
    zencodeMarkProgressToolEntry.handler(
      { stage: "complete", summary: "Done" },
      { runtimeScope: "subagent", toolCallId: "tool-child" } as never,
    ),
  );
});
