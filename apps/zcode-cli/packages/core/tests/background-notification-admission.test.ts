import assert from "node:assert/strict";
import { test } from "node:test";
import { createRootTraceContext } from "@zcode/contracts";
import { enqueueBackgroundTaskNotification } from "../src/runtime/methods/background-notifications.ts";

const traceContext = createRootTraceContext();

function runtimeForNotification(input: { shuttingDown?: boolean; taskBranch?: number } = {}) {
  const commands: unknown[] = [];
  const runtime = {
    shuttingDown: input.shuttingDown ?? false,
    branchGeneration: 2,
    runtimeTaskRegistry: {
      get: () =>
        input.taskBranch === undefined ? undefined : { branchGeneration: input.taskBranch },
    },
    enqueueRuntimeCommand: (command: unknown) => {
      commands.push(command);
    },
  };
  return { runtime, commands };
}

test("background notification admission reports accepted only when it really enters the parent queue", async () => {
  for (const scenario of [
    { input: { shuttingDown: true }, expected: false },
    { input: { taskBranch: 1 }, expected: false },
    { input: { taskBranch: 2 }, expected: true },
  ]) {
    const { runtime, commands } = runtimeForNotification(scenario.input);
    const accepted = await enqueueBackgroundTaskNotification.call(runtime as never, {
      taskId: "child-1",
      text: "done",
      traceContext,
    });
    assert.equal(accepted, scenario.expected);
    assert.equal(commands.length, scenario.expected ? 1 : 0);
  }
});

test("stable subagent notification rejects a store without atomic promotion", async () => {
  let writes = 0;
  const { runtime, commands } = runtimeForNotification();
  Object.assign(runtime, {
    sessionStore: {
      saveSessionInput: async () => { writes++; },
      getSessionInputById: async () => ({ status: "admitted" }),
    },
  });
  const accepted = await enqueueBackgroundTaskNotification.call(runtime as never, {
    requestId: "stable-child-result",
    taskId: "child-1",
    text: "done",
    traceContext,
  });
  assert.equal(accepted, false);
  assert.equal(writes, 0);
  assert.equal(commands.length, 0);
});

test("persistent background notification without stable ID also requires atomic promotion", async () => {
  let writes = 0;
  const { runtime, commands } = runtimeForNotification();
  Object.assign(runtime, {
    sessionStore: {
      saveSessionInput: async () => { writes++; },
      getSessionInputById: async () => ({ status: "admitted" }),
    },
  });
  const accepted = await enqueueBackgroundTaskNotification.call(runtime as never, {
    taskId: "bash-1",
    text: "done",
    traceContext,
  });
  assert.equal(accepted, false);
  assert.equal(writes, 0);
  assert.equal(commands.length, 0);
});

test("background notification begins ledger admission before the queue can drain", async () => {
  const order: string[] = [];
  const runtime = {
    shuttingDown: false,
    branchGeneration: 2,
    runtimeTaskRegistry: { get: () => ({ branchGeneration: 2 }) },
    sessionId: "session",
    sessionStore: {
      saveSessionInput: (input: { payload: { branchGeneration: number } }) => {
        assert.equal(input.payload.branchGeneration, 2);
        order.push("ledger");
        return Promise.resolve();
      },
      getSessionInputById: async () => ({ status: "admitted" }),
      promoteSessionInputBatch: async () => {},
    },
    trackResidencyBlockingWork: (work: Promise<void>) => work,
    enqueueRuntimeCommand: () => {
      order.push("queue");
    },
  };
  assert.equal(
    await enqueueBackgroundTaskNotification.call(runtime as never, {
      taskId: "child-1",
      text: "done",
      traceContext,
    }),
    true,
  );
  assert.deepEqual(order, ["ledger", "queue"]);
});

