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
  let recentOutput = "";
  const child = spawn(
    packagedExecutable || join(repoRoot, "node_modules/.bin/electron"),
    [
      ...(packagedExecutable ? [] : [join(repoRoot, "packages/desktop")]),
      `--remote-debugging-port=${port}`,
      // 根因：CI 的 Xvfb runner 未配置 SUID sandbox helper；只对该测试进程关闭沙箱。
      ...(process.env.ZENCODE_TEST_DISABLE_SANDBOX === "1" ? ["--no-sandbox"] : []),
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
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      recentOutput = (recentOutput + chunk.toString()).slice(-8_000);
    });
  }
  let browser;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1_000 });
        break;
      } catch {
        if (child.exitCode !== null || child.signalCode !== null) break;
        await new Promise((wait) => setTimeout(wait, 200));
      }
    }
    // 根因待实机日志确认：10 秒无 CDP 可能是首次解包慢，也可能是子进程退出；保留有界诊断。
    assert.ok(
      browser,
      `Electron did not expose CDP (exit=${child.exitCode}, signal=${child.signalCode}): ${recentOutput}`,
    );
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
    // 根因：Windows 的插件工作目录句柄可能在 Electron 退出后短暂占用；有界重试保留真实失败。
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
