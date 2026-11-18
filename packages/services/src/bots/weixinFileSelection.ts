import type { SelectionPrompt } from "@zcode/shared";

/** 微信纯文本选择只接受当前轮次 token；允许编号或本轮唯一标签。 */
export function resolveWeixinFileSelectionReply(
  selection: SelectionPrompt,
  text: string,
): { kind: "cancel" } | { kind: "choice"; value: string } | null {
  if (!selection.requiresToken || !selection.token) return null;
  const [token, index, extra] = text.trim().split(/\s+/u);
  if (token !== selection.token || !index || extra) return null;
  if (index === "0") return { kind: "cancel" };
  const matches = selection.options.filter((option) => option.label === index);
  const selected = /^\d+$/u.test(index)
    ? selection.options[Number(index) - 1]
    : matches.length === 1
      ? matches[0]
      : undefined;
  return selected ? { kind: "choice", value: `${token} ${selected.id}` } : null;
}
