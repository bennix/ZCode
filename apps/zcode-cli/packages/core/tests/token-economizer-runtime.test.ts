import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime } from "../src/runtime/agent-runtime.js";
import { zencodeMarkProgressToolEntry } from "../src/tool/handlers/zencode-progress.js";
import { TokenEconomizerSession, economizerOptions } from "../src/token-economizer/session.js";
import { digest } from "../src/token-economizer/policy.js";
import { evidenceDirectory, loadEvidence } from "../src/token-economizer/store.js";
import type { ModelToolContract } from "@zcode/contracts";

const name = "mcp__economizer_fixture__read";
const paragraph = "Read a fixture item without changing files. Preserve permissions.";
const description = `${paragraph}\n\n${paragraph}\n\nAsk before sharing data externally.`;
function fixture(root: string, id: string, failures = 0) {
  const requests: Array<{ messages: unknown[]; tools: ModelToolContract[] }> = [];
  const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];
  const model = {
    providerId: "fixture",
    modelId: "fixture",
    displayName: "fixture",
    properties: {
      contextWindow: 128_000,
      inputFormat: { supportsImage: false, supportsPdf: false, supportsVideo: false },
    },
    optionSpecs: { maxOutputTokens: { max: 4096 }, reasoningLevel: { values: [] } },
    options: {},
    bind() {
      return this;
    },
    async generateText(request: { messages: unknown[]; tools: ModelToolContract[] }) {
      requests.push(request);
      return {
        text: requests.length <= failures ? "" : "done",
        finishReason: requests.length <= failures ? "tool_calls" : "stop",
        usage: { inputTokens: 10, outputTokens: 5 },
        toolCalls:
          requests.length <= failures
            ? [{ id: `call-${requests.length}`, name, input: { attempt: requests.length } }]
            : [],
      };
    },
  };
  const runtime = new AgentRuntime(
    id as never,
    {
      modelSelection: { providerId: "fixture", modelId: "fixture" },
      modelStreaming: "off",
      maxTurns: 30,
      toolAllowlist: [],
      workingDirectory: root,
      memory: { cliStorageRoot: root, enabled: false },
    },
    {
      eventStore: {
        append: async (event: (typeof events)[number]) => {
          events.push(event);
          return { ...event, sequenceNumber: events.length };
        },
        getEvents: async () => events,
        getEventsAfter: async () => [],
        getLatestSequenceNumber: async () => events.length,
        deleteSession: async () => {},
      } as never,
      modelFactory: () => model as never,
    },
  );
  runtime.getToolRegistry().register({
    ...zencodeMarkProgressToolEntry,
    metadata: {
      ...zencodeMarkProgressToolEntry.metadata,
      name,
      description,
      mcpPresentation: { serverName: "fixture", toolName: "read" },
    },
    inputSchema: { type: "object", properties: { attempt: { type: "number" } } },
    outputSchema: undefined,
    runtimeInputSchema: undefined,
    runtimeOutputSchema: undefined,
    handler: async () => {
      throw new Error("same verification failure");
    },
  });
  return { runtime, requests, events };
}

