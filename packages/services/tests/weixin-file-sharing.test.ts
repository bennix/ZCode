import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, realpath, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  availableWeixinRecipients,
  deliverWeixinFile,
  readWeixinShareFile,
} from "../src/bots/weixinFileDelivery.js";
import type { BotConfig, BotsStateFile } from "@zcode/shared";

const bot = {
  id: "bot",
  name: "fixture",
  provider: "weixin",
  enabled: true,
  weixinAllowedUsers: ["a@im.wechat", "b@im.wechat"],
  allowedWorkspaces: ["*"],
} as BotConfig;
const state: BotsStateFile = {
  version: 3,
  bots: {},
  weixinRecipients: {
    a: { botId: "bot", userId: "a@im.wechat", contextToken: "fixture-a", updatedAt: 1 },
    b: { botId: "bot", userId: "b@im.wechat", contextToken: "fixture-b", updatedAt: 2 },
  },
};
const repo = {
  readConfig: async () => ({ version: 3 as const, bots: [bot] }),
  readState: async () => state,
};
test("most recent authorized channel is first; disabled and disallowed channels excluded", () => {
  assert.deepEqual(
    availableWeixinRecipients([bot], state, { workspacePath: "/fixture" }).map((x) => x.id),
    ["b", "a"],
  );
  assert.equal(
    availableWeixinRecipients([{ ...bot, enabled: false }], state, { workspacePath: "/fixture" })
      .length,
    0,
  );
  assert.equal(
    availableWeixinRecipients([{ ...bot, allowedWorkspaces: ["other"] }], state, {
      workspacePath: "/fixture",
    }).length,
    0,
  );
});
test("listing never leaks session tokens or sends; default send uses newest and preserves filename", async () => {
  const root = await mkdtemp(join(tmpdir(), "wx-share-"));
  try {
    const listed = await deliverWeixinFile(repo, undefined, {
      workspacePath: root,
      action: "list",
    });
    assert.equal(JSON.stringify(listed).includes("fixture-b"), false);
    const path = join(root, "报告.pdf");
    await writeFile(path, "%PDF-fixture");
    let calls = 0;
    const adapter = {
      test: async () => ({ ok: true, message: "" }),
      send: async () => {},
      sendFile: async (_bot: unknown, msg: any, bytes: Uint8Array, name: string) => {
        calls++;
        assert.equal(msg.providerUserId, "b@im.wechat");
        assert.equal(msg.providerContextToken, "fixture-b");
        assert.equal(name, "报告.pdf");
        assert.equal(Buffer.from(bytes).toString(), "%PDF-fixture");
      },
    };
    assert.equal(
      (await deliverWeixinFile(repo, adapter, { workspacePath: root, action: "send", path })).sent,
      true,
    );
    assert.equal(calls, 1);
    await assert.rejects(
      deliverWeixinFile(
        repo,
        {
          ...adapter,
          sendFile: async () => {
            calls++;
            throw Error("transport failed");
          },
        },
        { workspacePath: root, action: "send", path },
      ),
      /transport failed/,
    );
    assert.equal(calls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("reject missing recipients, escaping symlinks, directories and empty files", async () => {
  const root = await mkdtemp(join(tmpdir(), "wx-share-"));
  try {
    const inside = join(root, "inside");
    const outside = join(root, "outside.txt");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(inside);
    await writeFile(outside, "secret");
    await symlink(outside, join(inside, "link"));
    await assert.rejects(readWeixinShareFile(inside, "link"), /工作区/);
    await assert.rejects(readWeixinShareFile(root, "inside"), /普通文件/);
    await writeFile(join(root, "empty"), "");
    await assert.rejects(readWeixinShareFile(root, "empty"), /普通文件/);
    await assert.rejects(
      deliverWeixinFile(repo, undefined, {
        workspacePath: root,
        action: "send",
        path: outside,
        recipientId: "unknown",
      }),
      /没有可用/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated image uses host model choice, saves artifact and sends photo only after authorization", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "wx-generated-")));
  try {
    const calls: unknown[] = [];
    const adapter = {
      sendImage: async (_bot: unknown, msg: any, data: Uint8Array) => {
        calls.push({ recipient: msg.providerUserId, bytes: data.length });
      },
    } as any;
    const generator = async (prompt: string, model?: string) => {
      calls.push({ prompt, model });
      return { mimeType: "image/png", data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) };
    };
    const result = await deliverWeixinFile(
      repo,
      adapter,
      { workspacePath: root, action: "generate_image", prompt: "cat" },
      generator,
    );
    assert.equal(result.sent, true);
    assert.ok(result.path);
    assert.deepEqual(calls[0], { prompt: "cat", model: undefined });
    assert.deepEqual(calls[1], { recipient: "b@im.wechat", bytes: 8 });
    assert.equal((await readFile(result.path!)).length, 8);
    await assert.rejects(
      deliverWeixinFile(
        repo,
        adapter,
        {
          workspacePath: root,
          workspaceIdentity: "remote",
          action: "generate_image",
          prompt: "cat",
        },
        generator,
      ),
    );
    assert.equal(calls.length, 2);
    await assert.rejects(
      deliverWeixinFile(
        repo,
        {
          sendImage: async () => {
            throw Error("uncertain");
          },
        } as any,
        { workspacePath: root, action: "generate_image", prompt: "cat", model: "explicit/image" },
        generator,
      ),
      /uncertain/,
    );
    assert.deepEqual(calls[2], { prompt: "cat", model: "explicit/image" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
