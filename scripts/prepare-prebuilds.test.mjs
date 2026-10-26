import assert from "node:assert/strict";
import test from "node:test";
import { isNodeRuntimeVersionCurrent, shouldReuseNodeRuntime } from "./prepare-prebuilds.mjs";

test("remote Node reuse only accepts the exact pinned runtime version", () => {
  assert.equal(isNodeRuntimeVersionCurrent("v24.14.0"), true);
  assert.equal(isNodeRuntimeVersionCurrent("v24.14.0\n"), true);
  assert.equal(isNodeRuntimeVersionCurrent("v22.16.0"), false);
  assert.equal(isNodeRuntimeVersionCurrent(""), false);
  assert.equal(isNodeRuntimeVersionCurrent(null), false);
});

test("cross-architecture Node reuse requires an exact staged-version marker", () => {
  assert.equal(
    shouldReuseNodeRuntime({
      actualVersion: "v24.14.0",
      expectedVersion: "v24.14.0",
      canExecute: true,
    }),
    true,
  );
  assert.equal(
    shouldReuseNodeRuntime({
      actualVersion: "v22.16.0",
      expectedVersion: "v24.14.0",
      canExecute: true,
    }),
    false,
  );
  assert.equal(
    shouldReuseNodeRuntime({
      recordedVersion: "v24.14.0",
      expectedVersion: "v24.14.0",
      canExecute: false,
    }),
    true,
  );
  assert.equal(
    shouldReuseNodeRuntime({
      recordedVersion: "v22.16.0",
      expectedVersion: "v24.14.0",
      canExecute: false,
    }),
    false,
  );
  assert.equal(shouldReuseNodeRuntime({ expectedVersion: "v24.14.0", canExecute: false }), false);
});
