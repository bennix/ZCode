import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import { knowledgePluginAssets } from "./knowledge-plugin-assets.mjs";

test("eleven professional domains and engineering ship skills, license, explicit host adaptation and inert connector templates", async () => {
 assert.equal(knowledgePluginAssets.length, 12);
 for (const item of knowledgePluginAssets) {
  const root = item.relativePath;
  const manifest = JSON.parse(await readFile(`${root}/.zcode-plugin/plugin.json`, "utf8"));
  assert.ok(manifest.name.startsWith("knowledge-"));
  assert.equal(manifest.skills, "skills");
  await access(`${root}/LICENSE`);
  await access(`${root}/ZENCode-NOTICE.md`);
  await assert.rejects(access(`${root}/.mcp.json`), "connector templates must not auto-connect");
  assert.equal(item.requiresRuntime, false);
 }
});
test("DevTools package is version pinned, offline at runtime, telemetry disabled and staging complete", async () => {
 const root = "apps/zcode-cli/packages/chrome-devtools-plugin";
 const pkg = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
 assert.equal(pkg.dependencies["chrome-devtools-mcp"], "1.13.0");
 const config = JSON.parse(await readFile(`${root}/.zcode-plugin/plugin.json`, "utf8"));
 assert.equal(config.mcpServers["chrome-devtools"].command, "node");
 const launcher = await readFile(`${root}/scripts/server.mjs`, "utf8");
 assert.match(launcher, /--no-usage-statistics/); assert.match(launcher, /--no-performance-crux/); assert.match(launcher, /--isolated/);
 for (const bin of ["chrome-devtools-mcp", "chrome-devtools"]) await access(`${root}/dist/vendor/out/Default/gen/src/bin/${bin}.js`);
 for (const file of ["scripts/prepare-prebuilds.mjs", "packages/desktop/scripts/prepare-agent-node-bundle.mjs"]) {
  const source = await readFile(file, "utf8");
  assert.match(source, /knowledgePluginAssets/); assert.match(source, /@zcode\/chrome-devtools-plugin/);
 }
});

 test("engineering ships all 25 skills, nine commands and shared checklists without auto hooks", async () => {
  const root = "apps/zcode-cli/packages/knowledge-engineering-plugin";
  const skills = (await readdir(`${root}/skills`, { withFileTypes: true })).filter((item) => item.isDirectory());
  assert.equal(skills.length, 25);
  assert.equal((await readdir(`${root}/commands`)).filter((name) => name.endsWith(".md")).length, 9);
  assert.ok((await readdir(`${root}/references`)).length > 0);
  const manifest = JSON.parse(await readFile(`${root}/.zcode-plugin/plugin.json`, "utf8"));
  assert.equal(manifest.hooks, undefined);
  for (const skill of ["spec-driven-development", "planning-and-task-breakdown", "incremental-implementation", "test-driven-development", "code-review-and-quality", "shipping-and-launch", "using-agent-skills"]) {
    assert.match(await readFile(`${root}/skills/${skill}/SKILL.md`, "utf8"), /ZenCode integration/);
  }
  assert.match(await readFile(`${root}/commands/ship.md`, "utf8"), /knowledge-engineering:shipping-and-launch/);
});
