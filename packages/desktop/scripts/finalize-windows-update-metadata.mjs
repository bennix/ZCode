import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { releaseFileMetadata } from "./release-file-metadata.mjs";

export async function finalizeWindowsUpdateMetadata({ distDir, version, write = false }) {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("A release version is required");
  const metadataPath = join(distDir, "latest.yml");
  let existing;
  try {
    existing = YAML.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!write) throw new Error("latest.yml missing");
  }

  const files = [];
  for (const arch of ["x64", "arm64"]) {
    const url = `ZenCode-${version}-win-${arch}.exe`;
    const actual = await releaseFileMetadata(join(distDir, url));
    const recorded = existing?.files?.find((file) => file?.url === url);
    if (!write && (recorded?.sha512 !== actual.sha512 || recorded?.size !== actual.size)) {
      throw new Error(`${arch === "x64" ? "x64" : "ARM64"} metadata mismatch`);
    }
    files.push({ url, ...actual });
  }
  if (!write) {
    if (
      existing?.version !== version ||
      existing?.files?.length !== 2 ||
      existing?.path !== files[0].url ||
      existing?.sha512 !== files[0].sha512
    ) {
      throw new Error("latest.yml release metadata mismatch");
    }
  } else {
    await writeFile(
      metadataPath,
      YAML.stringify({
        version,
        files,
        path: files[0].url,
        sha512: files[0].sha512,
        releaseDate: existing?.releaseDate ?? new Date().toISOString(),
      }),
      "utf8",
    );
  }
  return { metadataPath, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const write = process.argv[2] === "--write";
  const offset = write ? 3 : 2;
  const distDir = process.argv[offset];
  const version = process.argv[offset + 1];
  if (!distDir || !version) {
    throw new Error("Usage: finalize-windows-update-metadata.mjs [--write] <dist-dir> <version>");
  }
  const result = await finalizeWindowsUpdateMetadata({ distDir, version, write });
  process.stdout.write(`${write ? "wrote" : "verified"} ${result.metadataPath}\n`);
}
