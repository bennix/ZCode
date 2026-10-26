import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRemoteCdnBaseUrls } from "../src/main/remoteCdn.js";

test("GitHub releases use one version-pinned base for manifests and components", () => {
  const base = "https://github.com/bennix/ZCode/releases/download/v3.14.36";
  const before = process.env.ZCODE_CDN_BASE_URL;
  delete process.env.ZCODE_CDN_BASE_URL;
  try {
    assert.deepEqual(resolveRemoteCdnBaseUrls({ version: "3.14.36" }), [base]);
    assert.deepEqual(resolveRemoteCdnBaseUrls({ overrideBaseUrl: "https://example.com/custom/" }), ["https://example.com/custom"]);
    process.env.ZCODE_CDN_BASE_URL = "https://example.com";
    assert.deepEqual(resolveRemoteCdnBaseUrls({ version: "3.14.36" }), ["https://example.com/zcode/electron/releases/3.14.36"]);
  } finally {
    if (before === undefined) delete process.env.ZCODE_CDN_BASE_URL;
    else process.env.ZCODE_CDN_BASE_URL = before;
  }
});
