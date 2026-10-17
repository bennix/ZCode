import { execFile } from "node:child_process";
import { classifyProxyUrl } from "@zcode/shared";

export interface SystemProxy {
  proxyUrl: string;
  noProxy?: string;
}

type CommandRunner = (command: string, args: string[]) => Promise<string | undefined>;

const CACHE_MS = 5_000;
let cached: { at: number; value: SystemProxy | undefined } | undefined;

export async function readSystemProxy(): Promise<SystemProxy | undefined> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const value = await detectSystemProxy(process.platform, runCommand, process.env);
  cached = { at: now, value };
  return value;
}

export async function detectSystemProxy(
  platform: NodeJS.Platform,
  run: CommandRunner,
  env: Record<string, string | undefined>,
): Promise<SystemProxy | undefined> {
  if (platform === "darwin") return parseMacosScutilProxy(await run("scutil", ["--proxy"]));
  if (platform === "win32") {
    const root = env.SystemRoot || env.WINDIR;
    const reg = root ? `${root}\\System32\\reg.exe` : "reg";
    return parseWindowsInternetSettings(
      await run(reg, [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      ]),
    );
  }
  return (
    parseGnomeProxy(await readGnomeProxy(run)) ??
    parseKdeProxy(await readKdeProxy(run)) ??
    proxyFromEnv((await readSystemdUserEnvironment(run)) ?? {}) ??
    proxyFromEnv(env)
  );
}

export function parseMacosScutilProxy(text: string | undefined): SystemProxy | undefined {
  if (!text) return undefined;
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Za-z0-9]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (match?.[1] && match[2] && !match[2].startsWith("<")) values.set(match[1], match[2]);
  }
  const endpoint = (hostKey: string, portKey: string, scheme: "http" | "socks5") => {
    const host = values.get(hostKey);
    const port = values.get(portKey);
    if (!host || !port || !/^\d+$/.test(port)) return undefined;
    return `${scheme}://${host}:${port}`;
  };
  const https = values.get("HTTPSEnable") === "1" ? endpoint("HTTPSProxy", "HTTPSPort", "http") : undefined;
  const http = values.get("HTTPEnable") === "1" ? endpoint("HTTPProxy", "HTTPPort", "http") : undefined;
  const socks = values.get("SOCKSEnable") === "1" ? endpoint("SOCKSProxy", "SOCKSPort", "socks5") : undefined;
  const proxyUrl = https ?? http ?? socks;
  if (!proxyUrl) return undefined;
  const exceptions = [...text.matchAll(/ExceptionsList : <array> \{([\s\S]*?)\n\s*\}/g)]
    .flatMap((match) => {
      const body = match[1] ?? "";
      return [...body.matchAll(/\d+\s*:\s*(\S+)/g)].flatMap((item) => (item[1] ? [item[1]] : []));
    });
  return { proxyUrl, noProxy: exceptions.length > 0 ? exceptions.join(",") : undefined };
}

export function parseWindowsInternetSettings(text: string | undefined): SystemProxy | undefined {
  if (!text) return undefined;
  const normalized = text.replaceAll("\0", "");
  const enable = /ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(normalized);
  const enableHex = enable?.[1];
  if (!enableHex || Number.parseInt(enableHex, 16) === 0) return undefined;
  const server = /ProxyServer\s+REG_SZ\s+(\S+)/i.exec(normalized)?.[1];
  if (!server) return undefined;
  const proxyUrl = windowsProxyUrl(server);
  if (!proxyUrl) return undefined;
  const override = /ProxyOverride\s+REG_SZ\s+(\S+)/i.exec(normalized)?.[1];
  const noProxy = override
    ?.split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item && item.toLowerCase() !== "<local>")
    .join(",");
  return { proxyUrl, noProxy: noProxy || undefined };
}

export function parseGnomeProxy(values: {
  mode?: string;
  httpHost?: string;
  httpPort?: string;
  httpsHost?: string;
  httpsPort?: string;
  socksHost?: string;
  socksPort?: string;
  ignoreHosts?: string;
} | undefined): SystemProxy | undefined {
  if (!values || unquote(values.mode) !== "manual") return undefined;
  const https = gnomeEndpoint(values.httpsHost, values.httpsPort, "http");
  const http = gnomeEndpoint(values.httpHost, values.httpPort, "http");
  const socks = gnomeEndpoint(values.socksHost, values.socksPort, "socks5");
  const proxyUrl = https ?? http ?? socks;
  if (!proxyUrl) return undefined;
  const hosts = [...(values.ignoreHosts ?? "").matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return { proxyUrl, noProxy: hosts.length > 0 ? hosts.join(",") : undefined };
}

export function parseKdeProxy(text: string | undefined): SystemProxy | undefined {
  if (!text) return undefined;
  const lines = new Map(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)] as const;
      }),
  );
  if (lines.get("ProxyType") !== "1") return undefined;
  const proxyUrl =
    asProxyUrl(lines.get("httpsProxy")) ??
    asProxyUrl(lines.get("httpProxy")) ??
    asProxyUrl(lines.get("socksProxy"));
  if (!proxyUrl) return undefined;
  const noProxy = lines
    .get("NoProxyFor")
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
  return { proxyUrl, noProxy: noProxy || undefined };
}

