import assert from "node:assert/strict";
import { test } from "node:test";
import { createRootTraceContext } from "@zcode/contracts";
import { enqueueBackgroundNotification } from "../src/subagent/runner.ts";
import { InMemoryRuntimeTaskRegistry } from "../src/runtime-task/registry.ts";

test("subagent claims delivery only after parent admission, and ignores duplicate completion", async () => {
  const task = {
    description: "Inspect files",
    notified: false,
    notificationRequestId: "notice-child-1",
  };
  let admissions = 0;
  let accepts = false;
  const registry = {
    get: () => task,
    update: (_id: string, change: (value: typeof task) => typeof task) =>
      Object.assign(task, change(task)),
  };
  const options = {
    enqueueParentTaskNotification: async () => {
      admissions += 1;
      return accepts;
    },
  };
  const notify = () =>
    enqueueBackgroundNotification(
      options as never,
      registry as never,
      "child-1",
      "done",
      createRootTraceContext(),
    );

  assert.equal(await notify(), false);
  assert.equal(task.notified, false);
  accepts = true;
  assert.equal(await notify(), true);
  assert.equal(task.notified, true);
  assert.equal(await notify(), false);
  assert.equal(admissions, 2);
});

test("parallel completion callbacks share one durable admission", async () => {
  const task = {
    description: "Inspect files",
    notified: false,
    notificationRequestId: "notice-child-1",
  };
  let admissions = 0;
  let resolveAdmission!: (accepted: boolean) => void;
  const admission = new Promise<boolean>((resolve) => {
    resolveAdmission = resolve;
  });
  const registry = {
    get: () => task,
    update: (_id: string, change: (value: typeof task) => typeof task) =>
      Object.assign(task, change(task)),
  };
  const options = {
    enqueueParentTaskNotification: () => {
      admissions++;
      return admission;
    },
  };
  const notify = () =>
    enqueueBackgroundNotification(
      options as never,
      registry as never,
      "child-1",
      "done",
      createRootTraceContext(),
    );
  const first = notify();
  const second = notify();
  assert.equal(admissions, 1);
  resolveAdmission(true);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(task.notified, true);
});

test("subagent retries reuse one lifecycle request ID and a rearm gets a new ID", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  const requestIds: string[] = [];
  let accepts = false;
  const options = {
    enqueueParentTaskNotification: async (notification: { requestId: string }) => {
      requestIds.push(notification.requestId);
      return accepts;
    },
  };
  const register = () =>
    registry.register({
      taskId: "child-1",
      type: "local_agent",
      status: "running",
      description: "Inspect files",
      notified: false,
    } as never);
  const notify = () =>
    enqueueBackgroundNotification(
      options as never,
      registry,
      "child-1",
      "done",
      createRootTraceContext(),
    );
  register();
  assert.equal(await notify(), false);
  accepts = true;
  assert.equal(await notify(), true);
  assert.equal(requestIds[0], requestIds[1]);
  register();
  assert.equal(await notify(), true);
  assert.notEqual(requestIds[2], requestIds[1]);
});
