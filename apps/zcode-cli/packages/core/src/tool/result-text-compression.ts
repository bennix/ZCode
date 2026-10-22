import type { ToolResultBudget } from "@zcode/contracts";
import { estimateTokens } from "../context/utils.js";

const COMPRESSION_MARKER = "[tool-output-compressed:v1";
const OMISSION_MARKER = "[tool-lines-omitted:v1";
const MIN_BYTES = 4_096;
const MAX_BYTES = 1_048_576;
const DIAGNOSTIC =
  /\b(?:error|warn(?:ing)?|fail(?:ed|ure|ures)?|exception|fatal|panic|traceback|denied|timeout|assert(?:ion)?|errno|exit|todo|fixme|cancelled|interrupted)\b|错误|失败|警告|^\s*(?:at\s|File\s"|Caused by:)/iu;
const SECTION = /^\s*(?:={3,}.*|-{3,}.*|(?:BEGIN|END):[A-Z][A-Z0-9_-]*)\s*$/u;
const TIMESTAMP =
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b|\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/gu;
const LOG_LINE =
  /^\s*(?:\[?\d{4}-\d{2}-\d{2}[T ][\d:.,Z+-]+\]?\s*|\[?\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\]?\s*)?(?:\[?(?:INFO|DEBUG|TRACE|WARN|WARNING|ERROR|FATAL)\]?\b|(?:Compiling|Checking|Building|Downloading)\s)/iu;

export interface CompressedToolText {
  content: string;
  removedLines: number;
}

/** Pure, first-result projection: no clock, query, model, history or mutable cache. */
export function compressToolText(
  content: string,
  strategy: ToolResultBudget["textCompression"],
): CompressedToolText | undefined {
  const bytes = Buffer.byteLength(content, "utf8");
  if (
    bytes < MIN_BYTES ||
    bytes > MAX_BYTES ||
    content.includes(COMPRESSION_MARKER) ||
    content.includes(OMISSION_MARKER) ||
    content.includes("<persisted-output>") ||
    /```|^diff --git |^@@ |^--- [ab]\//mu.test(content)
  )
    return undefined;
  const lines = content.split("\n");
  const protectedLines = protectedLineIndexes(lines);
  const omitted = new Set<number>();
  if (strategy === "logs") {
    if (lines.filter((line) => LOG_LINE.test(line)).length < lines.length * 0.6) return undefined;
    const seen = new Set<string>();
    for (const [index, line] of lines.entries()) {
      if (SECTION.test(line) || line.trim() === "") seen.clear();
      if (!LOG_LINE.test(line)) continue;
      // 原因：数字、路径和 ID 可能就是诊断事实；只忽略日志时间戳，不折叠不同指标或文件。
      const key = line.replace(TIMESTAMP, "<timestamp>");
      if (!protectedLines.has(index) && seen.has(key)) omitted.add(index);
      seen.add(key);
    }
  } else if (strategy === "search") {
    const files = new Map<string, number[]>();
    for (const [index, line] of lines.entries()) {
      const path = searchPath(line);
      if (!path) continue;
      const matches = files.get(path) ?? [];
      matches.push(index);
      files.set(path, matches);
    }
    for (const matches of files.values()) {
      for (const index of matches.slice(2, -2)) {
        if (!protectedLines.has(index)) omitted.add(index);
      }
    }
  } else return undefined;
  if (omitted.size === 0) return undefined;
  const output: string[] = [];
  let count = 0;
  const flush = () => {
    if (count > 0)
      output.push(`${OMISSION_MARKER} omitted ${count} lines; original order retained]`);
    count = 0;
  };
  for (const [index, line] of lines.entries()) {
    if (omitted.has(index)) count += 1;
    else {
      flush();
      output.push(line);
    }
  }
  flush();
  const compressed = output.join("\n");
  return worthwhile(content, compressed)
    ? { content: compressed, removedLines: omitted.size }
    : undefined;
}

/** Omission is allowed only after the caller has obtained a real Read-compatible artifact path. */
export function formatCompressedToolText(
  candidate: CompressedToolText,
  original: string,
  persistedPath: string,
  maxBytes: number,
): string | undefined {
  if (
    !persistedPath ||
    /[\r\n]/u.test(persistedPath) ||
    persistedPath.includes(String.fromCharCode(0))
  )
    return undefined;
  const content = [
    `${COMPRESSION_MARKER} omitted ${candidate.removedLines} lines; full original: Read ${JSON.stringify(persistedPath)}]`,
    candidate.content,
  ].join("\n");
  return Buffer.byteLength(content, "utf8") <= maxBytes && worthwhile(original, content)
    ? content
    : undefined;
}

function worthwhile(original: string, projected: string): boolean {
  return (
    Buffer.byteLength(projected, "utf8") <= Buffer.byteLength(original, "utf8") * 0.8 &&
    estimateTokens(original) - estimateTokens(projected) >= 256
  );
}

function protectedLineIndexes(lines: readonly string[]): Set<number> {
  const indexes = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    if (index < 8 || index >= lines.length - 12) indexes.add(index);
    if (DIAGNOSTIC.test(lines[index]!)) {
      for (
        let adjacent = Math.max(0, index - 3);
        adjacent <= Math.min(lines.length - 1, index + 3);
        adjacent += 1
      )
        indexes.add(adjacent);
    }
  }
  return indexes;
}

function searchPath(line: string): string | undefined {
  return (
    /^((?:[A-Za-z]:)?[^:\n]+?):\d+:/u.exec(line)?.[1] ??
    /^((?:[A-Za-z]:)?[^:\n]+)-\d+-/u.exec(line)?.[1]
  );
}
