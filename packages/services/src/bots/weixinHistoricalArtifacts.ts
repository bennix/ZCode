import { randomBytes } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { ZCodeSessionFile } from "@zcode/shared";
import { readWeixinShareFile } from "./weixinFileDelivery.js";

const extension = /\.(?:pdf|docx|pptx|xlsx|png|jpe?g|webp|svg|mp4|mp3|wav|zip|html|md|csv|txt)$/iu;
const maxBytes = 20 * 1024 * 1024;
export type HistoricalArtifact = { path: string; root: string; size: number; modified: number };
export function parseArtifactRetrieval(text: string): string | null {
  const trimmed = text.trim();
  if (/^(?:取回\s*(?:以前任务的)?产物|取回文件)[。！!？?]?$/u.test(trimmed)) return "";
  const command = /^\/(?:产物|取回产物|artifacts)(?:\s+(.*))?$/iu.exec(trimmed);
  return command ? command[1]?.trim() ?? "" : null;
}
export function parseArtifactRegeneration(text: string): string | null {
  const match = /^\/?重新生成产物(?:[\s：:]+(.*))?$/su.exec(text.trim());
  return match ? match[1]?.trim() || "按原任务要求重新生成产物" : null;
}
const within = (root: string, path: string) => {
  const rel = relative(root, path);
  return !!rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
function pathsFromText(text: string): string[] {
  const paths: string[] = [];
  // 链接/引用支持中文空格；裸路径只读到分隔符，绝不执行历史命令。
  for (const match of text.matchAll(/\]\(<?([^\n)]+?)>?\)|["'`]([^"'`\n]+)["'`]|((?:\/|[A-Za-z]:[\\/])[^\s<>"'`()[\]]+)/gu)) {
    let value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (value.startsWith("file://")) { try { value = decodeURIComponent(new URL(value).pathname); } catch { continue; } }
    if (extension.test(value) && !/^https?:/iu.test(value)) paths.push(value);
  }
  return paths;
}
export async function findHistoricalArtifacts(
  snapshot: ZCodeSessionFile,
  workspacePath: string,
  pendingPath?: string,
): Promise<HistoricalArtifact[]> {
  const roots = await Promise.all([workspacePath, tmpdir(), ...(process.platform === "win32" ? [] : ["/tmp"])].map((p) => realpath(p).catch(() => null)));
  const referenced: string[] = pendingPath ? [pendingPath] : [];
  for (const message of [...snapshot.messages].reverse()) {
    if (message.role !== "assistant") continue;
    referenced.push(...pathsFromText(message.content ?? ""));
    for (const tool of message.tools ?? []) {
      if (tool.status !== "completed") continue;
      for (const data of [tool.input, tool.output]) {
        const strings = (value: unknown, depth = 0): string[] => {
          if (typeof value === "string") return [value];
          if (!value || typeof value !== "object" || depth > 5) return [];
          return Object.values(value).slice(0, 100).flatMap((item) => strings(item, depth + 1));
        };
        for (const text of strings(data)) {
          if (extension.test(text) && !text.includes("\n")) referenced.push(text);
          referenced.push(...pathsFromText(text));
        }
      }
    }
  }
  const results = new Map<string, HistoricalArtifact>();
  for (const path of [...new Set(referenced)].slice(0, 100)) {
    if (!extension.test(path)) continue;
    try {
      const full = await realpath(resolve(workspacePath, path));
      // 历史引用不授予访问隐藏凭据的权限；只允许专用产物目录这一隐藏路径。
      const root = roots.find((item) => item && within(item, full));
      if (!root) continue;
      const visible = relative(root, full).replace(/^\.zencode[\\/]weixin-output[\\/]/u, "");
      if (visible.split(/[\\/]/u).some((part) => part.startsWith(".") || /^(?:credentials|secrets)$/iu.test(part))) continue;
      const info = await stat(full);
      if (!info.isFile() || !info.size || info.size > maxBytes) continue;
      results.set(full, { path: full, root, size: info.size, modified: info.mtimeMs });
    } catch { /* 历史临时文件已清理时跳过，不把路径文本冒充文件。 */ }
  }
  return [...results.values()];
}

export function createHistoricalArtifactMenu() {
  const menus = new Map<string, { scope: string; token: string; expires: number; files: HistoricalArtifact[] }>();
  return {
    list(actor: string, scope: string, files: HistoricalArtifact[]) {
      for (const [key, menu] of menus) if (menu.expires < Date.now()) menus.delete(key);
      if (!files.length) { menus.delete(actor); return "未找到可回传的已有产物。请确认已切换到目标任务；历史临时文件可能已清理，或记录中没有文件路径。本次没有继续执行或重新生成。"; }
      const token = randomBytes(4).toString("hex");
      menus.set(actor, { scope, token, expires: Date.now() + 300_000, files });
      return "当前任务记录中的可取回文件（请核对名称和目录）：\n" + files.map((file, index) => `${index + 1}. ${basename(file.path)} · ${Math.ceil(file.size / 1024)} KB\n${file.path}`).join("\n") + `\n发送 /取回产物 ${token} 1 取回第 1 项；有效期 5 分钟。`;
    },
    async take(actor: string, scope: string, choice: string) {
      const menu = menus.get(actor);
      const [token, index, extra] = choice.split(/\s+/u);
      if (!menu || menu.scope !== scope || menu.expires < Date.now() || token !== menu.token || extra || !/^[1-9]\d*$/u.test(index ?? "")) throw new Error("文件选择已失效或格式不正确，请重新发送 /产物。");
      const selected = menu.files[Number(index) - 1];
      if (!selected) throw new Error("文件编号不存在，请按菜单选择。");
      const canonical = await realpath(selected.path);
      const info = await stat(canonical);
      if (canonical !== selected.path || info.size !== selected.size || info.mtimeMs !== selected.modified) throw new Error("文件已发生变化，请重新发送 /产物 确认已有版本，或用 /重新生成产物 加修改要求生成新版。");
      const file = await readWeixinShareFile(selected.root, selected.path);
      const after = await stat(canonical);
      if (after.mtimeMs !== selected.modified || file.bytes.length !== selected.size) throw new Error("读取时文件发生变化，请重新查询产物。");
      return file;
    },
    complete(actor: string) { menus.delete(actor); },
  };
}
