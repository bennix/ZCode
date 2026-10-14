import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasVerifiedCache, selectAsset, verifyAssetBytes } from "../../bundled-skills/skills/officecli/scripts/officecli.mjs";

test("runtime selection covers supported operating systems and libc", () => {
  assert.equal(selectAsset("darwin", "arm64"), "officecli-mac-arm64");
  assert.equal(selectAsset("win32", "x64"), "officecli-win-x64.exe");
  assert.equal(selectAsset("linux", "arm64", true), "officecli-linux-alpine-arm64");
  assert.throws(() => selectAsset("freebsd", "x64"), /Unsupported/);
  assert.throws(() => selectAsset("linux", "ia32"), /Unsupported/);
});
test("untrusted or corrupted binaries are rejected", () => {
  assert.throws(() => verifyAssetBytes("officecli-mac-arm64", Buffer.from("corrupt")), /checksum/);
  assert.throws(() => verifyAssetBytes("unknown", Buffer.from("corrupt")), /Unknown/);
});

test("a corrupt cached runtime is removed so ensureRuntime can fetch a verified copy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "officecli-cache-test-"));
  const cached = join(directory, "officecli-mac-arm64");
  try {
    await writeFile(cached, "corrupt cache");
    assert.equal(await hasVerifiedCache(cached, "officecli-mac-arm64"), false);
    await assert.rejects(readFile(cached), { code: "ENOENT" });
    assert.equal(await hasVerifiedCache(cached, "officecli-mac-arm64"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
