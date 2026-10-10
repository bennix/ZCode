import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright-core";

async function freePort() {
  const server = createServer();
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((closed) => server.close(closed));
  return address.port;
}

test("packaged first-use Studio and Agent board show task before advanced settings", async () => {
  const executable = process.env.ZENCODE_PACKAGED_APP_PATH?.trim();
  assert.ok(executable, "ZENCODE_PACKAGED_APP_PATH must point to a packaged desktop executable");
  const root = await mkdtemp(join(tmpdir(), "zencode-guided-packaged-e2e-"));
  const port = await freePort();
  const child = spawn(executable, [`--remote-debugging-port=${port}`], {
    env: {
      ...process.env,
      HOME: join(root, "home"),
      ZCODE_DATA_BASE_DIR: join(root, "data"),
      ZCODE_DESKTOP_APPLICATION_NAME: "ZenCode Guided Packaged E2E",
      ZCODE_DESKTOP_HOME_DIR: join(root, "home"),
      ZCODE_DESKTOP_USER_DATA_DIR: join(root, "user"),
      ZCODE_DESKTOP_SESSION_DATA_DIR: join(root, "session"),
      ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
    },
    stdio: "ignore",
  });
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
    assert.ok(browser, "packaged desktop app did not open");
    const context = browser.contexts()[0];
    // 根因：CDP 端口先于首个窗口可用；等待真正的页面，避免首次启动被误判为失败。
    const page = context?.pages()[0] ?? (await context?.waitForEvent("page", { timeout: 30_000 }));
    assert.ok(page, "packaged desktop window did not open");
    await page.getByRole("heading", { name: "欢迎来到 ZenCode" }).waitFor();
    await page.getByText("暂时跳过", { exact: true }).click();
    for (let step = 0; step < 3; step++) await page.getByText("跳过", { exact: true }).click();

    await page.getByRole("button", { name: "创作", exact: true }).click();
    const guided = page.locator('[data-testid="composer-guided-panel"]');
    await guided.getByText("选择要创作的内容，再填写想法；需要时展开详细设置。").waitFor();
    assert.equal(
      await guided.getByPlaceholder("描述要生成的画面，或直接说 PPT 要讲什么").isVisible(),
      true,
    );
    assert.equal(await guided.getByRole("button", { name: "开始生成" }).isVisible(), true);
    const expand = guided.getByRole("button", { name: "展开生成设置" });
    assert.equal(await expand.getAttribute("aria-expanded"), "false");
    const studioBox = await guided.boundingBox();
    const inputBox = await page.locator(".chat-composer-input-surface").boundingBox();
    assert.ok(
      studioBox && inputBox && studioBox.y >= 0 && studioBox.y + studioBox.height <= inputBox.y + 1,
    );
    await expand.click();
    assert.equal(
      await guided.getByRole("button", { name: "收起生成设置" }).getAttribute("aria-expanded"),
      "true",
    );

    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await guided.getByPlaceholder("任务").waitFor();
    const boardBox = await guided.boundingBox();
    const boardInputBox = await page.locator(".chat-composer-input-surface").boundingBox();
    assert.ok(
      boardBox &&
        boardInputBox &&
        boardBox.y >= 0 &&
        boardBox.y + boardBox.height <= boardInputBox.y + 1,
    );
    assert.equal(await guided.getByRole("button", { name: "开始", exact: true }).isVisible(), true);
    assert.equal(await guided.getByRole("button", { name: "添加 Agent" }).isVisible(), false);
    await guided.locator("summary").filter({ hasText: "配置 Agent、裁定与白板" }).click();
    assert.equal(await guided.getByRole("button", { name: "添加 Agent" }).isVisible(), true);
  } finally {
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((exit) => child.once("exit", exit));
    }
    await rm(root, { recursive: true, force: true });
  }
});
