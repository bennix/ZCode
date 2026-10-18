const T = globalThis.TIMING;
const $ = (id) => document.getElementById(id);

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeIn(t) {
  return t * t * t;
}

function spring(t) {
  return 1 - Math.exp(-5.4 * t) * Math.cos(4.1 * t * Math.PI);
}

function ease(name, t) {
  if (name === "in") return easeIn(t);
  if (name === "out") return easeOut(t);
  if (name === "spring") return spring(t);
  return easeInOut(t);
}

function val(keys, frame) {
  if (frame <= keys[0].f) return keys[0].v;
  const last = keys[keys.length - 1];
  if (frame >= last.f) return last.v;
  let i = 1;
  while (keys[i].f < frame) i += 1;
  const a = keys[i - 1];
  const b = keys[i];
  const t = (frame - a.f) / (b.f - a.f);
  return a.v + (b.v - a.v) * ease(b.ease || "inOut", t);
}

function ramp(frame, a, b, name) {
  if (b === a) return frame >= b ? 1 : 0;
  return ease(name || "out", clamp01((frame - a) / (b - a)));
}

function cue(id) {
  return T.cues.find((item) => item.id === id).frame;
}

function scene(id) {
  return T.scenes.find((item) => item.id === id);
}

function wipe(frame, start, dur) {
  const t = easeOut(clamp01((frame - start) / dur));
  return `inset(0 ${((1 - t) * 100).toFixed(3)}% 0 0)`;
}

function blurPx(distance) {
  if (distance < 5) return "none";
  return `blur(${Math.min(9, (distance - 5) / 3.2).toFixed(2)}px)`;
}

function anticipate(frame) {
  let scale = 1;
  for (const cut of T.scenes) {
    if (cut.in === 0) continue;
    const lead = cut.in - frame;
    if (lead >= 0 && lead < 10) {
      const t = 1 - lead / 10;
      scale *= 1 - 0.045 * Math.sin(t * Math.PI);
    }
  }
  return scale;
}

function placeHook(el, frame, delay) {
  const t = ramp(frame, 156 + delay, 184 + delay, "in");
  el.style.opacity = t >= 1 ? "0" : "1";
  el.style.clipPath = `inset(0 0 ${(t * 100).toFixed(2)}% 0)`;
  el.style.transform = `translateX(-50%) translateY(${(-32 * t).toFixed(2)}px)`;
}

function box(el, frame, x, y, w, h, opacity) {
  const prevX = x(frame - 1);
  const prevY = y(frame - 1);
  const drift = Math.sin(frame / 18) * 6;
  el.style.left = `${x(frame).toFixed(2)}px`;
  el.style.top = `${(y(frame) + drift).toFixed(2)}px`;
  el.style.width = `${w(frame).toFixed(2)}px`;
  el.style.height = `${h(frame).toFixed(2)}px`;
  el.style.opacity = String(opacity(frame));
  el.style.filter = blurPx(Math.hypot(x(frame) - prevX, y(frame) - prevY));
}

