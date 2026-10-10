import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readMacComputerUseDoctor, resolveMacComputerUseExecutablePath } from "../index.js";

test("macOS settings reads the packaged executor diagnosis without opening onboarding", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-mac-cua-doctor-"));
  const executable = resolveMacComputerUseExecutablePath(root, "arm64");
  try {
    await mkdir(join(root, "bin", "macos-arm64"), { recursive: true });
    await writeFile(
      executable,
      `#!/usr/bin/env node
if (process.argv.slice(2).join(" ") !== "doctor --json --no-onboarding") process.exit(17);
console.log(JSON.stringify({schemaVersion:1,permissions:{accessibility:true,screenRecording:false},screenLocked:true,readiness:{hostProtocol:true}}));
`,
    );
    await chmod(executable, 0o755);
    const diagnosis = await readMacComputerUseDoctor({ pluginRoot: root, arch: "arm64" });
    assert.deepEqual(diagnosis.permissions, { accessibility: true, screenRecording: false });
    assert.equal(diagnosis.screenLocked, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
