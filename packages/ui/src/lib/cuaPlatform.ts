import type { IPlatformService } from "@zcode/shared";

// macOS 才具备 TCC 权限、授权引导和 Helper 状态轮询；Windows 本地桌面仅复用
// zcode-cua 插件总开关，不读取 TCC 或 Helper 状态。普通 Web 和手机远控不展示电脑控制设置。
// 因此权限弹窗、预检和 Helper 状态轮询都必须先判定本地是 macOS desktop。
// 用 navigator.userAgent 判定，并显式排除 iOS（iPhone/iPad 的 UA 含 Macintosh 子串）。
//
// 由模块级常量改为惰性函数。原常量在模块 import 时求值，导致按 UA 分支的单测
// 无法在同一进程内覆盖多平台（改 navigator.userAgent 对已求值的常量无效）。运行时行为等价——
// 真实环境里 UA 不会中途变化。
function isMacOsDesktopUserAgent(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Macintosh|Mac OS X/.test(navigator.userAgent) &&
    !/iPhone|iPad|iPod/.test(navigator.userAgent)
  );
}

function isWindowsDesktopUserAgent(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

function isLinuxDesktopUserAgent(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Linux/i.test(navigator.userAgent) &&
    !/Android/i.test(navigator.userAgent)
  );
}

/**
 * CUA 权限 UI 的真实平台能力门。
 *
 * 仅看 UA 会把 macOS Safari/Web 误判成 desktop，打开一个无法执行任何本机 IPC 的权限弹窗。
 * desktop preload 只在具备该能力时注入 onboarding 方法，因此 UA + capability 必须同时满足。
 */
export function supportsLocalMacCuaPermissionOnboarding(
  platform: Pick<IPlatformService, "openCuaPermissionOnboarding"> | null | undefined,
): boolean {
  return isMacOsDesktopUserAgent() && typeof platform?.openCuaPermissionOnboarding === "function";
}

/**
 * Windows 本地桌面的 CUA 能力门（与上面的 mac 门对称）。
 *
 * Windows 无 TCC，不读 Helper 权限。以前用 executeDesktopCommand 作为能力门，但 Web
 * 平台也有同名占位函数，会把普通浏览器误判成本机 Desktop；现在只认宿主显式标记。
 */
export function supportsLocalWindowsCuaEntry(
  platform: Pick<IPlatformService, "isDesktopRuntime"> | null | undefined,
): boolean {
  return isWindowsDesktopUserAgent() && platform?.isDesktopRuntime === true;
}

/** Linux 图形桌面入口与 Windows 一样只认宿主标记；实际后端能力由 doctor 检查。 */
export function supportsLocalLinuxCuaEntry(
  platform: Pick<IPlatformService, "isDesktopRuntime"> | null | undefined,
): boolean {
  return isLinuxDesktopUserAgent() && platform?.isDesktopRuntime === true;
}
