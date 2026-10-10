import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { createComputerUseRuntime } from "../index.js";

if (process.platform !== "linux" || !process.env.DISPLAY)
  throw new Error("Run this test in a Linux X11 session (for example, xvfb-run)");
const pluginRoot = process.env.ZCODE_CUA_PLUGIN_ROOT?.trim();
if (!pluginRoot) throw new Error("ZCODE_CUA_PLUGIN_ROOT is required");

const run = promisify(execFile);
const calculator = spawn("xcalc", [], { stdio: "ignore" });
const runtime = createComputerUseRuntime({
  arch: process.arch,
  env: { ...process.env, ZCODE_CUA_PLUGIN_ROOT: resolve(pluginRoot) },
  platform: "linux",
});
const context = { workspaceKey: "native-x11-smoke", sessionId: "calculator", runtimeScope: "main" };

async function windowGeometry() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const found = await run("xdotool", ["search", "--onlyvisible", "--class", "XCalc"]);
      const windowId = found.stdout.trim().split("\n")[0];
      const geometry = await run("xdotool", ["getwindowgeometry", "--shell", windowId]);
      const values = Object.fromEntries(
        geometry.stdout
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      );
      if (Number(values.WIDTH) > 100 && Number(values.HEIGHT) > 100) return values;
    } catch {
      await delay(100);
    }
  }
  throw new Error("xcalc did not open on the X11 display");
}

async function observe() {
  const response = await runtime.execute({
    toolName: "platform.call",
    arguments: { name: "get_app_state", arguments: {} },
    context,
    signal: AbortSignal.timeout(30_000),
  });
  assert.notEqual(response.isError, true, response.content?.[0]?.text?.slice(0, 500));
  const image = response.content.find((item) => item.type === "image");
  assert.ok(image?.data, "native observation must contain a screenshot");
  const snapshot = response.content
    .filter((item) => item.type === "text")
    .map((item) => JSON.parse(item.text))
    .find((item) => item.zcodeSnapshotId);
  assert.ok(snapshot?.zcodeSnapshotId, "native observation must issue a snapshot ID");
  return { image: image.data, snapshotId: snapshot.zcodeSnapshotId };
}

try {
  const geometry = await windowGeometry();
  const diagnosis = await runtime.execute({
    toolName: "platform.call",
    arguments: { name: "doctor", arguments: {} },
    context,
    signal: AbortSignal.timeout(30_000),
  });
  assert.notEqual(diagnosis.isError, true, diagnosis.content?.[0]?.text?.slice(0, 500));
  const doctor = JSON.parse(diagnosis.content[0].text);
  assert.equal(doctor.platform.x11_display.ok, true);
  assert.equal(doctor.readiness.can_send_development_input, true);
  assert.equal(doctor.readiness.can_capture_screenshots, true);

  const before = await observe();
  // 修复依据：X11 坐标动作必须引用当前观察；按 xcalc 默认网格的相对位置点击数字 7。
  const click = await runtime.execute({
    toolName: "platform.call",
    arguments: {
      name: "click",
      arguments: {
        x: Math.round(Number(geometry.X) + Number(geometry.WIDTH) * 0.31),
        y: Math.round(Number(geometry.Y) + Number(geometry.HEIGHT) * 0.725),
      },
      snapshotId: before.snapshotId,
    },
    context,
    signal: AbortSignal.timeout(30_000),
  });
  assert.notEqual(click.isError, true, click.content?.[0]?.text?.slice(0, 500));
  const action = JSON.parse(click.content[0].text);
  assert.equal(action.ok, true);
  assert.match(action.message, /xdotool.*X11 XTEST/u);

  const after = await observe();
  assert.notEqual(after.image, before.image, "xcalc display must change after clicking 7");
  console.log("[computer-use] Linux X11 observation and native click passed");
} finally {
  await runtime.dispose();
  calculator.kill();
}
