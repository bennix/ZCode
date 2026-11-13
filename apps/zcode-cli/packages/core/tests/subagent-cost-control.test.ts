import { resolveRuntimeCompactConfig } from "../src/compact/policy.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolCallId } from "@zcode/contracts";
import { resolveSubagentCompactConfig } from "../src/subagent/context-budget.js";
import { getAutoCompactThreshold, shouldAutoCompact } from "../src/compact/policy.js";
import { estimateMessageTokens } from "../src/compact/manual.js";
import {
  buildDefaultMicrocompactThreshold,
  maybeLocalMicrocompactMessages,
  MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE,
  type LocalMicrocompactMessage,
} from "../src/compact/microcompact.js";
import { resolveSubagentSelection } from "../src/runtime/helpers/subagent-selection.js";

test("child context maintenance uses 96K instead of the parent's million-token capacity", () => {
  const config = resolveSubagentCompactConfig(undefined, 1_000_000);
  assert.equal(config.contextWindow, 96_000);
  assert.equal(config.microcompact?.enabled, true);
  assert.equal(config.microcompact?.keepRecentToolResults, 3);
  assert.equal(resolveSubagentCompactConfig(undefined, 64_000).contextWindow, 64_000);
  assert.equal(resolveSubagentCompactConfig(undefined, undefined).contextWindow, 96_000);
});

test("explicit context policies survive without mutating the parent configuration", () => {
  const parent = Object.freeze({
    enabled: false,
    contextWindow: 128_000,
    microcompact: Object.freeze({ enabled: false, keepRecentToolResults: 6 }),
  });
  const child = resolveSubagentCompactConfig(parent, 100_000);
  assert.equal(child.contextWindow, 100_000);
  assert.equal(child.enabled, false);
  assert.equal(child.microcompact?.enabled, false);
  assert.equal(child.microcompact?.keepRecentToolResults, 6);
  assert.equal(parent.contextWindow, 128_000);
});

test("large tool history is reduced while the task and three recent results remain available", () => {
  const messages: LocalMicrocompactMessage[] = [
    { role: "system", content: "Use the configured tools and preserve the task scope." },
    { role: "user", content: "Find the initialization path and report file locations." },
  ];
  for (let index = 0; index < 8; index++) {
    const id = createToolCallId();
    messages.push({
      role: "assistant",
      content: `Inspect module ${index}`,
      toolCalls: [{ id, name: "Read", input: { file_path: `module-${index}.ts` } }],
    });
    messages.push({ role: "tool", toolCallId: id, toolName: "Read", content: `module-${index} ` + "x".repeat(40_000) });
  }
  const config = { ...resolveSubagentCompactConfig(undefined, 1_000_000), maxOutputTokens: 8192 };
  const threshold = getAutoCompactThreshold(config);
  const before = estimateMessageTokens(messages);
  const result = maybeLocalMicrocompactMessages({
    messages,
    config: { ...config.microcompact, thresholdTokens: buildDefaultMicrocompactThreshold(threshold) },
  });
  assert.equal(result.decision.reason, "applied");
  assert.ok(estimateMessageTokens(result.messages) < before / 2);
  assert.deepEqual(
    result.messages.slice(0, 2).map(({ role, content }) => ({ role, content })),
    messages.slice(0, 2),
  );
  const results = result.messages.filter((message) => message.role === "tool");
  assert.equal(results[0]?.content, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE);
  const expectedRecent = messages.filter((message) => message.role === "tool").slice(-3);
  for (let index = 0; index < 3; index++) {
    assert.ok(results.slice(-3)[index]?.content === expectedRecent[index]?.content);
    assert.equal(results.slice(-3)[index]?.toolCallId, expectedRecent[index]?.toolCallId);
  }
  assert.deepEqual(
    result.messages.filter((message) => message.role === "assistant"),
    messages.filter((message) => message.role === "assistant"),
  );
  assert.ok(String(messages[3]?.content).length > 40_000);
  assert.equal(shouldAutoCompact({ messages: result.messages, config, consecutiveFailures: 0 }).shouldCompact, false);
});

test("configured child role selection takes precedence over the parent's Opus model", () => {
  const parent = { providerId: "zenmux", modelId: "anthropic/claude-opus-5.5" };
  const child = { providerId: "zenmux", modelId: "anthropic/claude-sonnet-5.5", options: { reasoningLevel: "none" } };
  const result = resolveSubagentSelection({ parentSelection: parent, profileSelection: child });
  assert.equal(result.hasConcreteModel, true);
  assert.deepEqual(result.selection, child);
  assert.equal(parent.modelId, "anthropic/claude-opus-5.5");
});

test("all runtime requests apply bounded history maintenance and preserve explicit settings", () => {
  const main = resolveRuntimeCompactConfig(undefined, 1_000_000);
  assert.equal(main.contextWindow, 128_000);
  assert.equal(main.microcompact?.enabled, true);
  assert.equal(main.microcompact?.keepRecentToolResults, 5);
  assert.equal(resolveRuntimeCompactConfig(undefined, 64_000).contextWindow, 64_000);
  assert.equal(resolveRuntimeCompactConfig({ contextWindow: 200_000 }, 1_000_000).contextWindow, 200_000);
  const disabled = resolveRuntimeCompactConfig({ enabled: false, microcompact: { enabled: false } }, 1_000_000);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.microcompact?.enabled, false);
  const child = resolveRuntimeCompactConfig(resolveSubagentCompactConfig(undefined, 1_000_000), 1_000_000);
  assert.equal(child.contextWindow, 96_000);
  assert.equal(child.microcompact?.keepRecentToolResults, 3);
});
