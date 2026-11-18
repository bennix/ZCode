import { randomBytes } from "node:crypto";
import type { ZCodeSessionGoalAction } from "@zcode/shared";

type Draft = {
  scope: string;
  expires: number;
  stage: "objective" | "criteria" | "confirm" | "clean";
  objective?: string;
  criteria?: string;
  token: string;
};
export type WeixinGuideResult =
  | { kind: "reply"; text: string }
  | { kind: "workspace" }
  | { kind: "clean" }
  | { kind: "goal"; action: ZCodeSessionGoalAction; objective?: string; mode?: "yolo" };

/** 仅保存临时表单；目标和运行状态始终由 CLI 持有。 */
export function createWeixinTaskGuide(now = Date.now) {
  const drafts = new Map<string, Draft>();
  return {
    cancel(actor: string) {
      drafts.delete(actor);
    },
    accepts(actor: string, text: string) {
      return drafts.has(actor) || /^\/(?:goal|wechat|clean|清空)(?:\s|$)/iu.test(text.trim());
    },
    handle(actor: string, scope: string, text: string): WeixinGuideResult | null {
      text = text.trim();
      for (const [key, value] of drafts) if (value.expires <= now()) drafts.delete(key);
      let draft = drafts.get(actor);
      if (draft && draft.scope !== scope) {
        drafts.delete(actor);
        draft = undefined;
      }
      if (/^\/(?:cancel|取消)$/iu.test(text)) {
        drafts.delete(actor);
        return { kind: "reply", text: "已取消，未修改任务或文件。" };
      }
      if (/^\/wechat$/iu.test(text)) {
        drafts.delete(actor);
        return { kind: "workspace" };
      }
      const goal = text.match(/^\/goal(?:\s+([\s\S]*))?$/iu);
      if (goal) {
        drafts.delete(actor);
        const value = goal[1]?.trim() ?? "";
        if (/^(?:show|status|pause|resume|clear)$/u.test(value)) {
          return {
            kind: "goal",
            action: value === "status" ? "show" : (value as ZCodeSessionGoalAction),
          };
        }
        const objective = value.replace(/^replace\s+/u, "");
        drafts.set(actor, {
          scope,
          expires: now() + 300_000,
          token: randomBytes(4).toString("hex"),
          stage: objective ? "criteria" : "objective",
          objective,
        });
        return {
          kind: "reply",
          text: objective
            ? "请填写验收标准、输出文件与限制条件（例如：完成 PDF 并回传微信）。发送 /cancel 取消。"
            : "请描述长程任务目标。接下来会确认验收标准，再由你确认启动。",
        };
      }
      if (/^\/(?:clean|清空)$/u.test(text)) {
        const token = randomBytes(4).toString("hex");
        drafts.set(actor, { scope, expires: now() + 300_000, token, stage: "clean" });
        return {
          kind: "reply",
          text: `将删除微信专属目录内的全部文件，无法撤销；不删除聊天历史和配置。\n二次确认：回复“确认清空 ${token}”；/cancel 取消。五分钟内有效。`,
        };
      }
      if (!draft)
        return /^(?:确认启动|确认清空)\s/u.test(text)
          ? { kind: "reply", text: "确认已过期或不属于当前任务，请重新发起。" }
          : null;
      if (text.startsWith("/")) {
        drafts.delete(actor);
        return null;
      }
      if (draft.stage === "objective") {
        draft.objective = text;
        draft.stage = "criteria";
        return { kind: "reply", text: "请填写验收标准、输出文件和限制条件。" };
      }
      if (draft.stage === "criteria") {
        draft.criteria = text;
        draft.stage = "confirm";
        return {
          kind: "reply",
          text: `目标：${draft.objective}\n验收：${text}\n将设置或替换当前任务目标，按既有权限执行。\n回复“确认启动 ${draft.token}”使用逐次询问；或“确认启动 ${draft.token} yolo”仅对此任务开启后续自动批准。/cancel 取消。`,
        };
      }
      const expected = `${draft.stage === "clean" ? "确认清空" : "确认启动"} ${draft.token}`;
      const yolo = draft.stage === "confirm" && text === `${expected} yolo`;
      if (text !== expected && !yolo)
        return { kind: "reply", text: `尚未确认。请回复“${expected}”，或 /cancel 取消。` };
      drafts.delete(actor);
      return draft.stage === "clean"
        ? { kind: "clean" }
        : {
            kind: "goal",
            action: "set",
            objective: `${draft.objective}\n\n验收标准与交付要求：${draft.criteria}`,
            ...(yolo ? { mode: "yolo" as const } : {}),
          };
    },
  };
}
