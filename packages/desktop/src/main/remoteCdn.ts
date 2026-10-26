import { ZCODE_VERSION, type ZCodeEnv } from "@zcode/shared";

declare const __ZCODE_CDN_BASE_URL__: string | undefined;
const DEFAULT_RELEASE_BASE_URL = "https://github.com/bennix/ZCode/releases/download";

export interface ResolveRemoteCdnOptions {
  env?: ZCodeEnv;
  locale?: string;
  timeZone?: string;
  overrideBaseUrl?: string;
  version?: string;
  now?: Date;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("CDN URL must use http or https");
  return value.replace(/\/+$/, "");
}

export function resolveRemoteCdnBaseUrls(options: ResolveRemoteCdnOptions = {}): string[] {
  const override = options.overrideBaseUrl?.trim();
  if (override) return [normalizeBaseUrl(override)];
  const baseUrl =
    process.env.ZCODE_CDN_BASE_URL?.trim() ||
    (typeof __ZCODE_CDN_BASE_URL__ === "undefined" ? "" : __ZCODE_CDN_BASE_URL__);
  // 上游 CDN 不发布 ZenCode 的版本；默认使用与安装包同属的 GitHub Release。
  if (!baseUrl) return [`${DEFAULT_RELEASE_BASE_URL}/v${options.version ?? ZCODE_VERSION}`];
  return [
    `${normalizeBaseUrl(baseUrl)}/zcode/electron/releases/${options.version ?? ZCODE_VERSION}`,
  ];
}
