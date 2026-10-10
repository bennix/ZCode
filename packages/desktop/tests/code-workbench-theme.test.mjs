import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { updateWorkbenchTheme } from "../src/main/code-workbench/theme.ts";
import { chromium } from "playwright-core";
import { startWorkbench } from "../src/main/code-workbench/process.ts";
import { writeWorkbenchExtension } from "../src/main/code-workbench/extension.ts";

test("IDE theme surfaces match the outer Zai palette", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-ide-palette-"));
  try {
    await writeWorkbenchExtension(root);
    for (const [mode, expected] of Object.entries({
      light: { editor: "#f8f8f8", sidebar: "#f0f0f0", panel: "#ffffff", input: "#ffffff", border: "#0d0d0d1a" },
      dark: { editor: "#161616", sidebar: "#161616", panel: "#202020", input: "#2b2b2b", border: "#ffffff1a" },
    })) {
      const theme = JSON.parse(await readFile(join(root, "zencode.ai-bridge-1.0.0", "themes", `${mode}.json`), "utf8"));
      assert.equal(theme.colors["editor.background"], expected.editor);
      assert.equal(theme.colors["sideBar.background"], expected.sidebar);
      assert.equal(theme.colors["panel.background"], expected.panel);
      assert.equal(theme.colors["input.background"], expected.input);
      assert.equal(theme.colors["menu.background"], expected.input);
      assert.equal(theme.colors["panel.border"], expected.border);
      assert.equal(theme.colors["sideBar.border"], expected.border);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("IDE theme tracks light and dark while preserving unrelated settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-ide-theme-"));
  const path = join(root, "settings.json");
  try {
    await writeFile(path, '{\n  // Keep this setting\n  "editor.fontSize": 17,\n  "workbench.colorTheme": "Default Dark Modern"\n}\n');
    await updateWorkbenchTheme(path, "light");
    let settings = await readFile(path, "utf8");
    assert.match(settings, /"editor.fontSize": 17/);
    assert.match(settings, /\/\/ Keep this setting/);
    assert.match(settings, /"workbench.colorTheme": "ZenCode Light"/);
    await updateWorkbenchTheme(path, "dark");
    settings = await readFile(path, "utf8");
    assert.match(settings, /"workbench.colorTheme": "ZenCode Dark"/);
    await writeFile(path, '{\n  // Existing user preference\n  "editor.fontSize": 17\n}\n');
    await updateWorkbenchTheme(path, "light");
    settings = await readFile(path, "utf8");
    assert.match(settings, /"workbench.colorTheme": "ZenCode Light",/);
    assert.match(settings, /\/\/ Existing user preference/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("running bundled IDE follows ZenCode theme without reload", { timeout: 120_000, skip: !process.env.ZENCODE_IDE_TEST_ROOT }, async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-ide-live-theme-"));
  const workspace = join(root, "workspace");
  await import("node:fs/promises").then((fs) => fs.mkdir(workspace));
  const runtime = await startWorkbench({
    root,
    runtimeDirectory: new URL(`../bundled-workbench/${process.platform}-${process.arch}`, import.meta.url).pathname,
    stateKey: "theme",
    request: { workspacePath: workspace, theme: "light" },
    onContext() {},
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${runtime.origin}/?folder=${encodeURIComponent(workspace)}`);
    await page.locator(".monaco-workbench").waitFor({ timeout: 60_000 });
    await page.locator(".monaco-workbench.vs.zencode-ai-bridge-themes-light-json").waitFor({ timeout: 30_000 });
    assert.equal(await page.locator('.monaco-workbench').evaluate((element) => getComputedStyle(element).getPropertyValue('--vscode-editor-background').trim()), '#f8f8f8');
    await runtime.setTheme("dark");
    await page.locator(".monaco-workbench.vs-dark.zencode-ai-bridge-themes-dark-json").waitFor({ timeout: 30_000 });
    assert.equal(await page.locator('.monaco-workbench').evaluate((element) => getComputedStyle(element).getPropertyValue('--vscode-editor-background').trim()), '#161616');
  } finally {
    await browser.close();
    runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("two running IDE instances keep their theme streams isolated", { timeout: 180_000, skip: !process.env.ZENCODE_IDE_TEST_ROOT }, async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-ide-two-themes-"));
  const workspace = join(root, "workspace");
  await import("node:fs/promises").then((fs) => fs.mkdir(workspace));
  const runtimeDirectory = new URL(`../bundled-workbench/${process.platform}-${process.arch}`, import.meta.url).pathname;
  const instances = [];
  let browser;
  try {
    // 两份状态目录模拟两个 Desktop 窗口；各自拥有独立的扩展桥和配置流。
    for (const stateKey of ["window-a", "window-b"]) {
      instances.push(await startWorkbench({
        root,
        runtimeDirectory,
        stateKey,
        request: { workspacePath: workspace, theme: "dark" },
        onContext() {},
      }));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const pages = await Promise.all(instances.map(async (instance) => {
      const page = await browser.newPage();
      await page.goto(`${instance.origin}/?folder=${encodeURIComponent(workspace)}`);
      await page.locator(".monaco-workbench.vs-dark.zencode-ai-bridge-themes-dark-json").waitFor({ timeout: 60_000 });
      return page;
    }));
    const color = (page) => page.locator(".monaco-workbench").evaluate(
      (element) => getComputedStyle(element).getPropertyValue("--vscode-editor-background").trim(),
    );
    assert.deepEqual(await Promise.all(pages.map(color)), ["#161616", "#161616"]);
    await instances[0].setTheme("light");
    await pages[0].locator(".monaco-workbench.vs.zencode-ai-bridge-themes-light-json").waitFor({ timeout: 30_000 });
    assert.deepEqual(await Promise.all(pages.map(color)), ["#f8f8f8", "#161616"]);
    await instances[1].setTheme("light");
    await pages[1].locator(".monaco-workbench.vs.zencode-ai-bridge-themes-light-json").waitFor({ timeout: 30_000 });
    await instances[0].setTheme("dark");
    await pages[0].locator(".monaco-workbench.vs-dark.zencode-ai-bridge-themes-dark-json").waitFor({ timeout: 30_000 });
    assert.deepEqual(await Promise.all(pages.map(color)), ["#161616", "#f8f8f8"]);
  } finally {
    await browser?.close();
    for (const instance of instances) instance.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
