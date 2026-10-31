// Kleine synthetische Soundeffekte (WebAudio) – keine Asset-Dateien nötig.
import { settings } from './settings.js';

let ctx = null;
let master = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
    settings.onChange(applyVolume);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function applyVolume() {
  if (master) master.gain.value = settings.get().volume * 0.5;
}

// Muss nach einer Nutzeraktion aufgerufen werden (Autoplay-Regeln)
export function unlockAudio() { ensure(); }

function tone(freq, dur, { type = 'sine', to = freq, gain = 0.4, delay = 0 } = {}) {
  const c = ensure();
  if (!c || settings.get().volume <= 0) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, { gain = 0.3, freq = 800 } = {}) {
  const c = ensure();
  if (!c || settings.get().volume <= 0) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  jump: () => tone(260, 0.16, { type: 'triangle', to: 520, gain: 0.25 }),
  land: (strength = 1) => noise(0.12, { gain: 0.25 * Math.min(1.5, strength), freq: 500 }),
  emote: () => { tone(660, 0.1, { gain: 0.18 }); tone(880, 0.12, { gain: 0.18, delay: 0.09 }); },
  join: () => { tone(440, 0.12, { type: 'triangle', gain: 0.2 }); tone(660, 0.16, { type: 'triangle', gain: 0.2, delay: 0.1 }); },
  tension: () => tone(110, 0.25, { type: 'sawtooth', to: 90, gain: 0.06 }),
  click: () => tone(900, 0.04, { type: 'square', gain: 0.05 }),
  goal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.22, delay: i * 0.13 })),
};
