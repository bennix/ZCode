import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, rename, rm, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getTargetPlatform } from "./target-platform.mjs";
import { workbenchAsset, WORKBENCH_VERSION } from "./code-workbench-assets.mjs";

const watermarkDirectories = [
  "lib/vscode/out/vs/workbench/browser/parts/editor/media",
  "lib/vscode/out/media",
];
const watermarkThemes = ["light", "dark", "hcLight", "hcDark"];

export async function brandWorkbenchBundle(directory) {
  const productPath = join(directory, "lib/vscode/product.json");
  const product = JSON.parse(await readFile(productPath, "utf8"));
  const icon = await readFile(resolve(import.meta.dirname, "../build/zenmux-icon.svg"), "utf8");
  if (!icon.includes('viewBox="0 0 1024 1024"')) throw new Error("ZenCode icon is invalid");
  const watermark = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260"><g opacity=".18"><svg x="20" y="20" width="220" height="220" viewBox="0 0 1024 1024">${icon.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</svg></g></svg>\n`;
  const paths = watermarkDirectories.flatMap((base) =>
    watermarkThemes.map((theme) => join(directory, base, `letterpress-${theme}.svg`)),
  );
  // 品牌资产缺失说明上游目录已变；必须阻止出包，避免隐藏的旧 LOGO 混入安装包。
  await Promise.all(paths.map((path) => access(path)));
  product.nameShort = "ZenCode";
  product.nameLong = "ZenCode";
  await writeFile(productPath, `${JSON.stringify(product, null, 2)}\n`);
  await Promise.all(paths.map((path) => writeFile(path, watermark)));
}

export async function verifyWorkbenchBundle(directory, target) {
  const manifest = JSON.parse(await readFile(join(directory, "zencode-runtime.json"), "utf8"));
  const asset = workbenchAsset(target.os, target.arch);
  if (
    manifest.version !== WORKBENCH_VERSION ||
    manifest.platform !== target.os ||
    manifest.arch !== target.arch ||
    manifest.sha256 !== asset.sha256
  )
    throw new Error("IDE bundle platform/version mismatch");
  await access(join(directory, "out/node/entry.js"));
  await access(join(directory, "lib", target.os === "win32" ? "node.exe" : "node"));
  // code-server 的 node_modules 是运行时资产，不能被 Electron 的应用依赖过滤裁掉。
  await access(join(directory, "lib/vscode/node_modules"));
  // VS Code 上游按 OS 裁剪平台专用模块；只对 code-server 的通用依赖逐个验收。
  for (const base of [directory]) {
    const pkg = JSON.parse(await readFile(join(base, "package.json"), "utf8"));
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      await access(join(base, "node_modules", dependency, "package.json"));
    }
  }
  return directory;
}

export async function stageWorkbenchBundle(source, destination, target) {
  await verifyWorkbenchBundle(source, target);
  await brandWorkbenchBundle(source);
  await cp(source, destination, { recursive: true, force: true, dereference: true });
  await verifyWorkbenchBundle(destination, target);
}
export async function prepareWorkbench(
  target = getTargetPlatform(),
  root = resolve(import.meta.dirname, "../bundled-workbench"),
) {
  const asset = workbenchAsset(target.os, target.arch);
  const destination = join(root, target.key);
  try {
    await verifyWorkbenchBundle(destination, target);
    await brandWorkbenchBundle(destination);
    return destination;
  } catch {
    /* 仅构建阶段准备资产 */
  }
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(join(root, ".prepare-"));
  try {
    console.log(`[workbench] Preparing ${asset.name} for application bundle`);
    const response = await fetch(
      `https://github.com/coder/code-server/releases/download/v${WORKBENCH_VERSION}/${asset.name}.tar.gz`,
      { signal: AbortSignal.timeout(600_000) },
    );
    if (!response.ok || !response.body)
      throw new Error(`IDE build asset download failed: HTTP ${response.status}`);
    const archive = join(staging, "runtime.tar.gz");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest("hex") !== asset.sha256) throw new Error("IDE build asset checksum mismatch");
    await promisify(execFile)("tar", ["-xzf", archive, "-C", staging], { timeout: 120_000 });
    const extracted = join(staging, asset.name);
    await writeFile(
      join(extracted, "zencode-runtime.json"),
      JSON.stringify({
        version: WORKBENCH_VERSION,
        platform: target.os,
        arch: target.arch,
        sha256: asset.sha256,
      }),
    );
    await verifyWorkbenchBundle(extracted, target);
    await brandWorkbenchBundle(extracted);
    await rm(destination, { recursive: true, force: true });
    await rename(extracted, destination);
    console.log(`[workbench] Bundled asset ready: ${target.key}`);
    return destination;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await prepareWorkbench();
