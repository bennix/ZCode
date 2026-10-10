import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("bundled Computer Use listing covers every supported native platform", async () => {
  const manifest = JSON.parse(await readFile(new URL("../.zcode-plugin/plugin.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "computer-use");
  for (const platform of ["macOS", "Windows", "Linux"]) {
    assert.match(manifest.description, new RegExp(platform));
  }
});
