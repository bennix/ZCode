import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function resolveMacComputerUseExecutablePath(pluginRoot, arch = process.arch) {
  if (typeof pluginRoot !== "string" || !pluginRoot.trim()) {
    throw new Error("Computer Use packaged plugin root is unavailable");
  }
  if (arch !== "arm64" && arch !== "x64") {
    throw new Error(`Unsupported macOS Computer Use architecture: ${arch}`);
  }
  return resolve(pluginRoot, "bin", `macos-${arch}`, "OpenComputerUse");
}

export async function readMacComputerUseDoctor({ pluginRoot, arch = process.arch, signal } = {}) {
  const executable = resolveMacComputerUseExecutablePath(pluginRoot, arch);
  // JSON 模式与 --no-onboarding 同时指定，状态查询绝不打开授权窗或触发用户交互。
  const { stdout } = await execFileAsync(executable, ["doctor", "--json", "--no-onboarding"], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    signal,
  });
  const report = JSON.parse(stdout);
  if (
    report?.schemaVersion !== 1 ||
    typeof report?.permissions?.accessibility !== "boolean" ||
    typeof report?.permissions?.screenRecording !== "boolean" ||
    typeof report?.screenLocked !== "boolean"
  ) {
    throw new Error("Computer Use native diagnosis returned an invalid response");
  }
  return {
    permissions: {
      accessibility: report.permissions.accessibility,
      screenRecording: report.permissions.screenRecording,
    },
    screenLocked: report.screenLocked,
  };
}
