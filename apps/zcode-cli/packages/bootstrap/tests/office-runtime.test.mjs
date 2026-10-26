import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOfficeRuntimeEnv, hasVerifiedCache, selectAsset, verifyAssetBytes } from "../../bundled-skills/skills/officecli/scripts/officecli.mjs";

test("pinned Office runtime overrides self-update settings without changing parent environment", () => {
  const inherited = { PATH: "fixture-path", OFFICECLI_SKIP_UPDATE: "0", officecli_skip_update: "0" };
  assert.deepEqual(createOfficeRuntimeEnv(inherited), { PATH: "fixture-path", OFFICECLI_SKIP_UPDATE: "1" });
  assert.equal(inherited.OFFICECLI_SKIP_UPDATE, "0");
});

test("the real launcher prevents a child from enabling updates through inherited environment", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "officecli-launch-test-")));
  try {
    const asset = selectAsset(process.platform, process.arch);
    const runtime = join(directory, "runtime", "fixture");
    await mkdir(runtime, { recursive: true });
    await cp(process.execPath, join(runtime, asset));
    const sha256 = createHash("sha256").update(await readFile(process.execPath)).digest("hex");
    await writeFile(join(directory, "release.json"), JSON.stringify({ version: "fixture", assets: { [asset]: sha256 } }));
    await cp(new URL("../../bundled-skills/skills/officecli/scripts/officecli.mjs", import.meta.url), join(directory, "officecli.mjs"));
    const { stdout } = await promisify(execFile)(process.execPath, [join(directory, "officecli.mjs"), "-e", "process.stdout.write(process.env.OFFICECLI_SKIP_UPDATE)"], { env: { ...process.env, OFFICECLI_SKIP_UPDATE: "0" } });
    assert.equal(stdout, "1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
