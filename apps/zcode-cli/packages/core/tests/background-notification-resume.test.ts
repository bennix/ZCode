import assert from "node:assert/strict";
import test from "node:test";
import { createRootTraceContext } from "@zcode/contracts";
import { restorePersistedPendingInputs } from "../src/runtime/methods/steering.ts";
import { restorePromotedBackgroundResponses } from "../src/runtime/methods/background-notifications.ts";
import { createRuntimeCommandQueue } from "../src/runtime/command-queue.ts";
import { drainRuntimeCommandQueue } from "../src/runtime/methods/runtime-command-queue.ts";

test("promoted notice without assistant resumes one model turn without a second user message", async () => {
  const queued: Array<{ id: string; mode: string; promotedMessageId: string; text: string }> = [];
  const record = {
    id: "notice-promoted",
    status: "promoted",
    kind: "backgroundNotification",
    delivery: "queue",
    promotedMessageID: "message-promoted",
    payload: { text: "child completed", branchGeneration: 2 },
    time: { created: 10, updated: 11 },
  };
  const runtime = {
    sessionId: "session",
    branchGeneration: 2,
    sessionStore: {
      listSessionInputs: async () => [record],
      messages: async () => [{ info: {
        id: "message-promoted", role: "user", source: "background_task",
      }, parts: [{ type: "text", text: "child completed" }] }],
    },
    runtimeCommandQueue: {
      enqueue: (command: (typeof queued)[number]) => { queued.push(command); },
      snapshot: () => queued,
    },
  };
  assert.equal(await restorePromotedBackgroundResponses.call(runtime as never, createRootTraceContext()), 1);
  assert.equal(await restorePromotedBackgroundResponses.call(runtime as never, createRootTraceContext()), 0);
  assert.deepEqual(queued.map(({ id, mode, promotedMessageId, text }) => ({ id, mode, promotedMessageId, text })), [
    { id: "notice-promoted", mode: "background-response-continuation", promotedMessageId: "message-promoted", text: "child completed" },
  ]);
});

test("promoted notice with any assistant or stale branch is not automatically replayed", async () => {
  const queued: unknown[] = [];
  const records = [
    { id: "with-assistant", payload: { text: "done", branchGeneration: 2 }, promotedMessageID: "user-a" },
    { id: "stale", payload: { text: "done", branchGeneration: 1 }, promotedMessageID: "user-b" },
  ].map((record) => ({ ...record, status: "promoted", kind: "backgroundNotification", delivery: "queue", time: { created: 10, updated: 11 } }));
  const runtime = {
    sessionId: "session",
    branchGeneration: 2,
    sessionStore: {
      listSessionInputs: async () => records,
      messages: async () => [
        { info: { id: "user-a", role: "user", source: "background_task" }, parts: [] },
        { info: { id: "assistant-a", role: "assistant", parentID: "user-a" }, parts: [] },
        { info: { id: "user-b", role: "user", source: "background_task" }, parts: [] },
      ],
    },
    runtimeCommandQueue: { enqueue: (command: unknown) => { queued.push(command); }, snapshot: () => queued },
  };
  assert.equal(await restorePromotedBackgroundResponses.call(runtime as never, createRootTraceContext()), 0);
  assert.equal(queued.length, 0);
});

test("recovered promoted notice executes against its existing user message", async () => {
  const calls: Array<{ text: string; options: Record<string, unknown> }> = [];
  const runtime = {
    sessionId: "session",
    branchGeneration: 2,
    runtimeCommandDrainActive: false,
    runtimeCommandQueue: createRuntimeCommandQueue(),
    sessionStore: {
      listSessionInputs: async () => [{
        id: "notice-promoted", status: "promoted", kind: "backgroundNotification",
        delivery: "queue", promotedMessageID: "message-promoted",
        payload: { text: "child completed", branchGeneration: 2 },
        time: { created: 10, updated: 11 },
      }],
      messages: async () => [{ info: {
        id: "message-promoted", role: "user", source: "background_task",
      }, parts: [{ type: "text", text: "child completed" }] }],
    },
    executeTurnCommand: async (text: string, _attachments: unknown, options: Record<string, unknown>) => {
      calls.push({ text, options });
    },
  };
  await restorePromotedBackgroundResponses.call(runtime as never, createRootTraceContext());
  await drainRuntimeCommandQueue.call(runtime as never);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.text, "child completed");
  assert.equal(calls[0]?.options.recordedInputMessageId, "message-promoted");
  assert.equal(calls[0]?.options.skipInputRecord, true);
  assert.equal(runtime.runtimeCommandQueue.hasPending(), false);
});

