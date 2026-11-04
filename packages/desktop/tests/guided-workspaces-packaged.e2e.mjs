import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  // Linux CI 的解包应用需要与现有打包验收一致的 sandbox 开关，避免窗口启动前被环境拦截。
  const launchArgs = [
    `--remote-debugging-port=${port}`,
    ...(process.env.ZENCODE_TEST_DISABLE_SANDBOX === "1" ? ["--no-sandbox"] : []),
  ];
  const child = spawn(resolve(executable), launchArgs, {
    cwd: root,
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
    // 系统语言决定首次界面文案，不能把中文文案当作安装成功的前提。
    await page
      .getByRole("heading", { name: /^(?:欢迎来到 ZenCode|Welcome to ZenCode)$/ })
      .waitFor();
    await page.getByText(/^(?:暂时跳过|Skip for now)$/).click();
    for (let step = 0; step < 3; step++) await page.getByText(/^(?:跳过|Skip)$/).click();

    await page.getByRole("button", { name: /^(?:创作|Create)$/ }).click();
    const guided = page.locator('[data-testid="composer-guided-panel"]');
    await guided
      .getByText(
        /^(?:选择作品类型，按步骤描述想法、补充素材，再确认生成。|Choose a format, describe your idea, add optional materials, then review and generate\.)$/,
      )
      .waitFor();
    assert.equal(
      await guided
        .getByPlaceholder(
          /^(?:描述要生成的画面，或直接说 PPT 要讲什么|Describe the image, video, or the talk)$/,
        )
        .isVisible(),
      true,
    );
    assert.equal(
      await guided.getByRole("button", { name: /^(?:开始生成|Generate)$/ }).isVisible(),
      false,
    );
    await guided
      .getByPlaceholder(
        /^(?:描述要生成的画面，或直接说 PPT 要讲什么|Describe the image, video, or the talk)$/,
      )
      .fill("一片森林");
    await guided.getByRole("button", { name: /^(?:下一步|Next step)$/ }).click();
    const expand = guided.getByRole("button", {
      name: /^(?:展开生成设置|Show generation settings)$/,
    });
    assert.equal(await expand.getAttribute("aria-expanded"), "false");
    const studioBox = await guided.boundingBox();
    const inputBox = await page.locator(".chat-composer-input-surface").boundingBox();
    assert.ok(
      studioBox && inputBox && studioBox.y >= 0 && studioBox.y + studioBox.height <= inputBox.y + 1,
    );
    await expand.click();
    assert.equal(
      await guided
        .getByRole("button", { name: /^(?:收起生成设置|Hide generation settings)$/ })
        .getAttribute("aria-expanded"),
      "true",
    );

    await page.getByRole("button", { name: /^(?:工作区|Workspace)$/ }).click();
    await guided.getByPlaceholder(/^(?:任务|Task)$/).waitFor();
    const boardBox = await guided.boundingBox();
    const boardInputBox = await page.locator(".chat-composer-input-surface").boundingBox();
    assert.ok(
      boardBox &&
        boardInputBox &&
        boardBox.y >= 0 &&
        boardBox.y + boardBox.height <= boardInputBox.y + 1,
    );
    assert.equal(await guided.getByRole("button", { name: /^(?:开始|Run)$/ }).isVisible(), false);
    await guided.getByPlaceholder(/^(?:任务|Task)$/).fill("分析方案");
    await guided.getByRole("button", { name: /^(?:下一步|Next step)$/ }).click();
    assert.equal(await guided.getByRole("button", { name: /^(?:开始|Run)$/ }).isVisible(), true);
    assert.equal(
      await guided.getByRole("button", { name: /^(?:添加 Agent|Add agent)$/ }).isVisible(),
      false,
    );
    await guided
      .locator("summary")
      .filter({ hasText: /^(?:配置 Agent、裁定与白板|Configure agents, review, and whiteboard)$/ })
      .click();
    assert.equal(
      await guided.getByRole("button", { name: /^(?:添加 Agent|Add agent)$/ }).isVisible(),
      true,
    );
  } finally {
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((exit) => child.once("exit", exit));
    }
    await rm(root, { recursive: true, force: true });
  }
});
