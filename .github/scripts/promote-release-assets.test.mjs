import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const script = new URL("./promote-release-assets.mjs", import.meta.url).pathname;
const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const args = process.argv.slice(2);
const statePath = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
if (args[0] === 'release' && args[1] === 'view') {
  process.stdout.write(JSON.stringify({ assets: state.assets }));
} else if (args[0] === 'release' && args[1] === 'upload') {
  const file = args[3];
  const bytes = fs.readFileSync(file);
  state.assets.push({
    name: path.basename(file),
    apiUrl: 'https://api.github.com/repos/owner/repo/releases/assets/' + state.nextId++,
    size: bytes.length,
    digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex'),
  });
  if (process.env.FAKE_GH_CORRUPT === '1') state.assets.at(-1).digest = 'sha256:wrong';
  save();
} else if (args[0] === 'api' && args[1] === '-X' && args[2] === 'PATCH') {
  const id = args[3].split('/').at(-1);
  const asset = state.assets.find((item) => item.apiUrl.endsWith('/' + id));
  if (!asset) process.exit(2);
  if (process.env.FAKE_GH_FAIL_RENAME_STAGED === '1' && asset.name.includes('.refresh-')) process.exit(3);
  asset.name = args[5].slice('name='.length);
  save();
  process.stdout.write('{}');
} else if (args[0] === 'api' && args[1] === '-X' && args[2] === 'DELETE') {
  const id = args[3].split('/').at(-1);
  state.assets = state.assets.filter((item) => !item.apiUrl.endsWith('/' + id));
  save();
} else {
  process.stderr.write('unexpected gh call: ' + args.join(' '));
  process.exit(2);
}
`;

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "zencode-promote-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ghPath = join(directory, "gh");
  const statePath = join(directory, "state.json");
  const packagePath = join(directory, "ZenCode-3.14.26-win-x64.exe");
  await writeFile(ghPath, fakeGh);
  await chmod(ghPath, 0o755);
  await writeFile(packagePath, "new installer bytes");
  await writeFile(
    statePath,
    JSON.stringify({
      nextId: 2,
      assets: [
        {
          name: "ZenCode-3.14.26-win-x64.exe",
          apiUrl: "https://api.github.com/repos/owner/repo/releases/assets/1",
          size: 3,
          digest: "sha256:old",
        },
      ],
    }),
  );
  return { directory, packagePath, statePath };
}

test("validated staging replaces the canonical asset and removes its backup", async (t) => {
  const { directory, packagePath, statePath } = await fixture(t);
  const { stdout } = await execFileAsync(
    process.execPath,
    [script, "v3.14.26", "owner/repo", "123-1", packagePath],
    {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, FAKE_GH_STATE: statePath },
    },
  );
  const expected = `sha256:${createHash("sha256").update("new installer bytes").digest("hex")}`;
  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.deepEqual(
    state.assets.map((asset) => asset.name),
    ["ZenCode-3.14.26-win-x64.exe"],
  );
  assert.equal(state.assets[0].digest, expected);
  assert.match(stdout, new RegExp(expected));
});

test("staging hash mismatch leaves the old release asset intact", async (t) => {
  const { directory, packagePath, statePath } = await fixture(t);
  await assert.rejects(
    execFileAsync(process.execPath, [script, "v3.14.26", "owner/repo", "123-1", packagePath], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        FAKE_GH_STATE: statePath,
        FAKE_GH_CORRUPT: "1",
      },
    }),
  );
  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(
    state.assets.find((asset) => asset.name === "ZenCode-3.14.26-win-x64.exe")?.digest,
    "sha256:old",
  );
  assert.ok(state.assets.some((asset) => asset.name.endsWith(".refresh-123-1")));
});

test("failed canonical rename restores the old release asset", async (t) => {
  const { directory, packagePath, statePath } = await fixture(t);
  await assert.rejects(
    execFileAsync(process.execPath, [script, "v3.14.26", "owner/repo", "123-1", packagePath], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        FAKE_GH_STATE: statePath,
        FAKE_GH_FAIL_RENAME_STAGED: "1",
      },
    }),
  );
  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(
    state.assets.find((asset) => asset.name === "ZenCode-3.14.26-win-x64.exe")?.digest,
    "sha256:old",
  );
  assert.ok(state.assets.some((asset) => asset.name.endsWith(".refresh-123-1")));
});
