import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const SAFE_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoRead",
  "TaskOutput",
  "TaskStop",
  "AskUserQuestion",
  "zencode_mark_progress",
  "zencode_present_plan",
]);

interface Selection {
  turnId: string;
  selectedPaths: ReadonlySet<string>;
}

function normalizedPath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function workspaceRelativePath(workspaceRoot: string, filePath: string): string | null {
  const suffix = relative(workspaceRoot, filePath);
  if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) return null;
  return normalizedPath(suffix.split(sep).join("/"));
}

async function resolveExistingPathPrefix(path: string): Promise<string> {
  let candidate = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try {
      const resolvedPrefix = await realpath(candidate);
      return resolve(resolvedPrefix, ...suffix.reverse());
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) ||
        !["ENOENT", "ENOTDIR"].includes(String(error.code))) throw error;
      const parent = resolve(candidate, "..");
      if (parent === candidate) throw error;
      suffix.push(candidate.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
      candidate = parent;
    }
  }
}

/** 每个 ToolExecutor 一份；只约束确认文件计划所在的可信 turn。 */
export class TurnFileSelectionGuard {
  private selection: Selection | null = null;

  constructor(
    private readonly workspaceRoot: () => string,
    private readonly canActivate: boolean,
  ) {}

  async activate(turnId: string | undefined, selectedPaths: readonly string[]): Promise<void> {
    if (!this.canActivate) throw new Error("File selection cannot run with workspace hooks enabled");
    if (!turnId) throw new Error("File selection requires an active turn ID");
    if (selectedPaths.length === 0) throw new Error("File selection cannot be empty");
    const root = await realpath(this.workspaceRoot());
    const normalized = await Promise.all(selectedPaths.map(async (path) => {
      if (!path || isAbsolute(path)) throw new Error("File selection path must be relative");
      const canonicalPath = await resolveExistingPathPrefix(resolve(root, path));
      const relativePath = workspaceRelativePath(root, canonicalPath);
      if (!relativePath) throw new Error("File selection path is outside the workspace");
      return relativePath;
    }));
    if (new Set(normalized).size !== normalized.length) throw new Error("Duplicate file selection path");
    this.selection = { turnId, selectedPaths: new Set(normalized) };
  }

  async violation(params: {
    turnId: string | undefined;
    toolName: string;
    input: unknown;
    workingDirectory: string;
  }): Promise<string | null> {
    const selection = this.selection;
    if (!selection || selection.turnId !== params.turnId) return null;
    if (SAFE_TOOLS.has(params.toolName)) return null;
    if (params.toolName !== "Write" && params.toolName !== "Edit") {
      return `File selection is active; ${params.toolName} cannot prove it writes only selected files`;
    }
    const input = params.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return "File selection requires a file_path";
    }
    const filePath = (input as Record<string, unknown>).file_path;
    if (typeof filePath !== "string" || !filePath) return "File selection requires a file_path";
    const root = await realpath(this.workspaceRoot());
    const absolutePath = isAbsolute(filePath)
      ? resolve(filePath)
      : resolve(params.workingDirectory, filePath);
    let canonicalPath: string;
    try {
      canonicalPath = await resolveExistingPathPrefix(absolutePath);
    } catch {
      return "Unable to verify the selected file path";
    }
    const relativePath = workspaceRelativePath(root, canonicalPath);
    if (!relativePath || !selection.selectedPaths.has(relativePath)) {
      return "File is outside the confirmed selection";
    }
    return null;
  }
}
