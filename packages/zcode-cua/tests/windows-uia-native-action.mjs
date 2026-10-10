import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createComputerUseRuntime } from "../index.js";

if (process.platform !== "win32") throw new Error("Run this test on a Windows interactive desktop");
const pluginRoot = process.env.ZCODE_CUA_PLUGIN_ROOT?.trim();
if (!pluginRoot) throw new Error("ZCODE_CUA_PLUGIN_ROOT is required");

const temporary = await mkdtemp(join(tmpdir(), "zencode-windows-uia-"));
const scriptPath = join(temporary, "smoke.ps1");
const readyPath = join(temporary, "ready");
const clickedPath = join(temporary, "clicked");
const title = "ZenCode Native UIA Smoke";
const context = { workspaceKey: "native-windows-smoke", sessionId: "dialog", runtimeScope: "main" };
const script = String.raw`
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = 'ZenCode Native UIA Smoke'
$form.Width = 420
$form.Height = 240
$form.StartPosition = 'Manual'
$form.Left = 100
$form.Top = 100
$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Name = 'ZenCodeInput'
$textBox.AccessibleName = 'ZenCodeInput'
$textBox.Width = 340
$textBox.Left = 30
$textBox.Top = 35
$form.Controls.Add($textBox)
$button = New-Object System.Windows.Forms.Button
$button.Name = 'ZenCodeConfirm'
$button.Text = 'ZenCodeConfirm'
$button.Width = 180
$button.Height = 48
$button.Left = 110
$button.Top = 90
$button.Add_Click({ [System.IO.File]::WriteAllText($env:ZCODE_CUA_SMOKE_CLICKED, $textBox.Text); $form.Close() })
$form.Controls.Add($button)
$form.Add_Shown({ [System.IO.File]::WriteAllText($env:ZCODE_CUA_SMOKE_READY, 'ready') })
[void]$form.ShowDialog()
`;
await writeFile(scriptPath, script);
const windowProcess = spawn(
  "powershell.exe",
  ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
  {
    env: {
      ...process.env,
      ZCODE_CUA_SMOKE_READY: readyPath,
      ZCODE_CUA_SMOKE_CLICKED: clickedPath,
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let windowError = "";
windowProcess.stderr.on("data", (chunk) => {
  windowError = (windowError + chunk.toString()).slice(-4096);
});
const runtime = createComputerUseRuntime({
  arch: process.arch,
  env: { ...process.env, ZCODE_CUA_PLUGIN_ROOT: resolve(pluginRoot) },
  platform: "win32",
});

async function waitForFile(path, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await access(path);
      return;
    } catch {
      if (windowProcess.exitCode !== null) break;
      await delay(100);
    }
  }
  throw new Error(`${label} did not appear on the interactive desktop: ${windowError}`);
}

async function call(name, args = {}, snapshotId) {
  const response = await runtime.execute({
    toolName: "platform.call",
    arguments: { name, arguments: args, ...(snapshotId ? { snapshotId } : {}) },
    context,
    signal: AbortSignal.timeout(30_000),
  });
  assert.notEqual(response.isError, true, response.content?.[0]?.text?.slice(0, 700));
  return response;
}

function snapshotIdFrom(response) {
  for (const item of response.content ?? []) {
    if (item.type !== "text") continue;
    try {
      const parsed = JSON.parse(item.text);
      if (typeof parsed?.zcodeSnapshotId === "string") return parsed.zcodeSnapshotId;
    } catch {
      // Native UIA tree is plain text; the ZenCode snapshot is a separate JSON block.
    }
  }
  return undefined;
}

try {
  await waitForFile(readyPath, "WinForms fixture");
  const apps = await call("list_apps");
  assert.match(apps.content?.[0]?.text ?? "", /ZenCode Native UIA Smoke/u);

  let inputIndex;
  let observed;
  for (let attempt = 0; attempt < 30; attempt++) {
    observed = await call("get_app_state", { app: title });
    const tree = observed.content?.[0]?.text ?? "";
    const inputLine = tree.split("\n").find((line) => line.includes("ZenCodeInput"));
    inputIndex = inputLine?.match(/^\s*(\d+)\s+/u)?.[1];
    if (inputIndex) break;
    await delay(100);
  }
  // 根因待 CI 树诊断确认：列出窗口成功但文本框缺失；输出有界树以区分目标窗口与 UIA 子节点问题。
  assert.ok(
    inputIndex,
    `WinForms text box was not visible in the Windows UIA tree. apps=${(apps.content?.[0]?.text ?? "").slice(0, 1200)} tree=${(observed?.content?.[0]?.text ?? "").slice(0, 5000)}`,
  );
  const snapshotId = snapshotIdFrom(observed);
  assert.ok(snapshotId, "UIA observation must issue a ZenCode snapshot ID");
  await call(
    "set_value",
    { app: title, element_index: inputIndex, value: "ZenCodeInputOK" },
    snapshotId,
  );
  const afterInput = await call("get_app_state", { app: title });
  const buttonLine = (afterInput.content?.[0]?.text ?? "")
    .split("\n")
    .find((line) => line.includes("ZenCodeConfirm"));
  const buttonIndex = buttonLine?.match(/^\s*(\d+)\s+/u)?.[1];
  assert.ok(buttonIndex, "WinForms button was not visible after text input");
  const clickSnapshotId = snapshotIdFrom(afterInput);
  assert.ok(clickSnapshotId, "second observation must issue a new ZenCode snapshot ID");
  await call(
    "click",
    { app: title, element_index: buttonIndex, click_method: "accessibility" },
    clickSnapshotId,
  );
  await waitForFile(clickedPath, "UIA button click");
  assert.equal(await readFile(clickedPath, "utf8"), "ZenCodeInputOK");
  const exit =
    windowProcess.exitCode === null
      ? await Promise.race([
          once(windowProcess, "exit"),
          delay(10_000).then(() => {
            throw new Error("WinForms fixture did not exit after UIA click");
          }),
        ])
      : [windowProcess.exitCode];
  assert.equal(exit[0], 0);
  console.log("[computer-use] Windows UIA observation, native text input, and button click passed");
} finally {
  await runtime.dispose();
  if (windowProcess.exitCode === null) {
    windowProcess.kill();
    await Promise.race([once(windowProcess, "exit"), delay(5_000)]);
  }
  await rm(temporary, { recursive: true, force: true });
}
