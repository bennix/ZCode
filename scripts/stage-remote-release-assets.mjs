import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];

export async function stageRemoteReleaseAssets({ mockCdnDir, outputDir, version, platforms = PLATFORMS }) {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("Invalid release version");
  const root = await realpath(mockCdnDir);
  await mkdir(outputDir, { recursive: true });
  if ((await readdir(outputDir)).length) throw new Error("Staging directory must be empty");
  const staged = [];
  for (const platform of platforms) {
    if (!PLATFORMS.includes(platform)) throw new Error("Unsupported remote platform");
    const name = `manifest-${platform}.json`;
    const manifest = JSON.parse(await readFile(join(root, "releases", version, name), "utf8"));
    if (manifest.schemaVersion !== 1 || manifest.appVersion !== version || manifest.platformArch !== platform || !manifest.components?.length) throw new Error(`Invalid manifest: ${name}`);
    for (const component of manifest.components) {
      if (!/^[a-z0-9-]+$/u.test(component.id) || !/^[a-f0-9]{64}$/u.test(component.sha256)) throw new Error("Invalid component identity");
      const source = await realpath(resolve(root, component.artifactPath));
      // 发布路径必须留在 mock-cdn 内，禁止 manifest 把工作区外文件带入公开资产。
      if (!source.startsWith(root + sep)) throw new Error("Component path escapes mock-cdn");
      const digest = createHash("sha256");
      for await (const chunk of createReadStream(source)) digest.update(chunk);
      if (digest.digest("hex") !== component.sha256) throw new Error(`Component checksum mismatch: ${component.id}`);
      const asset = `remote-${platform}-${component.id}-${component.sha256}.tar.gz`;
      await copyFile(source, join(outputDir, asset));
      component.artifactPath = asset;
      staged.push(asset);
    }
    await writeFile(join(outputDir, name), JSON.stringify(manifest, null, 2) + "\n");
    staged.push(name);
  }
  return staged;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, outputDir] = process.argv.slice(2);
  if (!version || !outputDir) throw new Error("Usage: node scripts/stage-remote-release-assets.mjs <version> <empty-output-directory>");
  const files = await stageRemoteReleaseAssets({ mockCdnDir: resolve("packages/desktop/mock-cdn"), outputDir: resolve(outputDir), version });
  console.log(`Staged ${files.length} verified remote release assets in ${outputDir}`);
}
