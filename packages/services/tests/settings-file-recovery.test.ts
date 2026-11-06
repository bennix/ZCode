import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingService } from "../src/setting/settingService.js";

test("settings entrypoint backs up corrupt JSON and accepts a subsequent preference update", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-settings-recovery-"));
  const previousHome = process.env.ZCODE_DESKTOP_HOME_DIR;
  process.env.ZCODE_DESKTOP_HOME_DIR = root;
  const settingsDir = join(root, ".zcode", "v2");
  const path = join(settingsDir, "setting.json");
  const invalidJson = ":wq\n";
  try {
    await mkdir(settingsDir, { recursive: true });
    await writeFile(path, invalidJson);
    const service = createSettingService();
    const defaults = await service.get();
    assert.ok(defaults);
    const backups = (await readdir(settingsDir)).filter((name) =>
      name.startsWith("setting.json.corrupt-"),
    );
    assert.equal(backups.length, 1);
    assert.equal(await readFile(join(settingsDir, backups[0]), "utf8"), invalidJson);
    await assert.rejects(readFile(path), { code: "ENOENT" });
    await service.update({ locale: "en-US" });
    assert.equal((await createSettingService().get()).locale, "en-US");
    assert.equal(JSON.parse(await readFile(path, "utf8")).locale, "en-US");
    assert.equal(await readFile(join(settingsDir, backups[0]), "utf8"), invalidJson);
  } finally {
    if (previousHome === undefined) delete process.env.ZCODE_DESKTOP_HOME_DIR;
    else process.env.ZCODE_DESKTOP_HOME_DIR = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});
