import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { launchNativeMacCuaOnboarding } from "../src/main/nativeCuaOnboarding.ts";

test("native onboarding runs the same packaged executor and waits for its exit", async () => {
  const pluginRoot = await mkdtemp(join(tmpdir(), "zencode-cua-onboarding-"));
  const binary = join(pluginRoot, "bin", "macos-arm64", "OpenComputerUse");
  try {
    await mkdir(join(pluginRoot, "bin", "macos-arm64"), { recursive: true });
    await writeFile(binary, "#!/usr/bin/env node\nif(process.argv.length!==2)process.exit(17);\n");
    await chmod(binary, 0o755);
    const result = await launchNativeMacCuaOnboarding({ pluginRoot, arch: "arm64" });
    assert.equal(result.success, true);
    assert.equal(result.returnedFromSettings, true);
    assert.equal(result.restartHelperAfterReturn, false);
  } finally {
    await rm(pluginRoot, { recursive: true, force: true });
  }
});
