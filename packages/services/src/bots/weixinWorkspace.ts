import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getZCodeDataRootDir } from "../paths.js";

export function getWeixinWorkspacePath(botId: string): string {
  const id = createHash("sha256").update(botId).digest("hex").slice(0, 24);
  return join(getZCodeDataRootDir(), "workspace", "weixin", id);
}

export async function ensureWeixinWorkspace(botId: string): Promise<string> {
  const path = getWeixinWorkspacePath(botId);
  await mkdir(path, { recursive: true });
  await assertWeixinWorkspace(botId, path);
  return path;
}

export async function assertWeixinWorkspace(botId: string, path: string): Promise<void> {
  const expected = getWeixinWorkspacePath(botId);
  if (resolve(path) !== expected || (await lstat(expected)).isSymbolicLink()) {
    throw new Error("只能清空微信专属工作目录，不能使用符号链接或其他项目目录。");
  }
  // 中文修复依据：只检查末级目录会遗漏父目录替换成符号链接，必须校验整个真实路径。
  if ((await realpath(expected)) !== expected) throw new Error("微信工作目录的真实路径不匹配。");
}

export async function clearWeixinWorkspace(botId: string, path: string): Promise<void> {
  await assertWeixinWorkspace(botId, path);
  const quarantine = join(dirname(path), `.clearing-${randomUUID()}`);
  // 先原子移走旧目录，再重建空目录；递归清理不跟随其中的符号链接。
  await rename(path, quarantine);
  try {
    await mkdir(path);
  } catch (error) {
    await rename(quarantine, path);
    throw error;
  }
  await rm(quarantine, { recursive: true, force: false });
}
