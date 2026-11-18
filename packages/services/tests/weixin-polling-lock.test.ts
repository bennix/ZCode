import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireWeixinPollingLock } from "../src/bots/channelRuntime.js";
import { setDataBaseDir } from "../src/paths.js";

test("Weixin credential has one polling owner even across different bot IDs", async () => {
  const base = await mkdtemp(join(tmpdir(), "weixin-lock-"));
  setDataBaseDir(base);
  let first;
  let second;
  try {
    first = await acquireWeixinPollingLock("fixture-token", "bot-a");
    assert.ok(first);
    assert.equal(await acquireWeixinPollingLock("fixture-token", "bot-b"), null);
    await first.release();
    first = null;
    second = await acquireWeixinPollingLock("fixture-token", "bot-b");
    assert.ok(second);
  } finally {
    await first?.release();
    await second?.release();
    setDataBaseDir(null);
    await rm(base, { recursive: true, force: true });
  }
});
