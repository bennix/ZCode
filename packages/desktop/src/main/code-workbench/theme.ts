import { readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const themeName = { light: "ZenCode Light", dark: "ZenCode Dark" } as const;

export async function updateWorkbenchTheme(path: string, theme: "light" | "dark"): Promise<void> {
  const original = await readFile(path, "utf8");
  const themeLine = /^(\s*"workbench\.colorTheme"\s*:\s*)"(?:[^"\\]|\\.)*"/m;
  let updated: string;
  if (themeLine.test(original)) {
    updated = original.replace(themeLine, `$1${JSON.stringify(themeName[theme])}`);
  } else {
    const start = original.indexOf("{");
    const end = original.lastIndexOf("}");
    if (start < 0 || end <= start || original.slice(0, start).trim() || original.slice(end + 1).trim()) throw new Error("Invalid IDE settings file");
    const body = original.slice(start + 1, end);
    const hasSettings = /"[^"\n]+"\s*:/.test(body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""));
    updated = `${original.slice(0, start + 1)}\n  "workbench.colorTheme": ${JSON.stringify(themeName[theme])}${hasSettings ? "," : ""}${original.slice(start + 1)}`;
  }
  if (updated === original) return;
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, updated, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await import("node:fs/promises").then((fs) => fs.rm(temporary, { force: true }));
    throw error;
  }
}
