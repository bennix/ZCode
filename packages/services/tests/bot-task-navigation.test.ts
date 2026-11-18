import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBotCommand } from "../src/bots/commandParser.js";

test("task navigation aliases avoid model requests", () => {
  for (const text of ["/任务", "/tasks", "有哪些任务", "当前有哪些任务？"]) {
    assert.deepEqual(parseBotCommand(text), { type: "task.list" });
  }
  for (const text of ["/进度", "/progress", "当前任务进度", "任务进展到哪里了？"]) {
    assert.deepEqual(parseBotCommand(text), { type: "status" });
  }
  assert.deepEqual(parseBotCommand("/切换任务 task-1"), { type: "task.set", value: "task-1" });
  assert.deepEqual(parseBotCommand("分析当前有哪些任务需要重构"), { type: "message", text: "分析当前有哪些任务需要重构" });
});
