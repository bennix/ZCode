import assert from "node:assert/strict";
import test from "node:test";
import { dispatchExecutionForSubmission } from "../src/v4/composer/agentModelDispatch.ts";

const selection = { providerId: "p", modelId: "executor" };
const dispatcher = { providerId: "p", modelId: "judge" };
const view = {
  providers: [{ providerId: "p", models: [{ modelId: "judge" }, { modelId: "executor" }] }],
};

test("dispatch is turn-scoped only when the judge exists in the active catalog", () => {
  const base = {
    settings: { agentModelDispatchEnabled: true, agentModelDispatcher: dispatcher },
    view,
    routingMode: "startNow" as const,
    manualModelOverride: false,
    submissionSelection: selection,
  };
  assert.deepEqual(dispatchExecutionForSubmission(base), {
    selectionScope: "execution",
    dispatcher,
  });
  assert.equal(dispatchExecutionForSubmission({ ...base, routingMode: "guide" }), undefined);
  assert.equal(dispatchExecutionForSubmission({ ...base, manualModelOverride: true }), undefined);
  assert.equal(dispatchExecutionForSubmission({ ...base, view: { providers: [] } }), undefined);
});
