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
  server: { port: 5197, hmr: false, watch: null },
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
  await page.goto("http://localhost:5197/packages/ui/tests/studio-creation-fixture.html");
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
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator('[data-reference-kind="face"]').click({ position: { x: 8, y: 8 } });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-reference-kind")),
    "face",
  );
  await page.evaluate(() => {
    const card = document.querySelector('[data-reference-kind="face"]');
    const data = new DataTransfer();
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      ),
      (char) => char.charCodeAt(0),
    );
    data.items.add(new File([bytes], "shot.png", { type: "" }));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    card?.dispatchEvent(event);
  });
  await page.getByLabel("Reference role", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Reference role", { exact: true }).inputValue(), "face");
  await page.getByLabel("Remove reference", { exact: true }).click();
  await page.getByLabel("Pose preset", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Move joint", exact: true }).click();
  await page.getByRole("button", { name: "Rotate joint", exact: true }).click();
  await page.screenshot({ path: "/tmp/zencode-pose-mobile.png", fullPage: true });
  await page.getByText("Adjust joints and body", { exact: true }).click();
  await page.getByLabel("Height", { exact: true }).fill("180");
  await page.getByLabel("People", { exact: true }).selectOption("2");
  await page.getByLabel("Gender", { exact: true }).selectOption("male");
  await page.getByLabel("Selected person", { exact: true }).selectOption({ label: "2" });
  assert.equal(await page.getByLabel("Gender", { exact: true }).inputValue(), "female");
  await page.getByLabel("Gender", { exact: true }).selectOption("male");
  await page.getByLabel("Selected person", { exact: true }).selectOption({ label: "1" });
  assert.equal(await page.getByLabel("Gender", { exact: true }).inputValue(), "male");
  await page.getByLabel("Pose preset", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Use as body reference", exact: true }).click();
  await page.getByLabel("Reference role", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Reference role", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Use as body reference", exact: true }).click();
  assert.equal(await page.getByLabel("Reference role", { exact: true }).count(), 1);
  await page.getByLabel("Remove reference", { exact: true }).click();
  for (const role of ["Face identity", "Clothing", "Background", "Body / pose"])
    await page
      .getByLabel(role, { exact: true })
      .setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  assert.equal(await page.getByLabel("Color", { exact: true }).isVisible(), true);
  assert.equal(await page.getByLabel("Face identity", { exact: true }).isVisible(), false);
  assert.equal(await page.getByLabel("Pose preset", { exact: true }).isVisible(), false);
  assert.equal(await page.getByLabel("Reference role", { exact: true }).count(), 4);
  assert.equal(await page.getByLabel("Person", { exact: true }).count(), 2);
  await page.getByLabel("Person", { exact: true }).first().selectOption("2");
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page
    .getByLabel("What would you like to design?", { exact: true })
    .fill("A shop for local books");
  await page
    .getByLabel("Who is it for, and what should they do?", { exact: true })
    .fill("Readers finding new books");
  await page.getByRole("button", { name: "Generate prototype", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Design prototype preview"]');
  await frame.getByRole("heading", { name: "Initial" }).waitFor();
  await page.locator('iframe[title="Design prototype preview"]').scrollIntoViewIfNeeded();
  const tryButton = frame.getByRole("button", { name: "Try", exact: true });
  const clicked = frame.getByRole("button", { name: "Clicked", exact: true });
  await tryButton.click();
  try {
    await clicked.waitFor({ timeout: 1000 });
  } catch {
    await tryButton.click();
    await clicked.waitFor();
  }
  assert.equal(
    await page.locator('iframe[title="Design prototype preview"]').getAttribute("sandbox"),
    "allow-scripts",
  );
  await page.getByRole("button", { name: "Mobile preview", exact: true }).click();
  await page
    .getByLabel("3 · Describe the next change", { exact: true })
    .fill("Make the headline clearer");
  await page.getByRole("button", { name: "Refine with feedback", exact: true }).click();
  await frame.getByRole("heading", { name: "Revised" }).waitFor();
  const requests = await page.evaluate(() => globalThis.designRequests);
  assert.equal(JSON.parse(requests[1].messages[1].content).feedback, "Make the headline clearer");
  assert.match(JSON.parse(requests[1].messages[1].content).previousHtml, /Initial/);
  await page.getByRole("button", { name: "Export HTML", exact: true }).click();
  await page.getByRole("button", { name: "Export DESIGN.md", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => globalThis.saved), [
    "zencode-prototype.html",
    "DESIGN.md",
  ]);
  await page.getByLabel("Design versions", { exact: true }).selectOption("0");
  await frame.getByRole("heading", { name: "Initial" }).waitFor();
  await page.evaluate(() => {
    globalThis.holdDesign = true;
  });
  await page.getByLabel("3 · Describe the next change", { exact: true }).fill("Another change");
  await page.getByRole("button", { name: "Refine with feedback", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await frame.getByRole("heading", { name: "Initial" }).waitFor();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  assert.equal(await page.getByLabel("Reference role", { exact: true }).count(), 4);
  await page
    .getByPlaceholder("Describe the image, video, or the talk", { exact: true })
    .fill("A person running in a park");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForFunction(() => globalThis.imageRequests.length === 4);
  await page.getByRole("button", { name: "Generate", exact: true }).waitFor({ state: "visible" });
  const requestsImages = await page.evaluate(() =>
    globalThis.imageRequests.map((item) => item.instances[0]),
  );
  assert.equal(requestsImages[0].referenceImages.length, 1);
  assert.match(requestsImages[0].prompt, /Convert mannequins/);
  assert.deepEqual(
    requestsImages.slice(1).map((item) => item.referenceImages.length),
    [2, 2, 2],
  );
  assert.match(requestsImages[1].prompt, /clothing reference/);
  assert.match(requestsImages[2].prompt, /ENTIRE background/);
  assert.match(requestsImages[3].prompt, /person 2/);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Generate" && !button.disabled,
    ),
  );
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Use current image", exact: true }).click();
  await page.getByRole("img", { name: "Design asset", exact: true }).waitFor();
  await page.evaluate(() => {
    globalThis.holdDesign = false;
  });
  await page
    .getByLabel("3 · Describe the next change", { exact: true })
    .fill("Use the generated portrait as the hero image");
  await page.getByRole("button", { name: "Refine with feedback", exact: true }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Refine with feedback" && button.disabled,
    ),
  );
  await frame.locator("img").waitFor();
  assert.match(await frame.locator("img").getAttribute("src"), /^data:image/);
  const assetRequest = await page.evaluate(() => globalThis.designRequests.at(-1));
  assert.equal(assetRequest.messages[1].content[1].type, "image_url");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Desktop preview", exact: true }).click();
  await page.screenshot({ path: "/tmp/zencode-design-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByText("Saved locally", { exact: true }).waitFor();
  const projectId = await page.getByLabel("Design projects", { exact: true }).inputValue();
  assert.ok(projectId);
  await page.getByRole("button", { name: "New design", exact: true }).click();
  assert.equal(await page.locator('iframe[title="Design prototype preview"]').count(), 0);
  await page.getByLabel("Design projects", { exact: true }).selectOption(projectId);
  await frame.getByRole("heading", { name: "Revised" }).waitFor();
  await page.getByRole("img", { name: "Design asset", exact: true }).waitFor();
  const persisted = await page.evaluate(async () => {
    const { listStudioDesigns } = await import("/packages/ui/src/store/studioDesignHistory.ts");
    return (await listStudioDesigns())[0];
  });
  assert.equal(persisted.brief.goal, "A shop for local books");
  assert.equal(persisted.versions.length, 3);
  assert.ok(!JSON.stringify(persisted).includes("apiKey"));
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="Design projects"]').options.length === 1,
  );
  const staleRejected = await page.evaluate(async (record) => {
    const { saveStudioDesign } = await import("/packages/ui/src/store/studioDesignHistory.ts");
    try {
      await saveStudioDesign(record);
      return false;
    } catch {
      return true;
    }
  }, persisted);
  assert.equal(staleRejected, true);

  console.log(
    "PASS: 3D pose presets, shape/multiple people, PNG capture/replacement, classified references, four isolated image requests, design generation/interactive preview/revision/versions/export/cancellation, shared image assets, project save/reopen/delete and stale-save protection at mobile width",
  );
} finally {
  await browser.close();
  await server.close();
}
