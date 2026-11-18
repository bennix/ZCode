import assert from "node:assert/strict";
import { test } from "node:test";
import { createZCodeTaskServiceAdapter } from "../src/zcode-agent/zcodeTaskServiceAdapter.js";

test("cold Weixin model read uses explicit workspace without a loaded target", async () => {
  const requests: unknown[] = [];
  const selection = { providerId: "fixture", modelId: "text", options: { reasoningLevel: "low" } };
  const disposable = () => ({ dispose() {} });
  const service = createZCodeTaskServiceAdapter({
    zcodeAgentService: { readSession: async (params: unknown) => { requests.push(params); return { settings: { model: { current: selection } } }; }, disposeAll() {} } as any,
    taskIndexRepo: { close() {} } as any,
    taskIndexSyncer: { onSessionTerminalEvent: disposable, onSessionReadyEvent: disposable, disposeAll() {} } as any,
  });
  try {
    assert.deepEqual(await service.getTaskModelSelection({ taskId: "cold", workspacePath: "/workspace", workspaceIdentity: "fixture-identity" }), selection);
    assert.deepEqual(requests, [{ sessionId: "cold", workspacePath: "/workspace", workspaceIdentity: "fixture-identity" }]);
    await assert.rejects(service.getTaskModelSelection({ taskId: "unbound" }), /target is not loaded/);
  } finally { await service.disposeAll(); }
});
