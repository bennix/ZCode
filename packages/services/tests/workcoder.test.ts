import assert from "node:assert/strict";
import { test } from "node:test";
import {
  prepareWorkCoderTask,
  sendWorkCoderTask,
  WORKCODER_MODELS,
} from "../src/workcoder/workcoder.js";
import {
  parseSubagentMarkdown,
  serializeSubagentMarkdown,
} from "../src/subagents/subagentMarkdown.js";
import type { ISubagentsService } from "../src/subagents/subagents.js";
import type { IZCodeTaskService } from "../src/session/zcodeTaskService.js";
import type { IHooksService } from "../src/hooks/hooks.js";
import type { IFileService } from "../src/file/file.js";
import type {
  IModelSelectionService,
  IProviderSettingsService,
} from "../src/model-provider/providerFacadeServices.js";
import type { AgentSummary, ModelSelection } from "@zcode/shared";

const models = Object.fromEntries(
  Object.entries(WORKCODER_MODELS).map(([role, modelId]) => [
    role,
    {
      providerId: "test-provider",
      modelId,
      options: { reasoningLevel: "low" },
    } satisfies ModelSelection,
  ]),
) as Parameters<typeof prepareWorkCoderTask>[2];
function fixture() {
  const agents: AgentSummary[] = [];
  const created: unknown[] = [];
  const sent: unknown[] = [];
  let failSend = false;
  let directoryType: "directory" | "file" = "directory";
  const configured: unknown[] = [];
  const grants: unknown[] = [];
  let hookAccepted = true;
  let configuredHooks = false;
  const hooksService = {
    loadHooks: async () => ({
      hooks: [],
      hooksEnabled: true,
      ...(configuredHooks
        ? {
            workspaceHookSnapshot: {
              bundleDigest: "a".repeat(64),
              hooks: [{ configuredEnabled: true, hookDeclarationDigest: "b".repeat(64) }],
            },
          }
        : {}),
    }),
    grantWorkspaceHookTrust: async (input: unknown) => {
      grants.push(input);
      return {
        accepted: hookAccepted,
        ...(!hookAccepted ? { reasonCode: "workspace_hooks_policy_denied" } : {}),
      };
    },
  } as unknown as IHooksService;
  const catalog: {
    providers: Array<{
      providerId: string;
      models: Array<{
        modelId: string;
        config: { optionSpecs: { reasoningLevel: { values: string[]; map: string } } };
      }>;
    }>;
  } = { providers: [{ providerId: "test-provider", models: [] }] };
  const fileService = {
    resolvePath: async ({ path }: { path: string }) => path,
    stat: async () => ({ type: directoryType }),
  } as unknown as IFileService;
  const modelSelectionService = {
    getView: async () => catalog,
  } as unknown as IModelSelectionService;
  const providerSettingsService = {
    addPersonalModel: async (providerId: string, modelId: string, config: unknown) => {
      configured.push({ providerId, modelId, config });
      catalog.providers[0].models.push({
        modelId,
        config: { optionSpecs: { reasoningLevel: { values: ["none"], map: "{}" } } },
      });
    },
  } as unknown as IProviderSettingsService;
  const subagentsService = {
    list: async () => ({ agents }),
    createAgent: async ({ config }: Parameters<ISubagentsService["createAgent"]>[0]) => {
      if (agents.some((agent) => agent.name === config.name)) throw new Error("exists");
      const parsed = parseSubagentMarkdown({
        content: serializeSubagentMarkdown(config),
        path: `/synthetic/.zcode/agents/${config.name}.md`,
        scope: "workspace",
      });
      assert.ok(parsed.agent, parsed.diagnostic?.message);
      agents.push(parsed.agent);
      return { agent: parsed.agent };
    },
  } as unknown as ISubagentsService;
  const zcodeTaskService = {
    createTask: async (params: unknown) => {
      created.push(params);
      return { taskId: `task-${created.length}` };
    },
    sendPrompt: async (params: unknown) => {
      sent.push(params);
      if (failSend) throw new Error("disconnected");
    },
  } as unknown as IZCodeTaskService;
  return {
    services: {
      hooksService,
      subagentsService,
      zcodeTaskService,
      fileService,
      modelSelectionService,
      providerSettingsService,
    },
    configured,
    grants,
    configureHooks: (accepted: boolean) => {
      configuredHooks = true;
      hookAccepted = accepted;
    },
    setDirectoryType: (type: "directory" | "file") => {
      directoryType = type;
    },
    agents,
    created,
    sent,
    fail: (value: boolean) => {
      failSend = value;
    },
  };
}

test("fresh tasks use real model-bound readonly profiles and low reasoning", async () => {
  const f = fixture();
  const target = {
    workspacePath: "/synthetic",
    workspaceIdentity: "remote:one",
    remoteSessionId: "host-one",
  };
  const launch = await prepareWorkCoderTask(f.services, target, models, "Fix the nested form");
  assert.equal(f.agents.length, 2);
  for (const agent of f.agents) {
    assert.deepEqual(agent.tools, ["Read", "Glob", "Grep", "WebSearch", "WebFetch"]);
    assert.equal(agent.modelSelection?.options?.reasoningLevel, "low");
    assert.equal(agent.permissionMode, "plan");
    assert.equal(agent.injectAgentsMd, false);
    assert.equal(agent.tools?.includes("Bash"), false);
  }
  assert.equal(
    f.agents.find((agent) => agent.name.startsWith("workcoder-research"))?.modelSelection?.modelId,
    WORKCODER_MODELS.research,
  );
  assert.deepEqual(f.created[0], {
    ...target,
    provider: "glm",
    mode: "build",
    modelSelection: models.main,
    v4Create: true,
    deferPersistenceUntilFirstPrompt: true,
  });
  assert.match(launch.content, /run_in_background=true/u);
  assert.match(launch.content, /before finalizing the plan/u);
  assert.match(launch.content, /same error occurs for the second time/u);
  assert.match(launch.content, /before declaring completion/u);
  assert.match(launch.content, /Fix the nested form/u);
  await prepareWorkCoderTask(f.services, target, models, "Second task");
  assert.equal(f.agents.length, 2, "serialized profiles must be reusable");
});

