import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertOfficeRuntimeChecksum } from "./office-runtime-package-check.mjs";

test("packaged OfficeCLI must match the pinned release checksum", async () => {
  const directory = await mkdtemp(join(tmpdir(), "officecli-package-check-"));
  const binaryPath = join(directory, "officecli-mac-arm64");
  const content = Buffer.from("verified OfficeCLI fixture");
  const digest = "8a9f2c0c2bcbb73c5a869d0a7b1d6cd6046b9508e135bfa700bc4c57c39bcd18";
  try {
    await writeFile(binaryPath, content);
    assert.throws(
      () => assertOfficeRuntimeChecksum({ binaryPath, release: { assets: { "officecli-mac-arm64": digest } } }),
      /checksum mismatch/,
    );
    const { createHash } = await import("node:crypto");
    const actual = createHash("sha256").update(content).digest("hex");
    assert.doesNotThrow(() =>
      assertOfficeRuntimeChecksum({ binaryPath, release: { assets: { "officecli-mac-arm64": actual } } }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
