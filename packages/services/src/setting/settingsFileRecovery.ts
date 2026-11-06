import { rename } from "node:fs/promises";
import { maybeThrowInjectedFsFault } from "../fs/fsFaultInjection.js";

function buildCorruptSettingsBackupPath(settingsFile: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${settingsFile}.corrupt-${timestamp}`;
}

export async function quarantineCorruptSettingsFile(
  settingsFile: string,
  error: unknown,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const backupPath = buildCorruptSettingsBackupPath(settingsFile);
  try {
    // 用户手动编辑或远端磁盘异常可能把 setting.json 写成非 JSON（例如 ":wq"）。
    // 如果只返回默认值不隔离坏文件，每次启动都会重复解析失败；这里保留备份后让后续 update 重建合法配置。
    maybeThrowInjectedFsFault({ operation: "rename", path: settingsFile });
    await rename(settingsFile, backupPath);
    log("invalid settings json backed up:", backupPath, "error:", error);
  } catch (renameError) {
    if (
      renameError &&
      typeof renameError === "object" &&
      "code" in renameError &&
      (renameError as { code?: string }).code === "ENOENT"
    ) {
      // 启动时多个服务可能同时读取同一个坏 setting.json。
      // 第一个读取已经完成隔离后，后续读取再 rename 会遇到 ENOENT；这是并发下的预期结果，不应当按备份失败刷错误日志。
      log("invalid settings json already quarantined by another reader, returning defaults");
      return;
    }
    log("invalid settings json backup failed, returning defaults. error:", renameError);
  }
}
