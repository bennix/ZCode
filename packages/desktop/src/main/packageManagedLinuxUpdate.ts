/** DEB/RPM 没有 APPIMAGE 路径，electron-updater 不会执行检查，也不会发出完成事件。 */
export function isPackageManagedLinuxUpdateRuntime(
  platform: string,
  appImagePath: string | undefined,
): boolean {
  return platform === "linux" && !appImagePath?.trim();
}
