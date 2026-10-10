import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyWorkbenchBundle, brandWorkbenchBundle } from "../scripts/prepare-code-workbench.mjs";
import { workbenchAsset, WORKBENCH_VERSION } from "../scripts/code-workbench-assets.mjs";
test("packaging rejects absent or mismatched IDE assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "ide-bundle-test-"));
  const target = { os: "darwin", arch: "arm64", key: "darwin-arm64" };
  try {
    await assert.rejects(verifyWorkbenchBundle(root, target));
    await mkdir(join(root, "out/node"), { recursive: true });
    await mkdir(join(root, "lib"));
    await writeFile(join(root, "out/node/entry.js"), "");
    await writeFile(join(root, "lib/node"), "");
    const manifest = {
      version: WORKBENCH_VERSION,
      platform: target.os,
      arch: target.arch,
      sha256: workbenchAsset(target.os, target.arch).sha256,
    };
    await writeFile(join(root, "zencode-runtime.json"), JSON.stringify(manifest));
    await assert.rejects(verifyWorkbenchBundle(root, target));
    await mkdir(join(root, "lib/vscode/node_modules"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { "@coder/logger": "*" } }),
    );
    await assert.rejects(verifyWorkbenchBundle(root, target));
    await mkdir(join(root, "node_modules/@coder/logger"), { recursive: true });
    await writeFile(join(root, "node_modules/@coder/logger/package.json"), "{}");
    assert.equal(await verifyWorkbenchBundle(root, target), root);
    await assert.rejects(verifyWorkbenchBundle(root, { os: "darwin", arch: "x64" }), /mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Windows ARM64 manifest records its x64 IDE runtime explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "ide-win-arm-bundle-test-"));
  const target = { os: "win32", arch: "arm64", key: "win32-arm64" };
  try {
    await mkdir(join(root, "out/node"), { recursive: true });
    await mkdir(join(root, "lib/vscode/node_modules"), { recursive: true });
    await writeFile(join(root, "out/node/entry.js"), "");
    await writeFile(join(root, "lib/node.exe"), "");
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
    const asset = workbenchAsset(target.os, target.arch);
    const manifest = {
      version: WORKBENCH_VERSION,
      platform: target.os,
      arch: target.arch,
      runtimeArch: asset.runtimeArch,
      sha256: asset.sha256,
    };
    await writeFile(join(root, "zencode-runtime.json"), JSON.stringify(manifest));
    assert.equal(await verifyWorkbenchBundle(root, target), root);
    await writeFile(
      join(root, "zencode-runtime.json"),
      JSON.stringify({ ...manifest, runtimeArch: "arm64" }),
    );
    await assert.rejects(verifyWorkbenchBundle(root, target), /mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("release and development preparation include IDE, packaged resources contain it", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.scripts["prepare:code-workbench"]);
  const prepare = await readFile(
    new URL("../scripts/prepare-runtime-assets.mjs", import.meta.url),
    "utf8",
  );
  const dev = await readFile(
    new URL("../scripts/ensure-local-runtime-assets.mjs", import.meta.url),
    "utf8",
  );
  const builder = await readFile(new URL("../electron-builder.config.js", import.meta.url), "utf8");
  assert.match(prepare, /"prepare:code-workbench"/);
  assert.match(dev, /await prepareWorkbench\(target\)/);
  assert.ok(dev.indexOf("await prepareWorkbench(target)") < dev.indexOf("process.exit(0)"));
  assert.match(builder, /await verifyWorkbenchBundle/);
  assert.match(builder, /afterPack:stageWorkbenchBundle/);
  assert.doesNotMatch(builder, /to: "code-workbench"/);
});

test("workbench branding replaces both theme watermark sets and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "ide-brand-test-"));
  const bases = ["lib/vscode/out/vs/workbench/browser/parts/editor/media", "lib/vscode/out/media"];
  const themes = ["light", "dark", "hcLight", "hcDark"];
  try {
    await mkdir(join(root, "lib/vscode"), { recursive: true });
    await writeFile(
      join(root, "lib/vscode/product.json"),
      JSON.stringify({
        nameShort: "code-server",
        nameLong: "code-server",
        applicationName: "code-server",
        licenseUrl: "upstream",
      }),
    );
    for (const base of bases) {
      await mkdir(join(root, base), { recursive: true });
      for (const theme of themes)
        await writeFile(join(root, base, `letterpress-${theme}.svg`), "<svg>upstream logo</svg>");
    }
    await brandWorkbenchBundle(root);
    const product = JSON.parse(await readFile(join(root, "lib/vscode/product.json"), "utf8"));
    assert.equal(product.nameShort, "ZenCode");
    assert.equal(product.nameLong, "ZenCode");
    assert.equal(product.applicationName, "code-server");
    assert.equal(product.licenseUrl, "upstream");
    const watermark = await readFile(join(root, bases[0], "letterpress-dark.svg"), "utf8");
    assert.match(watermark, /linearGradient id="face"/);
    assert.match(watermark, /viewBox="0 0 1024 1024"/);
    assert.doesNotMatch(watermark, /upstream logo/);
    await brandWorkbenchBundle(root);
    for (const base of bases)
      for (const theme of themes)
        assert.equal(
          await readFile(join(root, base, `letterpress-${theme}.svg`), "utf8"),
          watermark,
        );
    await rm(join(root, bases[1], "letterpress-light.svg"));
    await assert.rejects(brandWorkbenchBundle(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
