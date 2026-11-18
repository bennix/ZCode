import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, realpath, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BOT_COMMANDS, ZCODE_AGENT_PROVIDER, type BotInboundMessage } from "@zcode/shared";
import { createBotsService } from "../src/bots/botsService.js";
import { BotsRepo } from "../src/bots/repo.js";
import { setDataBaseDir } from "../src/paths.js";
import { getWeixinWorkspacePath } from "../src/bots/weixinWorkspace.js";

test("Weixin end-to-end command routing uses goal API, explicit Yolo and two-step directory clearing", async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "wx-goal-service-")));
  setDataBaseDir(base);
  const calls: any[] = [];
  let mode = "build";
  let busy = false;
  let listener: (event: any) => Promise<void> = async () => {};
  let acceptPermission = true;
  let loaded = false;
  const repo = new BotsRepo();
  await repo.writeConfig({
    version: 3,
    bots: [
      {
        id: "wx",
        name: "fixture",
        provider: "weixin",
        enabled: true,
        weixinAllowedUsers: ["owner@im.wechat"],
        allowedWorkspaces: ["*"],
        allowedCommands: DEFAULT_BOT_COMMANDS,
        currentOptions: {
          modelSelection: {
            providerId: "fixture",
            modelId: "weixin-default",
            options: { reasoningLevel: "low" },
          },
        },
        replyMode: "assistant_changes",
      },
    ],
  });
  const task = {
    taskId: "task-1",
    workspacePath: getWeixinWorkspacePath("wx"),
    provider: ZCODE_AGENT_PROVIDER,
    status: "completed",
  };
  const service = createBotsService({
    runStartupBackgroundTasks: false,
    generateIntentText: async () => {
      calls.push({ intent: true });
      return { text: JSON.stringify({ kind: "chat", prompt: "follow up", useReference: false }) };
    },
    credentialService: { load: async () => null } as any,
    settingService: { get: async () => ({ locale: "zh-CN", lastWorkspaceSession: [] }) } as any,
    modelSelectionService: {
      getView: async (input: any) => ({
        effectiveSelection: input?.selection,
        preferredSelection: { providerId: "fixture", modelId: "text" },
        providers: [
          {
            providerId: "fixture",
            providerName: "Fixture",
            models: [
              {
                modelId: "weixin-default",
                config: { optionSpecs: { reasoningLevel: { values: ["none", "low", "high"] } } },
              },
            ],
          },
        ],
      }),
    } as any,
    zcodeTaskService: {
      createTask: async (p: any) => {
        calls.push({ create: p });
        return task;
      },
      getTaskConfigOptions: async () => [
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: mode,
          options: [
            { value: "build", name: "Build" },
            { value: "yolo", name: "Yolo" },
          ],
        },
      ],
      setMode: async (p: any) => {
        mode = p.mode;
        calls.push({ mode: p });
      },
      resumeTask: async () => {
        loaded = true;
        return task;
      },
      listDeletedTaskIds: async () => [],
      getTaskSnapshot: async () => ({ meta: { ...task, status: busy ? "running" : "completed" } }),
      getTaskModelSelection: async (params: any) => {
        assert.equal(params.workspacePath, task.workspacePath);
        assert.equal(loaded, true, "restore session before reading its model");
        return {
          providerId: "fixture",
          modelId: "weixin-default",
          options: { reasoningLevel: "low" },
        };
      },
      onDynamicStreamEvent: () => (handler: any) => {
        listener = handler;
        return { dispose() {} };
      },
      respondPermission: async (p: any) => {
        calls.push({ permission: p });
        return acceptPermission;
      },
      goalSession: async (p: any) => {
        calls.push({ goal: p });
        return { response: "目标已提交", startedTurn: false };
      },
      listTasks: async () => [{ ...task, status: busy ? "running" : "completed" }],
      sendPrompt: async (input: any) => {
        calls.push({ prompt: input });
      },
    } as any,
  });
  const message = (text: string): BotInboundMessage => ({
    botId: "wx",
    text,
    actor: {
      provider: "weixin",
      botId: "wx",
      providerUserId: "owner@im.wechat",
      chatType: "private",
    },
  });
  try {
    const help = await service.handleInboundMessage(message("/help"));
    assert.match(help.map((item) => item.text).join("\n"), /\/think/);
    const levels = await service.handleInboundMessage(message("/思考"));
    assert.match(JSON.stringify(levels), /high/);
    await service.handleInboundMessage(message("/think high"));
    assert.equal(
      (await repo.readState()).bots.wx.draftOptions?.modelSelection?.options?.reasoningLevel,
      "high",
    );
    await service.handleInboundMessage(message("/think low"));
    await service.handleInboundMessage(message("/goal 编写报告"));
    const review = await service.handleInboundMessage(message("输出 PDF 并回传"));
    const token = review[0]!.text.match(/确认启动 ([a-f0-9]+)/u)![1];
    await service.handleInboundMessage(message(`确认启动 ${token} yolo`));
    assert.equal(mode, "yolo");
    assert.deepEqual(calls.find((c) => c.create).create.modelSelection, {
      providerId: "fixture",
      modelId: "weixin-default",
      options: { reasoningLevel: "low" },
    });
    assert.equal(calls.filter((c) => c.goal).length, 1);
    assert.match(calls.find((c) => c.goal).goal.objective, /输出 PDF/);
    assert.equal(calls.find((c) => c.create).create.workspacePath, getWeixinWorkspacePath("wx"));
    await service.handleInboundMessage(message(`确认启动 ${token} yolo`));
    assert.equal(calls.filter((c) => c.goal).length, 1);
    await service.handleInboundMessage(message("/goal pause"));
    assert.equal(calls.at(-1).goal.action, "pause");
    const permission = (id: string) => ({
      type: "permission_request",
      taskId: "task-1",
      traceId: "trace",
      requestId: id,
      title: "覆盖文件？",
      kind: "tool",
      description: "overwrite",
      options: [
        {
          optionId: "allow-once",
          name: "Allow",
          kind: "allow_once",
          response: { decision: "allow" },
        },
        {
          optionId: "allow-always",
          name: "Always allow",
          kind: "allow_always",
          response: { decision: "allow" },
        },
        { optionId: "deny", name: "Deny", kind: "reject_once", response: { decision: "deny" } },
      ],
    });
    mode = "build";
    await listener(permission("request-1"));
    const beforeReply = calls.filter((c) => c.permission).length;
    const incomplete = await service.handleInboundMessage(message("2"));
    assert.match(incomplete[0]!.text, /完整确认码/);
    assert.doesNotMatch(incomplete[0]!.text, /未知命令|意图处理失败/);
    assert.equal(calls.filter((c) => c.permission).length, beforeReply);

    const requestToken = createHash("sha256").update("request-1").digest("hex").slice(0, 8);
    await service.handleInboundMessage(message("/permission deadbeef yolo"));
    assert.equal(mode, "build");
    await service.handleInboundMessage(message(`${requestToken} 本任务Yolo`));
    assert.equal(mode, "yolo");
    assert.equal(calls.filter((c) => c.permission).at(-1).permission.optionId, "allow-once");
    const modes = calls.filter((c) => c.mode).length;
    await service.handleInboundMessage(message(`/permission ${requestToken} yolo`));
    assert.equal(calls.filter((c) => c.mode).length, modes);
    await listener(permission("request-2"));
    acceptPermission = false;
    mode = "build";
    const oldToken = createHash("sha256").update("request-2").digest("hex").slice(0, 8);
    await service.handleInboundMessage(message(`/permission ${oldToken} yolo`));
    assert.equal(mode, "build");

    assert.equal(calls.filter((call) => call.prompt).length, 0, "goal uses structured API");
    busy = true;
    await listener({ type: "task_run_started", taskId: "task-1", traceId: "attachment-run" });
    const attachmentReply = await service.handleInboundMessage({
      ...message("补充参考图片"),
      attachments: [
        {
          id: "picture",
          kind: "image",
          filename: "reference.png",
          mimeType: "image/png",
          dataBase64: "aGVsbG8=",
        },
      ],
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(attachmentReply[0]!.text, /当前任务/);
    assert.equal(calls.at(-1).prompt.taskId, "task-1");
    assert.equal(calls.at(-1).prompt.attachments[0].filename, "reference.png");
    assert.equal(
      calls.filter((call) => call.intent).length,
      0,
      "attachments bypass image classification",
    );
    busy = false;
    loaded = false;
    const saved = await repo.readState();
    const pendingPdf = { path: join(task.workspacePath, "pending.pdf"), kind: "pdf" as const, status: "pending" as const };
    saved.bots.wx.pendingWeixinArtifact = pendingPdf;
    await repo.writeState(saved);
    await service.handleInboundMessage(message("请补充说明"));
    assert.deepEqual((await repo.readState()).bots.wx.pendingWeixinArtifact, pendingPdf);
    await listener(permission("after-follow-up"));
    assert.deepEqual((await repo.readState()).bots.wx.pendingWeixinArtifact, pendingPdf);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.filter((call) => call.intent).length, 1);
    const file = join(getWeixinWorkspacePath("wx"), "draft.txt");
    await writeFile(file, "keep until confirmed");
    const clear = await service.handleInboundMessage(message("/clean"));
    const clearToken = clear[0]!.text.match(/确认清空 ([a-f0-9]+)/u)![1];
    assert.deepEqual(await readdir(getWeixinWorkspacePath("wx")), ["draft.txt"]);
    busy = true;
    assert.match(
      (await service.handleInboundMessage(message(`确认清空 ${clearToken}`)))[0]!.text,
      /运行任务|停止任务/,
    );
    busy = false;
    const again = await service.handleInboundMessage(message("/clean"));
    await service.handleInboundMessage(
      message(`确认清空 ${again[0]!.text.match(/确认清空 ([a-f0-9]+)/u)![1]}`),
    );
    assert.deepEqual(await readdir(getWeixinWorkspacePath("wx")), []);
  } finally {
    await service.disposeAllAndWait();
    setDataBaseDir(null);
    await rm(base, { recursive: true, force: true });
  }
});
