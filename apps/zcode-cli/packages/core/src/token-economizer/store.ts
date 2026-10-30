import { mkdir, open, readdir, rename, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { COMMANDS, digest, type Evidence } from "./policy.js";

const MAX_BYTES = 160_000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export function evidenceDirectory(
  root: string,
  identity: string | undefined,
  path: string,
): string {
  return join(root, "token-economizer", digest(identity?.trim() || path));
}
function validEvidence(value: unknown, now: number): value is Evidence {
  if (!value || typeof value !== "object") return false;
  const item = value as Evidence;
  if (
    Object.keys(item).some(
      (key) =>
        !["version", "session", "updatedAt", "tools", "commands", "turns", "commandTimes"].includes(
          key,
        ),
    )
  )
    return false;
  if (
    item.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(item.session) ||
    !Number.isFinite(item.updatedAt) ||
    item.updatedAt > now + 60_000 ||
    item.updatedAt < now - MAX_AGE_MS ||
    !item.tools ||
    typeof item.tools !== "object" ||
    Array.isArray(item.tools) ||
    !item.commands ||
    typeof item.commands !== "object" ||
    Array.isArray(item.commands)
  )
    return false;
  if (
    item.turns !== undefined &&
    (!Array.isArray(item.turns) ||
      item.turns.length > 1000 ||
      !item.turns.every((turn) => typeof turn === "string" && /^[a-f0-9]{64}$/.test(turn)))
  )
    return false;
  if (
    item.commandTimes !== undefined &&
    (!item.commandTimes ||
      typeof item.commandTimes !== "object" ||
      Array.isArray(item.commandTimes) ||
      !Object.entries(item.commandTimes).every(
        ([key, time]) =>
          COMMANDS.includes(key as (typeof COMMANDS)[number]) &&
          typeof time === "number" &&
          Number.isFinite(time) &&
          time > 0 &&
          time <= now + 60_000,
      ))
  )
    return false;
  const tools = Object.entries(item.tools);
  return (
    tools.length <= 500 &&
    tools.every(
      ([key, record]) =>
        /^[a-f0-9]{64}$/.test(key) &&
        record &&
        Object.keys(record).every((key) => key === "prompts" || key === "used") &&
        Number.isSafeInteger(record.prompts) &&
        record.prompts > 0 &&
        record.prompts <= 100_000 &&
        typeof record.used === "boolean",
    ) &&
    Object.entries(item.commands).every(
      ([key, missing]) =>
        COMMANDS.includes(key as (typeof COMMANDS)[number]) && typeof missing === "boolean",
    )
  );
}
export async function loadEvidence(directory: string, ownSession: string): Promise<Evidence[]> {
  let names;
  try {
    names = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: Evidence[] = [];
  // 有界读取且跳过符号链接；同会话重启不把自己的历史计成独立确认。
  const candidates = await Promise.all(
    names
      .filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name))
      .map(async (entry) => {
        try {
          return { name: entry.name, modified: (await lstat(join(directory, entry.name))).mtimeMs };
        } catch {
          return { name: entry.name, modified: 0 };
        }
      }),
  );
  for (const name of candidates.sort((a, b) => b.modified - a.modified).slice(0, 100)) {
    const file = await open(join(directory, name.name), "r");
    try {
      if ((await file.stat()).size > MAX_BYTES) continue;
      let parsed: unknown;
      try {
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_BYTES) continue;
        parsed = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
      } catch {
        continue;
      }
      if (
        validEvidence(parsed, Date.now()) &&
        parsed.session !== ownSession &&
        name.name === `${parsed.session}.json`
      )
        records.push(parsed);
    } finally {
      await file.close();
    }
  }
  return records.sort((a, b) => a.updatedAt - b.updatedAt);
}
export async function saveEvidence(directory: string, evidence: Evidence): Promise<void> {
  if (!validEvidence(evidence, Date.now())) throw new Error("Invalid TokenEconomizer summary");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = join(directory, `${evidence.session}.${randomUUID()}.tmp`);
  try {
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(evidence));
    } finally {
      await file.close();
    }
    await rename(temp, join(directory, `${evidence.session}.json`));
  } finally {
    await rm(temp, { force: true });
  }
}
