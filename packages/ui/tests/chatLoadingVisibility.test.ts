import assert from "node:assert/strict";
import test from "node:test";
import { hasChatLoadingBlockingInteraction } from "../src/v4/chatLoadingVisibility.ts";

test("file selection waits without a second chat loading indicator", () => {
  const pending = [
    { payload: { kind: "userInput", toolName: "zencode_present_plan" } },
  ] as never;
  assert.equal(hasChatLoadingBlockingInteraction(pending), true);
  assert.equal(
    hasChatLoadingBlockingInteraction([
      { payload: { kind: "userInput", toolName: "ExitPlanMode" } },
    ] as never),
    false,
  );
});
