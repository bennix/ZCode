import assert from "node:assert/strict";
import { test } from "node:test";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createComputerUseRuntime } from "../index.js";
import { assertLinuxGlibcCompatible } from "../mcp-native.js";

test("Linux executor reports its glibc 2.39 runtime baseline", () => {
  assert.throws(() => assertLinuxGlibcCompatible("2.36"), /glibc 2\.39.*2\.36/);
  assert.doesNotThrow(() => assertLinuxGlibcCompatible("2.39"));
  assert.doesNotThrow(() => assertLinuxGlibcCompatible("2.41"));
  assert.doesNotThrow(() => assertLinuxGlibcCompatible(undefined));
});

test("native MCP child receives the runtime session environment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-cua-env-test-"));
  const executable = join(directory, "fake-mcp");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const readline = require('node:readline');
(async () => { for await (const line of readline.createInterface({input:process.stdin})) {
  const request = JSON.parse(line);
  if (!('id' in request)) continue;
  const result = request.method === 'tools/call'
    ? {content:[{type:'text',text:JSON.stringify({marker:process.env.ZCODE_CUA_SESSION_MARKER})}]}
    : {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fake',version:'1'}};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
} })().catch(e => { console.error(e); process.exitCode=1; });
`,
  );
  await chmod(executable, 0o755);
  const marker = `runtime-${Date.now()}`;
  const runtime = createComputerUseRuntime({
    platform: "linux",
    env: {
      ZCODE_CUA_DEV_MODE: "1",
      ZCODE_CUA_EXECUTOR_PATH: executable,
      ZCODE_CUA_SESSION_MARKER: marker,
    },
  });
  try {
    const response = await runtime.execute({
      toolName: "platform.call",
      context: { workspaceKey: "workspace", sessionId: "env", runtimeScope: "main" },
      arguments: { name: "doctor", arguments: {} },
    });
    assert.notEqual(response.isError, true);
    assert.equal(JSON.parse(response.content[0].text).marker, marker);
  } finally {
    await runtime.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Windows and Linux MCP executors enforce observation and session boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-cua-mcp-test-"));
  const executable = join(directory, "fake-mcp");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const readline = require('node:readline');
(async () => {
  for await (const line of readline.createInterface({input: process.stdin})) {
    const request = JSON.parse(line);
    if (!('id' in request)) continue;
    let result = {};
    if (request.method === 'initialize') result = {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fake',version:'1'}};
    if (request.method === 'tools/list') result = {tools:[{name:'get_app_state',inputSchema:{type:'object'}},{name:'click',inputSchema:{type:'object'}},{name:'move_window',inputSchema:{type:'object'}},{name:'resize_window',inputSchema:{type:'object'}},{name:'run_shell',inputSchema:{type:'object'}}]};
    if (request.method === 'tools/call') result = {content:[{type:'text',text:JSON.stringify({tool:request.params.name})},...(request.params.name==='get_app_state'?[{type:'image',mimeType:'image/png',data:'aW1hZ2U='}]:[])]};
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
  }
})().catch(e => { console.error(e); process.exitCode=1; });
`,
  );
  await chmod(executable, 0o755);
  const contexts = [
    { workspaceKey: "workspace", sessionId: "one", runtimeScope: "main" },
    { workspaceKey: "workspace", sessionId: "two", runtimeScope: "main" },
  ];
  try {
    for (const platform of ["win32", "linux"]) {
      const runtime = createComputerUseRuntime({
        platform,
        env: { ZCODE_CUA_DEV_MODE: "1", ZCODE_CUA_EXECUTOR_PATH: executable },
      });
      try {
        const described = await runtime.execute({
          toolName: "platform.describe",
          context: contexts[0],
        });
        const tools = JSON.parse(described.content[0].text).tools;
        assert.deepEqual(
          tools.map((tool) => tool.name),
          ["get_app_state", "click", "move_window", "resize_window"],
        );
        const denied = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "click", arguments: { element_index: "1" } },
        });
        assert.equal(denied.isError, true);
        const observed = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "get_app_state", arguments: { app: "Notepad" } },
        });
        assert.equal(observed.content.find((item) => item.type === "image")?.data, "aW1hZ2U=");
        const snapshotId = JSON.parse(observed.content.at(-1).text).zcodeSnapshotId;
        const crossSession = await runtime.execute({
          toolName: "platform.call",
          context: contexts[1],
          arguments: { name: "click", arguments: { element_index: "1" }, snapshotId },
        });
        assert.equal(crossSession.isError, true);
        const clicked = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "click", arguments: { element_index: "1" }, snapshotId },
        });
        assert.equal(clicked.isError, undefined);
        const replay = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "click", arguments: { element_index: "1" }, snapshotId },
        });
        assert.equal(replay.isError, true);
        const moveWithoutObservation = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "move_window", arguments: { window_id: 1, x: 10, y: 10 } },
        });
        assert.equal(moveWithoutObservation.isError, true);
        const shell = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "run_shell", arguments: {} },
        });
        assert.equal(shell.isError, true);
      } finally {
        await runtime.dispose();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("native MCP calls in one session preserve observation order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-cua-order-test-"));
  const executable = join(directory, "fake-mcp");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const readline = require('node:readline');
