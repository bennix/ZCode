import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import release from "./release.json" with { type: "json" };

const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const RELEASE_BASE = `https://github.com/iOfficeAI/OfficeCLI/releases/download/v${release.version}`;
const execFileAsync = promisify(execFile);

export function selectAsset(platform, arch, musl = false) {
  if (!["x64", "arm64"].includes(arch)) throw new Error(`Unsupported architecture: ${arch}`);
  const os = { darwin: "mac", win32: "win", linux: musl ? "linux-alpine" : "linux" }[platform];
  if (!os) throw new Error(`Unsupported platform: ${platform}`);
  return `officecli-${os}-${arch}${platform === "win32" ? ".exe" : ""}`;
}

export function verifyAssetBytes(asset, bytes) {
  const expected = release.assets[asset];
  if (!expected) throw new Error(`Unknown release asset: ${asset}`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`OfficeCLI checksum mismatch: ${asset}`);
}

export async function hasVerifiedCache(target, asset) {
  try {
    verifyAssetBytes(asset, await readFile(target));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    if (!String(error.message).startsWith("OfficeCLI checksum mismatch:")) throw error;
    await rm(target, { force: true });
    process.stderr.write(`[OfficeCLI] Removed an invalid cached binary (${asset}); downloading the pinned release again.\n`);
    return false;
  }
}

async function verifyPackagedMacSignature(binaryPath, asset) {
  const expectedTeam = release.packagedSignatureTeams?.[asset];
  if (!expectedTeam) return false;
  try {
    await execFileAsync("/usr/bin/codesign", ["--verify", "--strict", "--verbose=0", binaryPath]);
    const { stderr, stdout } = await execFileAsync("/usr/bin/codesign", ["-dv", "--verbose=4", binaryPath]);
    const team = `${stdout}\n${stderr}`.match(/TeamIdentifier=([A-Z0-9]+)/u)?.[1];
    return team === expectedTeam;
  } catch {
    return false;
  }
}

export async function ensureRuntime({ root, platform = process.platform, arch = process.arch, musl, signal } = {}) {
  const isMusl = musl ?? (platform === "linux" && !process.report.getReport().header.glibcVersionRuntime);
  const asset = selectAsset(platform, arch, isMusl);
  if (!root) {
    const bundled = join(dirname(fileURLToPath(import.meta.url)), "runtime", release.version, asset);
    try {
      // 生产包预置工具仍按锁定版本验哈希，损坏资产不能静默当作另一版本使用。
      const bytes = await readFile(bundled);
      try {
        verifyAssetBytes(asset, bytes);
      } catch (error) {
        // macOS codesign 会在 Mach-O 中嵌入签名并改变原始 SHA256；该分支仅接受通过严格签名校验、
        // 且签名 Team ID 与 ZenCode 发布证书一致的内置文件。用户缓存仍始终匹配上游 SHA256。
        if (platform !== "darwin" || !(await verifyPackagedMacSignature(bundled, asset))) throw error;
      }
      return bundled;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const target = join(root ?? join(homedir(), ".zcode", "tools", "officecli"), release.version, asset);
  if (await hasVerifiedCache(target, asset)) return target;
  process.stderr.write(`[OfficeCLI] Downloading ${release.version} (${asset}); subsequent runs use the local cache.\n`);
  const response = await fetch(`${RELEASE_BASE}/${asset}`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]) : AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new Error(`OfficeCLI download failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  let reported = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_DOWNLOAD_BYTES) throw new Error("OfficeCLI download exceeds size limit");
    chunks.push(chunk);
    if (size - reported > 16 * 1024 * 1024) {
      process.stderr.write(`[OfficeCLI] Downloaded ${Math.round(size / 1024 / 1024)} MiB\n`);
      reported = size;
    }
  }
  const bytes = Buffer.concat(chunks);
  verifyAssetBytes(asset, bytes);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o700 });
    if (platform !== "win32") await chmod(temporary, 0o700);
    try {
      await rename(temporary, target);
    } catch (error) {
      // Windows 不覆盖其他进程刚发布的文件；只有校验通过的并发赢家可以复用。
      try { verifyAssetBytes(asset, await readFile(target)); } catch { throw error; }
    }
  } finally {
    await rm(temporary, { force: true });
  }
  process.stderr.write(`[OfficeCLI] Verified and ready: ${release.version}\n`);
  return target;
}

async function main(args) {
  if (args.length === 0) {
    // upstream 裸调用会安装其他 agent 配置；ZenCode 无参数只显示帮助。
    args = ["--help"];
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const binary = await ensureRuntime({ signal: controller.signal });
    process.exitCode = await new Promise((resolve, reject) => {
      const child = spawn(binary, args, { stdio: "inherit", shell: false, signal: controller.signal });
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[OfficeCLI] ${error.message}\n`);
    process.exitCode = 1;
  });
}
