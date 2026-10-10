import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createComputerUseRuntime } from "../index.js";

if (process.platform !== "win32" && process.platform !== "linux") {
  throw new Error("Native package smoke test requires Windows or Linux");
}

const pluginRoot = process.env.ZCODE_CUA_PLUGIN_ROOT?.trim();
if (!pluginRoot) throw new Error("ZCODE_CUA_PLUGIN_ROOT is required");
const root = resolve(pluginRoot);
const binary = resolve(
  root,
  "bin",
  `${process.platform === "win32" ? "windows" : "linux"}-${process.arch}`,
  process.platform === "win32" ? "open-computer-use.exe" : "computer-use-linux",
);
await access(binary);

const runtime = createComputerUseRuntime({
  arch: process.arch,
  env: { ZCODE_CUA_PLUGIN_ROOT: root },
  platform: process.platform,
});
const context = { workspaceKey: "package-smoke", sessionId: "protocol", runtimeScope: "main" };
try {
  const response = await runtime.execute({
    context,
    signal: AbortSignal.timeout(30_000),
    toolName: "platform.describe",
  });
  assert.notEqual(response.isError, true, response.content?.[0]?.text);
  const described = JSON.parse(response.content[0].text);
  const names = new Set(described.tools.map((tool) => tool.name));
  for (const name of ["get_app_state", "click", "list_apps"]) assert.ok(names.has(name), name);
  assert.equal(names.has("run_shell"), false);
  if (process.platform === "linux") {
    assert.ok(names.has("doctor"));
    const diagnosis = await runtime.execute({
      arguments: { name: "doctor", arguments: {} },
      context,
      signal: AbortSignal.timeout(30_000),
      toolName: "platform.call",
    });
    assert.ok(!diagnosis.isError, diagnosis.content?.[0]?.text);
    const doctor = JSON.parse(diagnosis.content?.[0]?.text ?? "null");
    assert.equal(typeof doctor?.readiness?.can_register_mcp_tools, "boolean");
  }
  console.log(`[computer-use] ${process.platform}-${process.arch} native MCP handshake passed`);
} finally {
  await runtime.dispose();
}
