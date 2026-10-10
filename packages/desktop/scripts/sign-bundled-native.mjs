import { execFile } from "node:child_process";
import { open, opendir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MACH_O_MAGICS = new Set([
  0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xcafebabf, 0xbebafeca, 0xbfbafeca,
]);

async function hasMachOMagic(path) {
  const handle = await open(path, "r");
  try {
    const header = Buffer.allocUnsafe(4);
    const { bytesRead } = await handle.read(header, 0, 4, 0);
    return bytesRead === 4 && MACH_O_MAGICS.has(header.readUInt32BE(0));
  } finally {
    await handle.close();
  }
}

export async function findMachOFiles(root) {
  const found = [];
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop();
    for await (const entry of await opendir(directory)) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(path);
      else if (
        entry.isFile() &&
        (extname(entry.name) === "" || [".node", ".dylib"].includes(extname(entry.name)))
      ) {
        if (await hasMachOMagic(path)) found.push(path);
      }
    }
  }
  return found.sort();
}

export async function signBundledNativeFiles(root, identity) {
  const entitlements = resolve(import.meta.dirname, "../build/entitlements.mac.inherit.plist");
  const files = await findMachOFiles(root);
  for (const file of files) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await execFileAsync(
          "codesign",
          [
            "--sign",
            identity,
            "--force",
            "--timestamp",
            "--options",
            "runtime",
            "--entitlements",
            entitlements,
            file,
          ],
          { timeout: 120_000 },
        );
        break;
      } catch (error) {
        // Apple 的时间戳服务偶发不可用；仅对该网络错误有限重试，其他签名错误立即阻止出包。
        if (
          attempt === 3 ||
          !String(error.stderr ?? "").includes("The timestamp service is not available")
        )
          throw error;
        await setTimeout(attempt * 2_000);
      }
    }
  }
  return files.length;
}
