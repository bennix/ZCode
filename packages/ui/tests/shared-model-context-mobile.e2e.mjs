import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";

test("shared model context stays readable at mobile width without exposing row IDs", async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SharedModelContextPanel} from './packages/ui/src/v4/SharedModelContextPanel.tsx'; const snapshot={rows:{window:[{kind:'userInput',origin:'realUser',rowId:'row_${"x".repeat(160)}',text:'确认已经提交的目标与限制，并继续处理后续工作'}],totalCount:2},usage:{cumulative:{inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0},contextWindow:{usedTokens:8000,maxTokens:10000,autoCompactThresholdTokens:null}}}; createRoot(document.getElementById('root')).render(<SharedModelContextPanel snapshot={snapshot}/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    tsconfig: "packages/ui/tsconfig.json",
    plugins: [
      {
        name: "intl-fixture",
        setup(plugin) {
          plugin.onResolve({ filter: /i18n\/IntlProvider\.js$/ }, () => ({
            path: "intl",
            namespace: "fixture",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `export function useZCodeIntl(){return {intl:{formatMessage:({id},values)=>id==='chat.sharedContext.title'?'Shared model context':id==='chat.sharedContext.usedTokens'?values.count+' tokens used in context':id}}}`,
          }));
        },
      },
    ],
  });
  const vite = await createServer({
    root: process.cwd(),
    configFile: false,
    plugins: [tailwindcss()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
  });
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const stylesheet = await vite.transformRequest("/packages/ui/src/styles.css?direct");
    assert.ok(stylesheet?.code, "Tailwind stylesheet must compile");
    const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({ content: stylesheet.code });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.locator("summary").click();
    await page.getByText("确认已经提交的目标与限制，并继续处理后续工作").waitFor();
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
      text: document.body.innerText,
    }));
    assert.ok(layout.scrollWidth <= layout.width, JSON.stringify(layout));
    assert.doesNotMatch(layout.text, /row_x{20}/u);
  } finally {
    await browser?.close();
    await vite.close();
  }
});
