import assert from "node:assert/strict";
import test from "node:test";
import { pendingPresentPlanToElicitationEvent } from "../src/zcode-agent/zcodeTaskServiceAdapter.ts";

test("pending file selection can be rebuilt from the durable permission snapshot", () => {
  const event = pendingPresentPlanToElicitationEvent("session-1", {
    toolName: "zencode_present_plan",
    requestId: "tool-call-1",
    input: {
      title: "Refactor auth",
      files: [
        { path: "src/auth.ts", intent: "edit", reason: "Update contract" },
        { path: "src/auth.test.ts", intent: "edit", reason: "Add coverage" },
      ],
    },
  } as never);
  assert.equal(event?.requestId, "tool-call-1");
  assert.equal(event?.schema && (event.schema as Record<string, unknown>).interaction, "file_selection");
  assert.deepEqual(event?.options.map((option) => option.value), ["src/auth.ts", "src/auth.test.ts"]);
  assert.equal(event?.questions?.[0]?.multiSelect, true);
});
