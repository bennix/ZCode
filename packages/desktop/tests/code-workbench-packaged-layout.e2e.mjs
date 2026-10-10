import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const execFileAsync = promisify(execFile);

async function inspectShell(page) {
  return page.evaluate(() => {
    const root = document.getElementById("root");
    const key = Object.keys(root ?? {}).find((name) => name.startsWith("__reactContainer$"));
    const stack = key ? [root[key]] : [];
    let visited = 0;
    while (stack.length > 0 && visited++ < 20_000) {
      const fiber = stack.pop();
      const props = fiber?.memoizedProps;
      if (
        props &&
        "sidePaneState" in props &&
        "isSidePaneOpen" in props &&
        "workspaceMainView" in props
      ) {
        const sameFiber =
          !window.__zencodeShellFiber ||
          window.__zencodeShellFiber === fiber ||
          window.__zencodeShellFiber === fiber.alternate;
        window.__zencodeShellFiber ??= fiber;
        return {
          sameFiber,
          isSidePaneOpen: props.isSidePaneOpen,
          workspaceMainView: props.workspaceMainView,
          isMacFullscreen: props.isMacFullscreen,
          activeTaskId: props.activeTaskId,
          sidePaneOwnerId: props.sidePaneOwnerId,
          workspaceKey: props.workspaceKey,
          draftFocusVersion: props.workspaceShellZCodeState?.draftFocusVersion,
          activeTabId: props.sidePaneState?.activeTabId,
          tabs: props.sidePaneState?.tabs?.map((tab) => ({
            id: tab.id,
            type: tab.type,
            purpose: tab.purpose,
            ownerTaskId: tab.ownerTaskId,
            workspaceKey: tab.workspaceKey,
          })),
        };
      }
      if (fiber?.sibling) stack.push(fiber.sibling);
      if (fiber?.child) stack.push(fiber.child);
    }
    return null;
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((closed) => server.close(closed));
  return address.port;
}

test(
  process.env.ZENCODE_IDE_THEME_ONLY === "1"
    ? "packaged IDE follows ZenCode theme"
    : process.env.ZENCODE_IDE_SYSTEM_THEME_ONLY === "1"
      ? "packaged IDE follows system color scheme"
      : process.env.ZENCODE_IDE_RESIZE_ONLY === "1"
        ? "packaged IDE stays focused on window resize"
        : "packaged IDE keeps its focused layout in native full screen",
  async () => {
    const executable = process.env.ZENCODE_PACKAGED_APP_PATH?.trim();
    assert.ok(executable, "ZENCODE_PACKAGED_APP_PATH must point to a packaged desktop executable");
    const root = await mkdtemp(join(tmpdir(), "zencode-ide-packaged-e2e-"));
    const port = await freePort();
    let recentOutput = "";
    const child = spawn(executable, [`--remote-debugging-port=${port}`], {
      env: {
        ...process.env,
        HOME: join(root, "home"),
        ZCODE_DATA_BASE_DIR: join(root, "data"),
        ZCODE_DESKTOP_APPLICATION_NAME: "ZenCode IDE Packaged E2E",
        ZCODE_DESKTOP_HOME_DIR: join(root, "home"),
        ZCODE_DESKTOP_USER_DATA_DIR: join(root, "user"),
        ZCODE_DESKTOP_SESSION_DATA_DIR: join(root, "session"),
        ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        recentOutput = (recentOutput + chunk.toString()).slice(-128_000);
      });
    }
    let browser;
    try {
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1_000 });
          break;
        } catch {
          await new Promise((wait) => setTimeout(wait, 200));
        }
      }
      assert.ok(browser, "packaged app did not expose CDP");
      const context = browser.contexts()[0];
      // 根因：CDP 可连接不代表首个 BrowserWindow 已挂载；等待页面事件后再验收包内 UI。
      const page =
        context?.pages()[0] ?? (await context?.waitForEvent("page", { timeout: 30_000 }));
      assert.ok(page, "packaged desktop window did not open");
      page.on("console", (message) => {
        recentOutput = (recentOutput + `\n[renderer] ${message.text()}`).slice(-128_000);
      });
      await page.getByRole("heading", { name: "欢迎来到 ZenCode" }).waitFor();
      await page.getByText("暂时跳过", { exact: true }).click();
      for (let step = 0; step < 3; step++) {
        await page.getByText("跳过", { exact: true }).click();
      }
      await page.waitForTimeout(2_500);
      await page.locator('[data-testid="workspace-code-workbench"]').click();
      await page.locator('[data-code-workbench-focus="true"]').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(8_000);
      if (process.env.ZENCODE_IDE_SYSTEM_THEME_ONLY === "1") {
        const editorBackground = () =>
          page.evaluate(async () => {
            const view = document.querySelector("webview");
            return view?.executeJavaScript(
              "getComputedStyle(document.querySelector('.monaco-workbench')).getPropertyValue('--vscode-editor-background').trim()",
            );
          });
        await page.emulateMedia({ colorScheme: "dark" });
        await page.locator('[data-testid="login-trigger"]').click();
        await page.getByText("界面主题", { exact: true }).hover();
        await page.getByText("系统默认", { exact: true }).last().click();
        assert.equal(await page.evaluate(() => localStorage.getItem("zcode-theme")), "system");
        assert.equal(await editorBackground(), "#161616");
        await page.emulateMedia({ colorScheme: "light" });
        await page.waitForFunction(
          async () => {
            const view = document.querySelector("webview");
            return (
              (await view?.executeJavaScript(
                "getComputedStyle(document.querySelector('.monaco-workbench')).getPropertyValue('--vscode-editor-background').trim()",
              )) === "#f8f8f8"
            );
          },
          undefined,
          { timeout: 30_000 },
        );
        await page.waitForTimeout(1_000);
        assert.equal(await editorBackground(), "#f8f8f8");
        return;
      }
      if (process.env.ZENCODE_IDE_THEME_ONLY === "1") {
        const idePalette = () =>
          page.evaluate(async () => {
            const view = document.querySelector("webview");
            return view?.executeJavaScript(
              "(() => { const css = getComputedStyle(document.querySelector('.monaco-workbench')); return Object.fromEntries(['editor.background', 'sideBar.background', 'input.background', 'menu.background', 'panel.border'].map(name => [name, css.getPropertyValue('--vscode-' + name.replace('.', '-')).trim()])); })()",
            );
          });
        assert.deepEqual(await idePalette(), {
          "editor.background": "#161616",
          "sideBar.background": "#161616",
          "input.background": "#2b2b2b",
          "menu.background": "#2b2b2b",
          "panel.border": "rgba(255, 255, 255, 0.1)",
        });
        await page.locator('[data-testid="login-trigger"]').click();
        await page.getByText("界面主题", { exact: true }).hover();
        await page.getByText("浅色主题", { exact: true }).click();
        await page.waitForFunction(
          async () => {
            const view = document.querySelector("webview");
            return (
              (await view?.executeJavaScript(
                "getComputedStyle(document.querySelector('.monaco-workbench')).getPropertyValue('--vscode-editor-background').trim()",
              )) === "#f8f8f8"
            );
          },
          undefined,
          { timeout: 30_000 },
        );
        await page.waitForTimeout(1_000);
        assert.deepEqual(await idePalette(), {
          "editor.background": "#f8f8f8",
          "sideBar.background": "#f0f0f0",
          "input.background": "#ffffff",
          "menu.background": "#ffffff",
          "panel.border": "rgba(13, 13, 13, 0.1)",
        });
        return;
      }
      if (process.env.ZENCODE_IDE_RESIZE_ONLY === "1") {
        await page.evaluate(() => window.dispatchEvent(new Event("resize")));
        await page.waitForTimeout(700);
        assert.equal(await page.locator('[data-code-workbench-focus="true"]').count(), 1);
        assert.equal(await page.locator("[data-browser-toolbar]").isVisible(), false);
        const group = await page.locator('[data-code-workbench-focus="true"]').boundingBox();
        const ide = await page.locator("#browser").boundingBox();
        assert.ok(group && ide && Math.abs(group.width - ide.width) < 2);
        return;
      }
      assert.equal(
        await page.locator('[data-code-workbench-focus="true"]').count(),
        1,
        `IDE focus disappeared before full screen: ${recentOutput
          .split("\n")
          .filter((line) => /workbench|code-server|exited|failed/iu.test(line))
          .slice(-15)
          .join(" | ")}`,
      );
      if (process.env.ZENCODE_IDE_OBSERVE_ONLY === "1") {
        await page.waitForTimeout(5_000);
        assert.equal(await page.locator('[data-code-workbench-focus="true"]').count(), 1);
        return;
      }
      if (process.platform === "darwin") {
        const appBundlePath = dirname(dirname(dirname(executable)));
        const { stdout } = await execFileAsync("plutil", [
          "-extract",
          "CFBundleIdentifier",
          "raw",
          join(appBundlePath, "Contents", "Info.plist"),
        ]);
        const bundleId = stdout.trim();
        assert.match(bundleId, /^[A-Za-z0-9.-]+$/u);
        // 同一 bundle ID 可能已有另一份安装包在运行；按测试子进程 PID 激活，避免误操作用户窗口。
        await execFileAsync("osascript", [
          "-l",
          "JavaScript",
          "-e",
          `ObjC.import("AppKit"); const target = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}); if (!target) throw new Error("packaged app process missing"); target.activateWithOptions($.NSApplicationActivateIgnoringOtherApps);`,
        ]);
      }
      await page.bringToFront();
      if (process.env.ZENCODE_IDE_ACTIVATE_ONLY === "1") {
        await page.waitForTimeout(5_000);
        assert.equal(await page.locator('[data-code-workbench-focus="true"]').count(), 1);
        return;
      }
      const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      const beforeDom = await page.evaluate(() => ({
        focused: document.querySelectorAll('[data-code-workbench-focus="true"]').length,
        webviews: [...document.querySelectorAll("webview")].map((view) => view.getAttribute("src")),
        sidePane: document.querySelectorAll("#browser").length,
      }));
      const beforeShell = await inspectShell(page);
      await page.evaluate(() => {
        window.__zencodeFullscreenEvents = [];
        window.zcode.onWindowFullscreenChanged((value) =>
          window.__zencodeFullscreenEvents.push(value),
        );
      });
      await page.evaluate(() => window.zcode.executeDesktopCommand("toggleFullScreen"));
      await page
        .waitForFunction(
          (original) => innerWidth > original.width && innerHeight > original.height,
          before,
          { timeout: 12_000 },
        )
        .catch(() => {});
      const after = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        events: window.__zencodeFullscreenEvents,
      }));
      if (process.env.ZENCODE_IDE_SCREENSHOT_PATH) {
        await page.screenshot({ path: process.env.ZENCODE_IDE_SCREENSHOT_PATH });
      }
      assert.ok(
        after.width > before.width && after.height > before.height,
        `native full screen did not expand the window: ${JSON.stringify({ before, after })}; command=${recentOutput
          .split("\n")
          .filter((line) => line.includes("desktop-command") || line.includes("full-screen"))
          .join(" | ")}`,
      );
      const geometry = await page.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector)?.getBoundingClientRect().toJSON();
        const hidden = (selector) => {
          const element = document.querySelector(selector);
          return (
            !element ||
            getComputedStyle(element).display === "none" ||
            getComputedStyle(element).visibility === "hidden"
          );
        };
        return {
          group: rect('[data-code-workbench-focus="true"]'),
          browser: rect('[data-code-workbench-focus="true"] > #browser'),
          dock: rect('[data-code-workbench-focus="true"] > #conversation-column'),
          browserPanelCount: document.querySelectorAll("#browser").length,
          rawBrowser: rect("#browser"),
          browserOpacity: getComputedStyle(document.querySelector("#browser")).opacity,
          webviews: [...document.querySelectorAll("webview")].map((view) =>
            view.getAttribute("src"),
          ),
          focusedGroupCount: document.querySelectorAll('[data-code-workbench-focus="true"]').length,
          sidePaneTabs: [...document.querySelectorAll("[data-side-pane-tabs-list] > *")].map(
            (element) => ({
              text: element.textContent?.slice(0, 50),
              selected: element.getAttribute("aria-selected"),
            }),
          ),
          viewport: { width: innerWidth, height: innerHeight },
          toolbarHidden: hidden("[data-browser-toolbar]"),
          viewportToolbarHidden: hidden("[data-browser-viewport-toolbar]"),
          tabChildrenHidden: [...document.querySelectorAll("[data-side-pane-tabs-list] > *")].every(
            (element) => getComputedStyle(element).visibility === "hidden",
          ),
          workspaceHeaderCount: document.querySelectorAll("[data-workspace-header-frame]").length,
        };
      });
      const afterShell = await inspectShell(page);
      assert.ok(
        geometry.group && geometry.browser && geometry.dock,
        `IDE geometry unavailable after full screen: ${JSON.stringify({ beforeDom, beforeShell, afterShell, geometry })}; logs=${recentOutput
          .split("\n")
          .filter((line) =>
            /workbench|code-server|exited|failed|full-screen|收起右侧面板|新建任务/iu.test(line),
          )
          .slice(-25)
          .join(" | ")}`,
      );
      assert.ok(Math.abs(geometry.browser.width - geometry.group.width) < 2);
      assert.ok(geometry.dock.x >= geometry.group.x && geometry.dock.y >= geometry.group.y);
      assert.ok(geometry.dock.right <= geometry.viewport.width + 1);
      assert.ok(geometry.dock.bottom <= geometry.viewport.height + 1);
      assert.equal(geometry.toolbarHidden, true);
      assert.equal(geometry.viewportToolbarHidden, true);
      assert.equal(geometry.tabChildrenHidden, true);
      assert.equal(geometry.workspaceHeaderCount, 0);
    } finally {
      await browser?.close();
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await new Promise((exit) => child.once("exit", exit));
      }
      if (process.env.ZENCODE_IDE_KEEP_ROOT === "1") console.log("IDE test root", root);
      else await rm(root, { recursive: true, force: true });
    }
  },
);
