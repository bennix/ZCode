import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright-core";

const repoRoot = resolve(import.meta.dirname, "../../..");

async function freePort() {
  const server = createServer();
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((closed) => server.close(closed));
  return address.port;
}

test("fresh desktop exposes Computer Use settings and shares the plugin toggle", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-cua-settings-e2e-"));
  const port = await freePort();
  const requestedExecutable = process.env.ZENCODE_PACKAGED_APP_PATH?.trim();
  const packagedExecutable = requestedExecutable
    ? isAbsolute(requestedExecutable)
      ? requestedExecutable
      : resolve(repoRoot, requestedExecutable)
    : undefined;
  if (packagedExecutable) await access(packagedExecutable);
  const child = spawn(
    packagedExecutable || join(repoRoot, "node_modules/.bin/electron"),
    [
      ...(packagedExecutable ? [] : [join(repoRoot, "packages/desktop")]),
      `--remote-debugging-port=${port}`,
      ...(process.env.ZENCODE_TEST_APP_LANG ? [`--lang=${process.env.ZENCODE_TEST_APP_LANG}`] : []),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: join(root, "home"),
        ZCODE_DATA_BASE_DIR: join(root, "data"),
        ZCODE_DESKTOP_APPLICATION_NAME: "ZenCode Computer Use Settings E2E",
        ZCODE_DESKTOP_HOME_DIR: join(root, "home"),
        ZCODE_DESKTOP_USER_DATA_DIR: join(root, "user"),
        ZCODE_DESKTOP_SESSION_DATA_DIR: join(root, "session"),
        ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
      },
      stdio: "ignore",
    },
  );
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
    assert.ok(browser, "Electron did not expose CDP");
    const context = browser.contexts()[0];
    // 根因：CDP 端口先于首个 BrowserWindow 可用；等待页面事件，避免把正常启动误判为无窗口。
    const page = context?.pages()[0] ?? (await context?.waitForEvent("page", { timeout: 30_000 }));
    assert.ok(page, "desktop window did not open");
    await page
      .getByRole("heading", { name: /^(?:欢迎来到 ZenCode|Welcome to ZenCode)$/ })
      .waitFor();
    await page.getByText(/^(?:暂时跳过|Skip for now)$/).click();
    for (let step = 0; step < 3; step++) {
      await page.getByText(/^(?:跳过|Skip)$/).click();
    }
    await page
      .getByRole("button", { name: /^(?:设置|Settings)$/ })
      .first()
      .click();
    await page
      .getByText(/^(?:电脑控制|Computer Use)$/)
      .last()
      .click();
    const sectionSwitch = page.getByRole("switch", {
      name: /^(?:启用电脑控制|Enable Computer Use)$/,
    });
    await sectionSwitch.waitFor();
    assert.equal(await sectionSwitch.getAttribute("data-state"), "unchecked");
    await page
      .getByText(/^(?:插件|Plugins)$/)
      .last()
      .click();
    const pluginSwitch = page.locator(
      '[data-testid="plugin-settings-enabled-switch"][data-plugin-id="computer-use@zcode-plugins-official"]',
    );
    await pluginSwitch.waitFor();
    assert.equal(await pluginSwitch.getAttribute("data-state"), "unchecked");
    await pluginSwitch.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '[data-testid="plugin-settings-enabled-switch"][data-plugin-id="computer-use@zcode-plugins-official"]',
          )
          ?.getAttribute("data-state") === "checked",
    );
    await page
      .getByText(/^(?:电脑控制|Computer Use)$/)
      .first()
      .click();
    assert.equal(await sectionSwitch.getAttribute("data-state"), "checked");
  } finally {
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((exit) => child.once("exit", exit));
    }
    await rm(root, { recursive: true, force: true });
  }
});
