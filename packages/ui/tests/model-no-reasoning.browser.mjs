import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  esbuild: { jsx: "automatic" },
  server: { port: 5195, hmr: false, watch: null },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const modelId of ["anthropic/claude-haiku-5.5", "openai/gpt-6-astra", "custom/example"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(
      new URL("packages/ui/tests/studio-creation-fixture.html", server.resolvedUrls.local[0]).href,
    );
    await page.evaluate(async (modelId) => {
      const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
      const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
      const { ProviderModelReasoningSettings } =
        await import("/packages/ui/src/settings/model-provider-section/ProviderModelSettingsGroups.tsx");
      const { createProviderModelDraftValues, resolveProviderModelDraftCommit } =
        await import("/packages/ui/src/settings/model-provider-section/ProviderModelMetadata.ts");
      const config = {
        enabled: true,
        properties: { contextWindow: 32768, inputFormat: { supportsText: true } },
        optionSpecs: {
          reasoningLevel: { values: ["low", "high"], map: '{"reasoning_effort": reasoningLevel}' },
          maxOutputTokens: { max: 1024, map: '{"max_tokens": maxOutputTokens}' },
        },
      };
      const model = {
        modelId,
        config,
        inheritedConfig: config,
        personalConfig: {},
        useRecommendedConfig: true,
      };
      function Editor() {
        const [draft, setDraft] = React.useState(() => createProviderModelDraftValues(model));
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(ProviderModelReasoningSettings, {
            draft,
            inheritedConfig: config,
            onDraftChange: (patch) =>
              setDraft((current) => ({
                ...current,
                ...patch,
                overriddenFieldsValue: [
                  ...new Set([...current.overriddenFieldsValue, ...Object.keys(patch)]),
                ],
              })),
          }),
          React.createElement(
            "button",
            {
              onClick: () => {
                globalThis.result = resolveProviderModelDraftCommit({ currentModel: model, draft });
              },
            },
            "Save",
          ),
        );
      }
      document.body.innerHTML = '<div id="app"></div>';
      createRoot(document.getElementById("app")).render(
        React.createElement(
          ZCodeIntlProvider,
          { initialLocale: "zh-CN" },
          React.createElement(Editor),
        ),
      );
    }, modelId);
    await page.getByRole("button", { name: "无需思考", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const saved = await page.evaluate(async () => {
      const { compileModelOptionMap } = await import("/packages/model-option-map/src/compiler.ts");
      const result = globalThis.result;
      return {
        result,
        requestPatch:
          result.status === "commit"
            ? compileModelOptionMap(
                result.model.config.optionSpecs.reasoningLevel.map,
                "reasoningLevel",
              ).evaluate("none")
            : null,
      };
    });
    assert.equal(saved.result.status, "commit");
    assert.deepEqual(saved.result.model.personalConfig.optionSpecs.reasoningLevel, {
      values: ["none"],
      map: "{}",
    });
    assert.deepEqual(saved.requestPatch, {});
    await page.close();
    console.log(`PASS no-reasoning configuration and empty request patch for ${modelId}`);
  }
} finally {
  await browser.close();
  await server.close();
}
