import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { queryTaskUsage } from "../src/storage/session-store/repositories/usage.ts";

test("task request usage includes judge overhead without subtracting repeated context", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`create table model_usage (
      id text primary key,
      session_id text not null,
      started_at integer not null,
      query_source text not null,
      status text not null,
      input_tokens integer not null,
      output_tokens integer not null,
      reasoning_tokens integer not null,
      cache_creation_input_tokens integer not null,
      cache_read_input_tokens integer not null,
      computed_total_tokens integer not null,
      provider_total_tokens integer
    )`);
    const insert = db.prepare(`insert into model_usage values (?, 'session', ?, ?, 'completed', ?, ?, 0, ?, ?, ?, ?)`);
    insert.run("main-1", 1, "main_turn", 100, 20, 5, 40, 120, 120);
    insert.run("judge", 2, "model_dispatch", 10, 2, 0, 0, 12, 12);
    insert.run("main-2", 3, "main_turn", 120, 10, 0, 60, 130, 130);

    const result = await queryTaskUsage(db, { sessionID: "session" as never });
    assert.equal(result.totalTokens, 162);
    assert.equal(result.requestTotalTokens, 262);
    assert.equal(result.requestInputTokens, 230);
    assert.equal(result.requestOutputTokens, 32);
    assert.equal(result.requestCacheCreationTokens, 5);
    assert.equal(result.requestCacheReadTokens, 100);
    assert.equal(result.mainRequestTokens, 250);
    assert.equal(result.dispatchRequestTokens, 12);
    const empty = await queryTaskUsage(db, { sessionID: "empty" as never });
    assert.equal(empty.requestTotalTokens, 0);
    assert.equal(empty.dispatchRequestTokens, 0);
  } finally {
    db.close();
  }
});
