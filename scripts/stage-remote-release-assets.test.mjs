import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { stageRemoteReleaseAssets } from "./stage-remote-release-assets.mjs";

test("release staging preserves bytes and digests and rejects tampered or escaping components", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zencode-remote-stage-"));
  try {
    const root = join(dir, "cdn");
    const release = join(root, "releases", "3.14.36");
    await mkdir(release, { recursive: true });
    const bytes = Buffer.from("fixture archive");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(root, "node.tar.gz"), bytes);
    const manifest = { schemaVersion: 1, appVersion: "3.14.36", platformArch: "linux-x64", components: [{ id: "node-runtime", version: "v24.14.0", sha256, artifactPath: "node.tar.gz", mount: "node/linux-x64" }] };
    const path = join(release, "manifest-linux-x64.json");
    await writeFile(path, JSON.stringify(manifest));
    const run = (name) => stageRemoteReleaseAssets({ mockCdnDir: root, outputDir: join(dir, name), version: "3.14.36", platforms: ["linux-x64"] });
    await run("valid");
    const staged = JSON.parse(await readFile(join(dir, "valid", "manifest-linux-x64.json"), "utf8"));
    assert.deepEqual(await readFile(join(dir, "valid", staged.components[0].artifactPath)), bytes);
    assert.equal(staged.components[0].sha256, sha256);
    assert.equal(staged.components[0].mount, "node/linux-x64");
    await assert.rejects(run("valid"), /empty/u);
    await writeFile(join(root, "node.tar.gz"), "corrupted");
    await assert.rejects(run("corrupted"), /checksum mismatch/u);
    await writeFile(join(dir, "outside.tar.gz"), bytes);
    manifest.components[0].artifactPath = "../outside.tar.gz";
    await writeFile(path, JSON.stringify(manifest));
    await assert.rejects(run("escape"), /escapes/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