function apply(frame) {
  const message = cue("message");
  const file = cue("file");
  const hold = scene("filehold");
  const word = cue("wordmark");
  const version = cue("version");
  const url = cue("url");
  const iconEnd = T.icon.end;

  $("stage").style.setProperty("--gx", `${48 + Math.sin(frame / 26) * 30}%`);
  $("stage").style.setProperty("--gy", `${16 + Math.cos(frame / 32) * 18}%`);

  placeHook($("kicker"), frame, 0);
  placeHook($("headline"), frame, 0);

  const panelIn = ramp(frame, 176, 214, "out");
  const panelOut = ramp(frame, 380, 440, "in");
  const panel = $("panel");
  const panelShift = (f) => 32 * (1 - ramp(f, 176, 214, "out")) - 36 * ramp(f, 380, 440, "in");
  const panelY = panelShift(frame);
  panel.style.opacity = String(panelIn * (1 - panelOut));
  panel.style.transform = `translateY(${panelY.toFixed(2)}px) scale(${(0.96 + 0.04 * panelIn + 0.04 * panelOut).toFixed(4)})`;
  panel.style.filter = blurPx(Math.abs(panelY - panelShift(frame - 1)) * 2);

  const phoneIn = ramp(frame, 480, 540, "out");
  const phoneOut = ramp(frame, 980, 1040, "in");
  const phone = $("phone");
  const phoneShift = (f) => 40 * (1 - ramp(f, 480, 540, "out")) - 56 * ramp(f, 980, 1040, "in");
  const phoneY = phoneShift(frame);
  phone.style.opacity = String(phoneIn * (1 - phoneOut));
  phone.style.transform = `translateY(${phoneY.toFixed(2)}px) scale(${(0.94 + 0.06 * phoneIn + 0.05 * phoneOut).toFixed(4)})`;
  phone.style.filter = blurPx(Math.abs(phoneY - phoneShift(frame - 1)) > 2 ? Math.abs(phoneY - phoneShift(frame - 1)) / 3 : 0);

  const leave = (f) => ramp(f, hold.out - 28, hold.out + 4, "in");
  const close = (f) => ramp(f, hold.in, hold.in + 64, "inOut");
  const taskX = (f) => val([
    { f: 0, v: 680 },
    { f: 400, v: 680 },
    { f: 560, v: 780, ease: "inOut" },
    { f: 980, v: 780 },
    { f: hold.in + 64, v: 520, ease: "inOut" },
    { f: 1320, v: 520 },
  ], f);
  const taskY = (f) => val([
    { f: 0, v: 250 },
    { f: 400, v: 250 },
    { f: 560, v: 412, ease: "inOut" },
    { f: 980, v: 412 },
    { f: hold.in + 64, v: 210, ease: "inOut" },
    { f: 1320, v: 210 },
  ], f);
  const taskW = (f) => val([
    { f: 0, v: 640 },
    { f: 400, v: 640 },
    { f: 560, v: 360, ease: "inOut" },
    { f: 980, v: 360 },
    { f: hold.in + 64, v: 480, ease: "inOut" },
    { f: 1320, v: 480 },
  ], f);
  const taskH = (f) => val([
    { f: 0, v: 520 },
    { f: 400, v: 520 },
    { f: 560, v: 240, ease: "inOut" },
    { f: 980, v: 240 },
    { f: hold.in + 64, v: 340, ease: "inOut" },
    { f: 1320, v: 340 },
  ], f);
  const task = $("task");
  box(task, frame, taskX, taskY, taskW, taskH, (f) => ramp(f, 188, 222, "out") * (1 - leave(f)));
  const taskScale = taskH(frame) / 520;
  task.querySelector("strong").style.fontSize = `${Math.max(16, 28 * taskScale).toFixed(1)}px`;
  task.querySelector("em").style.fontSize = `${Math.max(13, 18 * taskScale).toFixed(1)}px`;
  $("prog").querySelector("b").style.transform = `scaleX(${ramp(frame, cue("progress"), cue("progress") + 140, "out").toFixed(4)})`;

  const bubble = $("bubble");
  const bubbleIn = ramp(frame, message - 8, message + 16, "spring");
  bubble.style.opacity = String(bubbleIn * (1 - ramp(frame, hold.in - 8, hold.in + 24, "in")));
  bubble.style.left = "800px";
  bubble.style.top = `${(336 + Math.sin(frame / 18) * 5).toFixed(2)}px`;
  bubble.style.width = "210px";
  bubble.style.height = "56px";
  bubble.style.transform = `scale(${(0.9 + 0.1 * Math.min(bubbleIn, 1.05)).toFixed(4)})`;

  const fileX = (f) => val([
    { f: 0, v: 780 },
    { f: 980, v: 780 },
    { f: hold.in + 64, v: 860, ease: "inOut" },
    { f: 1320, v: 860 },
  ], f);
  const fileY = (f) => val([
    { f: 0, v: 860 },
    { f: file - 20, v: 860 },
    { f: file + 16, v: 672, ease: "out" },
    { f: 980, v: 672 },
    { f: hold.in + 64, v: 400, ease: "inOut" },
    { f: 1320, v: 400 },
  ], f);
  const fileW = (f) => val([
    { f: 0, v: 360 },
    { f: 980, v: 360 },
    { f: hold.in + 64, v: 500, ease: "inOut" },
    { f: 1320, v: 500 },
  ], f);
  const fileH = (f) => val([
    { f: 0, v: 180 },
    { f: 980, v: 180 },
    { f: hold.in + 64, v: 360, ease: "inOut" },
    { f: 1320, v: 360 },
  ], f);
  const card = $("filecard");
  box(card, frame, fileX, fileY, fileW, fileH, (f) => ramp(f, file - 10, file + 14, "out") * (1 - leave(f)));
  card.querySelector("strong").style.fontSize = `${(22 + 20 * close(frame)).toFixed(1)}px`;
  card.style.transform = `scale(${(0.94 + 0.06 * ramp(frame, file - 8, file + 18, "spring")).toFixed(4)})`;

  placeLine($("word"), word, 392, 0, frame);
  placeLine($("version"), version, 540, 0, frame);
  placeLine($("url"), url, 608, 0, frame);
  placeMark(frame, iconEnd);
}

