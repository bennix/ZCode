import { readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";

const PATCH_MARKER = "; zcode-installer-details-v1";
const ON_INIT_PATCH_MARKER = "; zencode-on-init-stages-v1";
const ASSISTED_INIT_PATCH_MARKER = "; zencode-assisted-init-stages-v1";
const USER_FOLDER_PATCH_MARKER = "; zencode-user-folder-stages-v1";

function optionalMacro(name) {
  return [`!ifmacrodef ${name}`, `  !insertmacro ${name}`, "!endif"].join("\n");
}

function optionalStage(stage, indent = "    ") {
  return [
    `${indent}!ifmacrodef ZCodeReportInstallerStage`,
    `${indent}  !insertmacro ZCodeReportInstallerStage "${stage}"`,
    `${indent}!endif`,
  ].join("\n");
}

function replaceRequired(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index === -1) {
    throw new Error(`electron-builder installSection.nsh 缺少预期锚点：${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + needle.length)}`;
}

/**
 * 给 electron-builder 的安装段补上可见阶段，并开启 NSIS 内置逐文件详情。
 *
 * 这里不复制整份上游模板，避免 electron-builder 升级时静默带入旧模板；每次打包
 * 都必须命中下面的结构锚点，模板结构变化会立即失败并提醒维护者重新对齐。
 */
export function patchNsisInstallSectionSource(source) {
  const sourceEol = source.includes("\r\n") ? "\r\n" : "\n";
  let patched = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (patched.includes(PATCH_MARKER)) {
    return source;
  }

  const detailsAnchor = "${IfNot} ${Silent}\n  SetDetailsPrint none\n${endif}";
  patched = replaceRequired(
    patched,
    detailsAnchor,
    [
      PATCH_MARKER,
      "# 详情区需要同时显示 electron-builder 的 File 条目和项目阶段。",
      "${IfNot} ${Silent}",
      "  SetDetailsPrint listonly",
      "${endif}",
      optionalMacro("customInstallSectionStarted"),
    ].join("\n"),
    "SetDetailsPrint none",
  );

  const cleanupStartAnchor =
    "!insertmacro uninstallOldVersion SHELL_CONTEXT\n!insertmacro handleUninstallResult SHELL_CONTEXT";
  patched = replaceRequired(
    patched,
    cleanupStartAnchor,
    `${optionalMacro("customInstallCleanupStarted")}\n${cleanupStartAnchor}`,
    "SHELL_CONTEXT cleanup",
  );

  const cleanupEndAnchor =
    '${if} $installMode == "all"\n  !insertmacro uninstallOldVersion HKEY_CURRENT_USER\n  !insertmacro handleUninstallResult HKEY_CURRENT_USER\n${endIf}';
  patched = replaceRequired(
    patched,
    cleanupEndAnchor,
    `${cleanupEndAnchor}\n${optionalMacro("customInstallCleanupCompleted")}`,
    "HKEY_CURRENT_USER cleanup",
  );

  const extractAnchor = "!insertmacro installApplicationFiles";
  patched = replaceRequired(
    patched,
    extractAnchor,
    `${optionalMacro("customInstallExtractStarted")}\n${extractAnchor}\n${optionalMacro("customInstallExtractCompleted")}`,
    "application extraction",
  );

  const shortcutsAnchor =
    "!insertmacro addStartMenuLink $keepShortcuts\n!insertmacro addDesktopLink $keepShortcuts";
  patched = replaceRequired(
    patched,
    shortcutsAnchor,
    `${optionalMacro("customInstallShortcutsStarted")}\n${shortcutsAnchor}\n${optionalMacro("customInstallShortcutsCompleted")}`,
    "shortcut installation",
  );

  return sourceEol === "\r\n" ? patched.replaceAll("\n", "\r\n") : patched;
}

/** NSIS 初始化边界诊断：仅写文件日志，不改变上游检查顺序。 */
export function patchNsisOnInitStagesSource(source) {
  const sourceEol = source.includes("\r\n") ? "\r\n" : "\n";
  let patched = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (patched.includes(ON_INIT_PATCH_MARKER)) {
    return source;
  }

  const initAnchor = [
    "    !insertmacro check64BitAndSetRegView",
    "",
    "    !ifdef ONE_CLICK",
    "      !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE",
    "    !else",
    "      ${IfNot} ${UAC_IsInnerInstance}",
    "        !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE",
    "      ${EndIf}",
    "    !endif",
    "",
    "    !insertmacro initMultiUser",
  ].join("\n");
  const replacement = [
    `    ${ON_INIT_PATCH_MARKER}`,
    '    !insertmacro ZCodeReportInstallerStage "architecture-check-started"',
    "    !insertmacro check64BitAndSetRegView",
    '    !insertmacro ZCodeReportInstallerStage "architecture-check-completed"',
    "",
    "    !ifdef ONE_CLICK",
    '      !insertmacro ZCodeReportInstallerStage "single-instance-check-started"',
    "      !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE",
    '      !insertmacro ZCodeReportInstallerStage "single-instance-check-completed"',
    "    !else",
    "      ${IfNot} ${UAC_IsInnerInstance}",
    '        !insertmacro ZCodeReportInstallerStage "single-instance-check-started"',
    "        !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE",
    '        !insertmacro ZCodeReportInstallerStage "single-instance-check-completed"',
    "      ${EndIf}",
    "    !endif",
    "",
    '    !insertmacro ZCodeReportInstallerStage "install-mode-started"',
    "    !insertmacro initMultiUser",
    '    !insertmacro ZCodeReportInstallerStage "install-mode-initialized"',
  ].join("\n");
  patched = replaceRequired(patched, initAnchor, replacement, "installer.nsi onInit checks");
  return sourceEol === "\r\n" ? patched.replaceAll("\n", "\r\n") : patched;
}

/** 把 initMultiUser 缩小到管理员、注册表和模式选择边界。 */
export function patchNsisAssistedInitStagesSource(source) {
  const sourceEol = source.includes("\r\n") ? "\r\n" : "\n";
  let patched = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (patched.includes(ASSISTED_INIT_PATCH_MARKER)) return source;
  patched = replaceRequired(
    patched,
    "    ${endIf}\n\n    !ifndef MULTIUSER_INIT_TEXT_ADMINREQUIRED",
    [
      `    ${ASSISTED_INIT_PATCH_MARKER}`,
      "    ${endIf}",
      optionalStage("uac-completed"),
      "\n    !ifndef MULTIUSER_INIT_TEXT_ADMINREQUIRED",
    ].join("\n"),
    "initMultiUser UAC boundary",
  );
  patched = replaceRequired(
    patched,
    "    ${GetParameters} $R0",
    `${optionalStage("registry-completed")}\n` + "    ${GetParameters} $R0",
    "initMultiUser registry boundary",
  );
  patched = replaceRequired(
    patched,
    '    ${if} $hasPerUserInstallation == "1"',
    `${optionalStage("mode-selection-started")}\n` + '    ${if} $hasPerUserInstallation == "1"',
    "initMultiUser mode selection",
  );
  return sourceEol === "\r\n" ? patched.replaceAll("\n", "\r\n") : patched;
}

/** 缩小首次用户安装目录查询中 System 插件的具体出错调用。 */
export function patchNsisPerUserFolderStagesSource(source) {
  const sourceEol = source.includes("\r\n") ? "\r\n" : "\n";
  let patched = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (patched.includes(USER_FOLDER_PATCH_MARKER)) return source;
  patched = replaceRequired(
    patched,
    "      System::Store S\n      # Win7 has a per-user programfiles known folder",
    [
      `      ${USER_FOLDER_PATCH_MARKER}`,
      optionalStage("user-folder-store-started", "      "),
      "      System::Store S",
      optionalStage("user-folder-store-completed", "      "),
      "      # Win7 has a per-user programfiles known folder",
    ].join("\n"),
    "per-user folder store",
  );
  patched = replaceRequired(
    patched,
    "      System::Call 'SHELL32::SHGetKnownFolderPath(g \"${FOLDERID_UserProgramFiles}\", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'",
    "      System::Call 'SHELL32::SHGetKnownFolderPath(g \"${FOLDERID_UserProgramFiles}\", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'" +
      `\n${optionalStage("user-folder-query-completed", "      ")}`,
    "per-user folder query",
  );
  patched = replaceRequired(
    patched,
    "        System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'",
    "        System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'" +
      `\n${optionalStage("user-folder-pointer-read-completed", "        ")}`,
    "per-user folder pointer read",
  );
  patched = replaceRequired(
    patched,
    "        System::Call 'OLE32::CoTaskMemFree(p r2)'",
    `        System::Call 'OLE32::CoTaskMemFree(p r2)'\n${optionalStage("user-folder-free-completed", "        ")}`,
    "per-user folder release",
  );
  return sourceEol === "\r\n" ? patched.replaceAll("\n", "\r\n") : patched;
}

export async function patchNsisInstallSectionFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const patched = patchNsisInstallSectionSource(source);
  if (patched === source) {
    return { changed: false, originalSource: null };
  }

  await writeFile(filePath, patched, "utf8");
  return { changed: true, originalSource: source };
}

export async function patchNsisOnInitStagesFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const patched = patchNsisOnInitStagesSource(source);
  if (patched === source) {
    return { changed: false, originalSource: null };
  }

  await writeFile(filePath, patched, "utf8");
  return { changed: true, originalSource: source };
}

export async function patchNsisAssistedInitStagesFile(filePath) {
  return patchNsisTemplateFile(filePath, patchNsisAssistedInitStagesSource);
}

export async function patchNsisPerUserFolderStagesFile(filePath) {
  return patchNsisTemplateFile(filePath, patchNsisPerUserFolderStagesSource);
}

async function patchNsisTemplateFile(filePath, patchSource) {
  const source = await readFile(filePath, "utf8");
  const patched = patchSource(source);
  if (patched === source) return { changed: false, originalSource: null };
  await writeFile(filePath, patched, "utf8");
  return { changed: true, originalSource: source };
}

export function restoreNsisInstallSectionFileSync({ filePath, originalSource }) {
  if (originalSource !== null) {
    writeFileSync(filePath, originalSource, "utf8");
  }
}

export { PATCH_MARKER };
