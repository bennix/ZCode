import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("native permission IPC routes to the packaged executor and scopes cancellation by window", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zencode-cua-ipc-"));
  try {
    const bundle = await build({
      entryPoints: ["packages/desktop/src/main/desktopCuaPermissionIpc.ts"],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      plugins: [
        {
          name: "native-boundaries",
          setup(builder) {
            for (const [filter, path] of [
              [/^electron$/, "electron"],
              [/^@zcode\/shared$/, "shared"],
              [/desktopRuntimeEnv\.js$/, "runtime"],
              [/nativeCuaOnboarding\.js$/, "native"],
            ]) {
              builder.onResolve({ filter }, () => ({ path, namespace: "fixture" }));
            }
            builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
              contents:
                path === "electron"
                  ? "export const ipcMain={handle:(key,fn)=>globalThis.handlers[key]=fn,on:(key,fn)=>globalThis.listeners[key]=fn};"
                  : path === "shared"
                    ? 'export const PlatformChannels={OpenCuaPermissionOnboarding:"open",CancelCuaPermissionOnboarding:"cancel",PrepareCuaHelperPermissionDrag:"prepare",StartCuaHelperPermissionDrag:"drag",NotifyCuaHelperPermissionDragEnded:"ended"};'
                    : path === "runtime"
                      ? 'export const resolveBundledMacCuaPluginRoot=()=>"/packaged/plugin";'
                      : 'export async function launchNativeMacCuaOnboarding({pluginRoot,signal}){globalThis.nativeRoots.push(pluginRoot);return await new Promise(resolve=>signal.addEventListener("abort",()=>resolve({success:false,canceled:true}),{once:true}));}',
            }));
          },
        },
      ],
    });
    const file = join(directory, "ipc.mjs");
    await writeFile(file, bundle.outputFiles[0].text);
    globalThis.handlers = {};
    globalThis.listeners = {};
    globalThis.nativeRoots = [];
    const { registerCuaPermissionIpcHandlers } = await import(pathToFileURL(file).href);
    registerCuaPermissionIpcHandlers({
      logger: { info() {}, warn() {} },
      currentApplicationLocale: () => "zh-CN",
    });
    const sender = (id) => ({ id, isDestroyed: () => false, once() {}, removeListener() {} });
    const pending = globalThis.handlers.open({ sender: sender(1) }, { operationId: "operation" });
    await Promise.resolve();
    assert.deepEqual(globalThis.nativeRoots, ["/packaged/plugin"]);
    globalThis.listeners.cancel({ sender: sender(2) }, { operationId: "operation" });
    assert.equal(
      await Promise.race([pending.then(() => "resolved"), Promise.resolve("pending")]),
      "pending",
    );
    globalThis.listeners.cancel({ sender: sender(1) }, { operationId: "operation" });
    assert.deepEqual(await pending, { success: false, canceled: true });
  } finally {
    delete globalThis.handlers;
    delete globalThis.listeners;
    delete globalThis.nativeRoots;
    await rm(directory, { recursive: true, force: true });
  }
});
