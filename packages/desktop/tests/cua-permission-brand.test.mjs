import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["packages/desktop/src/main/cuaAccessibilitySettings.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "native-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^electron$/ }, () => ({
          path: "electron",
          namespace: "fixture",
        }));
        builder.onResolve({ filter: /desktopCuaHelperInstaller\.js$/ }, () => ({
          path: "installer",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents:
            path === "electron"
              ? "export const shell = { openExternal: async () => {} };"
              : "export const createDesktopCuaHelperInstaller = () => { throw new Error('unexpected installer'); };",
        }));
      },
    },
  ],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;
const { openCuaPermissionOnboarding, prepareCuaHelperPermissionDrag } = await import(moduleUrl);

test("computer control permission errors use ZenCode branding and reject unsafe continuation", async () => {
  for (const entry of [openCuaPermissionOnboarding, prepareCuaHelperPermissionDrag]) {
    const unsupported = await entry({ platform: "win32" });
    assert.equal(unsupported.success, false);
    assert.match(unsupported.error, /^ZenCode Computer Use/u);

    const installFailed = await entry({
      platform: "darwin",
      ensureHelperInstalled: async () => {
        throw new Error("test install failure");
      },
    });
    assert.equal(installFailed.success, false);
    assert.match(installFailed.error, /ZenCode Computer Use/u);
  }
});
