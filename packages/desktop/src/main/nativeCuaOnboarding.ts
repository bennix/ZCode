import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { resolveMacComputerUseExecutablePath } from "@zcode/zcode-cua";
import type { CuaAccessibilitySettingsResult } from "@zcode/shared";

const execFileAsync = promisify(execFile);

export async function launchNativeMacCuaOnboarding(options: {
  pluginRoot: string;
  arch?: string;
  signal?: AbortSignal;
}): Promise<CuaAccessibilitySettingsResult> {
  const binary = resolveMacComputerUseExecutablePath(options.pluginRoot, options.arch);
  try {
    // 原生执行器无参数时打开自身的权限引导。直接子进程保持 macOS TCC responsibility chain。
    await execFileAsync(binary, [], {
      signal: options.signal,
      maxBuffer: 64 * 1024,
      windowsHide: false,
    });
    return {
      success: true,
      sessionId: randomUUID(),
      returnedFromSettings: true,
      // 当前官方插件按会话运行执行器；旧常驻 Helper 的重启接口不能应用于它。
      restartHelperAfterReturn: false,
    };
  } catch (error) {
    if (options.signal?.aborted) return { success: false, canceled: true };
    return {
      success: false,
      error: `ZenCode Computer Use permission guide failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