(async () => { for await (const line of readline.createInterface({input:process.stdin})) {
  const request = JSON.parse(line);
  if (!('id' in request)) continue;
  const result = request.method === 'tools/call'
    ? {content:[{type:'text',text:JSON.stringify({label:request.params.arguments.label})}]}
    : {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fake',version:'1'}};
  setTimeout(() => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n'),
    request.params?.arguments?.label === 'first' ? 80 : 0);
}
})().catch(e => { console.error(e); process.exitCode=1; });
`,
  );
  await chmod(executable, 0o755);
  const runtime = createComputerUseRuntime({
    platform: "linux",
    env: { ZCODE_CUA_DEV_MODE: "1", ZCODE_CUA_EXECUTOR_PATH: executable },
  });
  const context = { workspaceKey: "workspace", sessionId: "one", runtimeScope: "main" };
  try {
    const completed = [];
    const first = runtime
      .execute({
        toolName: "platform.call",
        context,
        arguments: { name: "get_app_state", arguments: { label: "first" } },
      })
      .then((value) => {
        completed.push("first");
        return value;
      });
    const second = runtime
      .execute({
        toolName: "platform.call",
        context,
        arguments: { name: "get_app_state", arguments: { label: "second" } },
      })
      .then((value) => {
        completed.push("second");
        return value;
      });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.isError, undefined, JSON.stringify(firstResult));
    assert.equal(secondResult.isError, undefined, JSON.stringify(secondResult));
    assert.deepEqual(completed, ["first", "second"]);
    const firstId = JSON.parse(firstResult.content.at(-1).text).zcodeSnapshotId;
    const secondId = JSON.parse(secondResult.content.at(-1).text).zcodeSnapshotId;
    assert.notEqual(firstId, secondId);
    const stale = await runtime.execute({
      toolName: "platform.call",
      context,
      arguments: { name: "click", arguments: { label: "click" }, snapshotId: firstId },
    });
    assert.equal(stale.isError, true);
    const current = await runtime.execute({
      toolName: "platform.call",
      context,
      arguments: { name: "click", arguments: { label: "click" }, snapshotId: secondId },
    });
    assert.equal(current.isError, undefined);
    const pendingObservation = runtime.execute({
      toolName: "platform.call",
      context,
      arguments: { name: "get_app_state", arguments: { label: "first" } },
    });
    const queuedAction = runtime.execute({
      toolName: "platform.call",
      context,
      arguments: { name: "click", arguments: { label: "queued" }, snapshotId: secondId },
    });
    await runtime.closeSession(context);
    assert.equal((await pendingObservation).isError, true);
    assert.equal((await queuedAction).isError, true);
  } finally {
    await runtime.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("closing during native startup rejects queued calls before any tool executes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-cua-startup-close-test-"));
  const executable = join(directory, "fake-mcp");
  const started = join(directory, "started");
  const calls = join(directory, "calls");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
(async () => { for await (const line of readline.createInterface({input:process.stdin})) {
  const request = JSON.parse(line);
  if (!('id' in request)) continue;
  if (request.method === 'initialize') {
    fs.writeFileSync(${JSON.stringify(started)}, 'ready');
    setTimeout(() => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fake',version:'1'}}})+'\\n'), 300);
  } else {
    fs.appendFileSync(${JSON.stringify(calls)}, request.method + '\\n');
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{content:[]}})+'\\n');
  }
} })().catch(e => { console.error(e); process.exitCode=1; });
`,
  );
  await chmod(executable, 0o755);
  const runtime = createComputerUseRuntime({
    platform: "linux",
    env: { ZCODE_CUA_DEV_MODE: "1", ZCODE_CUA_EXECUTOR_PATH: executable },
  });
  const context = { workspaceKey: "workspace", sessionId: "startup-close", runtimeScope: "main" };
  try {
    const first = runtime.execute({
      toolName: "platform.call",
      context,
      arguments: { name: "get_app_state", arguments: {} },
    });
    const second = runtime.execute({
      toolName: "platform.call",
      context,
      arguments: { name: "click", arguments: { x: 1, y: 1 }, snapshotId: "stale" },
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await access(started);
        break;
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      }
    }
    await access(started);
    await runtime.closeSession(context);
    assert.equal((await first).isError, true);
    assert.equal((await second).isError, true);
    assert.equal(await readFile(calls, "utf8").catch(() => ""), "");
    const fresh = await runtime.execute({
      toolName: "platform.call",
      context,
      arguments: { name: "get_app_state", arguments: {} },
    });
    assert.notEqual(fresh.isError, true, JSON.stringify(fresh));
    assert.ok(JSON.parse(fresh.content.at(-1).text).zcodeSnapshotId);
    assert.equal(await readFile(calls, "utf8"), "tools/call\n");
  } finally {
    await runtime.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("native executor early exit returns an error without an unhandled pipe failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-cua-exit-test-"));
  const executable = join(directory, "fake-mcp");
  await writeFile(executable, "#!/usr/bin/env node\nprocess.exit(42);\n");
  await chmod(executable, 0o755);
  const runtime = createComputerUseRuntime({
    platform: "linux",
    env: { ZCODE_CUA_DEV_MODE: "1", ZCODE_CUA_EXECUTOR_PATH: executable },
  });
  try {
    const response = await runtime.execute({
      toolName: "platform.describe",
      context: { workspaceKey: "workspace", sessionId: "early-exit", runtimeScope: "main" },
    });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /exited.*42/);
  } finally {
    await runtime.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
