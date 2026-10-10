import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZCODE_PACKAGED_RESOURCES_PATH_ENV } from "@zcode/shared";
import { findZCodeAgentRuntimeNodeBundle } from "../src/runtime-tools/providerRuntimeResolver.ts";
import { resolveDefaultZCodeAgentCommand } from "../src/zcode-agent/zcodeAgentProcessManager.ts";

test("installed utility process resolves its Agent bundle from Main's resource path", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-installed-agent-"));
  const originalCwd = process.cwd();
  const originalResources = process.env[ZCODE_PACKAGED_RESOURCES_PATH_ENV];
  const originalCommand = process.env.ZCODE_AGENT_SERVER_COMMAND;
  try {
    const resources = join(root, "resources");
    const bundle = join(resources, "glm", "zcode.cjs");
    await mkdir(join(resources, "glm"), { recursive: true });
    await writeFile(bundle, "// test Agent bundle");
    // 已安装应用可能从源码 checkout 启动；开发入口不能抢走包内 Agent。
    const sourceEntry = join(root, "apps", "zcode-cli", "packages", "cli", "src", "main.ts");
    const tsxEntry = join(root, "node_modules", ".bin", "tsx");
    await mkdir(join(root, "apps", "zcode-cli", "packages", "cli", "src"), {
      recursive: true,
    });
    await mkdir(join(root, "node_modules", ".bin"), { recursive: true });
    await writeFile(sourceEntry, "// development Agent");
    await writeFile(tsxEntry, "// development launcher");
    process.chdir(root);
    process.env[ZCODE_PACKAGED_RESOURCES_PATH_ENV] = resources;
    delete process.env.ZCODE_AGENT_SERVER_COMMAND;

    assert.equal(findZCodeAgentRuntimeNodeBundle(), bundle);
    const command = resolveDefaultZCodeAgentCommand({
      workspacePath: root,
      workspaceKey: root,
      presentationSurface: "desktop",
    });
    assert.equal(command?.storagePreparationEntry, bundle);
    assert.equal(command?.supportsStorageStartup, true);
    assert.deepEqual(command?.args?.slice(0, 3), [bundle, "app-server", "--stdio"]);

    await rm(bundle);
    assert.equal(findZCodeAgentRuntimeNodeBundle(), null);
    assert.equal(
      resolveDefaultZCodeAgentCommand({
        workspacePath: root,
        workspaceKey: root,
        presentationSurface: "desktop",
      }),
      null,
    );
  } finally {
    process.chdir(originalCwd);
    if (originalResources === undefined) delete process.env[ZCODE_PACKAGED_RESOURCES_PATH_ENV];
    else process.env[ZCODE_PACKAGED_RESOURCES_PATH_ENV] = originalResources;
    if (originalCommand === undefined) delete process.env.ZCODE_AGENT_SERVER_COMMAND;
    else process.env.ZCODE_AGENT_SERVER_COMMAND = originalCommand;
    await rm(root, { recursive: true, force: true });
  }
});
