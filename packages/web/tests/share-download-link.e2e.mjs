import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";

test(
  "share recovery offers the current ZenCode release in both languages",
  { skip: !process.env.ZENCODE_SHARE_WEB_URL },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      for (const [path, continueLabel, downloadLabel] of [
        ["/cn/share/mock-public", "去 ZenCode 继续", "下载 ZenCode"],
        ["/share/mock-public", "Continue in ZenCode", "Download ZenCode"],
      ]) {
        const page = await browser.newPage();
        await page.goto(new URL(path, process.env.ZENCODE_SHARE_WEB_URL).href);
        await page.getByRole("heading", { name: "Conversation share preview" }).waitFor();
        await page.getByRole("link", { name: continueLabel }).first().click();
        const download = page.getByRole("link", { name: downloadLabel });
        await download.waitFor({ timeout: 5_000 });
        assert.equal(await download.getAttribute("href"), "https://github.com/bennix/ZCode/releases/latest");
        await page.close();
      }
      const readonly = await browser.newPage();
      await readonly.goto(new URL("/share/mock-readonly", process.env.ZENCODE_SHARE_WEB_URL).href);
      await readonly.getByRole("heading", { name: "Conversation share preview" }).waitFor();
      assert.equal(await readonly.getByRole("link", { name: "Download ZenCode" }).count(), 0);
      await readonly.close();
      const missing = await browser.newPage();
      await missing.addInitScript(() => sessionStorage.setItem("zcode:share:mock-auth", "owner"));
      await missing.goto(new URL("/share/mock-not-found", process.env.ZENCODE_SHARE_WEB_URL).href);
      const home = missing.getByRole("link", { name: "Back to home" });
      await home.waitFor();
      assert.equal(await home.getAttribute("href"), "https://zcode.z.ai");
      await missing.close();
    } finally {
      await browser.close();
    }
  },
);
