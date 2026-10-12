import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("mobile control entry opens the existing Weixin pairing flow", async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { WebRemoteControlDialog } from "./packages/ui/src/WebRemoteControlDialog.tsx";
        createRoot(document.getElementById("root")).render(
          React.createElement(WebRemoteControlDialog, {
            open: true,
            onOpenChange: () => {},
            workspacePath: "/workspace",
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
    plugins: [
      {
        name: "remote-entry-stubs",
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /\/BotsDialog\.js$/ }, () => ({
            path: "bots",
            namespace: "stub",
          }));
          pluginBuild.onResolve({ filter: /\/BotsDialog\/shared\.js$/ }, () => ({
            path: "icon",
            namespace: "stub",
          }));
          pluginBuild.onResolve({ filter: /\/i18n\/IntlProvider\.js$/ }, () => ({
            path: "intl",
            namespace: "stub",
          }));
          pluginBuild.onResolve({ filter: /\/logger\.js$/ }, () => ({
            path: "logger",
            namespace: "stub",
          }));
          pluginBuild.onResolve({ filter: /\/components\/ui\/dialog\.js$/ }, () => ({
            path: "dialog",
            namespace: "stub",
          }));
          pluginBuild.onLoad({ filter: /^bots$/, namespace: "stub" }, () => ({
            contents:
              'export const BotsDialog = ({open, entryProvider}) => open ? <div data-testid="bots-entry">{entryProvider ?? "all"}</div> : null;',
            loader: "tsx",
            resolveDir: process.cwd(),
          }));
          pluginBuild.onLoad({ filter: /^icon$/, namespace: "stub" }, () => ({
            contents: "export const ProviderIcon = ({provider}) => <span>{provider}</span>;",
            loader: "tsx",
            resolveDir: process.cwd(),
          }));
          pluginBuild.onLoad({ filter: /^intl$/, namespace: "stub" }, () => ({
            contents: "export const useZCodeIntl = () => ({intl:{formatMessage:({id})=>id}});",
            loader: "js",
          }));
          pluginBuild.onLoad({ filter: /^logger$/, namespace: "stub" }, () => ({
            contents: "export const logger = {info:()=>{}};",
            loader: "js",
          }));
          pluginBuild.onLoad({ filter: /^dialog$/, namespace: "stub" }, () => ({
            contents:
              "export const Dialog = ({children}) => <div>{children}</div>; export const DialogContent = ({children}) => <div>{children}</div>; export const DialogHeader = ({children}) => <div>{children}</div>; export const DialogTitle = ({children}) => <div>{children}</div>; export const DialogDescription = ({children}) => <div>{children}</div>;",
            loader: "tsx",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    assert.equal(
      await page
        .getByRole("button", { name: /webRemoteControl\.botChannel\.weixin\.title/u })
        .count(),
      1,
    );
    assert.equal(await page.getByText("webRemoteControl.botChannel.feishu.title").count(), 0);
    await page
      .getByRole("button", { name: /webRemoteControl\.botChannel\.weixin\.title/u })
      .click();
    assert.equal(await page.getByTestId("bots-entry").textContent(), "weixin");
  } finally {
    await browser.close();
  }
});
