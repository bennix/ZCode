/** 标题复制到微信后空格、全角字符可能改变；只做确定性匹配，不猜测任务。 */
export function matchTaskTitles<T extends { task: { taskId: string; title: string } }>(
  entries: T[],
  value: string,
): T[] {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
  const query = normalize(value);
  if (!query) return [];
  const ids = entries.filter((entry) => entry.task.taskId === value.trim());
  if (ids.length) return ids;
  const exact = entries.filter((entry) => normalize(entry.task.title ?? "") === query);
  if (exact.length) return exact;
  const tokens = value.normalize("NFKC").toLowerCase().trim().split(/\s+/u);
  return entries.filter((entry) => {
    const title = normalize(entry.task.title ?? "");
    if (title.includes(query)) return true;
    let offset = 0;
    return tokens.every((token) => {
      const index = title.indexOf(token, offset);
      if (index < 0) return false;
      offset = index + token.length;
      return true;
    });
  });
}
