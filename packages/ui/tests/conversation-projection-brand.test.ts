import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationProjectionStore } from "../src/v4/conversationProjectionStore.js";
import type { ConversationTransport } from "../src/v4/transport.js";

test("runtime 反复回收后展示 ZenCode 连接错误并保留手动重试", async () => {
  let onLifecycle: ((state: "available" | "unavailable") => void) | undefined;
  const transport = {
    onAssemblyFault: () => () => {},
    onRuntimeLifecycle: (listener: typeof onLifecycle) => {
      onLifecycle = listener;
      return () => {};
    },
    onRuntimeRestart: () => () => {},
    subscribe: async () => {
      throw new Error("ZCode agent transport closed");
    },
  } as unknown as ConversationTransport;
  const store = new ConversationProjectionStore("conversation:test", transport);
  try {
    assert.ok(onLifecycle);
    for (let index = 0; index < 4; index += 1) onLifecycle("unavailable");
    assert.equal(store.getState().status, "error");
    assert.match(store.getState().lastError ?? "", /ZenCode/u);
    assert.doesNotMatch(store.getState().lastError ?? "", /\bZCode\b/u);
    await store.retry();
    assert.equal(store.getState().status, "connecting");
  } finally {
    store.close();
  }
});
