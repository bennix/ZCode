import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const timing = JSON.parse(readFileSync(resolve(root, "timing.json"), "utf8"));
const build = resolve(root, "build");
mkdirSync(build, { recursive: true });

const sr = timing.sampleRate;
const n = Math.round(timing.durationSeconds * sr);
const musicL = new Float64Array(n);
const musicR = new Float64Array(n);
const sfxL = new Float64Array(n);
const sfxR = new Float64Array(n);

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function add(buf, index, value) {
  if (index >= 0 && index < buf.length) buf[index] += value;
}

const chords = [
  [50, 53, 57],
  [46, 50, 53],
  [53, 57, 60],
  [50, 57, 62],
];

for (let beat = 0; beat < timing.beats.length; beat += 1) {
  const chord = chords[Math.min(chords.length - 1, Math.floor(beat / 8))];
  const start = Math.round((timing.beats[beat] / timing.fps) * sr);
  const dur = Math.round((8 * timing.beatFrames / timing.fps) * sr);
  if (beat % 8 !== 0) continue;
  for (const note of chord) {
    const freq = midi(note);
    for (let i = 0; i < dur && start + i < n; i += 1) {
      const t = i / sr;
      const env = Math.min(1, t / 0.08) * Math.min(1, (dur - i) / sr / 0.4);
      const body = Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 1.003 * t);
      const sample = body * env * 0.055;
      add(musicL, start + i, sample);
      add(musicR, start + i, sample * 0.96);
    }
  }
  const bass = midi(chord[0] - 12);
  const bassDur = Math.round(0.55 * sr);
  for (let i = 0; i < bassDur && start + i < n; i += 1) {
    const t = i / sr;
    const env = Math.exp(-3.2 * t);
    const sample = Math.sin(2 * Math.PI * bass * t) * env * 0.09;
    add(musicL, start + i, sample);
    add(musicR, start + i, sample);
  }
}

for (let beat = 0; beat < timing.beats.length; beat += 1) {
  const chord = chords[Math.min(chords.length - 1, Math.floor(beat / 8))];
  const degree = [0, 7, 12, 7, 3, 12, 7, 0][beat % 8];
  const freq = midi(chord[0] + 12 + degree);
  const start = Math.round((timing.beats[beat] / timing.fps) * sr);
  const accent = beat % 4 === 0 ? 1 : 0.55;
  const dur = Math.round(0.18 * sr);
  for (let i = 0; i < dur && start + i < n; i += 1) {
    const t = i / sr;
    const env = Math.exp(-14 * t);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.045 * accent;
    add(musicL, start + i, sample);
    add(musicR, start + i, sample);
  }
}

function noiseBurst(seed, startFrame, seconds, gain, freq, pan) {
  const rand = lcg(seed);
  const start = Math.round((startFrame / timing.fps) * sr);
  const dur = Math.round(seconds * sr);
  let low = 0;
  const coeff = Math.exp((-2 * Math.PI * freq) / sr);
  for (let i = 0; i < dur; i += 1) {
    const white = rand() * 2 - 1;
    low = (1 - coeff) * white + coeff * low;
    const env = Math.sin((Math.PI * i) / dur) ** 1.4 * Math.exp(-2.2 * (i / dur));
    const sample = low * env * gain;
    add(sfxL, start + i, sample * (1 - pan));
    add(sfxR, start + i, sample * pan);
  }
}

function tone(startFrame, seconds, gain, freq, decay) {
  const start = Math.round((startFrame / timing.fps) * sr);
  const dur = Math.round(seconds * sr);
  for (let i = 0; i < dur; i += 1) {
    const t = i / sr;
    const sample = Math.sin(2 * Math.PI * freq * t) * Math.exp(-decay * t) * gain;
    add(sfxL, start + i, sample);
    add(sfxR, start + i, sample);
  }
}

for (const hit of timing.sfx) {
  if (hit.id.startsWith("whoosh")) noiseBurst(1000 + hit.frame, hit.frame, 0.22, 0.16, 1400, 0.62);
  if (hit.id.startsWith("click")) tone(hit.frame, 0.045, 0.12, 2400, 48);
  if (hit.id.startsWith("impact")) tone(hit.frame, 0.14, 0.14, 140, 10);
  if (hit.id.startsWith("tick")) tone(hit.frame, 0.04, 0.07, 1800, 60);
}

let musicPeak = 0;
let sfxPeak = 0;
for (let i = 0; i < n; i += 1) {
  musicPeak = Math.max(musicPeak, Math.abs(musicL[i]), Math.abs(musicR[i]));
  sfxPeak = Math.max(sfxPeak, Math.abs(sfxL[i]), Math.abs(sfxR[i]));
}

const musicGain = musicPeak > 0 ? 0.45 / musicPeak : 0;
const sfxGain = sfxPeak > 0 ? 0.22 / sfxPeak : 0;
const mixL = new Float64Array(n);
const mixR = new Float64Array(n);
const stemL = new Float64Array(n);
const stemR = new Float64Array(n);
for (let i = 0; i < n; i += 1) {
  stemL[i] = musicL[i] * musicGain;
  stemR[i] = musicR[i] * musicGain;
  mixL[i] = stemL[i] + sfxL[i] * sfxGain;
  mixR[i] = stemR[i] + sfxR[i] * sfxGain;
}

function writeWav(file, left, right) {
  const header = 44;
  const buffer = Buffer.alloc(header + n * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + n * 4, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sr, 24);
  buffer.writeUInt32LE(sr * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buffer.writeInt16LE(Math.round(l * 32767), header + i * 4);
    buffer.writeInt16LE(Math.round(r * 32767), header + 2 + i * 4);
  }
  writeFileSync(file, buffer);
}

writeWav(resolve(build, "music.wav"), stemL, stemR);
writeWav(resolve(build, "mix.wav"), mixL, mixR);

function loudnorm(input, output) {
  const probe = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", input, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const text = `${probe.stdout}\n${probe.stderr}`;
  const match = text.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!match) {
    console.error(text);
    process.exit(1);
  }
  const measured = JSON.parse(match[0]);
  const filter = [
    `loudnorm=I=-14:TP=-1.5:LRA=11`,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
  const run = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-i", input, "-af", filter, "-ar", String(sr), "-c:a", "pcm_s16le", output],
    { encoding: "utf8" },
  );
  if (run.status !== 0) {
    console.error(run.stderr);
    process.exit(1);
  }
}

loudnorm(resolve(build, "mix.wav"), resolve(build, "mix-norm.wav"));
console.log(JSON.stringify({ frames: n, musicGain, sfxGain, musicPeak, sfxPeak }));
