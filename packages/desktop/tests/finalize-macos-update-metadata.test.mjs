import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import YAML from "yaml";
import { finalizeMacUpdateMetadata } from "../scripts/finalize-macos-update-metadata.mjs";

const digest = (content) => createHash("sha512").update(content).digest("base64");

test("finalize macOS update metadata after DMG stapling", async () => {
  const distDir = await mkdtemp(join(tmpdir(), "zencode-mac-update-"));
  const version = "3.14.29";
  const zipName = `ZenCode-${version}-mac-arm64.zip`;
  const dmgName = `ZenCode-${version}-mac-arm64.dmg`;
  const zip = Buffer.from("signed zip");
  const stapledDmg = Buffer.from("stapled notarized dmg");
  try {
    await writeFile(join(distDir, zipName), zip);
    await writeFile(join(distDir, dmgName), stapledDmg);
    await writeFile(
      join(distDir, "latest-mac.yml"),
      YAML.stringify({
        version,
        files: [
          { url: zipName, sha512: digest(zip), size: zip.length },
          { url: dmgName, sha512: digest("pre-staple dmg"), size: 15 },
        ],
        path: zipName,
        sha512: digest(zip),
      }),
    );

    await assert.rejects(finalizeMacUpdateMetadata({ distDir, version }), /DMG metadata mismatch/u);
    await finalizeMacUpdateMetadata({ distDir, version, write: true });
    await finalizeMacUpdateMetadata({ distDir, version });
    const metadata = YAML.parse(await readFile(join(distDir, "latest-mac.yml"), "utf8"));
    assert.equal(metadata.files[0].sha512, digest(zip));
    assert.equal(metadata.files[1].sha512, digest(stapledDmg));
    assert.equal(metadata.files[1].size, stapledDmg.length);
    assert.equal(metadata.path, zipName);
    assert.equal(metadata.sha512, digest(zip));

    await writeFile(join(distDir, dmgName), "changed after finalization");
    await assert.rejects(finalizeMacUpdateMetadata({ distDir, version }), /DMG metadata mismatch/u);
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
