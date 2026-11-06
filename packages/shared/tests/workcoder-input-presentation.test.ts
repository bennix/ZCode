import assert from "node:assert/strict";
import { test } from "node:test";
import { splitLegacyWorkCoderInput } from "../src/workcoder-input-presentation.js";
import { commandPayloadSchemas } from "../src/zcode-protocol-v4/command.js";
const instructions =
  'WorkCoder collaboration protocol v1\nYou own the main coding session.\nLaunch Agent(subagent_type="workcoder-research-0123456789abcdef")\nUse Agent(subagent_type="workcoder-advisor-0123456789abcdef")';

test("legacy and new WorkCoder messages expose only the task as the visible body", () => {
  assert.deepEqual(splitLegacyWorkCoderInput(`${instructions}\n\nUser task:\n中文 task`), {
    task: "中文 task",
    instructions,
  });
  assert.deepEqual(splitLegacyWorkCoderInput(`中文 task\n\n${instructions}`), {
    task: "中文 task",
    instructions,
  });
  assert.equal(splitLegacyWorkCoderInput("Ordinary task"), null);
  assert.equal(
    splitLegacyWorkCoderInput("WorkCoder collaboration protocol v1\nUser task: hello"),
    null,
  );
});

test("engine epilogue offsets are optional and validated against the actual text", () => {
  assert.equal(
    commandPayloadSchemas.sendText.safeParse({ text: "需求", epilogueStart: 2 }).success,
    true,
  );
  assert.equal(
    commandPayloadSchemas.sendText.safeParse({ text: "需求", epilogueStart: 3 }).success,
    false,
  );
  assert.equal(
    commandPayloadSchemas.sendText.safeParse({ text: "需求", epilogueStart: -1 }).success,
    false,
  );
  assert.equal(commandPayloadSchemas.sendText.safeParse({ text: "需求" }).success, true);
});