function windowsProxyUrl(server: string): string | undefined {
  if (!server.includes("=")) return asProxyUrl(server.includes("://") ? server : `http://${server}`);
  const entries = new Map<string, string>();
  for (const part of server.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    entries.set(part.slice(0, index).toLowerCase(), part.slice(index + 1));
  }
  return (
    asProxyUrl(withScheme(entries.get("https"), "http")) ??
    asProxyUrl(withScheme(entries.get("http"), "http")) ??
    asProxyUrl(withScheme(entries.get("socks"), "socks5"))
  );
}

function withScheme(value: string | undefined, scheme: string): string | undefined {
  if (!value) return undefined;
  return value.includes("://") ? value : `${scheme}://${value}`;
}

function asProxyUrl(value: string | undefined): string | undefined {
  const classified = classifyProxyUrl(value);
  return classified.kind === "http" || classified.kind === "socks" ? classified.url : undefined;
}

function gnomeEndpoint(
  host: string | undefined,
  port: string | undefined,
  scheme: "http" | "socks5",
): string | undefined {
  const name = unquote(host);
  const parsedPort = Number(unquote(port));
  if (!name || name === "''" || !Number.isInteger(parsedPort) || parsedPort <= 0) return undefined;
  return `${scheme}://${name}:${parsedPort}`;
}

function unquote(value: string | undefined): string | undefined {
  return value?.trim().replace(/^'|'$/g, "");
}

async function readGnomeProxy(run: CommandRunner) {
  const [mode, httpHost, httpPort, httpsHost, httpsPort, socksHost, socksPort, ignoreHosts] =
    await Promise.all([
      run("gsettings", ["get", "org.gnome.system.proxy", "mode"]),
      run("gsettings", ["get", "org.gnome.system.proxy.http", "host"]),
      run("gsettings", ["get", "org.gnome.system.proxy.http", "port"]),
      run("gsettings", ["get", "org.gnome.system.proxy.https", "host"]),
      run("gsettings", ["get", "org.gnome.system.proxy.https", "port"]),
      run("gsettings", ["get", "org.gnome.system.proxy.socks", "host"]),
      run("gsettings", ["get", "org.gnome.system.proxy.socks", "port"]),
      run("gsettings", ["get", "org.gnome.system.proxy", "ignore-hosts"]),
    ]);
  if (!mode) return undefined;
  return { mode, httpHost, httpPort, httpsHost, httpsPort, socksHost, socksPort, ignoreHosts };
}

async function readKdeProxy(run: CommandRunner): Promise<string | undefined> {
  const keys = ["ProxyType", "httpProxy", "httpsProxy", "socksProxy", "NoProxyFor"];
  for (const command of ["kreadconfig6", "kreadconfig5"]) {
    const values = await Promise.all(
      keys.map((key) =>
        run(command, ["--file", "kioslaverc", "--group", "Proxy Settings", "--key", key]),
      ),
    );
    if (values.some((value) => value?.trim())) {
      return keys.map((key, index) => `${key}=${values[index]?.trim() ?? ""}`).join("\n");
    }
  }
  return undefined;
}

async function readSystemdUserEnvironment(
  run: CommandRunner,
): Promise<Record<string, string | undefined> | undefined> {
  const text = await run("systemctl", ["--user", "show-environment"]);
  if (!text?.trim()) return undefined;
  const result: Record<string, string | undefined> = {};
  for (const line of text.split("\n")) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    result[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  return result;
}

function proxyFromEnv(env: Record<string, string | undefined>): SystemProxy | undefined {
  const proxyUrl = ["all_proxy", "ALL_PROXY", "https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY"]
    .map((key) => asProxyUrl(env[key]))
    .find((value): value is string => Boolean(value));
  if (!proxyUrl) return undefined;
  const noProxy = env.no_proxy?.trim() || env.NO_PROXY?.trim() || undefined;
  return { proxyUrl, noProxy };
}

function runCommand(command: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 2000, windowsHide: true, maxBuffer: 256_000 },
      (error, stdout) => {
        resolve(error ? undefined : String(stdout));
      },
    );
  });
}