function placeLine(el, start, top, y, frame) {
  const shown = ramp(frame, start, start + 16, "out");
  el.style.top = `${top}px`;
  el.style.opacity = String(shown);
  el.style.clipPath = wipe(frame, start, 18);
  el.style.transform = `translateY(${((1 - shown) * 18 + y).toFixed(2)}px)`;
}

function placeMark(frame, iconEnd) {
  const bob = Math.sin(frame / 14) * 7;
  const x = val([
    { f: 0, v: 960 },
    { f: 160, v: 960 },
    { f: 230, v: 452, ease: "inOut" },
    { f: 360, v: 452 },
    { f: 540, v: 960, ease: "inOut" },
    { f: 1000, v: 960 },
    { f: 1064, v: 620, ease: "inOut" },
    { f: 1160, v: 620 },
    { f: iconEnd.arrive, v: iconEnd.x, ease: "inOut" },
  ], frame);
  const y = val([
    { f: 0, v: 360 },
    { f: 160, v: 360 },
    { f: 230, v: 178, ease: "inOut" },
    { f: 360, v: 178 },
    { f: 540, v: 248, ease: "inOut" },
    { f: 1000, v: 248 },
    { f: 1064, v: 168, ease: "inOut" },
    { f: 1160, v: 168 },
    { f: iconEnd.arrive, v: iconEnd.y, ease: "inOut" },
  ], frame) + bob;
  const size = val([
    { f: 0, v: 168 },
    { f: 160, v: 168 },
    { f: 230, v: 48, ease: "inOut" },
    { f: 360, v: 48 },
    { f: 540, v: 64, ease: "inOut" },
    { f: 1160, v: 64 },
    { f: iconEnd.arrive, v: iconEnd.size, ease: "inOut" },
  ], frame);
  const prevX = val([
    { f: 0, v: 960 },
    { f: 160, v: 960 },
    { f: 230, v: 452, ease: "inOut" },
    { f: 360, v: 452 },
    { f: 540, v: 960, ease: "inOut" },
    { f: 1000, v: 960 },
    { f: 1064, v: 620, ease: "inOut" },
    { f: 1160, v: 620 },
    { f: iconEnd.arrive, v: iconEnd.x, ease: "inOut" },
  ], frame - 1);
  const prevY = val([
    { f: 0, v: 360 },
    { f: 160, v: 360 },
    { f: 230, v: 178, ease: "inOut" },
    { f: 360, v: 178 },
    { f: 540, v: 248, ease: "inOut" },
    { f: 1000, v: 248 },
    { f: 1064, v: 168, ease: "inOut" },
    { f: 1160, v: 168 },
    { f: iconEnd.arrive, v: iconEnd.y, ease: "inOut" },
  ], frame - 1) + Math.sin((frame - 1) / 14) * 7;
  const mark = $("mark");
  mark.style.left = `${x}px`;
  mark.style.top = `${y}px`;
  mark.style.width = `${size}px`;
  mark.style.height = `${size}px`;
  mark.style.transform = `translate(-50%, -50%) scale(${(anticipate(frame)).toFixed(4)})`;
  mark.style.filter = blurPx(Math.hypot(x - prevX, y - prevY));
}

window.renderFrame = async (frame) => {
  if (!document.fonts.check("156px 'Film Serif'") || !document.fonts.check("32px 'Film Sans'")) {
    await document.fonts.ready;
  }
  apply(frame);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

const params = new URLSearchParams(location.search);
const initial = Number(params.get("frame") || 0);
if (params.get("ui") === "1") {
  document.addEventListener("keydown", (event) => {
    const current = Number(params.get("frame") || 0);
    const next = event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : current;
    if (next !== current) {
      params.set("frame", String(Math.max(0, next)));
      history.replaceState(null, "", `?${params}`);
      void window.renderFrame(next);
    }
  });
}
void window.renderFrame(initial);
