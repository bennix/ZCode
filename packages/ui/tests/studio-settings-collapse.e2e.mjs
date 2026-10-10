import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";

test("generation settings collapse preserves inputs and leaves progress visible", async () => {
  let browser;
  const vite = await createServer({
    root: process.cwd(), configFile: false, plugins: [tailwindcss()],
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
  });
  try {
    const bundle = await build({
      stdin: {
        contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import { StudioSettingsDisclosure } from './packages/ui/src/v4/composer/studio/StudioSettingsDisclosure.tsx';
        createRoot(document.getElementById('root')).render(<><input aria-label="主题" defaultValue="" /><StudioSettingsDisclosure collapseLabel="收起生成设置" expandLabel="展开生成设置"><input aria-label="生成模型" defaultValue="" /></StudioSettingsDisclosure><p role="status">正在生成第 2 页</p></>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      jsx: "automatic",
      tsconfig: "packages/ui/tsconfig.json",
    });
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    const stylesheet = await vite.transformRequest("/packages/ui/src/styles.css?direct");
    assert.ok(stylesheet?.code);
    await page.addStyleTag({ content: stylesheet.code });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const input = page.getByRole("textbox", { name: "主题" });
    const model = page.getByRole("textbox", { name: "生成模型" });
    assert.equal(await input.isVisible(), true);
    assert.equal(await model.isVisible(), false);
    await input.fill("Python 条件判断");
    assert.equal(await page.getByRole("status").isVisible(), true);
    const toggle = page.getByRole("button", { name: "展开生成设置" });
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await model.fill("Claude Sonnet");
    await page.getByRole("button", { name: "收起生成设置" }).click();
    assert.equal(await model.isVisible(), false);
    await page.getByRole("button", { name: "展开生成设置" }).click();
    assert.equal(await input.inputValue(), "Python 条件判断");
    assert.equal(await model.inputValue(), "Claude Sonnet");
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByRole("button", { name: "收起生成设置" }).focus();
    await page.keyboard.press("Space");
    assert.equal(await model.isVisible(), false);
    assert.equal(await input.isVisible(), true);
    assert.equal(await page.getByRole("status").isVisible(), true);
    const mobile = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    }));
    assert.ok(mobile.scrollWidth <= mobile.viewportWidth, JSON.stringify(mobile));
  } finally {
    await browser?.close();
    await vite.close();
  }
});
