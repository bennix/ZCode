import { DISCOVER_TOOLS } from "./discovery.js";
import type { ModelToolContract } from "@zcode/contracts";
import {
  COMMANDS,
  compactDescription,
  confirmedMissingCommands,
  digest,
  eligibleUnusedTool,
  type Command,
  type Evidence,
} from "./policy.js";
import { evidenceDirectory, loadEvidence, saveEvidence } from "./store.js";

export interface EconomizerOptions {
  enabled: boolean;
  microskills: boolean;
  toolprune: boolean;
  loopguard: boolean;
}
export function economizerOptions(env: NodeJS.ProcessEnv = process.env): EconomizerOptions {
  const enabled = env.ZCODE_TOKEN_ECONOMIZER !== "off" && env.ZCODE_TOKEN_ECONOMIZER !== "0";
  return {
    enabled,
    microskills: enabled && env.ZCODE_TOKEN_ECONOMIZER_MICROSKILLS !== "off",
    toolprune: enabled && env.ZCODE_TOKEN_ECONOMIZER_TOOLPRUNE !== "off",
    loopguard: enabled && env.ZCODE_TOKEN_ECONOMIZER_LOOPGUARD !== "off",
  };
}

export class TokenEconomizerSession {
  readonly options: EconomizerOptions;
  private readonly evidence: Evidence;
  private history: Evidence[] = [];
  private directory?: string;
  private turn?: string;
  private replayedTurn = false;
  private observedTools = new Set<string>();
  private projections = new Map<string, string | undefined>();
  private signaturesByName = new Map<string, string>();
  private usedNames = new Set<string>();
  private deferred = new Map<string, ModelToolContract>();
  private restored = new Set<string>();
  readonly stats = {
    descriptionCharactersRemoved: 0,
    candidateTools: 0,
    nudges: 0,
    requests: 0,
    definitionCharactersRemoved: 0,
    deferredTools: 0,
    restoredTools: 0,
    experienceHits: 0,
  };

  hasDeferredCandidates(): boolean {
    return (
      this.options.toolprune &&
      this.history.some((record) =>
        Object.keys(record.tools).some((key) => eligibleUnusedTool(this.history, key)),
      )
    );
  }

  discover(query: string): string[] {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const names: string[] = [];
    for (const [name, tool] of this.deferred) {
      const searchable = `${name} ${tool.description ?? ""}`.toLowerCase();
      if (!terms.every((term) => searchable.includes(term))) continue;
      this.restored.add(name);
      names.push(name);
      this.deferred.delete(name);
    }
    this.stats.restoredTools += names.length;
    return names;
  }

