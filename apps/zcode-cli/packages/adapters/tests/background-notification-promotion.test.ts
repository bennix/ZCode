import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import {
  listSessionInputs,
  promoteSessionInputBatch,
  saveSessionInput,
} from "../src/storage/session-store/repositories/session-inputs.ts";
import { messages } from "../src/storage/session-store/repositories/messages.ts";

function database(path = ":memory:") {
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
    insert into session_input values ('notice-1', 's', 'backgroundNotification', 'queue', '{}', 0, null, null, 'admitted', null, 1, 1);
    insert into session_input values ('notice-2', 's', 'backgroundNotification', 'queue', '{}', 1, null, null, 'admitted', null, 1, 1);
  `);
  return db;
}

function promotion(ids: string[]) {
  return {
    ids,
    sessionID: "s" as never,
    message: { id: "message", sessionID: "s", role: "user", time: { created: 2 } } as never,
    parts: [
      { id: "part", sessionID: "s", messageID: "message", type: "text", text: "done" },
    ] as never,
  };
}

test("background notification batch commits transcript and all claims together", async () => {
  const db = database();
  try {
    await promoteSessionInputBatch(db, promotion(["notice-1", "notice-2"]));
    const rows = db
      .prepare(
        "select id, status, promoted_message_id from session_input order by admitted_sequence",
      )
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { id: "notice-1", status: "promoted", promoted_message_id: "message" },
      { id: "notice-2", status: "promoted", promoted_message_id: "message" },
    ]);
    assert.equal(db.prepare("select count(*) as n from message").get()?.n, 1);
    assert.equal(db.prepare("select count(*) as n from part").get()?.n, 1);
  } finally {
    db.close();
  }
});

test("admitted notification survives database reopen and disappears from replay after promotion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-notification-"));
  const path = join(directory, "session.sqlite");
  try {
    const first = database(path);
    try {
      await saveSessionInput(first, {
        id: "notice-reopened",
        sessionID: "s" as never,
        kind: "backgroundNotification",
        delivery: "queue",
        payload: { text: "child completed", branchGeneration: 2 },
      });
    } finally {
      first.close();
    }
    const second = new DatabaseSync(path);
    try {
      const admitted = await listSessionInputs(second, {
        sessionID: "s" as never,
        status: "admitted",
      });
      assert.equal(
        admitted.find((record) => record.id === "notice-reopened")?.payload.text,
        "child completed",
      );
      await promoteSessionInputBatch(second, promotion(["notice-reopened"]));
    } finally {
      second.close();
    }
    const third = new DatabaseSync(path);
    try {
      const pending = await listSessionInputs(third, {
        sessionID: "s" as never,
        status: "admitted",
      });
      assert.equal(
        pending.some((record) => record.id === "notice-reopened"),
        false,
      );
      assert.equal(third.prepare("select count(*) as n from message").get()?.n, 1);
    } finally {
      third.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("promoted batch reopens with one full user notice and no assistant", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-promoted-reopen-"));
  const path = join(directory, "session.sqlite");
  try {
    const first = database(path);
    try {
      const input = promotion(["notice-1", "notice-2"]);
      await promoteSessionInputBatch(first, {
        ...input,
        message: { ...input.message, source: "background_task" },
        parts: [{ ...input.parts[0], text: "one\n\ntwo" }] as never,
      });
    } finally {
      first.close();
    }
    const reopened = new DatabaseSync(path);
    try {
      const promoted = await listSessionInputs(reopened, {
        sessionID: "s" as never,
        status: "promoted",
      });
      const transcript = await messages(reopened, { sessionID: "s" as never });
      assert.equal(promoted.length, 2);
      assert.deepEqual(promoted.map((record) => record.promotedMessageID), ["message", "message"]);
      assert.equal(transcript.length, 1);
      assert.equal(transcript[0]?.info.role, "user");
      assert.equal(transcript[0]?.info.source, "background_task");
      assert.deepEqual(transcript[0]?.parts.map((part) => part.type === "text" ? part.text : ""), ["one\n\ntwo"]);
      assert.equal(transcript.some((item) => item.info.role === "assistant"), false);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("promoted notice remains atomic after the writer process is killed", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-promoted-crash-"));
  const path = join(directory, "session.sqlite");
  try {
    database(path).close();
    const input = promotion(["notice-1", "notice-2"]);
    const moduleUrl = new URL("../src/storage/session-store/repositories/session-inputs.ts", import.meta.url).href;
    const script = `
      import { DatabaseSync } from "node:sqlite";
      const { promoteSessionInputBatch } = await import(process.argv[2]);
      const db = new DatabaseSync(process.argv[1]);
      await promoteSessionInputBatch(db, JSON.parse(process.argv[3]));
      process.kill(process.pid, "SIGKILL");
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script,
      path, moduleUrl, JSON.stringify({ ...input, message: { ...input.message, source: "background_task" } })], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const [code, signal] = await once(child, "exit");
    assert.equal(signal, "SIGKILL", `writer exited ${code}: ${stderr}`);
    const reopened = new DatabaseSync(path);
    try {
      const promoted = await listSessionInputs(reopened, { sessionID: "s" as never, status: "promoted" });
      const transcript = await messages(reopened, { sessionID: "s" as never });
      assert.equal(promoted.length, 2);
      assert.equal(transcript.length, 1);
      assert.equal(transcript[0]?.info.role, "user");
      assert.equal(transcript.some((item) => item.info.role === "assistant"), false);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retrying a promoted request ID cannot overwrite its durable payload", async () => {
  const db = database();
  try {
    await promoteSessionInputBatch(db, promotion(["notice-1"]));
    await saveSessionInput(db, {
      id: "notice-1",
      sessionID: "s" as never,
      kind: "backgroundNotification",
      delivery: "queue",
      payload: { text: "replacement" },
    });
    const row = db
      .prepare("select status, payload from session_input where id = 'notice-1'")
      .get() as { status: string; payload: string };
    assert.equal(row.status, "promoted");
    assert.equal(row.payload, "{}");
  } finally {
    db.close();
  }
});

test("missing notification claim rolls back the whole batch", async () => {
  const db = database();
  try {
    await assert.rejects(promoteSessionInputBatch(db, promotion(["notice-1", "missing"])));
    assert.equal(
      db.prepare("select status from session_input where id = 'notice-1'").get()?.status,
      "admitted",
    );
    assert.equal(db.prepare("select count(*) as n from message").get()?.n, 0);
    assert.equal(db.prepare("select count(*) as n from part").get()?.n, 0);
  } finally {
    db.close();
  }
});
