import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import tls from "node:tls";
import { classifyProxyUrl } from "@zcode/shared";

export function isSocksProxyUrl(value: string): boolean {
  return classifyProxyUrl(value).kind === "socks";
}

export async function fetchThroughSocksProxy(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  proxyUrl: string,
  ca: string | undefined,
): Promise<Response> {
  const proxy = new URL(proxyUrl);
  const request = new Request(input, init);
  const target = new URL(request.url);
  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    if (request.signal.aborted) {
      reject(abortError(request.signal));
      return;
    }
    const client = transport.request(
      {
        agent: createSocksAgent(proxy, target.protocol === "https:", ca),
        headers: headersOf(request.headers),
        hostname: target.hostname,
        method,
        path: `${target.pathname}${target.search}`,
        port: target.port || undefined,
        protocol: target.protocol,
      },
      (message) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(message.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
          else if (value !== undefined) headers.append(name, String(value));
        }
        resolve(
          new Response(Readable.toWeb(message) as ReadableStream<Uint8Array>, {
            headers,
            status: message.statusCode ?? 502,
            statusText: message.statusMessage,
          }),
        );
      },
    );
    const onAbort = () => {
      client.destroy(abortError(request.signal));
    };
    request.signal.addEventListener("abort", onAbort, { once: true });
    client.once("error", reject);
    client.once("close", () => request.signal.removeEventListener("abort", onAbort));
    client.end(body);
  });
}

function createSocksAgent(proxy: URL, secure: boolean, ca: string | undefined): http.Agent {
  const agent = new (secure ? https : http).Agent();
  agent.createConnection = ((options, callback) => {
    if (!callback) return;
    const port = Number(options.port) || (secure ? 443 : 80);
    const host = options.host ?? options.hostname ?? "localhost";
    const servername = (options as { servername?: string }).servername || host;
    connectSocks(proxy, host, port)
      .then((socket) => {
        if (!secure) {
          callback(null, socket);
          return;
        }
        const tlsSocket = tls.connect({ socket, servername, ca });
        tlsSocket.once("secureConnect", () => callback(null, tlsSocket));
        tlsSocket.once("error", (error) => callback(error, tlsSocket));
      })
      .catch((error: Error) => callback(error, new net.Socket()));
  }) as http.Agent["createConnection"];
  return agent;
}

export function connectSocks(proxy: URL, host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(proxy.port) || 1080, proxy.hostname);
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.once("error", fail);
    socket.once("connect", () => {
      socket.off("error", fail);
      const handshake =
        proxy.protocol === "socks4:" || proxy.protocol === "socks4a:"
          ? handshakeSocks4(socket, proxy, host, port)
          : handshakeSocks5(socket, proxy, host, port);
      handshake.then(
        () => resolve(socket),
        (error: Error) => fail(error),
      );
    });
  });
}

async function handshakeSocks5(socket: net.Socket, proxy: URL, host: string, port: number) {
  const reader = createReader(socket);
  const user = decodeURIComponent(proxy.username);
  const password = decodeURIComponent(proxy.password);
  socket.write(Buffer.from(user ? [0x05, 0x01, 0x02] : [0x05, 0x01, 0x00]));
  const method = await reader.read(2);
  if (method[0] !== 0x05 || (method[1] !== 0x00 && method[1] !== 0x02)) {
    throw new Error("SOCKS5 proxy rejected the authentication method");
  }
  if (method[1] === 0x02) {
    const userBytes = Buffer.from(user);
    const passwordBytes = Buffer.from(password);
    socket.write(
      Buffer.concat([
        Buffer.from([0x01, userBytes.length]),
        userBytes,
        Buffer.from([passwordBytes.length]),
        passwordBytes,
      ]),
    );
    const auth = await reader.read(2);
    if (auth[1] !== 0x00) throw new Error("SOCKS5 proxy rejected the username or password");
  }
  const domain = Buffer.from(host);
  const request = Buffer.alloc(7 + domain.length);
  request[0] = 0x05;
  request[1] = 0x01;
  request[2] = 0x00;
  request[3] = 0x03;
  request[4] = domain.length;
  domain.copy(request, 5);
  request.writeUInt16BE(port, 5 + domain.length);
  socket.write(request);
  const reply = await reader.read(4);
  if (reply[1] !== 0x00) throw new Error(`SOCKS5 connect failed (${reply[1]})`);
  const addressLength =
    reply[3] === 0x01 ? 4 : reply[3] === 0x04 ? 16 : ((await reader.read(1))[0] ?? 0);
  await reader.read(addressLength + 2);
  reader.stop();
}

async function handshakeSocks4(socket: net.Socket, proxy: URL, host: string, port: number) {
  const reader = createReader(socket);
  const user = Buffer.from(decodeURIComponent(proxy.username));
  const useDomain = proxy.protocol === "socks4a:" || net.isIP(host) === 0;
  const address = useDomain
    ? Buffer.from([0, 0, 0, 1])
    : Buffer.from(host.split(".").map((part) => Number(part)));
  const domain = useDomain ? Buffer.from(host) : Buffer.alloc(0);
  socket.write(
    Buffer.concat([
      Buffer.from([0x04, 0x01, port >> 8, port & 0xff]),
      address,
      user,
      Buffer.from([0x00]),
      domain.length > 0 ? Buffer.concat([domain, Buffer.from([0x00])]) : Buffer.alloc(0),
    ]),
  );
  const reply = await reader.read(8);
  reader.stop();
  if (reply[1] !== 0x5a) throw new Error(`SOCKS4 connect failed (${reply[1]})`);
}

function createReader(socket: net.Socket) {
  let pending = Buffer.alloc(0);
  const waiters: Array<(error?: Error) => void> = [];
  const onData = (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    waiters.splice(0).forEach((wake) => wake());
  };
  const onError = (error: Error) => {
    waiters.splice(0).forEach((wake) => wake(error));
  };
  socket.on("data", onData);
  socket.on("error", onError);
  return {
    async read(length: number) {
      while (pending.length < length) {
        await new Promise<void>((resolve, reject) => {
          waiters.push((error) => (error ? reject(error) : resolve()));
        });
      }
      const output = Buffer.from(pending.subarray(0, length));
      pending = pending.subarray(length);
      return output;
    },
    stop() {
      socket.off("data", onData);
      socket.off("error", onError);
    },
  };
}

function headersOf(headers: Headers): http.OutgoingHttpHeaders {
  const outgoing: http.OutgoingHttpHeaders = {};
  headers.forEach((value, key) => {
    outgoing[key] = value;
  });
  return outgoing;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("The operation was aborted.");
}