test("promoted batch resumes one response for the full persisted message", async () => {
  const queue = createRuntimeCommandQueue();
  const runtime = {
    sessionId: "session",
    branchGeneration: 2,
    runtimeCommandQueue: queue,
    sessionStore: {
      listSessionInputs: async () => ["one", "two"].map((id) => ({
        id, status: "promoted", kind: "backgroundNotification", delivery: "queue",
        promotedMessageID: "shared-message", payload: { text: id, branchGeneration: 2 },
        time: { created: 10, updated: 11 },
      })),
      messages: async () => [{ info: {
        id: "shared-message", role: "user", source: "background_task",
      }, parts: [{ type: "text", text: "one\n\ntwo" }] }],
    },
  };
  assert.equal(await restorePromotedBackgroundResponses.call(runtime as never, createRootTraceContext()), 1);
  assert.deepEqual(queue.snapshot().map((command) => command.mode === "background-response-continuation" ? command.text : ""), ["one\n\ntwo"]);
});

test("recovered response is discarded when branch changes before queue drain", async () => {
  let executions = 0;
  const queue = createRuntimeCommandQueue();
  queue.enqueue({
    id: "notice-promoted" as never,
    mode: "background-response-continuation",
    priority: "next",
    branchGeneration: 2,
    promotedMessageId: "message-promoted" as never,
    text: "child completed",
    createdAt: new Date(10),
    traceContext: createRootTraceContext(),
  });
  await drainRuntimeCommandQueue.call({
    branchGeneration: 3,
    runtimeCommandQueue: queue,
    runtimeCommandDrainActive: false,
    executeTurnCommand: async () => { executions++; },
  } as never);
  assert.equal(executions, 0);
  assert.equal(queue.hasPending(), false);
});

test("resume rebuilds admitted same-branch notifications with their ledger IDs", async () => {
  const queued: Array<{ id: string; mode: string; text: string }> = [];
  const settled: Array<{ id: string; reason?: string }> = [];
  const records = [
    {
      id: "notice-current",
      kind: "backgroundNotification",
      delivery: "queue",
      admittedSequence: 1,
      time: { created: 10, updated: 10 },
      payload: { text: "child completed", branchGeneration: 2, taskId: "child-1" },
    },
    {
      id: "notice-stale",
      kind: "backgroundNotification",
      delivery: "queue",
      admittedSequence: 2,
      time: { created: 11, updated: 11 },
      payload: { text: "stale child", branchGeneration: 1, taskId: "child-2" },
    },
    {
      id: "notice-legacy",
      kind: "backgroundNotification",
      delivery: "queue",
      admittedSequence: 3,
      time: { created: 12, updated: 12 },
      payload: { text: "unknown branch", taskId: "child-3" },
    },
  ];
  const runtime = {
    sessionId: "session",
    branchGeneration: 2,
    sessionStore: {
      listSessionInputs: async () => records,
      settleSessionInput: async (input: { id: string; reason?: string }) => {
        settled.push(input);
      },
    },
    runtimeCommandQueue: {
      enqueue: (command: (typeof queued)[number]) => {
        queued.push(command);
      },
      snapshot: () => queued,
    },
    rebuildProjection: async () => ({ pendingSteerInputs: [] }),
    enqueueDeferredInput: async () => {},
  };
  const count = await restorePersistedPendingInputs.call(
    runtime as never,
    createRootTraceContext(),
  );
  assert.equal(count, 0);
  assert.deepEqual(
    queued.map(({ id, mode, text }) => ({ id, mode, text })),
    [{ id: "notice-current", mode: "task-notification", text: "child completed" }],
  );
  assert.deepEqual(
    settled.map(({ id }) => id),
    ["notice-stale", "notice-legacy"],
  );
});

test("repeated resume keeps one queued command per admitted notification", async () => {
  const queued: Array<{ id: string; mode: string }> = [];
  const runtime = {
    sessionId: "session",
    branchGeneration: 2,
    sessionStore: {
      listSessionInputs: async () => [
        {
          id: "notice-current",
          kind: "backgroundNotification",
          delivery: "queue",
          admittedSequence: 1,
          time: { created: 10, updated: 10 },
          payload: { text: "child completed", branchGeneration: 2, taskId: "child-1" },
        },
      ],
    },
    runtimeCommandQueue: {
      enqueue: (command: (typeof queued)[number]) => {
        queued.push(command);
      },
      snapshot: () => queued,
    },
    rebuildProjection: async () => ({ pendingSteerInputs: [] }),
    enqueueDeferredInput: async () => {},
  };
  await restorePersistedPendingInputs.call(runtime as never, createRootTraceContext());
  await restorePersistedPendingInputs.call(runtime as never, createRootTraceContext());
  assert.deepEqual(
    queued.map(({ id }) => id),
    ["notice-current"],
  );
});
