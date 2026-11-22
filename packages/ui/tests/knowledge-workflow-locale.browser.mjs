import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const server = await createServer({
  configFile: false,
  cacheDir: join(tmpdir(), "knowledge-locale-vite"),
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  root: process.cwd(),
  server: { port: 5199, hmr: false, watch: null },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.route("https://zenmux.ai/api/v1/models", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.goto(
    new URL("packages/ui/tests/studio-creation-fixture.html", server.resolvedUrls.local[0]).href,
  );
  const catalog = await page.evaluate(async () => {
    await import("/packages/ui/src/styles.css");
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { ZCodeIntlProvider, useZCodeIntl } =
      await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { ServiceProvider } = await import("/packages/ui/src/hooks/useServices.tsx");
    const { TabStoreProvider } = await import("/packages/ui/src/store/TabStoreProvider.tsx");
    const { KnowledgeWorkspace } =
      await import("/packages/ui/src/v4/composer/knowledge/KnowledgeWorkspace.tsx");
    const { knowledgeDomains } = await import("/packages/ui/src/v4/composer/knowledge/catalog.ts");
    const { default: zh } = await import("/packages/ui/src/i18n/locales/zh-CN.ts");
    const { default: en } = await import("/packages/ui/src/i18n/locales/en-US.ts");
    const h = React.createElement;
    function App() {
      const { setLocale } = useZCodeIntl();
      return h(
        React.Fragment,
        null,
        h("button", { onClick: () => setLocale("zh-CN") }, "中文"),
        h("button", { onClick: () => setLocale("en-US") }, "English"),
        h(KnowledgeWorkspace, {
          workspacePath: "/fixture",
          modelSelectionView: null,
          onReady: () => {},
        }),
      );
    }
    document.body.innerHTML = '<main id="app"></main>';
    createRoot(document.getElementById("app")).render(
      h(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        h(ServiceProvider, { services: {} }, h(TabStoreProvider, null, h(App))),
      ),
    );
    return knowledgeDomains.map((d) => ({
      id: d.id,
      title: en[`chat.knowledge.domain.${d.id}`],
      skills: d.skills.map((id) => ({
        id,
        zh: zh[`chat.knowledge.workflow.${id}`],
        en: en[`chat.knowledge.workflow.${id}`],
      })),
    }));
  });
  for (const domain of catalog) {
    await page.getByRole("button", { name: domain.title, exact: true }).click();
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    const workflow = page.getByLabel("Workflow", { exact: true });
    await workflow.selectOption(domain.skills.at(-1).id);
    await page.getByLabel("Goal and deliverables", { exact: true }).fill("Keep my draft");
    for (const language of ["zh", "en"]) {
      await page
        .getByRole("button", { name: language === "zh" ? "中文" : "English", exact: true })
        .click();
      const select = page.locator("select").first();
      const options = await select
        .locator("option")
        .evaluateAll((nodes) => nodes.map((n) => ({ id: n.value, label: n.textContent.trim() })));
      assert.deepEqual(
        options,
        domain.skills.map((s) => {
          assert.ok(s[language], `missing ${s.id}`);
          assert.notEqual(s[language], s.id);
          return { id: s.id, label: s[language] };
        }),
      );
      assert.equal(await select.inputValue(), domain.skills.at(-1).id);
      assert.equal(await page.locator("textarea").first().inputValue(), "Keep my draft");
    }
    await page.getByRole("button", { name: "1 Domain", exact: true }).click();
  }
  console.log(
    `PASS ${catalog.length} domains: complete workflow translations, live locale switching, stable skill IDs and drafts`,
  );
} finally {
  await browser.close();
  await server.close();
}
