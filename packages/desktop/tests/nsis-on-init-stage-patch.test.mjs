import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  patchNsisAssistedInitStagesSource,
  patchNsisOnInitStagesSource,
  patchNsisPerUserFolderSource,
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

test("安装模式诊断保留边界，首次用户目录不再解引用 System 指针", async () => {
  const assisted = await readFile(
    "node_modules/app-builder-lib/templates/nsis/assistedInstaller.nsh",
    "utf8",
  );
  const multiUser = await readFile(
    "node_modules/app-builder-lib/templates/nsis/multiUser.nsh",
    "utf8",
  );
  const assistedPatched = patchNsisAssistedInitStagesSource(assisted);
  const multiUserPatched = patchNsisPerUserFolderSource(multiUser);
  assert.equal(patchNsisAssistedInitStagesSource(assistedPatched), assistedPatched);
  assert.equal(patchNsisPerUserFolderSource(multiUserPatched), multiUserPatched);
  for (const stage of ["uac-completed", "registry-completed", "mode-selection-started"]) {
    assert.match(assistedPatched, new RegExp(`ZCodeReportInstallerStage "${stage}"`));
  }
  assert.match(multiUserPatched, /ReadRegStr \$perUserInstallationFolder HKCU/u);
  assert.match(multiUserPatched, /StrCpy \$0 "\$LocalAppData\\Programs"/u);
  assert.match(multiUserPatched, /!insertmacro GetDParameter \$R0/u);
  assert.doesNotMatch(
    multiUserPatched,
    /SHGetKnownFolderPath|System::Store|CoTaskMemFree|\*\$2\(&w/u,
  );
});
