// Kleine Bausteine für prozedurale Klänge mit der Web Audio API.
// Es gibt keine Audiodateien: alles wird zur Laufzeit erzeugt.

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Rauschen als Puffer, wird einmal erzeugt und in Schleife abgespielt.
export function makeNoise(ctx, kind = 'white', seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    } else d[i] = w;
  }
  // Übergang am Schleifenende glätten
  const fade = Math.min(256, len >> 2);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
  }
  return buf;
}

// Künstliche Hallfahne (Stereo) für den Lagerhallen-Raumklang.
export function makeIR(ctx, seconds = 2.6, decay = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      // frühe Reflexionen von Regalen/Wänden
      const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? 2 : 1;
      d[i] = (Math.random() * 2 - 1) * (1 - k) ** decay * early;
    }
  }
  return buf;
}

// Einfache Hüllkurve: Anstieg auf peak, exponentielles Ausklingen.
export function blip(param, t, peak, attack, decay, from = 0.0001) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(from, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return t + attack + decay;
}

export function osc(ctx, type, freq, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

export function filter(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

export function gain(ctx, v = 0) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

// Kette verbinden: chain(a, b, c) → a→b→c, gibt das erste Glied zurück
export function chain(...nodes) {
  for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
  return nodes[0];
}

// Quelle starten, stoppen und danach aufräumen
export function play(src, t, stopAt, ...cleanup) {
  src.start(t);
  src.stop(stopAt + 0.05);
  src.onended = () => {
    try { src.disconnect(); } catch { /* egal */ }
    for (const n of cleanup) { try { n.disconnect(); } catch { /* egal */ } }
  };
}

export function noiseSrc(ctx, buffer, rate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.playbackRate.value = rate;
  return s;
}
