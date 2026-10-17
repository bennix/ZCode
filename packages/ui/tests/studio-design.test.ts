import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDesignSystem,
  requireDesignDocument,
  isolateDesignDocument,
} from "../src/v4/composer/studio/studioDesign.js";
test("design specification includes requirements and responsive rules", () => {
  const brief = {
    goal: "Store",
    audience: "Buyers",
    platform: "mobile-app",
    palette: "brand-blue",
    typography: "system-ui",
    layout: "single-column",
    mood: "restrained",
    density: "compact",
    constraints: "No checkout",
  };
  const system = deriveDesignSystem(brief);
  for (const value of Object.values(brief)) assert.ok(system.includes(value));
  assert.match(system, /360px/);
});
test("incomplete model output is never admitted as a prototype", () => {
  assert.throws(() => requireDesignDocument("<html><body>partial"));
  assert.equal(
    requireDesignDocument("```html\n<!doctype html><html><body>ok</body></html>\n```"),
    "<!doctype html><html><body>ok</body></html>",
  );
});
test("preview policy precedes model scripts and disables network and embedded frames", () => {
  const html = isolateDesignDocument(
    '<!doctype html><html><head><script>fetch("https://example.com")</script></head><body>ok</body></html>',
  );
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<script>"));
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /frame-src 'none'/);
  assert.match(html, /base-uri 'none'/);
});
