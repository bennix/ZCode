import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSkillDisplayDescription } from "../src/lib/builtinSkillI18n.js";

test("官方内置技能描述使用 ZenCode，第三方描述原样保留", () => {
  for (const name of ["control-browser", "plugin-creator", "web-gui-tester"]) {
    for (const locale of ["zh-CN", "en-US"] as const) {
      const description = resolveSkillDisplayDescription(
        { name, description: "fallback", path: "/zcode-plugins-official/skills", scope: "plugin" },
        locale,
      );
      assert.match(description, /ZenCode/u);
      assert.doesNotMatch(description, /\bZCode\b/u);
    }
  }
  assert.equal(
    resolveSkillDisplayDescription(
      {
        name: "control-browser",
        description: "Third-party ZCode wording",
        path: "/other",
        scope: "plugin",
      },
      "en-US",
    ),
    "Third-party ZCode wording",
  );
});
