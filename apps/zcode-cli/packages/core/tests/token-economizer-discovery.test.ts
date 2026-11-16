import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TokenEconomizerSession, economizerOptions } from "../src/token-economizer/session.js";
import { discoveryEntry } from "../src/token-economizer/discovery.js";

const tool = {
  name: "mcp__fixture__network",
  description: "Inspect network timing. ".repeat(100),
  inputSchema: { type: "object" as const },
};
const entry = discoveryEntry(() => []);
const discovery = {
  name: entry.metadata.name,
  description: entry.metadata.description,
  inputSchema: entry.inputSchema,
};

test("unused MCP definitions are deferred, searchable and restored without mutating registry schemas", async () => {
  const root = await mkdtemp(join(tmpdir(), "economizer-discovery-"));
  try {
    for (let i = 0; i < 5; i++) {
      const session = new TokenEconomizerSession(economizerOptions({}), `prior-${i}`);
      await session.initialize(root, "workspace", root);
      session.projectTools([tool, discovery], `turn-${i}`, (name) => name === tool.name);
      await session.save();
    }
    const session = new TokenEconomizerSession(economizerOptions({}), "current");
    await session.initialize(root, "workspace", root);
    assert.deepEqual(
      session.projectTools([tool, discovery], "turn", (name) => name === tool.name),
      [discovery],
    );
    assert.deepEqual(session.discover("network timing"), [tool.name]);
    assert.deepEqual(
      session.projectTools([tool, discovery], "turn", (name) => name === tool.name),
      [tool, discovery],
    );
    assert.equal(session.stats.restoredTools, 1);
    assert.ok(session.stats.definitionCharactersRemoved > 0);
    assert.deepEqual(
      session.projectTools([discovery], "turn", () => true),
      [discovery],
      "restoration must not bypass current visibility",
    );
    const restricted = new TokenEconomizerSession(economizerOptions({}), "restricted");
    await restricted.initialize(root, "workspace", root);
    assert.deepEqual(
      restricted.projectTools([tool], "turn", () => true),
      [tool],
      "no discovery means no pruning",
    );
    assert.deepEqual(restricted.discover(""), []);
    const all = new TokenEconomizerSession(economizerOptions({}), "restore-all");
    await all.initialize(root, "workspace", root);
    all.projectTools([tool, discovery], "turn", (name) => name === tool.name);
    assert.deepEqual(all.discover(""), [tool.name]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
