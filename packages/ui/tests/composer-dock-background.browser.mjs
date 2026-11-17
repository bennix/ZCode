import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";

const { chromium } = createRequire(import.meta.url)("playwright-core");
// 使用真实 Composer 根节点的样式，避免测试夹具另写一套已经修好的背景。
const source = await readFile("packages/ui/src/v4/ConversationComposer.tsx", "utf8");
const rootClasses = source.match(/"(chat-composer-region[^"]+)"/u)?.[1];
assert.ok(rootClasses);
const navigationClasses = source.match(
  /className="([^"]+)"\s+data-testid="composer-workspace-entries"/u,
)?.[1];
assert.ok(navigationClasses);
const server = await createServer({
  configFile: false,
  cacheDir: join(tmpdir(), "composer-dock-background-vite"),
  plugins: [tailwindcss()],
  root: process.cwd(),
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
  server: { port: 5198, hmr: false, watch: null },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto(
      new URL("packages/ui/tests/studio-creation-fixture.html", server.resolvedUrls.local[0]).href,
    );
    await page.evaluate(
      async ({ classes, navigationClasses }) => {
        await import("/packages/ui/src/styles.css");
        document.body.innerHTML = `<div id="viewport" style="height:600px;overflow:auto">
        <div style="height:1200px">History output</div>
        <div style="position:sticky;bottom:0">
          <div id="composer" class="${classes}">
            <nav class="${navigationClasses}"><button aria-pressed="true">普通对话</button><button id="toggle" aria-pressed="false">WorkCoder</button><button>专业任务</button><button>研究探针</button></nav>
            <section id="guided" style="height:280px" hidden>Model assignment</section>
          </div>
        </div></div>`;
        document.getElementById("toggle").onclick = () => {
          const panel = document.getElementById("guided");
          panel.hidden = !panel.hidden;
        };
      },
      { classes: rootClasses, navigationClasses },
    );
    for (const dark of [false, true]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
      for (const scrollTop of [200, 600, 300]) {
        await page.locator("#viewport").evaluate((node, top) => {
          node.scrollTop = top;
        }, scrollTop);
        await page.locator("#toggle").click();
        const state = await page.locator("#composer").evaluate((node) => {
          const style = getComputedStyle(node);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = style.backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          const nav = node.querySelector("nav").getBoundingClientRect();
          const rect = node.getBoundingClientRect();
          return {
            alpha: ctx.getImageData(0, 0, 1, 1).data[3],
            containsNavigation: nav.top >= rect.top && nav.bottom <= rect.bottom,
            fitsWidth: node.scrollWidth <= node.clientWidth,
            selectedSurface: getComputedStyle(node.querySelector('[aria-pressed="true"]'))
              .backgroundColor,
            unselectedSurface: getComputedStyle(node.querySelector('[aria-pressed="false"]'))
              .backgroundColor,
            visible: rect.top >= 0 && rect.bottom <= 600,
          };
        });
        assert.equal(state.alpha, 255, "sticky entry bar must obscure history beneath it");
        assert.equal(state.containsNavigation, true);
        assert.equal(state.fitsWidth, true, "entry strip must wrap within the dock");
        assert.notEqual(state.selectedSurface, state.unselectedSurface);
        assert.equal(state.visible, true);
      }
    }
    await page.close();
  }
  console.log(
    "PASS: opaque composer dock in both themes, desktop/mobile and repeated panel toggles",
  );
} finally {
  await browser.close();
  await server.close();
}
