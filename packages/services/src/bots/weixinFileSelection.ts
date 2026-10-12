import type { SelectionPrompt } from "@zcode/shared";

/** 微信纯文本文件选择只接受当前轮次 token 和编号。 */
export function resolveWeixinFileSelectionReply(
  selection: SelectionPrompt,
  text: string,
): { kind: "cancel" } | { kind: "choice"; value: string } | null {
  if (!selection.requiresToken || !selection.token) return null;
  const [token, index, extra] = text.trim().split(/\s+/u);
  if (token !== selection.token || !index || extra || !/^\d+$/u.test(index)) return null;
  if (index === "0") return { kind: "cancel" };
  const selected = selection.options[Number(index) - 1];
  return selected ? { kind: "choice", value: `${token} ${selected.id}` } : null;
}
