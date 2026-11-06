import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { useComposerWorkspaceNavigation } from "./packages/ui/src/hooks/useComposerWorkspaceNavigation.ts";
      function App() {
        const nav = useComposerWorkspaceNavigation();
        return <main>
          {["conversation", "workcoder", "probes", "workspace", "studio"].map(entry =>
            <button key={entry} aria-pressed={nav.entry === entry}
              onClick={() => entry === "probes" || entry === "workspace" || entry === "studio"
                ? nav.toggle(entry) : nav.select(entry)}>{entry}</button>)}
          {nav.workcoderVisited && <section data-panel="workcoder" hidden={nav.entry !== "workcoder"}>
            <input aria-label="task" /><button onClick={nav.completeWorkcoder}>started</button>
          </section>}
          <section data-panel="probes" hidden={nav.entry !== "probes"}>probes</section>
          <section data-panel="workspace" hidden={nav.entry !== "workspace"}>workspace</section>
          <section data-panel="studio" hidden={nav.entry !== "studio"}>studio</section>
        </main>;
      }
      createRoot(document.getElementById("root")).render(<App />);
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const button = (name) => page.getByRole("button", { name, exact: true });
    await button("workcoder").click();
    await page.getByLabel("task").fill("Keep this draft");
    for (const name of [
      "probes",
      "workcoder",
      "probes",
      "conversation",
      "studio",
      "probes",
      "workspace",
      "workcoder",
    ]) {
      await button(name).click();
      assert.equal(await page.locator('button[aria-pressed="true"]').count(), 1);
      assert.equal(await button(name).getAttribute("aria-pressed"), "true");
      assert.equal(
        await page.locator("[data-panel]:visible").count(),
        name === "conversation" ? 0 : 1,
      );
    }
    assert.equal(await page.getByLabel("task").inputValue(), "Keep this draft");
    await button("started").click();
    assert.equal(await button("conversation").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-panel="workcoder"]').count(), 0);
    await button("probes").click();
    await button("probes").click();
    assert.equal(await page.locator("[data-panel]:visible").count(), 0);
    assert.equal(await button("conversation").getAttribute("aria-pressed"), "true");
    await page.close();
  }
  console.log(
    "PASS: exclusive workspace navigation, retained draft, successful launch cleanup, desktop/mobile",
  );
} finally {
  await browser.close();
}
