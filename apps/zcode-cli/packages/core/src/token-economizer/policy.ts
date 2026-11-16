import { createHash } from "node:crypto";

export const COMMANDS = [
  "node",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "python",
  "python3",
  "pytest",
  "git",
  "cargo",
  "go",
  "make",
] as const;
export type Command = (typeof COMMANDS)[number];
export interface Evidence {
  version: 1;
  session: string;
  updatedAt: number;
  turns?: string[];
  commandTimes?: Partial<Record<Command, number>>;
  tools: Record<string, { prompts: number; used: boolean }>;
  commands: Partial<Record<Command, boolean>>;
}
export const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

function uniqueSessions(evidence: Evidence[]): Evidence[] {
  return [...new Map(evidence.map((entry) => [entry.session, entry])).values()];
}

export function confirmedMissingCommands(evidence: Evidence[]): Command[] {
  const sessions = uniqueSessions(evidence);
  return COMMANDS.filter((command) => {
    const lastSuccess = Math.max(
      -1,
      ...sessions
        .filter((session) => session.commands[command] === false)
        .map((session) => session.commandTimes?.[command] ?? session.updatedAt),
    );
    return (
      sessions.filter(
        (session) =>
          session.commands[command] === true &&
          (session.commandTimes?.[command] ?? session.updatedAt) > lastSuccess &&
          (session.commandTimes?.[command] ?? session.updatedAt) >=
            Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).length >= 3
    );
  });
}

export function eligibleUnusedTool(evidence: Evidence[], signature: string): boolean {
  const observations = uniqueSessions(evidence).flatMap((entry) =>
    entry.tools[signature] ? [entry.tools[signature]] : [],
  );
  if (observations.some((entry) => entry.used)) return false;
  return (
    observations.length >= 5 ||
    (observations.length >= 2 && observations.reduce((sum, entry) => sum + entry.prompts, 0) >= 10)
  );
}

export function compactDescription(description: string): string {
  // 代码示例中的重复可能有执行语义；只对普通描述的完全重复段落去重，不删权限或参数规则。
  if (
    description.includes("```") ||
    description.includes("~~~") ||
    /^\s{4}\S/m.test(description) ||
    /^\s*(?:[-*+] |\d+[.)] )/m.test(description)
  )
    return description;
  const paragraphs = description.split(/\n\s*\n/);
  const seen = new Set<string>();
  const kept = paragraphs.filter((paragraph) => {
    if (seen.has(paragraph)) return false;
    seen.add(paragraph);
    return true;
  });
  return kept.length === paragraphs.length ? description : kept.join("\n\n");
}

export interface FailureState {
  total: number;
  failures: string[];
  nudged: boolean;
  operations?: Map<string, { signature: string; count: number }>;
}

/** 对象键顺序不影响操作身份；不丢弃参数，避免合并不同的合理探索。 */
export function operationSignature(name: string, input: unknown): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, stable(item)]),
      );
    return value;
  };
  return digest(`${name}:${JSON.stringify(stable(input))}`);
}

export function observeFailure(
  state: FailureState,
  failed: boolean,
  signature: string,
  operation = "default",
): boolean {
  state.total++;
  const operations = (state.operations ??= new Map());
  if (!failed) {
    operations.delete(operation);
    return false;
  }
  state.failures.push(signature);
  state.failures = state.failures.slice(-12);
  const previous = operations.get(operation);
  const count = previous?.signature === signature ? previous.count + 1 : 1;
  operations.delete(operation);
  operations.set(operation, { signature, count });
  if (operations.size > 128) operations.delete(operations.keys().next().value!);
  if (state.nudged || count < 3) return false;
  state.nudged = true;
  return true;
}
