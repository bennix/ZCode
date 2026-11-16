import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const server = await createServer({ configFile: false, cacheDir: join(tmpdir(), "knowledge-vite"), plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, root: process.cwd(), server: { port: 5198, hmr: false, watch: null }, resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } } });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
 for (const locale of ["en-US", "zh-CN"]) {
  const page = await browser.newPage({ viewport: { width: locale === "en-US" ? 1440 : 390, height: 900 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://zenmux.ai/api/v1/models", (route) => route.fulfill({ json: { data: [{ id: "vendor/balanced", output_modalities: ["text"], context_length: 128000, capabilities: { reasoning: true }, pricings: { prompt: [{ value: 1, unit: "perMTokens", currency: "USD" }], completion: [{ value: 4, unit: "perMTokens", currency: "USD" }] } }] } }));
  await page.goto(new URL("packages/ui/tests/studio-creation-fixture.html", server.resolvedUrls.local[0]).href);
  await page.evaluate(async (locale) => {
   await import("/packages/ui/src/styles.css");
   const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
   const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
   const { ServiceProvider } = await import("/packages/ui/src/hooks/useServices.tsx");
   const { TabStoreProvider } = await import("/packages/ui/src/store/TabStoreProvider.tsx");
   const { KnowledgeWorkspace } = await import("/packages/ui/src/v4/composer/knowledge/KnowledgeWorkspace.tsx");
   globalThis.enabled = []; globalThis.drafts = []; globalThis.fail = true;
   const services = {
    pluginManagementService: { setPluginEnabled: async (input) => { if (globalThis.fail) throw new Error("fixture retry"); globalThis.enabled.push(input); return { enabled: true }; } },
    skillsService: { list: async () => ({ skills: [{ name: "account-research", pluginId: "knowledge-sales@zcode-plugins-official", enabled: true, path: "/fixtures/account-research/SKILL.md" }, { name: "shipping-and-launch", pluginId: "knowledge-engineering@zcode-plugins-official", enabled: true, path: "/fixtures/shipping-and-launch/SKILL.md" }] }) },
   };
   document.body.innerHTML = '<main id="app" style="max-width:960px;margin:auto;padding:8px"></main>';
   createRoot(document.getElementById("app")).render(React.createElement(ZCodeIntlProvider, { initialLocale: locale }, React.createElement(ServiceProvider, { services }, React.createElement(TabStoreProvider, null, React.createElement(KnowledgeWorkspace, { workspacePath: "/fixture", modelSelectionView: { providers: [{ providerId: "fixture", templateId: "zenmux", models: [{ modelId: "vendor/balanced" }] }] }, onReady: (...args) => globalThis.drafts.push(args) })))));
  }, locale);
  const en = locale === "en-US";
  const next = () => page.getByRole("button", { name: en ? "Next step" : "下一步", exact: true }).click();
  await page.getByTestId("knowledge-workspace").waitFor();
  await next();
  assert.equal(await page.getByRole("button", { name: en ? "Next step" : "下一步", exact: true }).count(), 0);
  await page.getByLabel(en ? "Goal and deliverables" : "目标与交付物", { exact: true }).fill("Prepare an account brief");
  await next();
  await page.getByRole("radio", { name: en ? "Use authorized connectors" : "使用已授权的连接器" }).check();
  await page.getByRole("button", { name: en ? "Configure connectors" : "配置连接器" }).waitFor();
  await next();
  const model = page.getByLabel(en ? "Model (override the suggestion)" : "具体模型（可覆盖建议）", { exact: true });
  assert.equal(await model.inputValue(), "fixture\nvendor/balanced");
  const prepare = page.getByRole("button", { name: en ? "Enable selected domain and prepare chat draft" : "启用所选领域并生成对话草稿" });
  await prepare.click(); await page.getByRole("alert").filter({ hasText: "fixture retry" }).waitFor();
  await page.evaluate(() => { globalThis.fail = false; }); await prepare.click();
  await page.waitForFunction(() => globalThis.drafts.length === 1);
  const result = await page.evaluate(() => ({ enabled: globalThis.enabled, drafts: globalThis.drafts, overflow: document.documentElement.scrollWidth > innerWidth }));
  assert.equal(result.enabled.length, 1); assert.equal(result.enabled[0].scope, "workspace");
  assert.match(result.drafts[0][0], /account-research\/SKILL.md/);
  assert.equal(result.drafts[0][1].model, "vendor/balanced"); assert.equal(result.overflow, false); assert.deepEqual(errors, []);

  await page.getByRole("button", { name: en ? "1 Domain" : "1 领域", exact: true }).click();
  await page.getByRole("button", { name: en ? "Engineering lifecycle" : "工程开发流程", exact: true }).click();
  await next();
  await page.getByTestId("engineering-stages").waitFor();
  assert.equal(await page.getByTestId("engineering-stages").getByRole("button").count(), 7);
  await page.getByRole("button", { name: en ? "6. Ship" : "6. 发布", exact: true }).click();
  await next(); await next(); await prepare.click();
  await page.waitForFunction(() => globalThis.drafts.length === 2);
  const engineering = await page.evaluate(() => ({ enabled: globalThis.enabled.at(-1), draft: globalThis.drafts.at(-1)[0] }));
  assert.equal(engineering.enabled.pluginId, "knowledge-engineering@zcode-plugins-official");
  assert.match(engineering.draft, /shipping-and-launch\/SKILL.md/);
  assert.match(engineering.draft, en ? /explicit task authorization/ : /任务明确授权/);
  assert.deepEqual(errors, []);
  console.log(locale, "guided professional + six-stage engineering flow, retry, skill and model selection passed");
  await page.close();
 }
} finally { await browser.close(); await server.close(); }
