import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const repoRoot = resolve(import.meta.dirname, "../../..");

test("desktop, web, and UI blue octopus assets have identical pixels", async () => {
  const files = [
    "public/icon_512@2x.png",
    "packages/desktop/build/icon.png",
    "packages/desktop/src/renderer/public/zencode-app-icon.png",
    "packages/web/public/zencode-app-icon.png",
  ];
  const pixelHashes = await Promise.all(
    files.map(async (file) => {
      const image = PNG.sync.read(await readFile(join(repoRoot, file)));
      assert.equal(image.width, 1024, file);
      assert.equal(image.height, 1024, file);
      return createHash("sha256").update(image.data).digest("hex");
    }),
  );
  assert.equal(new Set(pixelHashes).size, 1);
});

async function freePort() {
  const server = createServer();
  await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolveClosed) => server.close(resolveClosed));
  return address.port;
}

test("fresh desktop welcome uses ZenCode branding while retaining ZenMux provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-brand-e2e-"));
  const port = await freePort();
  const child = spawn(
    join(repoRoot, "node_modules/.bin/electron"),
    [join(repoRoot, "packages/desktop"), `--remote-debugging-port=${port}`],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: join(root, "home"),
        ZCODE_DATA_BASE_DIR: join(root, "data"),
        ZCODE_DESKTOP_APPLICATION_NAME: "ZenCode Brand E2E",
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
        await new Promise((resolveWait) => setTimeout(resolveWait, 200));
      }
    }
    assert.ok(browser, "Electron did not expose CDP");
    const page = browser.contexts()[0]?.pages()[0];
    assert.ok(page, "welcome window did not open");
    await page.getByRole("heading", { name: "欢迎来到 ZenCode" }).waitFor();
    const brand = page.getByRole("img", { name: "ZenCode" });
    assert.equal(await brand.count(), 1);
    const image = brand.locator("img");
    assert.equal(await image.count(), 1, "welcome must use the blue octopus app icon");
    assert.equal(await image.evaluate((node) => node.naturalWidth), 1024);
    assert.equal(await page.getByText("worker", { exact: true }).count(), 0);
    assert.equal(await page.getByText("ZenMux API Key", { exact: true }).count(), 1);
    await page.setViewportSize({ width: 320, height: 568 });
    const narrowBrand = await brand.boundingBox();
    const narrowHeading = await page
      .getByRole("heading", { name: "欢迎来到 ZenCode" })
      .boundingBox();
    assert.ok(narrowBrand && narrowHeading && narrowBrand.y + narrowBrand.height < narrowHeading.y);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.getByText("暂时跳过", { exact: true }).click();
    for (let step = 0; step < 3; step++) {
      await page.getByText("跳过", { exact: true }).click();
    }
    await page.getByText("新建任务", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("Z", { exact: true }).count(), 0);
    assert.equal(await page.locator('[aria-label="ZenCode"] img').count(), 1);
  } finally {
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolveExit) => child.once("exit", resolveExit));
    }
    await rm(root, { recursive: true, force: true });
  }
});
