import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createComputerUseRuntime } from "../index.js";

test("MCP observations bind target, screenshot provenance and a bounded lifetime", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-cua-observation-"));
  const executable = join(directory, "fake-mcp");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const readline=require('node:readline');
(async()=>{for await(const line of readline.createInterface({input:process.stdin})){
 const q=JSON.parse(line);if(!('id' in q))continue;
 let result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
 if(q.method==='tools/call'){
  const {name,arguments:args}=q.params;
  result={content:[{type:'text',text:JSON.stringify({name,arguments:args})},...(name==='get_app_state'&&args.include_screenshot!==false?[{type:'image',mimeType:'image/png',data:'AQ=='}]:[])]};
 }
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');
}})();`,
  );
  await chmod(executable, 0o755);
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  try {
    for (const platform of ["win32", "linux"]) {
      const runtime = createComputerUseRuntime({
        platform,
        env: { ZCODE_CUA_DEV_MODE: "1", ZCODE_CUA_EXECUTOR_PATH: executable },
      });
      const context = { workspaceKey: "fixture", sessionId: "main", runtimeScope: "main" };
      const call = (name, args, snapshotId) =>
        runtime.execute({
          toolName: "platform.call",
          arguments: { name, arguments: args, snapshotId },
          context,
        });
      const observe = async (include_screenshot = true) => {
        const value = await call("get_app_state", {
          ...(platform === "linux"
            ? { app_name_or_bundle_identifier: "Editor", window_id: 42 }
            : { app: "Editor" }),
          include_screenshot,
        });
        assert.notEqual(value.isError, true);
        return JSON.parse(value.content.at(-1).text).zcodeSnapshotId;
      };
      try {
        let id = await observe();
        const wrong = await call(
          "click",
          { ...(platform === "linux" ? { window_id: 43 } : { app: "Other" }), element_index: 1 },
          id,
        );
        assert.equal(wrong.isError, true);
        assert.match(wrong.content[0].text, /observed app/u);
        id = await observe();
        const inherited = await call("click", { element_index: 1 }, id);
        assert.notEqual(inherited.isError, true);
        assert.equal(
          JSON.parse(inherited.content[0].text).arguments.app,
          platform === "win32" ? "Editor" : undefined,
        );
        assert.equal((await call("click", { element_index: 1 }, id)).isError, true);
        id = await observe(false);
        assert.equal((await call("click", { x: 10, y: 20 }, id)).isError, true);
        id = await observe(false);
        assert.equal(
          (await call("drag", { from_x: 1, from_y: 1, to_x: 2, to_y: 2 }, id)).isError,
          true,
        );
        id = await observe(false);
        assert.notEqual((await call("click", { element_index: 1 }, id)).isError, true);
        id = await observe();
        now += 120001;
        const expired = await call("click", { element_index: 1 }, id);
        assert.equal(expired.isError, true);
        assert.match(expired.content[0].text, /expired/u);
        id = await observe();
        assert.notEqual((await call("click", { x: 10, y: 20 }, id)).isError, true);
      } finally {
        await runtime.dispose();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
