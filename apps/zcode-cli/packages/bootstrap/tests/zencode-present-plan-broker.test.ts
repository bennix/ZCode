import assert from "node:assert/strict";
import test from "node:test";
import { createProtocolInteractionBroker } from "../src/zcode-protocol/interaction-broker.ts";

const plan = {
  title: "Refactor auth",
  files: [
    { path: "src/auth.ts", intent: "edit", reason: "Update contract" },
    { path: "src/auth.test.ts", intent: "edit", reason: "Add coverage" },
  ],
};

function brokerWithResponse(response: unknown) {
  let forwarded: Record<string, unknown> | undefined;
  const broker = createProtocolInteractionBroker({
    v4Interactions: { register: () => () => {} },
    requestClient: async (_method: unknown, params: unknown) => {
      forwarded = params as Record<string, unknown>;
      return response;
    },
  } as never);
  return { broker, forwarded: () => forwarded };
}

const request = {
  requestId: "file-plan-1",
  sessionId: "session-1",
  traceId: "trace-1",
  toolCallId: "tool-1",
  toolName: "zencode_present_plan",
  input: plan,
  mode: "default",
  ruleId: "rule-1",
  reason: "Select files",
  riskLevel: "low",
  requestedAt: new Date(),
};

test("broker forwards a multi-select plan and accepts only the chosen candidate", async () => {
  const { broker, forwarded } = brokerWithResponse({
    action: "accept",
    content: { answer_0: ["src/auth.ts"] },
  });
  const result = await broker.requestPermission(request as never);
  assert.equal(result.decision, "modify");
  assert.deepEqual(result.modifiedInput, { ...plan, selectedPaths: ["src/auth.ts"] });
  assert.equal((forwarded()?.schema as Record<string, unknown>).interaction, "file_selection");
  assert.equal((forwarded()?.questions as Array<Record<string, unknown>>)[0]?.multiSelect, true);
});

test("broker rejects cancellation and forged file selections", async () => {
  const cancelled = brokerWithResponse({ action: "cancel" });
  assert.equal((await cancelled.broker.requestPermission(request as never)).decision, "deny");
  const forged = brokerWithResponse({
    action: "accept",
    content: { answer_0: ["src/other.ts"] },
  });
  assert.equal((await forged.broker.requestPermission(request as never)).decision, "deny");
});
