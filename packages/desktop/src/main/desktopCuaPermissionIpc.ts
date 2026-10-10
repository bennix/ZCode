import { ipcMain } from "electron";
import { PlatformChannels, type Locale } from "@zcode/shared";
import { resolveBundledMacCuaPluginRoot } from "./desktopRuntimeEnv.js";
import { launchNativeMacCuaOnboarding } from "./nativeCuaOnboarding.js";

function operationIdOf(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
}

export function registerCuaPermissionIpcHandlers(_options: {
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
  currentApplicationLocale: () => Locale;
}): void {
  // 授权子进程由 Main 持有；取消键同时绑定 webContents id 和本次操作 id，不能跨窗口取消。
  const operations = new Map<string, AbortController>();
  const keyOf = (senderId: number, operationId: string) => `${senderId}\0${operationId}`;

  ipcMain.on(PlatformChannels.CancelCuaPermissionOnboarding, (event, payload) => {
    const operationId = operationIdOf(payload?.operationId);
    if (operationId) operations.get(keyOf(event.sender.id, operationId))?.abort();
  });

  ipcMain.handle(PlatformChannels.OpenCuaPermissionOnboarding, async (event, payload) => {
    if (process.platform !== "darwin") {
      return { success: false, error: "ZenCode Computer Use permissions require macOS." };
    }
    const operationId = operationIdOf(payload?.operationId);
    const operationKey = operationId ? keyOf(event.sender.id, operationId) : null;
    if (operationKey && operations.has(operationKey)) {
      return { success: false, canceled: true, error: "Duplicate permission operation." };
    }
    const controller = new AbortController();
    if (operationKey) operations.set(operationKey, controller);
    const onDestroyed = () => controller.abort();
    if (event.sender.isDestroyed()) onDestroyed();
    else event.sender.once("destroyed", onDestroyed);
    try {
      const pluginRoot = resolveBundledMacCuaPluginRoot();
      return pluginRoot
        ? await launchNativeMacCuaOnboarding({ pluginRoot, signal: controller.signal })
        : { success: false, error: "ZenCode Computer Use executor is not installed." };
    } finally {
      event.sender.removeListener("destroyed", onDestroyed);
      if (operationKey && operations.get(operationKey) === controller)
        operations.delete(operationKey);
    }
  });

  // 旧拖拽 Helper.app 不在当前包内。保留 IPC 响应形状供旧 renderer 短暂兼容，但不再尝试安装或启动它。
  ipcMain.handle(PlatformChannels.PrepareCuaHelperPermissionDrag, async () => ({
    success: false,
    error: "ZenCode Computer Use now uses its native permission guide.",
  }));
  ipcMain.on(PlatformChannels.StartCuaHelperPermissionDrag, () => {});
  ipcMain.on(PlatformChannels.NotifyCuaHelperPermissionDragEnded, () => {});
}