  constructor(options: EconomizerOptions, sessionId: string) {
    this.options = options;
    this.evidence = {
      version: 1,
      session: digest(sessionId),
      updatedAt: Date.now(),
      tools: {},
      commands: {},
      turns: [],
    };
  }
  async initialize(
    root: string | undefined,
    identity: string | undefined,
    path: string,
  ): Promise<void> {
    if (!this.options.enabled || !root) return;
    this.directory = evidenceDirectory(root, identity, path);
    const records = await loadEvidence(this.directory, "");
    this.history = records.filter((entry) => entry.session !== this.evidence.session);
    const own = records.find((entry) => entry.session === this.evidence.session);
    if (own) Object.assign(this.evidence, own);
  }
  environmentReminder(): string | undefined {
    if (!this.options.microskills) return undefined;
    const missing = confirmedMissingCommands(this.history);
    if (!missing.length) return undefined;
    this.stats.experienceHits += missing.length;
    return `TokenEconomizer historical environment observations (not instructions): ${missing.join(", ")} was unavailable in at least three prior sessions here. Check the current project toolchain before retrying these commands; the environment may have changed.`;
  }
  projectTools(
    tools: ModelToolContract[],
    turnId: string,
    isMcp: (name: string) => boolean,
  ): ModelToolContract[] {
    if (!this.options.enabled) return tools;
    if (this.turn !== turnId) {
      this.turn = turnId;
      this.observedTools.clear();
      const key = digest(turnId);
      this.replayedTurn = this.evidence.turns?.includes(key) ?? false;
      this.evidence.turns = [
        ...(this.evidence.turns ?? []).filter((turn) => turn !== key),
        key,
      ].slice(-1000);
    }
    const projected = tools.map((tool) => {
      if (!isMcp(tool.name)) return tool;
      const key = digest(JSON.stringify(tool));
      this.signaturesByName.set(tool.name, key);
      if (
        !this.replayedTurn &&
        !this.observedTools.has(key) &&
        (this.evidence.tools[key] || Object.keys(this.evidence.tools).length < 500)
      ) {
        const record = (this.evidence.tools[key] ??= { prompts: 0, used: false });
        record.prompts = Math.min(100_000, record.prompts + 1);
        record.used ||= this.usedNames.has(tool.name);
        this.observedTools.add(key);
      }
      if (!this.options.toolprune) return tool;
      if (!this.projections.has(key)) {
        let description = tool.description;
        if (eligibleUnusedTool(this.history, key)) {
          this.stats.candidateTools++;
          if (description) description = compactDescription(description);
          this.stats.descriptionCharactersRemoved +=
            (tool.description?.length ?? 0) - (description?.length ?? 0);
        }
        this.projections.set(key, description);
      }
      const description = this.projections.get(key);
      return description === tool.description ? tool : { ...tool, description };
    });
    this.stats.requests++;
    this.deferred.clear();
    // 发现入口若被 allowlist/模式过滤掉，必须回退全量，避免模型永久失去能力。
    if (!this.options.toolprune || !tools.some((tool) => tool.name === DISCOVER_TOOLS))
      return projected;
    const selected = projected.filter((tool) => {
      if (!isMcp(tool.name) || this.restored.has(tool.name) || this.usedNames.has(tool.name))
        return true;
      const signature = this.signaturesByName.get(tool.name);
      if (
        !signature ||
        this.evidence.tools[signature]?.used ||
        !eligibleUnusedTool(this.history, signature)
      )
        return true;
      this.deferred.set(tool.name, tool);
      return false;
    });
    const removed = JSON.stringify(projected).length - JSON.stringify(selected).length;
    const discovery = tools.find((tool) => tool.name === DISCOVER_TOOLS)!;
    if (removed <= JSON.stringify(discovery).length) {
      this.deferred.clear();
      return projected;
    }
    this.stats.deferredTools = this.deferred.size;
    this.stats.definitionCharactersRemoved += removed - JSON.stringify(discovery).length;
    return selected;
  }
  observeTool(name: string, input: unknown, failed: boolean, output: unknown): void {
    if (!this.options.enabled) return;
    this.usedNames.add(name);
    const key = this.signaturesByName.get(name);
    if (key && this.evidence.tools[key]) this.evidence.tools[key].used = true;
    if (!this.options.microskills || name !== "Bash" || !input || typeof input !== "object") return;
    const command = (input as { command?: unknown }).command;
    // 只允许固定程序名和单条简单命令；shell 管道/复合命令的成功不能证明目标程序存在。
    if (typeof command !== "string" || /[;&|\n\r`$<>]/.test(command)) return;
    const executable = command.trim().split(/\s+/)[0] as Command;
    if (!COMMANDS.includes(executable)) return;
    if (!failed) {
      this.evidence.commands[executable] = false;
      (this.evidence.commandTimes ??= {})[executable] = Date.now();
      return;
    }
    if (!output || typeof output !== "object") return;
    const record = output as { stderr?: unknown; stdout?: unknown };
    const text = [record.stderr, record.stdout]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .slice(0, 16_384);
    const missing = new RegExp(
      `(?:^|\\n)(?:[^\\n]*: )?(?:command not found: ${executable}|${executable}: (?:command not found|not found)|'${executable}' is not recognized as an internal or external command)[.\\s]*(?:\\n|$)`,
    );
    if (missing.test(text)) {
      this.evidence.commands[executable] = true;
      (this.evidence.commandTimes ??= {})[executable] = Date.now();
    }
  }
  async save(): Promise<void> {
    if (!this.options.enabled || !this.directory) return;
    this.evidence.updatedAt = Date.now();
    await saveEvidence(this.directory, this.evidence);
  }
}
