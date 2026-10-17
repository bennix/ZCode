export type HttpProxyMode = "auto" | "manual" | "direct";

const LOCAL_PROXY_PROTOCOLS = new Set([
  "http:",
  "https:",
  "socks:",
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
]);

const SERVER_LINK_PROTOCOLS = new Set([
  "ss:",
  "ssr:",
  "vmess:",
  "vless:",
  "trojan:",
  "hysteria:",
  "hysteria2:",
  "hy2:",
]);

export type ClassifiedProxyUrl =
  | { kind: "empty" }
  | { kind: "http"; url: string }
  | { kind: "socks"; url: string; chromium: string }
  | { kind: "server-link" }
  | { kind: "invalid" };

/**
 * 旧设置没有模式。填过地址的继续用手填；空白改为自动发现，切回直连必须显式选择 direct。
 */
export function resolveHttpProxyMode(
  mode: string | undefined,
  httpProxy: string | undefined,
): HttpProxyMode {
  if (mode === "auto" || mode === "manual" || mode === "direct") return mode;
  return httpProxy?.trim() ? "manual" : "auto";
}

export function classifyProxyUrl(value: string | undefined): ClassifiedProxyUrl {
  const trimmed = value?.trim();
  if (!trimmed) return { kind: "empty" };
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { kind: "invalid" };
  }
  if (!url.hostname) return { kind: "invalid" };
  if (SERVER_LINK_PROTOCOLS.has(url.protocol)) return { kind: "server-link" };
  if (!LOCAL_PROXY_PROTOCOLS.has(url.protocol)) return { kind: "invalid" };
  const endpoint = proxyEndpoint(url);
  if (url.protocol === "http:" || url.protocol === "https:") {
    return { kind: "http", url: endpoint };
  }
  return { kind: "socks", url: endpoint, chromium: chromiumSocksRule(url) };
}

function proxyEndpoint(url: URL): string {
  const copy = new URL(url.href);
  copy.pathname = "";
  copy.search = "";
  copy.hash = "";
  return copy.href.replace(/\/$/, "");
}

function chromiumSocksRule(url: URL): string {
  const protocol =
    url.protocol === "socks4:" || url.protocol === "socks4a:" ? "socks4:" : "socks5:";
  const auth = url.username
    ? `${url.username}${url.password ? `:${url.password}` : ""}@`
    : "";
  return `${protocol}//${auth}${url.host}`;
}
