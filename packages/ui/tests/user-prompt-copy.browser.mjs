import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  esbuild: { jsx: "automatic" },
  server: { port: 0, watch: null },
  optimizeDeps: { entries: [] },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
  plugins: [
    {
      name: "copy-fixture",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/") return next();
          res.setHeader("Content-Type", "text/html");
          res.end('<html><body><div id="app"></div></body></html>');
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { PlatformProvider } = await import("/packages/ui/src/hooks/usePlatform.tsx");
    const { ConversationRowView } = await import("/packages/ui/src/v4/ConversationRowView.tsx");
    const { TooltipProvider } = await import("/packages/ui/src/components/ui/tooltip.tsx");
    const { assembleConversationContext } =
      await import("/packages/ui/src/v4/composer/contextAssembler.ts");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedPrompt = text;
        },
      },
    });
    const root = createRoot(document.getElementById("app"));
    window.renderPrompt = ({ body, environment = false, epilogue = false }) => {
      const block = assembleConversationContext({
        workspacePath: "/workspace/example",
        capturedAt: "2026-10-23T00:00:00.000Z",
        git: { worktreePath: "/workspace/example", dirty: false },
        widgets: [],
      }).userContextBlock;
      const text = environment ? `${body}\n\n${block}` : body;
      const row = {
        kind: "userInput",
        rowId: 7,
        text: epilogue ? `${text}\n\nInternal engine epilogue` : text,
        ...(epilogue ? { epilogueStart: text.length } : {}),
        entityId: "input-1",
        attachments: [],
      };
      window.originalPromptRow = row;
      root.render(
        React.createElement(
          ZCodeIntlProvider,
          { initialLocale: "en-US" },
          React.createElement(
            PlatformProvider,
            { platform: {} },
            React.createElement(
              TooltipProvider,
              null,
              React.createElement(ConversationRowView, {
                row,
                context: {
                  workspacePath: "/workspace/example",
                  theme: "light",
                  codePreviewSettings: {},
                },
              }),
            ),
          ),
        ),
      );
    };
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scenario of [
      {
        body: "Add MCP server at https://example.com/mcp. Let user handle browser sign in.",
        environment: true,
      },
      {
        body: "普通中文正文\n第二行与 https://example.com/page",
        environment: true,
        epilogue: true,
      },
      { body: "plain prompt without suffix" },
      { body: 'Keep this example: <zencode_context version="1">incomplete</zencode_context>' },
    ]) {
      await page.evaluate((scenario) => {
        window.copiedPrompt = null;
        window.renderPrompt(scenario);
      }, scenario);
      await page.getByTestId("v4-copy-7").click();
      await page.waitForFunction(() => window.copiedPrompt !== null);
      assert.equal(await page.evaluate(() => window.copiedPrompt), scenario.body);
      if (scenario.environment)
        assert.match(await page.evaluate(() => window.originalPromptRow.text), /<zencode_context/u);
    }
  }
  console.log(
    "PASS: actual user-row copy excludes environment/engine suffixes, preserves user URLs and malformed examples, on desktop and mobile.",
  );
} finally {
  await browser.close();
  await server.close();
}
