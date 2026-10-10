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

test("published desktop app checks its GitHub update manifest", async () => {
  const executable = process.env.ZENCODE_PACKAGED_APP_PATH?.trim();
  assert.ok(executable, "ZENCODE_PACKAGED_APP_PATH is required");
  const root = await mkdtemp(join(tmpdir(), "zencode-about-update-e2e-"));
  const port = await freePort();
  let output = "";
  const child = spawn(executable, [`--remote-debugging-port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      HOME: join(root, "home"),
      ZCODE_DATA_BASE_DIR: join(root, "data"),
      ZCODE_DESKTOP_HOME_DIR: join(root, "home"),
      ZCODE_DESKTOP_USER_DATA_DIR: join(root, "user"),
      ZCODE_DESKTOP_SESSION_DATA_DIR: join(root, "session"),
      ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-8_000);
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
    assert.ok(browser, `packaged app did not expose CDP: ${output}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.waitForEvent("page", { timeout: 30_000 }));
    await page.getByRole("heading", { name: /^(?:欢迎来到 ZenCode|Welcome to ZenCode)$/u }).waitFor();
    await page.getByText(/^(?:暂时跳过|Skip for now)$/u).click();
    for (let step = 0; step < 3; step++) await page.getByText(/^(?:跳过|Skip)$/u).click();
    await page.getByTestId("workspace-help-menu-trigger").click();
    const aboutPagePromise = context.waitForEvent("page", { timeout: 30_000 });
    await page.getByText(/^(?:关于 ZenCode|About ZenCode)$/u).click();
    const aboutPage = await aboutPagePromise;
    await aboutPage.locator("#update-status").waitFor();
    await aboutPage.waitForFunction(() => {
      const text = document.querySelector("#update-status")?.textContent ?? "";
      return /^(?:已是最新版本|Up to date|发现新版本|New version)/u.test(text);
    }, undefined, { timeout: 45_000 });
    const status = (await aboutPage.locator("#update-status").innerText()).trim();
    assert.doesNotMatch(status, /Cannot find latest(?:-mac)?\.yml/iu);
    console.log(`packaged update check: ${status}`);
  } finally {
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((exit) => child.once("exit", exit));
    }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
