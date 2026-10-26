import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRemoteCdnBaseVersionMatches, buildReleaseBaseCandidates, buildComponentArtifactUrlCandidates } from "../src/remote/remoteAssetCdn.js";
test("GitHub manifest and component requests stay within the pinned release", () => {
  const base = "https://github.com/bennix/ZCode/releases/download/v3.14.36";
  assert.deepEqual(buildReleaseBaseCandidates([base], "3.14.36"), [base]);
  assert.deepEqual(buildComponentArtifactUrlCandidates([base], "remote-linux-x64-node.tar.gz", "3.14.36"), [`${base}/remote-linux-x64-node.tar.gz`]);
  assert.doesNotThrow(() => assertRemoteCdnBaseVersionMatches([base], "3.14.36"));
  assert.throws(() => assertRemoteCdnBaseVersionMatches([base], "3.14.37"), /版本不匹配/u);
});

test("custom CDN component paths preserve existing cross-version storage", () => {
  const base = "https://example.com/releases/3.14.36";
  assert.deepEqual(buildReleaseBaseCandidates([base], "3.14.36"), [base]);
  assert.deepEqual(buildComponentArtifactUrlCandidates([base], "components/node.tar.gz", "3.14.36"), ["https://example.com/releases/components/node.tar.gz", `${base}/components/node.tar.gz`]);
});
