import { mountWorkCoderFixture } from "./workcoder-browser-fixture.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const server = await createServer({
  configFile: false,
  cacheDir: join(tmpdir(), "workcoder-vite"),
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  root: process.cwd(),
  server: { port: 5197, hmr: false, watch: null },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const locale of ["en-US", "zh-CN"]) {
    const page = await browser.newPage({
      viewport: { width: locale === "en-US" ? 1440 : 390, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      new URL("packages/ui/tests/studio-creation-fixture.html", server.resolvedUrls.local[0]).href,
    );
    await page.evaluate(mountWorkCoderFixture, locale);
    const en = locale === "en-US";
    await page.getByTestId("workcoder-workspace").waitFor();
    const mainEffort = page.getByLabel(en ? "Main session Reasoning effort" : "主会话 思考强度", {
      exact: true,
    });
    const researchEffort = page.getByLabel(
      en ? "Read-only research Reasoning effort" : "只读研究 思考强度",
      { exact: true },
    );
    assert.equal(await mainEffort.inputValue(), "low");
    assert.equal(await researchEffort.count(), 0);
    await page
      .getByTestId("workcoder-role-research")
      .getByText(en ? "No reasoning" : "无需思考", { exact: true })
      .waitFor();
    await page
      .getByLabel(en ? "Main session" : "主会话", { exact: true })
      .selectOption("synthetic\ncustom/high-only");
    assert.equal(await mainEffort.inputValue(), "high");
    await page
      .getByLabel(en ? "Main session" : "主会话", { exact: true })
      .selectOption("alternate\ncustom/alternate-model");
    assert.equal(
      await mainEffort.inputValue(),
      "medium",
      "reasoning levels belong to the selected provider",
    );
    await page
      .getByLabel(en ? "Main session" : "主会话", { exact: true })
      .selectOption("synthetic\ncustom/alternate-model");
    assert.equal(
      await mainEffort.inputValue(),
      "low",
      "switching models restores the supported default",
    );
    await mainEffort.selectOption("high");
    await page
      .getByLabel(en ? "Advisor Reasoning effort" : "顾问 思考强度", { exact: true })
      .selectOption("medium");
    await page.getByRole("button", { name: en ? "Next step" : "下一步", exact: true }).click();
    await page.evaluate(() => {
      globalThis.pickDirectory = null;
    });
    await page
      .getByRole("button", { name: en ? "Choose working directory" : "选择工作目录", exact: true })
      .click();
    assert.equal(
      await page.getByLabel(en ? "Working directory" : "工作目录", { exact: true }).inputValue(),
      "/synthetic",
    );
    await page.evaluate(() => {
      globalThis.pickDirectory = "/synthetic/lesson";
    });
    await page
      .getByRole("button", { name: en ? "Choose working directory" : "选择工作目录", exact: true })
      .click();
    assert.equal(
      await page.getByLabel(en ? "Working directory" : "工作目录", { exact: true }).inputValue(),
      "/synthetic/lesson",
    );
    const automatic = page.getByRole("checkbox", {
      name: en ? "Automatic approval" : "自动批准",
      exact: true,
    });
    assert.equal(await automatic.isChecked(), false);
    await automatic.check();
    await page
      .getByRole("textbox", { name: en ? "Describe task" : "描述任务", exact: true })
      .fill("Fix a nested React form and verify it.");
    await page.getByRole("button", { name: en ? "Next step" : "下一步", exact: true }).click();
    await page
      .getByRole("button", {
        name: en ? "Start WorkCoder task" : "启动 WorkCoder 任务",
        exact: true,
      })
      .click();
    await page.getByRole("alert").filter({ hasText: "Simulated disconnect" }).waitFor();
    await page.evaluate(() => {
      globalThis.failSend = false;
    });
    await page
      .getByRole("button", {
        name: en ? "Retry the same task submission" : "重试提交同一任务",
        exact: true,
      })
      .click();
    await page.waitForFunction(() => globalThis.sent.length === 2);
    const launch = await page.evaluate(() => ({
      created: globalThis.created,
      sent: globalThis.sent,
      agents: globalThis.agents,
    }));
    assert.equal(launch.created.length, 1);
    assert.equal(launch.created[0].mode, "yolo");
    assert.equal(launch.sent[0].epilogueStart, "Fix a nested React form and verify it.".length);
    assert.equal(
      launch.sent[0].content.slice(0, launch.sent[0].epilogueStart),
      "Fix a nested React form and verify it.",
    );
    assert.equal(await page.evaluate(() => globalThis.started), 1);
    assert.equal(launch.created[0].workspacePath, "/synthetic/lesson");
    assert.equal(launch.agents.length, 2);
    assert.equal(launch.created[0].modelSelection.modelId, "custom/alternate-model");
    assert.equal(launch.sent[0].traceId, launch.sent[1].traceId);
    assert.equal(launch.sent[0].modelSelection.options.reasoningLevel, "high");
    assert.equal(launch.sent[1].modelSelection.options.reasoningLevel, "high");
    assert.equal(
      launch.agents.find((agent) => agent.name.startsWith("workcoder-research")).modelSelection
        .options.reasoningLevel,
      "none",
    );
    assert.equal(
      launch.agents.find((agent) => agent.name.startsWith("workcoder-advisor")).modelSelection
        .options.reasoningLevel,
      "medium",
    );
    const panel = page.getByTestId("research-probes");
    await panel.locator("summary").click();
    assert.equal(await panel.getByRole("checkbox").nth(0).isChecked(), false);
    await panel.getByRole("checkbox").nth(0).check();
    await panel.getByRole("checkbox").nth(1).check();
    await page.evaluate(() => {
      const base = {
        version: 1,
        sessionId: "synthetic-session",
        turnId: "turn-one",
        occurredAt: Date.now(),
        eventSeq: 1,
      };
      for (const listener of globalThis.factListeners) {
        listener({ ...base, eventId: "start", kind: "turn.started" });
        const usage = {
          ...base,
          eventId: "usage",
          kind: "usage.delta",
          modelId: "test-model",
          inputTokens: 40,
          outputTokens: 10,
        };
        listener(usage);
        listener(usage);
        listener({
          ...base,
          eventId: "end",
          kind: "turn.terminal",
          status: "success",
          durationMs: 250,
        });
      }
      globalThis.probes.startProbe("/synthetic", "local-edit", "design.local-edit")("cancelled");
    });
    await page.waitForFunction(
      () => globalThis.probes.readProbeScope("/synthetic").records.length === 3,
    );
    await panel
      .getByRole("button", { name: en ? "Export JSON" : "导出 JSON", exact: true })
      .click();
    await panel.getByRole("button", { name: en ? "Export CSV" : "导出 CSV", exact: true }).click();
    const exported = await page.evaluate(() => globalThis.saved);
    assert.equal(exported.length, 2);
    const records = JSON.parse(exported[0].text).records;
    assert.equal(records.filter((record) => record.operation === "usage.delta").length, 1);
    assert.equal(records.find((record) => record.operation === "usage.delta").inputTokens, 40);
    assert.equal(
      records.find((record) => record.operation === "design.local-edit").status,
      "cancelled",
    );
    assert.equal(exported[0].text.includes("/synthetic"), false);
    await panel.getByRole("combobox").selectOption("tokens");
    await page.getByRole("cell", { name: "50", exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    await page
      .getByRole("button", { name: en ? "1 Assign models" : "1 分配模型", exact: true })
      .click();
    await page.evaluate(() =>
      globalThis.setCatalog({
        providers: globalThis.fullView.providers.map((provider) => ({
          ...provider,
          models: provider.models.filter((model) => model.modelId !== "anthropic/claude-haiku-5.5"),
        })),
      }),
    );
    await page.getByTestId("workcoder-workspace").getByRole("status").waitFor();
    assert.equal(await researchEffort.count(), 0);
    await page
      .getByTestId("workcoder-role-research")
      .getByText(en ? "No reasoning" : "无需思考", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: en ? "Next step" : "下一步", exact: true }).click();
    assert.equal(
      await page
        .getByRole("textbox", { name: en ? "Describe task" : "描述任务", exact: true })
        .inputValue(),
      "Fix a nested React form and verify it.",
    );
    await page.getByRole("button", { name: en ? "Next step" : "下一步", exact: true }).click();
    await page
      .getByRole("button", {
        name: en ? "Configure and start WorkCoder task" : "配置并启动 WorkCoder 任务",
        exact: true,
      })
      .click();
    await page.waitForFunction(() => globalThis.sent.length === 3);
    const added = await page.evaluate(() => globalThis.modelAdded);
    assert.equal(added.modelId, "anthropic/claude-haiku-5.5");
    assert.deepEqual(added.config.optionSpecs.reasoningLevel, { values: ["none"], map: "{}" });
    await page
      .getByRole("button", { name: en ? "1 Assign models" : "1 分配模型", exact: true })
      .click();
    await page.evaluate(() => globalThis.setCatalog(globalThis.fullView));
    await page.getByTestId("workcoder-workspace").getByRole("status").waitFor({ state: "hidden" });
    await page.screenshot({ path: `/tmp/workcoder-${locale}.png`, fullPage: true });
    await page.close();
    console.log(
      `PASS ${locale}: guided launch, model assignment, retry, probes, deduplication, export, charts, responsive layout`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
