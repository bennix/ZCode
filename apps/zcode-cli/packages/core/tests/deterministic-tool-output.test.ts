import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import type { TraceContext } from "@zcode/contracts";
import { compressToolText, formatCompressedToolText } from "../src/tool/result-text-compression.js";
import {
  serializeOutput,
  appendHookAdditionalContexts,
} from "../src/tool/executor/result-serialization.js";
import type { ToolExecutorDeps } from "../src/tool/executor/types.js";
import type { ToolEntry } from "../src/tool/types.js";

import { estimateTokens } from "../src/context/utils.js";

const trace = { traceId: "compression-trace", turnId: "compression-turn" } as TraceContext;
const logFixture = () =>
  Array.from({ length: 280 }, (_, i) =>
    i === 150
      ? "ERROR src/worker.ts:42: missing configuration\n    at start (worker.ts:42:7)"
      : `2026-10-23T10:00:${String(i % 60).padStart(2, "0")}Z INFO worker waiting for the same build operation to finish`,
  ).join("\n");
const searchFixture = () =>
  ["src/a-file-2026-10-23.ts", "C:\\project\\b-file.ts"]
    .flatMap((path) =>
      Array.from(
        { length: 100 },
        (_, i) =>
          `${path}:${i + 1}:${i === 51 ? "FIXME failing assertion" : "ordinary matching source line with full context"}`,
      ),
    )
    .join("\n");

test("log folding is deterministic, retains diagnostics/tail, and accounts for removals", () => {
  const input = logFixture();
  const first = compressToolText(input, "logs");
  assert.ok(first);
  assert.deepEqual(compressToolText(input, "logs"), first);
  assert.ok(first.removedLines > 100);
  assert.match(
    first.content,
    /ERROR src\/worker.ts:42: missing configuration\n    at start \(worker.ts:42:7\)/u,
  );
  assert.ok(first.content.endsWith(input.split("\n").slice(-12).join("\n")));
  assert.match(first.content, /omitted/u);
  assert.equal(compressToolText(first.content, "logs"), undefined);
});

test("source, numeric data, config, diffs, short results and old envelopes are unchanged", () => {
  for (const input of [
    "INFO short",
    "const a = 1;\n".repeat(500),
    JSON.stringify(Array(200).fill({ x: 1 })),
    "diff --git a/a.ts b/a.ts\n" + "+INFO repeated\n".repeat(400),
    "<persisted-output>\n" + logFixture() + "\n</persisted-output>",
    Array.from({ length: 300 }, (_, i) => `INFO metric value=${i}`).join("\n"),
  ]) {
    assert.equal(compressToolText(input, "logs"), undefined);
  }
});

test("search sampling preserves each dated/Windows path, key hits and original ordering", () => {
  const input = searchFixture();
  const result = compressToolText(input, "search");
  assert.ok(result);
  for (const path of ["src/a-file-2026-10-23.ts", "C:\\project\\b-file.ts"]) {
    for (const line of [1, 2, 52, 99, 100]) assert.ok(result.content.includes(`${path}:${line}:`));
  }
  assert.ok(result.content.indexOf("src/a-file") < result.content.indexOf("C:\\project"));
  assert.equal(
    compressToolText(
      "Found 200 files\n" + Array.from({ length: 200 }, (_, i) => `src/file-${i}.ts`).join("\n"),
      "search",
    ),
    undefined,
  );
  const context = input.replaceAll(":20:", "-20-");
  assert.ok(compressToolText(context, "search")?.content.includes("FIXME failing assertion"));
});

function fixture(
  mode: "ok" | "fail" | "uri" | "none" = "ok",
  strategy: "artifact" | "truncate" = "artifact",
) {
  const writes: { content: string; trace?: unknown; sessionId: unknown }[] = [];
  const entry = {
    metadata: { name: "Bash" },
    resultBudget: {
      maxInlineBytes: 30_000,
      maxModelBytes: 30_000,
      strategy,
      textCompression: "logs",
      artifact: { enabled: true, retention: "session" },
    },
  } as unknown as ToolEntry;
  const deps = {
    sessionId: "compression-session",
    artifactStore:
      mode === "none"
        ? undefined
        : {
            async writeToolResultArtifact(input: {
              content: string;
              trace?: unknown;
              sessionId: unknown;
            }) {
              writes.push(input);
              if (mode === "fail") throw new Error("disk full");
              return {
                path: mode === "uri" ? undefined : "/workspace/artifacts/full.txt",
                uri: "artifact:test",
              };
            },
          },
  } as unknown as ToolExecutorDeps;
  const run = (content: unknown, signal = new AbortController().signal) =>
    serializeOutput(deps, content, entry, trace, "compression-call", signal);
  return { entry, deps, writes, run };
}

