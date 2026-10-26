import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const server = await createServer({
  configFile: false,
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  root: process.cwd(),
  server: { port: 5198, hmr: false, watch: null },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(msg.text());
  });
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto("http://localhost:5198/packages/ui/tests/studio-creation-fixture.html");
  await page.evaluate(async () => {
    await import("/packages/ui/src/styles.css");
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { PlatformProvider } = await import("/packages/ui/src/hooks/usePlatform.tsx");
    const { ServiceProvider } = await import("/packages/ui/src/hooks/useServices.tsx");
    const { StudioPanel } = await import("/packages/ui/src/v4/composer/studio/StudioPanel.tsx");
    const { readStudioMediaLibrary } =
      await import("/packages/ui/src/v4/composer/studio/studioMediaStore.ts");
    const settings = { studioMediaLibrary: readStudioMediaLibrary() };
    globalThis.nativeFetch = globalThis.fetch;
    globalThis.imageRequests = [];
    globalThis.designRequests = [];
    globalThis.saved = [];
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith("blob:") || String(url).startsWith("data:"))
        return globalThis.nativeFetch(url, options);
      const request = JSON.parse(options.body);
      if (request.instances) {
        globalThis.imageRequests.push(request);
        return Response.json({
          predictions: [
            {
              bytesBase64Encoded:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            },
          ],
        });
      }
      if (!request.messages[0].content.startsWith("Create a polished")) {
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "FINAL: A person running in a park" }, finish_reason: "stop" }] })}\n\n`,
        );
      }
      globalThis.designRequests.push(request);
      const content = request.messages[1].content;
      const revision = JSON.parse(Array.isArray(content) ? content[0].text : content).feedback;
      const text =
        "<!doctype html><html><head></head><body><h1>" +
        (revision ? "Revised" : "Initial") +
        "</h1><button onclick=\"this.textContent='Clicked'\">Try</button>" +
        (Array.isArray(content) ? '<img src="{{STUDIO_ASSET}}">' : "") +
        "</body></html>";
      if (globalThis.holdDesign)
        return new Response(
          new ReadableStream({
            start(c) {
              options.signal.addEventListener("abort", () =>
                c.error(new DOMException("Aborted", "AbortError")),
              );
            },
          }),
        );
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\n`,
      );
    };
    document.body.innerHTML = '<div id="app"></div>';
    const view = {
      providers: [
        {
          config: {
            access: { type: "api-key", apiKey: "test" },
            api: { baseUrl: "https://zenmux.ai/api/v1" },
          },
          models: [{ modelId: "test", config: { optionSpecs: {} } }],
        },
      ],
    };
    createRoot(document.getElementById("app")).render(
      React.createElement(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        React.createElement(
          PlatformProvider,
          {
            platform: {
              saveFile: async (file) => {
                globalThis.saved.push(file.suggestedName);
                return { success: true };
              },
            },
          },
          React.createElement(
            ServiceProvider,
            { services: { settingService: { get: async () => settings, update: async () => {} } } },
            React.createElement(StudioPanel, { modelSelectionView: view }),
          ),
        ),
      ),
    );
  });

  await page.getByRole("button", { name: "CoDesign", exact: true }).click();
  const design = {
    version: 1,
    brief: {
      goal: "A report",
      audience: "Readers",
      platform: "responsive-web",
      palette: "light-neutral",
      typography: "system-ui",
      layout: "adaptive-grid",
      mood: "restrained",
      density: "comfortable",
      constraints: "",
    },
    html: '<!doctype html><html><head><style>h1{color:var(--accent)}</style></head><body><h1>Original title</h1><p>Sibling stays</p><img src="{{IMAGE:hero}}"></body></html>',
    codesign: {
      kind: "report",
      images: [{ id: "hero", prompt: "A forest", purpose: "hero", ratio: "1:1", alt: "Forest" }],
      tweaks: [
        { id: "accent", label: "Accent", token: "--accent", kind: "color", value: "#112233" },
      ],
      comments: [],
    },
  };
  await page.getByLabel("Import design file").setInputFiles({
    name: "design.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(design)),
  });
  await page.getByRole("heading", { name: "Original title" }).count();
  const frame = page.frameLocator("iframe");
  await frame.getByRole("heading", { name: "Original title" }).waitFor();
  await page.getByLabel("Accent", { exact: true }).fill("#abcdef");
  await frame.getByRole("heading").waitFor();
  assert.equal(
    await frame.getByRole("heading").evaluate((el) => getComputedStyle(el).color),
    "rgb(171, 205, 239)",
  );
  await page.getByLabel("Select an element in the preview").check();
  await frame.locator("script:not([type])").waitFor({ state: "attached" });
  await frame.getByRole("heading").click();
  await page.getByText("zc-0 · Original title", { exact: true }).waitFor();
  await page.getByLabel("Describe changes to the selected element").fill("Change title");
  await page.evaluate(() => {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      const supplied = JSON.parse(request.messages[1].content);
      const content = JSON.stringify({
        elementId: supplied.elementId,
        html: "<h1>Updated title</h1>",
      });
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\n`,
      );
    };
  });
  await page.getByRole("button", { name: "Edit selected element", exact: true }).click();
  await frame.getByRole("heading", { name: "Updated title" }).waitFor();
  assert.equal(await frame.getByText("Sibling stays").textContent(), "Sibling stays");
  await page.getByRole("button", { name: "Export design file", exact: true }).click();
  assert.ok(
    (await page.evaluate(() => globalThis.saved)).includes("zencode-design.zencode-design.json"),
  );
  const invalid = {
    ...design,
    codesign: {
      ...design.codesign,
      images: [design.codesign.images[0], design.codesign.images[0]],
    },
  };
  await page.getByLabel("Import design file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await page.getByRole("alert").filter({ hasText: "Duplicate" }).waitFor();
  assert.equal(await frame.getByRole("heading").textContent(), "Updated title");
  await page.evaluate(() => {
    globalThis.fetch = async (_url, options) => {
      if (String(_url).startsWith("data:") || String(_url).startsWith("blob:"))
        return globalThis.nativeFetch(_url, options);
      globalThis.codesignImageRequest = { ...JSON.parse(options.body), url: String(_url) };
      return Response.json({
        data: [
          {
            b64_json:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          },
        ],
      });
    };
  });
  await page.getByRole("button", { name: "Generate assets (1)", exact: true }).click();
  await page.getByRole("button", { name: "Generate assets (0)", exact: true }).waitFor();
  const imageRequest = await page.evaluate(() => globalThis.codesignImageRequest);
  assert.match(imageRequest.url, /publishers\/openai\/models\/gpt-image-2:predict$/);
  assert.equal(imageRequest.parameters.imageSize, "1024x1024");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByText("Saved locally", { exact: true }).waitFor();
  const id = await page.getByLabel("Design projects", { exact: true }).inputValue();
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await page.getByLabel("Design projects", { exact: true }).selectOption(id);
  await frame.getByRole("heading", { name: "Updated title" }).waitFor();
  assert.equal(await page.getByLabel("Accent", { exact: true }).inputValue(), "#abcdef");
  assert.equal(await page.getByLabel("Format", { exact: true }).inputValue(), "report");
  assert.ok(
    await page.getByRole("button", { name: "Generate assets (0)", exact: true }).isDisabled(),
  );
  const results = await page.evaluate(async () => {
    const d = await import("/packages/ui/src/v4/composer/studio/coDesignDocument.ts");
    const g = await import("/packages/ui/src/v4/composer/studio/coDesignGeneration.ts");
    const base = d.prepareCoDesignHtml(
      "<!doctype html><html><head></head><body><h1>One</h1><p>Two</p></body></html>",
    );
    let rejected = false;
    try {
      d.replaceCoDesignElement(base, "zc-0", "<h1><style>p{display:none}</style>bad</h1>");
    } catch {
      rejected = true;
    }
    const state = {
      kind: "poster",
      tweaks: [],
      comments: [],
      images: ["one", "two"].map((id) => ({
        id,
        prompt: "Tree",
        purpose: "hero",
        ratio: "1:1",
        alt: "Tree",
      })),
    };
    const commits = [];
    let calls = 0;
    globalThis.fetch = globalThis.nativeFetch;
    try {
      await g.generateCoDesignImages({
        html: "{{IMAGE:one}} {{IMAGE:two}}",
        state,
        apiKey: "test",
        model: "google/gemini-3-pro-image-preview",
        signal: new AbortController().signal,
        onProgress: () => {},
        onCommit: (html, state) => commits.push({ html, state }),
        generate: async () => {
          if (++calls === 2) throw new Error("upstream failed");
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
        },
      });
    } catch {}
    const controller = new AbortController();
    let cancelledCommits = 0;
    try {
      await g.generateCoDesignImages({
        html: "{{IMAGE:one}} {{IMAGE:two}}",
        state,
        apiKey: "test",
        model: "google/gemini-3-pro-image-preview",
        signal: controller.signal,
        onProgress: () => {},
        onCommit: () => cancelledCommits++,
        generate: async () => {
          controller.abort();
          return "data:image/png;base64,AA==";
        },
      });
    } catch {}
    return {
      rejected,
      commits,
      calls,
      cancelledCommits,
      stale: d.acceptCoDesignSelection(
        { type: "zencode-codesign-selection", nonce: "old", elementId: "zc-0", quote: "x" },
        "new",
      ),
    };
  });
  assert.equal(results.rejected, true);
  assert.equal(results.stale, null);
  assert.equal(results.calls, 2);
  assert.equal(results.commits.length, 1);
  assert.equal(results.commits[0].state.images[0].id, "two");
  assert.equal(results.cancelledCommits, 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.ok(await page.getByTestId("studio-codesign-controls").isVisible());
  console.log(
    "PASS: CoDesign import, tweaks, preview selection, scoped edit, sibling preservation, export, invalid import, sequential partial failure, cancellation, stale selection; mobile and desktop",
  );
} finally {
  await browser.close();
  await server.close();
}
