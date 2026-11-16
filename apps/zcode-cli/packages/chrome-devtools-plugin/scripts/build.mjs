import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("chrome-devtools-mcp/package.json"));
const pkg = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
if (pkg.version !== "1.13.0" || Object.keys(pkg.dependencies ?? {}).length) throw new Error("Unexpected DevTools package version or runtime dependencies");
await mkdir(resolve(root, "dist/vendor"), { recursive: true });
for (const name of ["out", "package.json", "LICENSE"]) {
  await cp(resolve(source, name), resolve(root, "dist/vendor", name), { recursive: true });
}
console.log("Chrome DevTools 1.13.0 runtime staged");

await mkdir(resolve(root, "dist/mcp"), { recursive: true });
await writeFile(resolve(root, "dist/mcp/server.js"), 'await import("../../scripts/server.mjs");\n');
