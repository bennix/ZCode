import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import test from "node:test";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { TurnFileSelectionGuard } from "../src/tool/file-selection-guard.ts";

test("confirmed file selection permits only the chosen direct writes in its turn", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-file-guard-"));
  try {
  const guard = new TurnFileSelectionGuard(() => root, true);
  await guard.activate("turn-1", ["src/chosen.ts"]);
  const check = async (turnId: string, toolName: string, filePath?: string) =>
    guard.violation({
      turnId,
      toolName,
      input: filePath ? { file_path: filePath } : {},
      workingDirectory: root,
    });
  assert.equal(await check("turn-1", "Write", "src/chosen.ts"), null);
  assert.equal(await check("turn-1", "Edit", resolve(root, "src/chosen.ts")), null);
  assert.match((await check("turn-1", "Write", "src/other.ts")) ?? "", /outside/u);
  assert.match((await check("turn-1", "Write", "../other.ts")) ?? "", /outside/u);
  assert.match((await check("turn-1", "Bash")) ?? "", /cannot prove/u);
  assert.match((await check("turn-1", "js")) ?? "", /cannot prove/u);
  assert.match((await check("turn-1", "Agent")) ?? "", /cannot prove/u);
  assert.equal(await check("turn-1", "Read"), null);
  assert.equal(await check("turn-2", "Bash"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file selection fails closed without a turn or with workspace hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-file-guard-"));
  try {
  await assert.rejects(new TurnFileSelectionGuard(() => root, true).activate(undefined, ["a.ts"]));
  await assert.rejects(new TurnFileSelectionGuard(() => root, false).activate("turn-1", ["a.ts"]));
  await assert.rejects(new TurnFileSelectionGuard(() => root, true).activate("turn-1", ["../a.ts"]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file selection rejects symlink escapes from the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-file-guard-root-"));
  const outside = await mkdtemp(join(tmpdir(), "zcode-file-guard-outside-"));
  try {
    await symlink(outside, join(root, "external"));
    const guard = new TurnFileSelectionGuard(() => root, true);
    await guard.activate("turn-1", ["external/secret.txt"]).then(
      () => assert.fail("selection through an external symlink must be rejected"),
      () => undefined,
    );
    await guard.activate("turn-1", ["src/chosen.ts"]);
    assert.match(
      (await guard.violation({
        turnId: "turn-1",
        toolName: "Write",
        input: { file_path: "external/secret.txt" },
        workingDirectory: root,
      })) ?? "",
      /outside/u,
    );
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
});
