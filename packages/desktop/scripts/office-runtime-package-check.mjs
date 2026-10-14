import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export function assertOfficeRuntimeChecksum({
  binaryPath,
  asset = basename(binaryPath),
  release,
  allowSignedMac = false,
}) {
  const expected = release.assets[asset];
  if (!expected) throw new Error(`[OfficeCLI package] asset is not pinned: ${asset}`);
  const actual = createHash("sha256").update(readFileSync(binaryPath)).digest("hex");
  if (actual !== expected) {
    const expectedTeam = release.packagedSignatureTeams?.[asset];
    if (allowSignedMac && expectedTeam) {
      try {
        const verify = spawnSync(
          "/usr/bin/codesign",
          ["--verify", "--strict", "--verbose=0", binaryPath],
          { encoding: "utf8", stdio: "ignore" },
        );
        if (verify.status !== 0) throw new Error("invalid codesign");
        const details = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", binaryPath], {
          encoding: "utf8",
        });
        const team = `${details.stdout}\n${details.stderr}`.match(/TeamIdentifier=([A-Z0-9]+)/u)?.[1];
        if (team === expectedTeam) return;
      } catch {
        // Fall through to the checksum error: an invalid or differently signed binary is rejected.
      }
    }
    throw new Error(
      `[OfficeCLI package] checksum mismatch for ${asset}: expected ${expected}, got ${actual}`,
    );
  }
}
