import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";
import { classifyProxyUrl, resolveHttpProxyMode } from "@zcode/shared";
import { resolveEffectiveAppProxy } from "../src/network/appProxy.js";
import { connectSocks } from "../src/network/socksFetch.js";
import {
  detectSystemProxy,
  parseGnomeProxy,
  parseKdeProxy,
  parseMacosScutilProxy,
  parseWindowsInternetSettings,
} from "../src/network/systemProxy.js";

test("blank proxy settings follow the system, and an existing address stays manual", () => {
  assert.equal(resolveHttpProxyMode(undefined, ""), "auto");
  assert.equal(resolveHttpProxyMode(undefined, "http://127.0.0.1:7897"), "manual");
  assert.equal(resolveHttpProxyMode("direct", "http://127.0.0.1:7897"), "direct");
});

test("local proxy forms are accepted and server links are not an endpoint", () => {
  assert.equal(classifyProxyUrl("127.0.0.1:7897").kind, "http");
  assert.equal(classifyProxyUrl("socks5://127.0.0.1:1080").kind, "socks");
  assert.equal(classifyProxyUrl("socks5h://127.0.0.1:1080").kind, "socks");
  if (classifyProxyUrl("socks5h://127.0.0.1:1080").kind === "socks") {
    assert.equal(
      classifyProxyUrl("socks5h://127.0.0.1:1080").kind === "socks"
        ? (classifyProxyUrl("socks5h://127.0.0.1:1080") as { chromium: string }).chromium
        : "",
      "socks5://127.0.0.1:1080",
    );
  }
  assert.equal(classifyProxyUrl("ss://example").kind, "server-link");
  assert.equal(classifyProxyUrl("vmess://example").kind, "server-link");
});

test("Clash Verge system proxy prefers the HTTP mixed port, Shadowsocks keeps SOCKS", () => {
  const clash = parseMacosScutilProxy(`
    HTTPSEnable : 1
    HTTPSProxy : 127.0.0.1
    HTTPSPort : 7897
    SOCKSEnable : 1
    SOCKSProxy : 127.0.0.1
    SOCKSPort : 7897
    ExceptionsList : <array> {
      0 : localhost
      1 : 127.0.0.1
    }
  `);
  assert.equal(clash?.proxyUrl, "http://127.0.0.1:7897");
  assert.equal(clash?.noProxy, "localhost,127.0.0.1");

  const shadowsocks = parseMacosScutilProxy(`
    SOCKSEnable : 1
    SOCKSProxy : 127.0.0.1
    SOCKSPort : 1080
  `);
  assert.equal(shadowsocks?.proxyUrl, "socks5://127.0.0.1:1080");
});

test("Windows and GNOME proxy settings are read from their own formats", () => {
  const windows = parseWindowsInternetSettings(`
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ    http=127.0.0.1:7897;socks=127.0.0.1:7897
    ProxyOverride    REG_SZ    localhost;<local>
  `);
  assert.equal(windows?.proxyUrl, "http://127.0.0.1:7897");
  assert.equal(windows?.noProxy, "localhost");
  assert.equal(
    parseWindowsInternetSettings("ProxyEnable    REG_DWORD    0x0\nProxyServer    REG_SZ    127.0.0.1:7890"),
    undefined,
  );
  assert.equal(
    parseGnomeProxy({
      mode: "'manual'",
      socksHost: "'127.0.0.1'",
      socksPort: "1080",
      ignoreHosts: "['localhost']",
    })?.proxyUrl,
    "socks5://127.0.0.1:1080",
  );
  assert.equal(parseGnomeProxy({ mode: "'none'" }), undefined);
});

test("Windows and Linux discovery read their own system settings", async () => {
  const windowsCalls: string[] = [];
  const windows = await detectSystemProxy(
    "win32",
    async (command) => {
      windowsCalls.push(command);
      return "ProxyEnable    REG_DWORD    0x1\nProxyServer    REG_SZ    127.0.0.1:1080\n";
    },
    { SystemRoot: "C:\\Windows" },
  );
  assert.equal(windowsCalls[0], "C:\\Windows\\System32\\reg.exe");
  assert.equal(windows?.proxyUrl, "http://127.0.0.1:1080");

  assert.equal(
    parseKdeProxy("ProxyType=1\nhttpsProxy=http://127.0.0.1:7897\nNoProxyFor=localhost,127.0.0.1")
      ?.proxyUrl,
    "http://127.0.0.1:7897",
  );

  const linux = await detectSystemProxy(
    "linux",
    async (command) => {
      if (command === "systemctl") return "http_proxy=http://127.0.0.1:20171\nno_proxy=localhost\n";
      return undefined;
    },
    {},
  );
  assert.equal(linux?.proxyUrl, "http://127.0.0.1:20171");
  assert.equal(linux?.noProxy, "localhost");
});

test("direct switches back, automatic uses discovery, manual keeps the typed address", async () => {
  const detect = async () => ({ proxyUrl: "socks5://127.0.0.1:1080" });
  assert.equal((await resolveEffectiveAppProxy({ mode: "direct", httpProxy: "http://127.0.0.1:7897" }, detect)).httpProxy, undefined);
  assert.equal((await resolveEffectiveAppProxy({ mode: "auto" }, detect)).httpProxy, "socks5://127.0.0.1:1080");
  assert.equal(
    (await resolveEffectiveAppProxy({ mode: "manual", httpProxy: "http://127.0.0.1:7897" }, detect)).httpProxy,
    "http://127.0.0.1:7897",
  );
});

test("SOCKS5 handshake reaches the requested host", async () => {
  const server = net.createServer((socket) => {
    socket.once("data", () => {
      socket.write(Buffer.from([0x05, 0x00]));
      socket.once("data", (request) => {
        assert.equal(request[3], 0x03);
        const length = request[4];
        assert.equal(request.subarray(5, 5 + length).toString(), "example.com");
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        socket.end();
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const socket = await connectSocks(new URL(`socks5://127.0.0.1:${address.port}`), "example.com", 443);
  socket.destroy();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
