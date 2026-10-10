import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findMachOFiles } from "../scripts/sign-code-workbench.mjs";

test("workbench signing selects Mach-O files and skips ordinary resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-workbench-sign-"));
  try {
    await mkdir(join(root, "nested"));
    const executable = join(root, "nested", "node");
    const addon = join(root, "addon.node");
    const image = join(root, "image.png");
    await writeFile(executable, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 1]));
    await writeFile(addon, Buffer.from([0xca, 0xfe, 0xba, 0xbe, 1]));
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]), { mode: 0o755 });
    assert.deepEqual(await findMachOFiles(root), [addon, executable]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
