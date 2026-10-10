import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, stat, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const [tag, repository, promotionId, ...files] = process.argv.slice(2);
if (
  !tag ||
  !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") ||
  !/^[0-9]+-[0-9]+$/.test(promotionId ?? "") ||
  files.length === 0
) {
  throw new Error(
    "usage: promote-release-assets.mjs <tag> <owner/repo> <run-id>-<attempt> <file>...",
  );
}

async function gh(...args) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}

async function assets() {
  return JSON.parse(await gh("release", "view", tag, "--repo", repository, "--json", "assets"))
    .assets;
}

function uniqueAsset(list, name) {
  const found = list.filter((asset) => asset.name === name);
  if (found.length !== 1)
    throw new Error(`expected exactly one release asset named ${name}; found ${found.length}`);
  return found[0];
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

async function rename(asset, name) {
  const assetId = asset.apiUrl?.match(/\/assets\/(\d+)$/)?.[1];
  if (!assetId) throw new Error(`missing numeric asset ID for ${asset.name}`);
  await gh(
    "api",
    "-X",
    "PATCH",
    `repos/${repository}/releases/assets/${assetId}`,
    "-f",
    `name=${name}`,
  );
}

for (const file of files) {
  const name = basename(file);
  const stagedName = `${name}.refresh-${promotionId}`;
  const backupName = `${name}.previous-${promotionId}`;
  const stagedPath = join(dirname(file), stagedName);
  const digest = await sha256(file);
  const size = (await stat(file)).size;
  const before = await assets();
  const old = uniqueAsset(before, name);
  if (before.some((asset) => asset.name === stagedName || asset.name === backupName)) {
    throw new Error(
      `promotion ${promotionId} has existing temporary assets for ${name}; inspect them before retrying`,
    );
  }

  await copyFile(file, stagedPath);
  try {
    await gh("release", "upload", tag, stagedPath, "--repo", repository);
    const staged = uniqueAsset(await assets(), stagedName);
    if (staged.digest !== digest || staged.size !== size) {
      throw new Error(`staged asset hash or size differs from ${name}`);
    }

    // 先保留旧资产的可恢复名称；新资产验证完成后才占用规范名称。
    await rename(old, backupName);
    try {
      await rename(staged, name);
    } catch (error) {
      await rename(old, name);
      throw error;
    }
    const published = uniqueAsset(await assets(), name);
    if (published.digest !== digest || published.size !== size) {
      throw new Error(
        `published asset hash or size differs from ${name}; backup retained as ${backupName}`,
      );
    }
    const oldId = old.apiUrl?.match(/\/assets\/(\d+)$/)?.[1];
    if (!oldId) throw new Error(`missing numeric asset ID for ${backupName}`);
    await gh("api", "-X", "DELETE", `repos/${repository}/releases/assets/${oldId}`);
    process.stdout.write(`${name} ${digest}\n`);
  } finally {
    await unlink(stagedPath).catch(() => {});
  }
}
