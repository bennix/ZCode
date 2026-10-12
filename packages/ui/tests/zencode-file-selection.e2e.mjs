import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("file selection card requires an explicit choice and returns selected paths", async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { ElicitationDialog } from "./packages/ui/src/ElicitationDialog.tsx";
        const request = {
          requestId: "plan-1",
          message: "Select files",
          header: "Files",
          options: [
            { value: "src/a.ts", label: "src/a.ts", description: "edit: main change" },
            { value: "src/b.ts", label: "src/b.ts", description: "edit: tests" },
          ],
          multiSelect: true,
          schema: { interaction: "file_selection", toolName: "zencode_present_plan" },
        };
        createRoot(document.getElementById("root")).render(
          React.createElement(ElicitationDialog, {
            request,
            onRespond: (_id, action, content) => { window.__answer = { action, content }; },
          }),
        );
      `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    tsconfig: "packages/ui/tsconfig.json",
    plugins: [{
      name: "intl-stub",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /\/i18n\/IntlProvider\.js$/ }, () => ({ path: "intl", namespace: "stub" }));
        pluginBuild.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export const useZCodeIntl = () => ({intl:{formatMessage:({id})=>id}});",
          loader: "js",
        }));
      },
    }],
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const submit = page.getByRole("button", { name: /chat\.elicitation\.(?:submit|continue)/u }).last();
    await submit.waitFor();
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await page.getByRole("textbox").count(), 0);
    await page.getByRole("checkbox", { name: /src\/a\.ts/u }).click();
    assert.equal(await submit.isDisabled(), false);
    await submit.click();
    assert.deepEqual(await page.evaluate(() => window.__answer), {
      action: "accept",
      content: {
        answers: { "Select files": "src/a.ts" },
        answer_0: ["src/a.ts"],
        answer: ["src/a.ts"],
      },
    });
  } finally {
    await browser.close();
  }
});
