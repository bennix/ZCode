import assert from "node:assert/strict";
import test from "node:test";
import { createRootTraceContext } from "@zcode/contracts";
import { taskOutputToolEntry } from "../src/tool/handlers/task-output.ts";
import { drainRuntimeCommandQueue } from "../src/runtime/methods/runtime-command-queue.ts";

test("TaskOutput settles an admitted child notification before claiming it in memory", async () => {
  const order: string[] = [];
  const task = {
    taskId: "child-1",
    type: "local_agent",
    status: "completed",
    description: "Inspect files",
    notificationRequestId: "notice-child-1",
    notified: false,
    output: { status: "completed", content: [{ text: "done" }] },
  };
  const result = await taskOutputToolEntry.handler({ task_id: "child-1", block: false }, {
    abortSignal: new AbortController().signal,
    sessionId: "session",
    runtimeTaskRegistry: {
      get: () => task,
      update: (_id: string, patch: (current: typeof task) => typeof task) => {
        order.push("registry");
        Object.assign(task, patch(task));
      },
    },
    sessionStore: {
      settleSessionInput: async (input: { id: string; reason?: string }) => {
        assert.equal(input.id, "notice-child-1");
        assert.equal(input.reason, "task_output_consumed");
        order.push("ledger");
      },
    },
  } as never);
  assert.equal((result as { retrieval_status: string }).retrieval_status, "success");
  assert.deepEqual(order, ["ledger", "registry"]);
  assert.equal(task.notified, true);
});

test("TaskOutput for an old lifecycle does not claim a rearmed child", async () => {
  let task = {
    taskId: "child-1",
    type: "local_agent",
    status: "completed",
    description: "Inspect files",
    notificationRequestId: "old-notice",
    notified: false,
    output: { status: "completed", content: [{ text: "old result" }] },
  };
  const result = await taskOutputToolEntry.handler({ task_id: "child-1", block: false }, {
    abortSignal: new AbortController().signal,
    sessionId: "session",
    runtimeTaskRegistry: {
      get: () => task,
      update: (_id: string, patch: (current: typeof task) => typeof task) => {
        task = patch(task);
      },
    },
    sessionStore: {
      settleSessionInput: async () => {
        task = { ...task, notificationRequestId: "new-notice", status: "running" };
      },
    },
  } as never);
  assert.equal((result as { retrieval_status: string }).retrieval_status, "success");
  assert.equal(task.notificationRequestId, "new-notice");
  assert.equal(task.notified, false);
});

test("a discarded notification command cannot start another model turn", async () => {
  const command = {
    id: "notice-child-1",
    branchGeneration: 2,
    createdAt: new Date(),
    mode: "task-notification",
    priority: "next",
    source: "background_task",
    taskId: "child-1",
    text: "done",
    traceContext: createRootTraceContext(),
  };
  let dequeued = false;
  let modelTurns = 0;
  const runtime = {
    branchGeneration: 2,
    config: { taskType: "parent" },
    runtimeCommandDrainActive: false,
    runtimeTaskRegistry: { get: () => undefined },
    runtimeCommandQueue: {
      dequeueNextBatch: () => {
        if (dequeued) return [];
        dequeued = true;
        return [command];
      },
      hasPending: () => false,
    },
    sessionStore: { getSessionInputById: async () => ({ status: "discarded" }) },
    executeTurnCommand: async () => {
      modelTurns += 1;
    },
  };
  await drainRuntimeCommandQueue.call(runtime as never);
  assert.equal(modelTurns, 0);
});

test("ledger read failure does not inject an unverified notification", async () => {
  const command = {
    id: "notice-child-1",
    branchGeneration: 2,
    createdAt: new Date(),
    mode: "task-notification",
    priority: "next",
    source: "background_task",
    taskId: "child-1",
    text: "done",
    traceContext: createRootTraceContext(),
  };
  let dequeued = false;
  let modelTurns = 0;
  const runtime = {
    branchGeneration: 2,
    config: { taskType: "parent" },
    runtimeCommandDrainActive: false,
    runtimeTaskRegistry: { get: () => undefined },
    runtimeCommandQueue: {
      dequeueNextBatch: () => {
        if (dequeued) return [];
        dequeued = true;
        return [command];
      },
      hasPending: () => false,
    },
    sessionStore: {
      getSessionInputById: async () => {
        throw new Error("disk unavailable");
      },
    },
    executeTurnCommand: async () => {
      modelTurns += 1;
    },
  };
  await drainRuntimeCommandQueue.call(runtime as never);
  assert.equal(modelTurns, 0);
});
