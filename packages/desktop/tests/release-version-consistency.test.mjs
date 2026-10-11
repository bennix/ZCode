import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflowPaths = [
  ".github/workflows/linux-packages.yml",
  ".github/workflows/verify-installed-release.yml",
  ".github/workflows/stage-draft-release-assets.yml",
  ".github/workflows/promote-linux-release.yml",
  ".github/workflows/promote-windows-release.yml",
];

test("release workflows use the root package version for candidate assets", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  );
  for (const path of workflowPaths) {
    const source = await readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
    const releaseVersions = [...source.matchAll(/(?:ZenCode-|\bv)(\d+\.\d+\.\d+)/gu)].map(
      (match) => match[1],
    );
    assert.ok(releaseVersions.length > 0, `${path} has no release version`);
    assert.deepEqual(new Set(releaseVersions), new Set([manifest.version]), path);
  }
});