test("a failed first send reuses the exact task and trace on retry", async () => {
  const f = fixture();
  const launch = await prepareWorkCoderTask(
    f.services,
    { workspacePath: "/synthetic" },
    models,
    "Check the parser",
  );
  f.fail(true);
  await assert.rejects(sendWorkCoderTask(f.services.zcodeTaskService, launch, "host-one"));
  f.fail(false);
  await sendWorkCoderTask(f.services.zcodeTaskService, launch, "host-one");
  assert.deepEqual(f.sent[0], f.sent[1]);
  assert.equal(f.created.length, 1);
});

test("concurrent preparation reuses atomic same-config roles and refuses modified profiles", async () => {
  const f = fixture();
  const target = { workspacePath: "/synthetic" };
  await Promise.all([
    prepareWorkCoderTask(f.services, target, models, "One"),
    prepareWorkCoderTask(f.services, target, models, "Two"),
  ]);
  assert.equal(f.agents.length, 2);
  f.agents[0].tools = ["Bash"];
  await assert.rejects(
    prepareWorkCoderTask(f.services, target, models, "Three"),
    /configuration was modified/u,
  );
  assert.equal(f.created.length, 2, "invalid role must prevent session creation");
});

test("empty task is rejected before any role or session is created", async () => {
  const f = fixture();
  await assert.rejects(
    prepareWorkCoderTask(f.services, { workspacePath: "/synthetic" }, models, "  "),
  );
  assert.equal(f.agents.length, 0);
  assert.equal(f.created.length, 0);
});

test("preserves each role's chosen reasoning and freezes the main selection before async preparation", async () => {
  const f = fixture();
  const chosen = structuredClone(models);
  chosen.main.options = { reasoningLevel: "high" };
  chosen.research.options = { reasoningLevel: "none" };
  chosen.advisor.options = { reasoningLevel: "medium" };
  const pending = prepareWorkCoderTask(
    f.services,
    { workspacePath: "/synthetic" },
    chosen,
    "Review the change",
  );
  chosen.main.modelId = "modified-after-start";
  chosen.main.options.reasoningLevel = "low";
  const launch = await pending;
  assert.equal(launch.modelSelection.modelId, WORKCODER_MODELS.main);
  assert.equal(launch.modelSelection.options?.reasoningLevel, "high");
  assert.equal(
    f.agents.find((agent) => agent.name.startsWith("workcoder-research"))?.modelSelection?.options
      ?.reasoningLevel,
    "none",
  );
  assert.equal(
    f.agents.find((agent) => agent.name.startsWith("workcoder-advisor"))?.modelSelection?.options
      ?.reasoningLevel,
    "medium",
  );
  await sendWorkCoderTask(f.services.zcodeTaskService, launch);
  const { target: _target, ...prompt } = launch;
  assert.deepEqual(f.sent[0], { ...prompt, remoteSessionId: undefined });
});

test("validates the working directory before profiles, model configuration or task creation", async () => {
  const f = fixture();
  f.setDirectoryType("file");
  await assert.rejects(
    prepareWorkCoderTask(f.services, { workspacePath: "/synthetic/file" }, models, "Task", {
      configureResearch: true,
    }),
    /must be a directory/u,
  );
  assert.equal(f.agents.length, 0);
  assert.equal(f.configured.length, 0);
  assert.equal(f.created.length, 0);
});

test("configures the specified research model without thinking and freezes the chosen directory", async () => {
  const f = fixture();
  const chosen = structuredClone(models);
  chosen.research.options = { reasoningLevel: "none" };
  const launch = await prepareWorkCoderTask(
    f.services,
    { workspacePath: "/synthetic/lesson" },
    chosen,
    "Task",
    { configureResearch: true },
  );
  assert.equal(f.configured.length, 1);
  assert.equal(launch.target.workspacePath, "/synthetic/lesson");
  assert.equal(
    f.agents.find((agent) => agent.name.startsWith("workcoder-research"))?.modelSelection?.options
      ?.reasoningLevel,
    "none",
  );
  await sendWorkCoderTask(f.services.zcodeTaskService, launch);
  assert.equal(f.created.length, 1);
});

test("automatic approval is opt-in and uses existing yolo mode and exact Hook grants", async () => {
  const f = fixture();
  f.configureHooks(true);
  const launch = await prepareWorkCoderTask(
    f.services,
    { workspacePath: "/synthetic" },
    models,
    "Task",
    { autoApprove: true },
  );
  assert.equal((f.created[0] as { mode: string }).mode, "yolo");
  assert.equal(f.grants.length, 1);
  assert.equal(
    (f.grants[0] as { hookDeclarationDigest: string }).hookDeclarationDigest,
    "b".repeat(64),
  );
  assert.equal(launch.content.slice(0, launch.epilogueStart), "Task");
});

test("Hook policy rejection retains the authority decision and prevents task creation", async () => {
  const f = fixture();
  f.configureHooks(false);
  await assert.rejects(
    prepareWorkCoderTask(f.services, { workspacePath: "/synthetic" }, models, "Task", {
      autoApprove: true,
    }),
    /approval rejected/u,
  );
  assert.equal(f.created.length, 0);
  assert.equal(f.agents.length, 0);
});