test("real AgentRuntime sends compacted MCP descriptors after evidence; registry and schema remain intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "economizer-runtime-"));
  try {
    for (let i = 0; i < 5; i++) await fixture(root, `prior-${i}`).runtime.executeTurn("inspect");
    const current = fixture(root, "current");
    await current.runtime.executeTurn("inspect");
    const tool = current.requests[0].tools.find((item) => item.name === name)!;
    assert.equal(tool.description, `${paragraph}\n\nAsk before sharing data externally.`);
    assert.deepEqual(
      tool.inputSchema,
      current.runtime.getTools().find((item) => item.name === name)!.inputSchema,
    );
    assert.equal(current.runtime.getToolRegistry().get(name)!.metadata.description, description);
    assert.equal((await loadEvidence(evidenceDirectory(root, undefined, root), "")).length, 6);
    assert.equal(current.requests.length, 1, "economizer must not add model calls");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real tool failures produce one model-visible nudge and the normal replayable warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "economizer-loop-"));
  try {
    const current = fixture(root, "loop", 21);
    const result = await current.runtime.executeTurn("try the fixture tool");
    assert.equal(result.response, "done");
    assert.match(
      JSON.stringify(current.requests.at(-1)?.messages),
      /TokenEconomizer: repeated identical failures/,
    );
    assert.equal(
      current.events.filter(
        (event) => event.type === "model_anomaly_warning" && event.payload?.threshold === 6,
      ).length,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("environment facts survive sessions, never echo outputs, and success withdraws them", async () => {
  const root = await mkdtemp(join(tmpdir(), "economizer-facts-"));
  try {
    for (let i = 0; i < 3; i++) {
      const session = new TokenEconomizerSession(economizerOptions({}), `facts-${i}`);
      await session.initialize(root, "remote", "/workspace");
      session.observeTool("Bash", { command: "pnpm test" }, true, {
        stderr: "zsh: command not found: pnpm\nsecret-untrusted-text",
      });
      await session.save();
    }
    const session = new TokenEconomizerSession(economizerOptions({}), "next");
    await session.initialize(root, "remote", "/workspace");
    assert.match(session.environmentReminder()!, /pnpm was unavailable/);
    assert.doesNotMatch(session.environmentReminder()!, /secret/);
    session.observeTool("Bash", { command: "pnpm test" }, false, {});
    await session.save();
    const later = new TokenEconomizerSession(economizerOptions({}), "later");
    await later.initialize(root, "remote", "/workspace");
    assert.equal(later.environmentReminder(), undefined);
    assert.ok(
      (await loadEvidence(evidenceDirectory(root, "remote", "/workspace"), "")).some(
        (entry) => entry.session === digest("next"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("disabled feature performs no evidence IO and keeps original descriptors", async () => {
  const root = await mkdtemp(join(tmpdir(), "economizer-disabled-"));
  try {
    const session = new TokenEconomizerSession(
      economizerOptions({ ZCODE_TOKEN_ECONOMIZER: "off" }),
      "off",
    );
    await session.initialize(root, undefined, root);
    const tools = [{ name, description, inputSchema: {} }];
    assert.equal(
      session.projectTools(tools, "turn", () => true),
      tools,
    );
    assert.equal(session.environmentReminder(), undefined);
    await session.save();
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cold resume preserves used-tool evidence without counting a replayed turn twice", async () => {
  const root = await mkdtemp(join(tmpdir(), "economizer-resume-"));
  try {
    const tools = [{ name, description, inputSchema: {} }];
    const first = new TokenEconomizerSession(economizerOptions({}), "same-session");
    await first.initialize(root, undefined, root);
    first.projectTools(tools, "same-turn", () => true);
    first.observeTool(name, {}, false, {});
    await first.save();
    const resumed = new TokenEconomizerSession(economizerOptions({}), "same-session");
    await resumed.initialize(root, undefined, root);
    resumed.projectTools(tools, "same-turn", () => true);
    await resumed.save();
    const [saved] = await loadEvidence(evidenceDirectory(root, undefined, root), "");
    assert.deepEqual(Object.values(saved.tools), [{ prompts: 1, used: true }]);
    assert.equal(resumed.environmentReminder(), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("each mechanism can be disabled independently", async () => {
  const options = economizerOptions({
    ZCODE_TOKEN_ECONOMIZER_MICROSKILLS: "off",
    ZCODE_TOKEN_ECONOMIZER_TOOLPRUNE: "off",
    ZCODE_TOKEN_ECONOMIZER_LOOPGUARD: "off",
  });
  assert.deepEqual(options, {
    enabled: true,
    microskills: false,
    toolprune: false,
    loopguard: false,
  });
  const session = new TokenEconomizerSession(options, "flags");
  assert.equal(session.environmentReminder(), undefined);
  const tool = { name, description, inputSchema: { type: "object" as const } };
  assert.equal(session.projectTools([tool], "turn", () => true)[0], tool);
});
