import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findFile } from "electron-updater/out/providers/Provider.js";
import YAML from "yaml";
import { finalizeWindowsUpdateMetadata } from "../scripts/finalize-windows-update-metadata.mjs";

const digest = (content) => createHash("sha512").update(content).digest("base64");

test("Windows update metadata contains both released installer architectures", async () => {
  const distDir = await mkdtemp(join(tmpdir(), "zencode-win-update-"));
  const version = "3.14.29";
  const installers = {
    x64: Buffer.from("signed x64 installer"),
    arm64: Buffer.from("signed arm64 installer"),
  };
  try {
    for (const [arch, bytes] of Object.entries(installers)) {
      await writeFile(join(distDir, `ZenCode-${version}-win-${arch}.exe`), bytes);
    }
    await assert.rejects(finalizeWindowsUpdateMetadata({ distDir, version }), /latest.yml missing/u);
    await finalizeWindowsUpdateMetadata({ distDir, version, write: true });
    await finalizeWindowsUpdateMetadata({ distDir, version });
    const metadata = YAML.parse(await readFile(join(distDir, "latest.yml"), "utf8"));
    assert.deepEqual(metadata.files.map((file) => file.url), [
      `ZenCode-${version}-win-x64.exe`,
      `ZenCode-${version}-win-arm64.exe`,
    ]);
    assert.equal(metadata.files[0].sha512, digest(installers.x64));
    assert.equal(metadata.files[1].sha512, digest(installers.arm64));
    assert.equal(metadata.path, `ZenCode-${version}-win-x64.exe`);
    assert.equal(metadata.sha512, digest(installers.x64));
    if (process.arch === "x64" || process.arch === "arm64") {
      const selected = findFile(
        metadata.files.map((info) => ({
          info,
          url: new URL(`https://example.invalid/${info.url}`),
        })),
        "exe",
      );
      assert.equal(selected.info.url, `ZenCode-${version}-win-${process.arch}.exe`);
    }
    await writeFile(join(distDir, `ZenCode-${version}-win-arm64.exe`), "changed");
    await assert.rejects(finalizeWindowsUpdateMetadata({ distDir, version }), /ARM64 metadata mismatch/u);
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
