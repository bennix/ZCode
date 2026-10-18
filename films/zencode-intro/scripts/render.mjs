import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const timing = JSON.parse(readFileSync(resolve(root, "timing.json"), "utf8"));
const build = resolve(root, "build");
mkdirSync(resolve(build, "frames"), { recursive: true });
writeFileSync(
  resolve(root, "src/timing-data.js"),
  `globalThis.TIMING = ${JSON.stringify(timing)};\n`,
);

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}
const only = flag("--frames", "");
const frames = only
  ? only.split(",").map((value) => Number(value))
  : Array.from({ length: Number(flag("--to", timing.durationFrames)) - Number(flag("--from", 0)) }, (_, index) => Number(flag("--from", 0)) + index);

const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const file = resolve(root, decodeURIComponent(url.pathname).slice(1));
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1920,1080",
  "--remote-debugging-port=0",
  `--user-data-dir=${resolve(build, `chrome-profile-${process.pid}`)}`,
  "--no-first-run",
  "--disable-extensions",
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

let devtools = "";
function watch(chunk) {
  const match = String(chunk).match(/DevTools listening on (ws:\S+)/);
  if (match) devtools = match[1];
}
chrome.stderr.on("data", watch);
chrome.stdout.on("data", watch);
const started = Date.now();
while (!devtools) {
  if (Date.now() - started > 15000) throw new Error("Chrome did not open a debugging port");
  await new Promise((r) => setTimeout(r, 50));
}

const browser = new WebSocket(devtools);
const pending = new Map();
let seq = 0;
function send(method, params = {}, sessionId) {
  const id = ++seq;
  const message = { id, method, params };
  if (sessionId) message.sessionId = sessionId;
  browser.send(JSON.stringify(message));
  return new Promise((done, reject) => pending.set(id, { done, reject }));
}
browser.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.done(message.result);
  }
});
await new Promise((done) => browser.addEventListener("open", done, { once: true }));

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
}, sessionId);
await send("Page.navigate", { url: `http://127.0.0.1:${port}/src/stage.html?frame=0` }, sessionId);
await new Promise((r) => setTimeout(r, 400));

for (const frame of frames) {
  await send("Runtime.evaluate", {
    expression: `window.renderFrame(${frame})`,
    awaitPromise: true,
  }, sessionId);
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
  }, sessionId);
  const name = `frame-${String(frame).padStart(4, "0")}.png`;
  writeFileSync(resolve(build, "frames", name), Buffer.from(shot.data, "base64"));
  if (frame % 60 === 0) console.log(name);
}

browser.close();
chrome.kill();
server.close();
console.log(`rendered ${frames.length} frames`);
