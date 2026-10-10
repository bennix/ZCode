import type { MacComputerUseDoctorResult } from "@zcode/zcode-cua";
import type { CuaPermissionStatus } from "@zcode/zcode-cua/broker/ports";

export function mapMacComputerUseDoctorStatus(
  diagnosis: MacComputerUseDoctorResult,
): CuaPermissionStatus {
  // 锁屏会让抓屏探针失败，但不能把已授予的 TCC 权限改判为缺权。
  return {
    available: true,
    grantOwner: "OpenComputerUse",
    grantOwnerDisplayName: "ZenCode Computer Use",
    accessibility: diagnosis.permissions.accessibility ? "granted" : "denied",
    screenRecording: diagnosis.permissions.screenRecording ? "granted" : "denied",
    accessibilityProbeOk: diagnosis.permissions.accessibility && !diagnosis.screenLocked,
    screenCaptureProbeOk: diagnosis.permissions.screenRecording && !diagnosis.screenLocked,
    screenLocked: diagnosis.screenLocked,
  };
}
