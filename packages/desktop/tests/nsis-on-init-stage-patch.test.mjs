import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  patchNsisAssistedInitStagesSource,
  patchNsisOnInitStagesSource,
  patchNsisPerUserFolderStagesSource,
} from "../scripts/patch-nsis-install-section.mjs";

test("NSIS onInit 阶段标记覆盖架构、互斥和安装模式边界", async () => {
  const source = await readFile(
    "node_modules/app-builder-lib/templates/nsis/installer.nsi",
    "utf8",
  );
  const patched = patchNsisOnInitStagesSource(source);
  assert.equal(patchNsisOnInitStagesSource(patched), patched);
  for (const stage of [
    "architecture-check-started",
    "architecture-check-completed",
    "single-instance-check-started",
    "single-instance-check-completed",
    "install-mode-initialized",
  ]) {
    assert.match(patched, new RegExp(`!insertmacro ZCodeReportInstallerStage "${stage}"`));
  }
  assert.match(patched, /!insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE/);
  assert.match(patched, /!insertmacro initMultiUser/);
});

test("NSIS 上游模板锚点变化时明确失败", () => {
  assert.throws(() => patchNsisOnInitStagesSource("Function .onInit\nFunctionEnd"), /缺少预期锚点/);
});

test("安装模式诊断覆盖管理员、注册表、模式选择和用户目录 System 调用", async () => {
  const assisted = await readFile(
    "node_modules/app-builder-lib/templates/nsis/assistedInstaller.nsh",
    "utf8",
  );
  const multiUser = await readFile(
    "node_modules/app-builder-lib/templates/nsis/multiUser.nsh",
    "utf8",
  );
  const assistedPatched = patchNsisAssistedInitStagesSource(assisted);
  const multiUserPatched = patchNsisPerUserFolderStagesSource(multiUser);
  assert.equal(patchNsisAssistedInitStagesSource(assistedPatched), assistedPatched);
  assert.equal(patchNsisPerUserFolderStagesSource(multiUserPatched), multiUserPatched);
  for (const stage of ["uac-completed", "registry-completed", "mode-selection-started"]) {
    assert.match(assistedPatched, new RegExp(`ZCodeReportInstallerStage "${stage}"`));
  }
  for (const stage of [
    "user-folder-store-started",
    "user-folder-store-completed",
    "user-folder-query-completed",
    "user-folder-pointer-read-completed",
    "user-folder-free-completed",
  ]) {
    assert.match(multiUserPatched, new RegExp(`ZCodeReportInstallerStage "${stage}"`));
  }
});
