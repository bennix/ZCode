import assert from "node:assert/strict";
import { test } from "node:test";
import { mapMacComputerUseDoctorStatus } from "../src/cua-permission-broker/nativePermissionStatus.js";

test("locked desktop preserves granted TCC states while reporting the lock", () => {
  const status = mapMacComputerUseDoctorStatus({
    permissions: { accessibility: true, screenRecording: true },
    screenLocked: true,
  });
  assert.equal(status.available, true);
  assert.equal(status.accessibility, "granted");
  assert.equal(status.screenRecording, "granted");
  assert.equal(status.screenLocked, true);
  assert.equal(status.screenCaptureProbeOk, false);
});

test("native permission denial is visible without claiming executor readiness", () => {
  const status = mapMacComputerUseDoctorStatus({
    permissions: { accessibility: false, screenRecording: true },
    screenLocked: false,
  });
  assert.equal(status.available, true);
  assert.equal(status.accessibility, "denied");
  assert.equal(status.screenRecording, "granted");
  assert.equal(status.accessibilityProbeOk, false);
});
