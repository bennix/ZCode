import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";

test("workspace board keeps setup behind disclosure and streams one visible result", async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {WorkspaceAgentBoard} from './packages/ui/src/v4/composer/WorkspaceAgentBoard.tsx'; createRoot(document.getElementById('root')).render(<WorkspaceAgentBoard modelSelectionView={{providers:[{providerId:'p',config:{access:{apiKey:'test'}},models:[{modelId:'model',config:{optionSpecs:{reasoningLevel:{values:[]}}}}]}]}}/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    tsconfig: "packages/ui/tsconfig.json",
    plugins: [{
      name: "board-fixtures",
      setup(plugin) {
        const fixtures = new Map([
          ["@zcode/provider", `export const isApiKeyAccess=()=>true;`],
          ["@zcode/shared", `export const ZENMUX_SYSTEM_ONE_MODEL_ID='system'; export const clampDuckDuckGoQuery=x=>x; export const normalizeDuckDuckGoHits=x=>x; export const formatDuckDuckGoHits=()=>''; export const completeZenMuxChat=async()=>({content:'{}',toolCalls:[]}); export const streamZenMuxChatCompletion=async({messages,onDelta})=>{onDelta(messages[0].content.includes('验收裁定')?'裁定完成':'Agent 结论');};`],
          ["@/components/ai-elements/message.js", `export function MessageResponse({children}){return <div>{children}</div>}`],
          ["@/components/ui/button.js", `export function Button({children,variant,...props}){return <button {...props}>{children}</button>}`],
          ["@/components/lib/utils.js", `export const cn=(...parts)=>parts.filter(Boolean).join(' ')`],
          ["@/hooks/usePlatform.js", `export const usePlatform=()=>({searchDuckDuckGo:async()=>[],saveFile:async()=>({success:true})})`],
          ["@/i18n/IntlProvider.js", `export const useZCodeIntl=()=>({intl:{formatMessage:({id})=>id}})`],
          ["./reasoningEffort.js", `export const defaultEffort=()=>''; export const supportedEfforts=()=>[]; export const resolveEffort=()=>''; export const reasoningBody=()=>undefined;`],
        ]);
        plugin.onResolve({ filter: /.*/ }, (args) => {
          if (fixtures.has(args.path)) return { path: args.path, namespace: "board-fixture" };
          return undefined;
        });
        plugin.onLoad({ filter: /.*/, namespace: "board-fixture" }, (args) => ({
          contents: fixtures.get(args.path),
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
      },
    }],
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const vite = await createServer({
    root: process.cwd(), configFile: false, plugins: [tailwindcss()],
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    const stylesheet = await vite.transformRequest("/packages/ui/src/styles.css?direct");
    assert.ok(stylesheet?.code);
    await page.addStyleTag({ content: stylesheet.code });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const add = page.getByRole("button", { name: "chat.workspace.add" });
    assert.equal(await add.isVisible(), false);
    await page.locator("summary").filter({ hasText: "chat.workspace.configure" }).click();
    assert.equal(await add.isVisible(), true);
    await page.locator("summary").filter({ hasText: "chat.workspace.configure" }).click();
    await page.getByPlaceholder("chat.workspace.task").fill("讨论任务");
    await page.getByRole("button", { name: "chat.workspace.run" }).click();
    await page.getByText("Agent 结论", { exact: false }).waitFor();
    const taskBox = await page.getByPlaceholder("chat.workspace.task").boundingBox();
    const searchBox = await page.getByText("chat.workspace.searchEmpty").boundingBox();
    assert.ok(taskBox && searchBox && searchBox.y > taskBox.y);
    assert.equal(await page.getByText("Agent 结论", { exact: false }).count(), 1);
    assert.equal(await page.getByText("裁定完成", { exact: false }).count(), 1);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByPlaceholder("chat.workspace.task").scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    }));
    assert.ok(mobile.scrollWidth <= mobile.viewportWidth, JSON.stringify(mobile));
    assert.equal(await page.getByPlaceholder("chat.workspace.task").isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "chat.workspace.run" }).isVisible(), true);
  } finally {
    await browser.close();
    await vite.close();
  }
});
