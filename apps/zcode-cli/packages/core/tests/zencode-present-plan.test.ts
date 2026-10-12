import assert from "node:assert/strict";
import test from "node:test";
import { ZencodePresentPlanInputSchema } from "@zcode/contracts";
import { zencodePresentPlanToolEntry } from "../src/tool/handlers/zencode-present-plan.ts";

const plan = {
  title: "Refactor auth",
  files: [
    { path: "src/auth.ts", intent: "edit", reason: "Update contract" },
    { path: "src/auth.test.ts", intent: "edit", reason: "Add coverage" },
  ],
} as const;

test("model cannot self-approve a file selection", async () => {
  assert.equal(ZencodePresentPlanInputSchema.safeParse({ ...plan, selectedPaths: ["src/auth.ts"] }).success, false);
  await assert.rejects(
    zencodePresentPlanToolEntry.handler(plan, { runtimeScope: "main", toolCallId: "plan-1" } as never),
  );
});

test("confirmed selection is a strict subset of offered workspace-relative paths", async () => {
  const activated: string[][] = [];
  const context = {
    runtimeScope: "main",
    toolCallId: "plan-1",
    turnId: "turn-1",
    fileSelectionGuard: { activate: (_turnId: string, paths: string[]) => activated.push(paths) },
  } as never;
  assert.deepEqual(
    await zencodePresentPlanToolEntry.handler({ ...plan, selectedPaths: ["src/auth.ts"] }, context),
    { status: "confirmed", selectedPaths: ["src/auth.ts"] },
  );
  assert.deepEqual(activated, [["src/auth.ts"]]);
  await assert.rejects(
    zencodePresentPlanToolEntry.handler({ ...plan, selectedPaths: ["src/other.ts"] }, context),
  );
  assert.equal(ZencodePresentPlanInputSchema.safeParse({ ...plan, files: [{ path: "../secret", intent: "edit", reason: "x" }] }).success, false);
});