test("serializer saves the exact original once and returns a bounded Read reference", async () => {
  const f = fixture();
  const input = logFixture();
  const result = await f.run(input);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0]?.content, input);
  assert.equal(f.writes[0]?.trace, trace);
  assert.equal(f.writes[0]?.sessionId, "compression-session");
  assert.match(result.content, /Read.*\/workspace\/artifacts\/full.txt/u);
  assert.ok(result.returnedBytes < result.originalBytes * 0.8);
  assert.equal(result.returnedBytes, Buffer.byteLength(result.content));
  assert.ok(result.returnedBytes <= 30_000);
  assert.equal(result.truncated, true);
  assert.equal((await f.run(result.content)).content, result.content);
  assert.equal(f.writes.length, 1);
  const withHook = appendHookAdditionalContexts(result, ["keep this hook instruction"], f.entry);
  assert.ok(withHook.content.includes("keep this hook instruction"));
  assert.ok(withHook.content.includes("/workspace/artifacts/full.txt"));
});

test("no store, disk failure or unreadable URI never ships an unrecoverable compacted result", async () => {
  for (const mode of ["none", "fail", "uri"] as const) {
    assert.equal((await fixture(mode).run(logFixture())).content, logFixture());
  }
  const f = fixture();
  delete f.entry.resultBudget!.textCompression;
  assert.equal((await f.run(logFixture())).content, logFixture());
  assert.equal(f.writes.length, 0);
  const old = fixture("ok", "truncate");
  assert.equal((await old.run(logFixture())).content, logFixture());
  assert.equal(old.writes.length, 0);
});

test("multimodal blocks, budgets and cancellation retain their existing authority", async () => {
  const f = fixture();
  const media = [
    { type: "text" as const, text: logFixture() },
    { type: "image" as const, dataUrl: "data:image/png;base64,AQ==" },
  ];
  f.entry.formatModelContent = () => media;
  assert.deepEqual((await f.run({})).modelContent, media);
  assert.equal(f.writes.length, 0);
  delete f.entry.formatModelContent;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.run(logFixture(), controller.signal), { name: "AbortError" });
  assert.equal(f.writes.length, 0);
  const candidate = compressToolText(logFixture(), "logs")!;
  assert.equal(
    formatCompressedToolText(
      candidate,
      logFixture(),
      "/" + "very-long-directory/".repeat(3000),
      30_000,
    ),
    undefined,
  );
});

test("persisted original round-trips through the filesystem and measures final projection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-compression-"));
  try {
    const f = fixture();
    const path = join(directory, "original.txt");
    f.deps.artifactStore = {
      async writeToolResultArtifact(input: { content: string }) {
        await writeFile(path, input.content, "utf8");
        return { path, uri: "artifact:roundtrip" };
      },
    } as unknown as ToolExecutorDeps["artifactStore"];
    const input = logFixture();
    const start = performance.now();
    const result = await f.run(input);
    assert.equal(await readFile(path, "utf8"), input);
    assert.ok(result.content.includes(path));
    assert.ok(result.content.includes("ERROR src/worker.ts:42"));
    console.info(
      JSON.stringify({
        fixture: "synthetic repeated build log",
        originalBytes: result.originalBytes,
        returnedBytes: result.returnedBytes,
        estimatedTokensBefore: estimateTokens(input),
        estimatedTokensAfter: estimateTokens(result.content),
        elapsedMs: Math.round(performance.now() - start),
      }),
    );
    const controller = new AbortController();
    f.deps.artifactStore = {
      async writeToolResultArtifact() {
        controller.abort();
        return { path };
      },
    } as unknown as ToolExecutorDeps["artifactStore"];
    await assert.rejects(f.run(input, controller.signal), { name: "AbortError" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
