import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { listSessionInputs } from "../src/storage/session-store/repositories/session-inputs.ts";
import { messages } from "../src/storage/session-store/repositories/messages.ts";

const inputRepositoryUrl = new URL(
  "../src/storage/session-store/repositories/session-inputs.ts",
  import.meta.url,
).href;
const messageRepositoryUrl = new URL(
  "../src/storage/session-store/repositories/messages.ts",
  import.meta.url,
).href;

test("completed background reply and promoted claim survive writer death together", {
  skip: process.platform === "win32",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "zencode-background-finalized-"));
  const path = join(directory, "session.sqlite");
  try {
    const db = new DatabaseSync(path);
    db.exec(`
      create table session (id text primary key, time_updated integer not null);
      insert into session values ('s', 0);
      create table message (id text primary key, session_id text not null, time_created integer not null,
        time_updated integer not null, data text not null, sequence integer);
      create table part (id text primary key, message_id text not null, session_id text not null,
        time_created integer not null, time_updated integer not null, data text not null, sequence integer);
      create table session_input (id text primary key, session_id text not null, kind text not null,
        delivery text not null, payload text not null, admitted_sequence integer not null,
        promoted_sequence integer, promoted_message_id text, status text not null,
        status_reason text, time_created integer not null, time_updated integer not null);
      insert into session_input values ('notice', 's', 'backgroundNotification', 'queue',
        '{"text":"child completed","branchGeneration":2}', 0, null, null, 'admitted', null, 1, 1);
    `);
    db.close();

    const writer = `
      import { DatabaseSync } from "node:sqlite";
      const { promoteSessionInputBatch } = await import(process.argv[2]);
      const { saveMessage, savePart } = await import(process.argv[3]);
      const db = new DatabaseSync(process.argv[1]);
      await promoteSessionInputBatch(db, {
        ids: ["notice"], sessionID: "s",
        message: { id: "user", sessionID: "s", role: "user", source: "background_task", time: { created: 2 } },
        parts: [{ id: "input-part", sessionID: "s", messageID: "user", type: "text", text: "child completed" }],
      });
      await saveMessage(db, {
        id: "assistant", sessionID: "s", role: "assistant", parentID: "user",
        time: { created: 3, completed: 4 },
      });
      await savePart(db, {
        id: "answer-part", sessionID: "s", messageID: "assistant", type: "text", text: "task done",
      });
      process.kill(process.pid, "SIGKILL");
    `;
    const child = spawn(process.execPath, [
      "--import", "tsx", "--input-type=module", "-e", writer,
      path, inputRepositoryUrl, messageRepositoryUrl,
    ], { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const [code, signal] = await once(child, "exit");
    assert.equal(signal, "SIGKILL", `writer exited ${code}: ${stderr}`);

    const reopened = new DatabaseSync(path);
    try {
      const promoted = await listSessionInputs(reopened, { sessionID: "s" as never, status: "promoted" });
      const persisted = await messages(reopened, { sessionID: "s" as never });
      assert.equal(promoted.length, 1);
      assert.equal(promoted[0]?.promotedMessageID, "user");
      assert.equal(persisted.filter((item) => item.info.role === "user").length, 1);
      assert.equal(persisted.filter((item) => item.info.role === "assistant").length, 1);
      assert.equal(persisted.find((item) => item.info.id === "assistant")?.info.time.completed, 4);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
