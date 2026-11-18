import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, realpath, writeFile, readFile, readdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWeixinTaskGuide } from "../src/bots/weixinTaskGuide.js";
import {
  ensureWeixinWorkspace,
  getWeixinWorkspacePath,
  clearWeixinWorkspace,
} from "../src/bots/weixinWorkspace.js";
import { setDataBaseDir } from "../src/paths.js";

test("goal requires objective, criteria and current actor/scope confirmation; replay cannot launch", () => {
  const guide = createWeixinTaskGuide();
  assert.equal(guide.handle("a", "draft", "/goal")?.kind, "reply");
  guide.handle("a", "draft", "完成报告");
  const prompt = guide.handle("a", "draft", "PDF 回传");
  assert.equal(prompt?.kind, "reply");
  const token = (prompt as { text: string }).text.match(/确认启动 ([a-f0-9]+)/u)![1];
  assert.equal(guide.handle("b", "draft", `确认启动 ${token}`)?.kind, "reply");
  const result = guide.handle("a", "draft", `确认启动 ${token}`);
  assert.deepEqual(result, {
    kind: "goal",
    action: "set",
    objective: "完成报告\n\n验收标准与交付要求：PDF 回传",
  });
  assert.equal(guide.handle("a", "draft", `确认启动 ${token}`)?.kind, "reply");
});
test("clear requires exact current confirmation; scope change and expiration invalidate it", () => {
  let time = 0;
  const guide = createWeixinTaskGuide(() => time);
  const start = guide.handle("a", "one", "/clean") as { text: string };
  const token = start.text.match(/确认清空 ([a-f0-9]+)/u)![1];
  assert.equal(guide.handle("a", "one", "是")?.kind, "reply");
  assert.equal(guide.handle("a", "two", `确认清空 ${token}`)?.kind, "reply");
  const next = guide.handle("a", "two", "/clean") as { text: string };
  time = 300_001;
  assert.equal(
    guide.handle("a", "two", `确认清空 ${next.text.match(/确认清空 ([a-f0-9]+)/u)![1]}`)?.kind,
    "reply",
  );
  for (const action of ["show", "pause", "resume", "clear"])
    assert.deepEqual(guide.handle("a", "two", `/goal ${action}`), { kind: "goal", action });
});
test("dedicated directories are isolated; clearing cannot follow links or delete another project", async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "wx-workspace-")));
  setDataBaseDir(base);
  try {
    const first = await ensureWeixinWorkspace("a");
    const second = await ensureWeixinWorkspace("b");
    assert.notEqual(first, second);
    assert.equal(first, getWeixinWorkspacePath("a"));
    await writeFile(join(second, "keep.txt"), "keep");
    await writeFile(join(first, "delete.txt"), "delete");
    await symlink(second, join(first, "link"));
    await assert.rejects(clearWeixinWorkspace("a", second));
    await clearWeixinWorkspace("a", first);
    assert.deepEqual(await readdir(first), []);
    assert.equal(await readFile(join(second, "keep.txt"), "utf8"), "keep");
    await rm(first, { recursive: true });
    await symlink(second, first);
    await assert.rejects(clearWeixinWorkspace("a", first));
  } finally {
    setDataBaseDir(null);
    await rm(base, { recursive: true, force: true });
  }
});

test("Yolo is explicit at goal confirmation; defaults remain interactive", () => {
  const guide = createWeixinTaskGuide();
  guide.handle("a", "draft", "/goal 分析数据");
  const prompt = guide.handle("a", "draft", "输出报告") as { text: string };
  const token = prompt.text.match(/确认启动 ([a-f0-9]+)/u)![1];
  const result = guide.handle("a", "draft", `确认启动 ${token} yolo`);
  assert.equal(result?.kind, "goal");
  assert.equal((result as { mode: string }).mode, "yolo");
});
