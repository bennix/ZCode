import assert from "node:assert/strict";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";

const server = await createServer({
  configFile: false,
  plugins: [tailwindcss()],
  root: process.cwd(),
  esbuild: { jsx: "automatic" },
  server: { port: 5196, hmr: false, watch: null },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const locale of ["zh-CN", "en-US"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(
      new URL("packages/ui/tests/studio-creation-fixture.html", server.resolvedUrls.local[0]).href,
    );
    await page.evaluate(async (locale) => {
      await import("/packages/ui/src/styles.css");
      const { SettingsRow } = await import("/packages/ui/src/settings/SettingsPageParts.tsx");
      const { Button } = await import("/packages/ui/src/components/ui/button.tsx");
      const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
      const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
      const { CommandDialog } = await import("/packages/ui/src/components/ui/command.tsx");
      const { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter, DialogDescription } =
        await import("/packages/ui/src/components/ui/dialog.tsx");
      const h = React.createElement;
      function App() {
        const [open, setOpen] = React.useState(false);
        return h(
          React.Fragment,
          null,
          h(Button, { onClick: () => setOpen(true) }, "Commands"),
          h(SettingsRow, {
            label: "Long localized model configuration label",
            description: "A translated explanation that must wrap without obscuring the control",
            control: h("input", { "aria-label": "Setting", style: { width: "100%", minWidth: 0 } }),
          }),
          h(CommandDialog, { open, onOpenChange: setOpen }, h("input", { "aria-label": "Query" })),
          h(
            Dialog,
            null,
            h(DialogTrigger, null, "Open"),
            h(
              DialogContent,
              null,
              h(DialogTitle, null, "Details"),
              h(DialogDescription, null, "Dialog test"),
              h(DialogFooter, { showCloseButton: true }),
            ),
          ),
        );
      }
      document.body.innerHTML = '<div id="app"></div>';
      createRoot(document.getElementById("app")).render(
        h(ZCodeIntlProvider, { initialLocale: locale }, h(App)),
      );
    }, locale);
    for (const theme of ["theme-zai-light", "theme-zai-dark"]) {
      await page.evaluate((theme) => (document.documentElement.className = theme), theme);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        const input = page.getByRole("textbox", { name: "Setting" });
        await input.waitFor();
        const box = await input.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, "setting stays inside viewport");
        const label = await page
          .getByText("Long localized model configuration label", { exact: true })
          .boundingBox();
        assert.ok(
          width < 640 ? box.y >= label.y + label.height : box.x >= label.x + label.width,
          "responsive setting alignment",
        );
        await page.getByRole("button", { name: "Commands", exact: true }).focus();
        assert.notEqual(
          await page
            .getByRole("button", { name: "Commands", exact: true })
            .evaluate((el) => getComputedStyle(el).outlineStyle),
          "none",
        );
      }
    }
    await page.getByRole("button", { name: "Commands", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal((await dialog.getAttribute("aria-labelledby")) !== null, true);
    assert.equal(
      await dialog.getByRole("heading").innerText(),
      locale === "zh-CN" ? "命令面板" : "Command palette",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Open", exact: true }).click();
    const close = page.getByRole("button", {
      name: locale === "zh-CN" ? "关闭" : "Close",
      exact: true,
    });
    assert.equal(await close.count(), 2);
    await close.first().click();
    await dialog.waitFor({ state: "hidden" });
    await page.close();
    console.log(`PASS ${locale}: accessible command title, Escape, translated dialog close`);
  }
} finally {
  await browser.close();
  await server.close();
}
