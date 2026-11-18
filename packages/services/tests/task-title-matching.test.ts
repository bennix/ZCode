import assert from "node:assert/strict";
import { test } from "node:test";
import { matchTaskTitles } from "../src/bots/taskTitleMatching.js";
const entries = [
  { task: { taskId: "a", title: "7天 Python 速通计划 LaTeX 中文 PDF" } },
  { task: { taskId: "b", title: "Python 入门练习" } },
];
test("title switching tolerates copied spacing, case and partial title", () => {
  for (const query of ["天Python速通计划LaTeX中文PDF", "Python PDF", "７天Ｐｙｔｈｏｎ速通计划latex中文pdf", "a"]) {
    assert.deepEqual(matchTaskTitles(entries, query), [entries[0]]);
  }
});
test("ambiguous and unknown names never silently select the first task", () => {
  assert.equal(matchTaskTitles(entries, "Python").length, 2);
  assert.deepEqual(matchTaskTitles(entries, "missing"), []);
  assert.deepEqual(matchTaskTitles(entries, "  "), []);
  assert.equal(matchTaskTitles([entries[0]!, { task: { ...entries[0]!.task, taskId: "c" } }], entries[0]!.task.title).length, 2);
});
