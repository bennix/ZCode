import assert from "node:assert/strict";
import test from "node:test";
import { createRootTraceContext } from "@zcode/contracts";
import { drainPendingRuntimeCommandsForActiveLoop } from "../src/runtime/methods/runtime-command-active-loop.ts";

function runtimeWithNotice(readLedger: () => Promise<{ status: string }>) {
  const command = {
    id: "notice-1",
    mode: "task-notification",
    priority: "next",
    branchGeneration: 0,
    source: "background_task",
    text: "child finished",
    traceContext: createRootTraceContext(),
  };
  const queued = [command];
  const writes: string[] = [];
  const runtime = {
    branchGeneration: 0,
    config: {},
    sessionStore: { getSessionInputById: readLedger },
    runtimeCommandQueue: {
      getByMaxPriority: () => [...queued],
      removeById: (id: string) => {
        const index = queued.findIndex((item) => item.id === id);
        return index < 0 ? undefined : queued.splice(index, 1)[0];
      },
    },
    runtimeTaskRegistry: { get: () => undefined },
    persistSyntheticUserNoticeForSession: async () => { writes.push("persist"); },
    ensureContextInitialized: async () => {},
    messageHistory: { addUser: () => { writes.push("history"); } },
  };
  return { runtime, queued, writes };
}

test("active loop skips a notification already settled by TaskOutput", async () => {
  const { runtime, queued, writes } = runtimeWithNotice(async () => ({ status: "discarded" }));
  const result = await drainPendingRuntimeCommandsForActiveLoop.call(runtime as never);
  assert.equal(result.drained, 0);
  assert.equal(queued.length, 0);
  assert.deepEqual(writes, []);
});

test("active loop retains notification when ledger read fails", async () => {
  const { runtime, queued, writes } = runtimeWithNotice(async () => { throw new Error("disk unavailable"); });
  const result = await drainPendingRuntimeCommandsForActiveLoop.call(runtime as never);
  assert.equal(result.drained, 0);
  assert.equal(queued.length, 1);
  assert.deepEqual(writes, []);
});