test("background notification waits for durable admission and rejects a failed write", async () => {
  let finishAdmission!: () => void;
  const admission = new Promise<void>((resolve) => {
    finishAdmission = resolve;
  });
  const commands: unknown[] = [];
  const runtime = {
    shuttingDown: false,
    branchGeneration: 2,
    runtimeTaskRegistry: { get: () => ({ branchGeneration: 2 }) },
    sessionId: "session",
    sessionStore: {
      saveSessionInput: () => admission,
      getSessionInputById: async () => ({ status: "admitted" }),
      promoteSessionInputBatch: async () => {},
    },
    trackResidencyBlockingWork: (work: Promise<void>) => work,
    enqueueRuntimeCommand: (command: unknown) => {
      commands.push(command);
    },
  };
  const accepted = enqueueBackgroundTaskNotification.call(runtime as never, {
    taskId: "child-1",
    text: "done",
    traceContext,
  });
  assert.equal(commands.length, 0);
  finishAdmission();
  assert.equal(await accepted, true);
  assert.equal(commands.length, 1);

  runtime.sessionStore.saveSessionInput = () => Promise.reject(new Error("disk failure"));
  assert.equal(
    await enqueueBackgroundTaskNotification.call(runtime as never, {
      taskId: "child-2",
      text: "done",
      traceContext,
    }),
    false,
  );
  assert.equal(commands.length, 1);
});

test("TaskOutput claim during admission prevents duplicate subagent wake", async () => {
  let finishAdmission!: () => void;
  const admission = new Promise<void>((resolve) => {
    finishAdmission = resolve;
  });
  const task = { branchGeneration: 2, notified: false };
  const settled: string[] = [];
  const commands: unknown[] = [];
  const runtime = {
    shuttingDown: false,
    branchGeneration: 2,
    runtimeTaskRegistry: { get: () => task },
    sessionId: "session",
    sessionStore: {
      saveSessionInput: () => admission,
      getSessionInputById: async () => ({ status: "admitted" }),
      promoteSessionInputBatch: async () => {},
      settleSessionInput: async (input: { reason?: string }) => {
        settled.push(input.reason ?? "");
      },
    },
    trackResidencyBlockingWork: (work: Promise<void>) => work,
    enqueueRuntimeCommand: (command: unknown) => {
      commands.push(command);
    },
  };
  const accepted = enqueueBackgroundTaskNotification.call(runtime as never, {
    originMeta: { backgroundSource: "subagent", title: "Child", workId: "child-1" },
    taskId: "child-1",
    text: "done",
    traceContext,
  });
  task.notified = true;
  finishAdmission();
  assert.equal(await accepted, false);
  assert.equal(commands.length, 0);
  assert.deepEqual(settled, ["task_output_consumed"]);
});

test("stable request ID is queued once and terminal ledger retry is rejected", async () => {
  const commands: Array<{ id: string }> = [];
  let status = "admitted";
  let saves = 0;
  const runtime = {
    shuttingDown: false,
    branchGeneration: 2,
    runtimeTaskRegistry: { get: () => ({ branchGeneration: 2, notified: false }) },
    sessionId: "session",
    sessionStore: {
      saveSessionInput: async () => {
        saves += 1;
      },
      getSessionInputById: async () => ({ status }),
      promoteSessionInputBatch: async () => {},
    },
    trackResidencyBlockingWork: (work: Promise<void>) => work,
    runtimeCommandQueue: { snapshot: () => commands },
    enqueueRuntimeCommand: (command: { id: string }) => {
      commands.push(command);
    },
  };
  const notify = () =>
    enqueueBackgroundTaskNotification.call(runtime as never, {
      originMeta: { backgroundSource: "subagent", title: "Child", workId: "child-1" },
      requestId: "stable-notice-1",
      taskId: "child-1",
      text: "done",
      traceContext,
    });
  assert.equal(await notify(), true);
  assert.equal(await notify(), true);
  assert.deepEqual(
    commands.map(({ id }) => id),
    ["stable-notice-1"],
  );
  status = "promoted";
  assert.equal(await notify(), false);
  assert.equal(commands.length, 1);
  assert.equal(saves, 3);
});
