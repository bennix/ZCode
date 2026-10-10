import assert from "node:assert/strict";
import test from "node:test";
import { createSessionEvent, SessionEventType } from "@zcode/contracts";
import { ProductProjection } from "../src/zcode-protocol-v4/product-projection.ts";

test("main model request projects the actual execution model without changing session selection", () => {
  const projection = new ProductProjection("session", "epoch");
  projection.applyEvent(createSessionEvent(
    SessionEventType.TurnStarted,
    "session" as never,
    { turnNumber: 0, input: "do work", messageId: "message" },
    { turnId: "turn" as never, sequenceNumber: 1 },
  ));
  projection.applyEvent(createSessionEvent(
    SessionEventType.ModelRequest,
    "session" as never,
    {
      messages: [],
      providerId: "provider",
      modelId: "worker",
      reasoningLevel: "low",
      querySource: "main_turn",
    },
    { turnId: "turn" as never, sequenceNumber: 2 },
  ));
  const snapshot = projection.getSnapshot();
  const header = snapshot.rows.window.find((row) => row.kind === "turnHeader");
  assert.equal(header?.kind, "turnHeader");
  if (header?.kind !== "turnHeader") return;
  assert.deepEqual(header.executionModel, {
    providerId: "provider",
    modelId: "worker",
    options: { reasoningLevel: "low" },
  });
  assert.notEqual(snapshot.config.modelSelection?.modelId, "worker");
});
