import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { createComputerUseRuntime } from "../index.js";

if (process.platform !== "linux" || !process.env.DBUS_SESSION_BUS_ADDRESS)
  throw new Error("Run this test on Linux under dbus-run-session");
const pluginRoot = process.env.ZCODE_CUA_PLUGIN_ROOT?.trim();
if (!pluginRoot) throw new Error("ZCODE_CUA_PLUGIN_ROOT is required");

const temporary = await mkdtemp(join(tmpdir(), "zencode-wayland-smoke-"));
const runtimeDir = join(temporary, "runtime");
const configDir = join(temporary, "config");
await mkdir(runtimeDir, { mode: 0o700 });
await mkdir(configDir);
const socketName = "wayland-zencode-smoke";
const environment = {
  ...process.env,
  GDK_BACKEND: "wayland",
  GTK_A11Y: "atspi",
  LANG: "C.UTF-8",
  WAYLAND_DISPLAY: socketName,
  XDG_CONFIG_HOME: configDir,
  XDG_RUNTIME_DIR: runtimeDir,
  XDG_SESSION_TYPE: "wayland",
  ZCODE_CUA_PLUGIN_ROOT: resolve(pluginRoot),
};
const run = promisify(execFile);
const weston = spawn(
  "weston",
  [
    "--backend=headless",
    "--renderer=pixman",
    `--socket=${socketName}`,
    "--idle-time=0",
    "--no-config",
  ],
  { env: environment, stdio: ["ignore", "ignore", "pipe"] },
);
let westonError = "";
weston.stderr.on("data", (chunk) => {
  westonError = (westonError + chunk.toString()).slice(-4096);
});
let zenity;
let runtime;
const context = { workspaceKey: "native-wayland-smoke", sessionId: "dialog", runtimeScope: "main" };

async function call(name, arguments_) {
  const response = await runtime.execute({
    toolName: "platform.call",
    arguments: { name, arguments: arguments_ },
    context,
    signal: AbortSignal.timeout(30_000),
  });
  assert.notEqual(response.isError, true, response.content?.[0]?.text?.slice(0, 500));
  return response;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await access(join(runtimeDir, socketName));
      ready = true;
      break;
    } catch {
      if (weston.exitCode !== null) break;
      await delay(100);
    }
  }
  assert.ok(ready, `Weston did not create a Wayland socket: ${westonError}`);
  await run("gsettings", ["set", "org.gnome.desktop.interface", "toolkit-accessibility", "true"], {
    env: environment,
  });

  zenity = spawn(
    "zenity",
    [
      "--question",
      "--title=ZenCode Wayland smoke",
      "--text=Confirm native AT-SPI action",
      "--ok-label=ZenCodeConfirm",
      "--cancel-label=ZenCodeCancel",
    ],
    { env: environment, stdio: "ignore" },
  );
  runtime = createComputerUseRuntime({
    arch: process.arch,
    env: environment,
    platform: "linux",
  });
  const doctorResponse = await call("doctor", {});
  const doctor = JSON.parse(doctorResponse.content[0].text);
  assert.equal(doctor.platform.xdg_session_type, "wayland");
  assert.equal(
    doctor.readiness.can_build_accessibility_tree,
    true,
    JSON.stringify(doctor.readiness),
  );

  let observed;
  let button;
  for (let attempt = 0; attempt < 100; attempt++) {
    observed = await call("get_app_state", { app: "zenity" });
    const state = JSON.parse(observed.content[0].text);
    button = state.accessibility_tree?.find(
      (node) => node.role === "button" && node.name === "ZenCodeConfirm",
    );
    if (button) break;
    if (zenity.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(button, "Zenity confirmation button was not visible in the AT-SPI tree");
  const snapshotId = observed.content
    .filter((item) => item.type === "text")
    .map((item) => JSON.parse(item.text))
    .find((item) => item.zcodeSnapshotId)?.zcodeSnapshotId;
  assert.ok(snapshotId, "observation must issue a ZenCode snapshot ID");
  const clicked = await runtime.execute({
    toolName: "platform.call",
    arguments: {
      name: "click",
      arguments: { element_index: button.index },
      snapshotId,
    },
    context,
    signal: AbortSignal.timeout(30_000),
  });
  assert.notEqual(clicked.isError, true, clicked.content?.[0]?.text?.slice(0, 500));
  const action = JSON.parse(clicked.content[0].text);
  assert.equal(action.ok, true);
  assert.match(action.message, /AT-SPI action/u);
  const exit =
    zenity.exitCode === null
      ? await Promise.race([
          once(zenity, "exit"),
          delay(10_000).then(() => {
            throw new Error("Zenity did not exit after click");
          }),
        ])
      : [zenity.exitCode];
  assert.equal(exit[0], 0, "Zenity must accept the button action");
  console.log("[computer-use] Linux Wayland AT-SPI observation and native click passed");
} finally {
  if (runtime) await runtime.dispose();
  zenity?.kill();
  weston.kill();
  await rm(temporary, { recursive: true, force: true });
}
