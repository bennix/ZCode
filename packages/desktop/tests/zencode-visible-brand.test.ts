import assert from "node:assert/strict";
import { test } from "node:test";
import { getWebAuthCopy } from "../../web/src/auth/webAuthLocale.js";
import { indicatorDataUrl, indicatorWindowSize } from "../src/main/windowsCuaOperationIndicatorContent.js";
import { formatCanonicalPluginName } from "../../shared/src/plugin-display-name.js";
import { OPENROUTER_ATTRIBUTION_HEADERS } from "../../shared/src/openrouter-attribution.js";

test("user-visible ZenCode branding is consistent across Web auth, desktop CUA, and integrations", () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    assert.equal(getWebAuthCopy(locale).brand, "ZenCode");
    const dataUrl = indicatorDataUrl(locale);
    const html = Buffer.from(dataUrl.split(",")[1] ?? "", "base64").toString("utf8");
    assert.match(html, /ZenCode/u);
    assert.doesNotMatch(html, />ZCode</u);
    assert.ok(indicatorWindowSize(locale).width >= 270);
  }
  assert.equal(formatCanonicalPluginName("zcode-tools", "en-US"), "ZenCode Tools");
  assert.equal(OPENROUTER_ATTRIBUTION_HEADERS["X-OpenRouter-Title"], "ZenCode");
});
