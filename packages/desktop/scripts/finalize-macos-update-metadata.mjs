import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { releaseFileMetadata } from "./release-file-metadata.mjs";

export async function finalizeMacUpdateMetadata({ distDir, version, write = false }) {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("A release version is required");
  const metadataPath = join(distDir, "latest-mac.yml");
  const metadata = YAML.parse(await readFile(metadataPath, "utf8"));
  if (metadata?.version !== version || !Array.isArray(metadata.files)) {
    throw new Error("latest-mac.yml version or files are invalid");
  }

  const zipName = `ZenCode-${version}-mac-arm64.zip`;
  const dmgName = `ZenCode-${version}-mac-arm64.dmg`;
  const expected = new Map();
  for (const name of [zipName, dmgName]) {
    if (metadata.files.filter((file) => file?.url === name).length !== 1) {
      throw new Error(`latest-mac.yml must reference ${name} exactly once`);
    }
    expected.set(name, await releaseFileMetadata(join(distDir, name)));
  }

  for (const file of metadata.files) {
    const actual = expected.get(file.url);
    if (!actual) continue;
    if (!write && (file.sha512 !== actual.sha512 || file.size !== actual.size)) {
      throw new Error(`${file.url === dmgName ? "DMG" : "ZIP"} metadata mismatch`);
    }
    file.sha512 = actual.sha512;
    file.size = actual.size;
  }
  const zip = expected.get(zipName);
  if (!write && (metadata.path !== zipName || metadata.sha512 !== zip.sha512)) {
    throw new Error("ZIP primary metadata mismatch");
  }
  metadata.path = zipName;
  metadata.sha512 = zip.sha512;
  if (write) await writeFile(metadataPath, YAML.stringify(metadata), "utf8");
  return { metadataPath, zipName, dmgName };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const write = process.argv[2] === "--write";
  const offset = write ? 3 : 2;
  const distDir = process.argv[offset];
  const version = process.argv[offset + 1];
  if (!distDir || !version) {
    throw new Error("Usage: finalize-macos-update-metadata.mjs [--write] <dist-dir> <version>");
  }
  const result = await finalizeMacUpdateMetadata({ distDir, version, write });
  process.stdout.write(`${write ? "wrote" : "verified"} ${result.metadataPath}\n`);
}
