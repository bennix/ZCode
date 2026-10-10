import assert from "node:assert/strict";
import { test } from "node:test";
import { TurnMachineImpl } from "../src/agent/turn-machine.js";
import { TurnPhase } from "../src/agent/turn-state.js";
import type { SessionId } from "@zcode/contracts";

test("uncommitted failed model request yields to fallback in the same turn", () => {
  const initial = TurnMachineImpl.create("session-fallback" as SessionId, 0, "hello");
  const processing = new TurnMachineImpl(initial.start());
  const originalRequest = new TurnMachineImpl(processing.startModelRequest("primary", []));

  assert.equal(originalRequest.state.phase, TurnPhase.AwaitingModelResponse);
  const abandoned = new TurnMachineImpl(originalRequest.abandonModelRequest());
  assert.equal(abandoned.state.phase, TurnPhase.AggregatingResults);
  assert.equal(abandoned.state.streamingContent, "");
  assert.deepEqual(abandoned.state.toolResults, []);
  assert.equal(abandoned.state.id, originalRequest.state.id);

  const fallback = new TurnMachineImpl(abandoned.startModelRequest("fallback", []));
  assert.equal(fallback.state.phase, TurnPhase.AwaitingModelResponse);
  assert.equal(fallback.state.modelRequest?.model, "fallback");
  assert.equal(fallback.state.id, originalRequest.state.id);
});
