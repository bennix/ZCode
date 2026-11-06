const LEGACY_PREFIX = "WorkCoder collaboration protocol v1\nYou own the main coding session.\n";
const LEGACY_TASK_MARKER = "\n\nUser task:\n";

/** 仅兼容此前由 WorkCoder 生成的完整 v1 头部，不匹配一般引用或用户说明。 */
export function splitLegacyWorkCoderInput(
  text: string,
): { task: string; instructions: string } | null {
  const currentBoundary = text.indexOf(`\n\n${LEGACY_PREFIX}`);
  const oldFormat = text.startsWith(LEGACY_PREFIX);
  if (!oldFormat && currentBoundary < 0) return null;
  const boundary = oldFormat
    ? text.indexOf(LEGACY_TASK_MARKER, LEGACY_PREFIX.length)
    : currentBoundary;
  if (boundary < 0) return null;
  const instructions = oldFormat ? text.slice(0, boundary) : text.slice(boundary + 2);
  if (
    !/subagent_type="workcoder-research-[a-f0-9]{16}"/u.test(instructions) ||
    !/subagent_type="workcoder-advisor-[a-f0-9]{16}"/u.test(instructions)
  )
    return null;
  return {
    task: oldFormat ? text.slice(boundary + LEGACY_TASK_MARKER.length) : text.slice(0, boundary),
    instructions,
  };
}
