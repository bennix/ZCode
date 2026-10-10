import assert from "node:assert/strict";
import test from "node:test";
import { createRootTraceContext } from "@zcode/contracts";
import { persistBackgroundTaskNotificationBatch } from "../src/runtime/methods/background-notifications.ts";
import { persistSyntheticUserNoticeForSession } from "../src/runtime/methods/message-persistence.ts";

const traceContext = createRootTraceContext();
const commands = ["notice-1", "notice-2"].map((id) => ({
  id,
  branchGeneration: 0,
  createdAt: new Date(),
  mode: "task-notification",
  priority: "next",
  source: "background_task",
  text: id,
  traceContext,
}));

test("background notification batch gives all ledger IDs to one atomic promotion", async () => {
  const calls: string[] = [];
  const runtime = {
    sessionId: "session",
    config: {},
    sessionStore: {
      promoteSessionInputBatch: async (input: { ids: string[] }) => {
        calls.push(`promote:${input.ids.join(",")}`);
      },
      markSessionInputPromoted: async () => {
        throw new Error("legacy promotion must not run");
      },
    },
    ensureContextInitialized: async () => {},
    messageHistory: {
      addUser: () => {
        calls.push("history");
      },
    },
    getSessionModelSelection: () => undefined,
    getTools: () => [],
    persistSyntheticUserNoticeForSession(
      input: Parameters<typeof persistSyntheticUserNoticeForSession>[0],
    ) {
      return persistSyntheticUserNoticeForSession.call(this as never, input);
    },
  };
  await persistBackgroundTaskNotificationBatch.call(runtime as never, commands as never);
  assert.deepEqual(calls, ["promote:notice-1,notice-2", "history"]);
});

test("failed atomic promotion leaves runtime history untouched", async () => {
  let historyWrites = 0;
  const runtime = {
    sessionId: "session",
    config: {},
    sessionStore: {
      promoteSessionInputBatch: async () => {
        throw new Error("disk failure");
      },
    },
    ensureContextInitialized: async () => {},
    messageHistory: {
      addUser: () => {
        historyWrites++;
      },
    },
    getSessionModelSelection: () => undefined,
    getTools: () => [],
    persistSyntheticUserNoticeForSession(
      input: Parameters<typeof persistSyntheticUserNoticeForSession>[0],
    ) {
      return persistSyntheticUserNoticeForSession.call(this as never, input);
    },
  };
  await assert.rejects(
    persistBackgroundTaskNotificationBatch.call(runtime as never, commands as never),
    /disk failure/,
  );
  assert.equal(historyWrites, 0);
});

test("persistent notification batch refuses non-atomic store", async () => {
  let writes = 0;
  const runtime = {
    sessionId: "session",
    config: {},
    sessionStore: {
      saveMessage: async () => { writes++; },
      markSessionInputPromoted: async () => { writes++; },
    },
    ensureContextInitialized: async () => {},
    messageHistory: { addUser: () => { writes++; } },
    getSessionModelSelection: () => undefined,
    getTools: () => [],
  };
  await assert.rejects(
    persistBackgroundTaskNotificationBatch.call(runtime as never, commands as never),
    /batch promotion is unavailable/,
  );
  assert.equal(writes, 0);
});
