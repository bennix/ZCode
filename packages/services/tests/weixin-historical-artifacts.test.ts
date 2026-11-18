import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHistoricalArtifactMenu, findHistoricalArtifacts, parseArtifactRetrieval } from "../src/bots/weixinHistoricalArtifacts.js";

test("retrieval commands are exact and do not capture generation requests", () => {
  for (const text of ["取回 产物", "取回以前任务的产物", "/产物", "/artifacts"]) assert.equal(parseArtifactRetrieval(text), "");
  assert.equal(parseArtifactRetrieval("/取回产物 abc12345 2"), "abc12345 2");
  assert.equal(parseArtifactRetrieval("修改 PDF 后取回产物"), null);
});
test("historical temporary PDF retrieval is read-only, scoped and checked again before sending", async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "wx-history-")));
  try {
    const workspace = join(base, "workspace"); await mkdir(workspace);
    const file = join(base, "中文 PDF.pdf"); await writeFile(file, "%PDF-1.4 historical");
    const secretDir = join(workspace, ".secrets"); await mkdir(secretDir);
    const secret = join(secretDir, "private.pdf"); await writeFile(secret, "secret");
    const link = join(workspace, "alias.pdf"); await symlink(secret, link);
    const snapshot: any = { messages: [{ role: "assistant", content: `[PDF](${file}) [hidden](${link}) [missing](${base}/gone.pdf)` }] };
    const files = await findHistoricalArtifacts(snapshot, workspace);
    assert.deepEqual(files.map((f) => f.path), [file]);
    const menu = createHistoricalArtifactMenu();
    const text = menu.list("actor", "task", files);
    const token = text.match(/\/取回产物 ([a-f0-9]{8}) 1/u)![1];
    await assert.rejects(menu.take("other", "task", `${token} 1`));
    await assert.rejects(menu.take("actor", "other-task", `${token} 1`));
    await assert.rejects(menu.take("actor", "task", "1"));
    assert.equal((await menu.take("actor", "task", `${token} 1`)).bytes.toString(), "%PDF-1.4 historical");
    await writeFile(file, "%PDF-changed");
    await assert.rejects(menu.take("actor", "task", `${token} 1`), /变化/);
    menu.complete("actor");
    await assert.rejects(menu.take("actor", "task", `${token} 1`));
  } finally { await rm(base, { recursive: true, force: true }); }
});
