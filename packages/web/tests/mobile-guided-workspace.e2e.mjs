import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";

test(
  "mobile Web keeps the composer and guided entry points within the viewport",
  {
    skip: !process.env.ZENCODE_MOBILE_WEB_URL,
  },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 320, height: 700 },
        locale: "zh-CN",
      });
      await page.goto(process.env.ZENCODE_MOBILE_WEB_URL);
      await page.getByRole("heading", { name: "欢迎来到 ZenCode" }).waitFor({ timeout: 30_000 });
      await page.getByText("暂时跳过", { exact: true }).click();
      for (let step = 0; step < 3; step++) {
        const skip = page.getByText("跳过", { exact: true });
        await skip.waitFor({ timeout: 3_000 }).catch(() => {});
        if (!(await skip.isVisible().catch(() => false))) break;
        await skip.click();
      }
      const composer = page.locator(".chat-composer-input-surface");
      await composer.waitFor();
      const box = await composer.boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= 321 && box.width >= 250,
        JSON.stringify(box),
      );
      const toggleSidebar = page.getByRole("button", { name: "切换侧边栏" });
      assert.equal(await toggleSidebar.isVisible(), true);
      await toggleSidebar.click();
      await page.waitForTimeout(250);
      const sidebar = await page.locator("#sidebar").boundingBox();
      const main = await page.locator("#content").boundingBox();
      assert.ok(
        sidebar && sidebar.width >= 200 && main && main.width >= 319,
        JSON.stringify({ sidebar, main }),
      );
      await toggleSidebar.click();
      await page.waitForTimeout(250);
      const reopenedComposer = await composer.boundingBox();
      assert.ok(reopenedComposer && reopenedComposer.x + reopenedComposer.width <= 321);
      assert.equal(await page.getByRole("button", { name: "创作", exact: true }).isVisible(), true);
      assert.equal(
        await page.getByRole("button", { name: "工作区", exact: true }).isVisible(),
        true,
      );
      await page.getByRole("button", { name: "创作", exact: true }).click();
      await page.waitForTimeout(700);
      assert.equal(await page.getByRole("button", { name: "开始生成" }).isVisible(), true);
      const studioPanel = await page.locator('[data-testid="composer-guided-panel"]').boundingBox();
      const studioStart = await page.getByRole("button", { name: "开始生成" }).boundingBox();
      assert.ok(
        studioPanel &&
          studioPanel.y >= 56 &&
          studioStart &&
          studioStart.y + studioStart.height <=
            Math.min(studioPanel.y + studioPanel.height + 1, 701),
        JSON.stringify({ studioPanel, studioStart }),
      );
      assert.equal(await page.locator('[data-testid="chat-empty"]').isVisible(), false);
      if (process.env.ZENCODE_MOBILE_WEB_STUDIO_SCREENSHOT_PATH) {
        await page.screenshot({
          path: process.env.ZENCODE_MOBILE_WEB_STUDIO_SCREENSHOT_PATH,
          fullPage: true,
        });
      }
      await page.getByRole("button", { name: "创作", exact: true }).click();
      assert.equal(await page.locator('[data-testid="chat-empty"]').isVisible(), true);
      await page.getByRole("button", { name: "工作区", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "开始", exact: true }).isVisible(), true);
      const boardHeading = await page.getByText("多 Agent 工作区", { exact: true }).boundingBox();
      const guidedGeometry = await page.evaluate(() => ({
        content: document.querySelector("#content")?.getBoundingClientRect().toJSON(),
        guided: document
          .querySelector('[data-testid="composer-guided-panel"]')
          ?.getBoundingClientRect()
          .toJSON(),
        guidedScrollTop: document.querySelector('[data-testid="composer-guided-panel"]')?.scrollTop,
      }));
      assert.ok(
        boardHeading && boardHeading.y >= 56,
        JSON.stringify({ boardHeading, guidedGeometry }),
      );
      const boardStart = await page
        .getByRole("button", { name: "开始", exact: true })
        .boundingBox();
      assert.ok(
        boardStart &&
          guidedGeometry.guided &&
          boardStart.y + boardStart.height <= guidedGeometry.guided.bottom + 1,
        JSON.stringify({ boardStart, guidedGeometry }),
      );
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(layout.scrollWidth <= layout.width, JSON.stringify(layout));
      if (process.env.ZENCODE_MOBILE_WEB_SCREENSHOT_PATH) {
        await page.screenshot({
          path: process.env.ZENCODE_MOBILE_WEB_SCREENSHOT_PATH,
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 1024, height: 700 });
      await toggleSidebar.click();
      await page.setViewportSize({ width: 320, height: 700 });
      await page.waitForTimeout(250);
      const afterResize = await composer.boundingBox();
      assert.ok(
        afterResize && afterResize.x + afterResize.width <= 321,
        JSON.stringify(afterResize),
      );
    } finally {
      await browser.close();
    }
  },
);
