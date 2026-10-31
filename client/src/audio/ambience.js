// Hallen-Ambiente je Abschnitt: ein durchgehender Klangteppich plus zufällige,
// räumlich verteilte Ereignisse (Durchsagen, Rückfahrwarner, Möwen, Wind …).
import { osc, filter, gain, noiseSrc, rand, pick, mtof } from './synth.js';

// Klangteppiche: Rauschen/Brummen-Bausteine
const BEDS = [
  // Wareneingang: offene Tore, Lüftung, Neonröhren
  { rumble: [160, 0.3], air: [2200, 0.035], hum: [100, 0.012], drone: null, wind: null, water: false },
  // Hochregallager: hohe, stille Halle, Lüftung oben
  { rumble: [120, 0.22], air: [1500, 0.05], hum: [100, 0.008], drone: null, wind: null, water: false },
  // Fördertechnik: dauerndes Maschinenbrummen
  { rumble: [200, 0.32], air: [2600, 0.03], hum: [100, 0.01], drone: [55, 0.05, 9], wind: null, water: false },
  // Staplerzone: Motorbrummen in der Ferne
  { rumble: [140, 0.35], air: [2000, 0.03], hum: [100, 0.008], drone: [38, 0.04, 3], wind: null, water: false },
  // Containerhafen: draußen, Wasser und leichter Wind
  { rumble: [110, 0.18], air: null, hum: null, drone: null, wind: [700, 0.12, 0.08], water: true },
  // Versanddach: kräftiger Wind, Stadt in der Ferne
  { rumble: [90, 0.2], air: null, hum: null, drone: null, wind: [550, 0.3, 0.14], water: false },
];

// Zufallsereignisse je Abschnitt
const EVENTS = [
  ['pa', 'pallet', 'reverse', 'scanner', 'door', 'pallet'],
  ['creak', 'creak', 'clank', 'pallet', 'scanner', 'creak'],
  ['hiss', 'clank', 'scanner', 'pneumatic', 'hiss', 'clank'],
  ['reverse', 'horn', 'pallet', 'clank', 'reverse', 'hiss'],
  ['gull', 'gull', 'ship', 'chain', 'gull', 'clank'],
  ['gull', 'flap', 'plane', 'flap', 'gull'],
];
const EVENT_GAP = [[3, 8], [4, 10], [2.5, 6], [2.5, 6], [3, 8], [4, 9]];

export class Ambience {
  constructor(engine) {
    this.e = engine;
    this.c = engine.ctx;
    this.section = -1;
    this.bed = null;
    this.timer = null;
  }

  setSection(i) {
    if (i === this.section) return;
    this.section = i;
    const t = this.c.currentTime;
    if (this.bed) {
      const old = this.bed;
      old.out.gain.setTargetAtTime(0, t, 1.2);
      setTimeout(() => old.stop(), 6000);
    }
    this.bed = this._makeBed(BEDS[i] || BEDS[0]);
    this.bed.out.gain.setValueAtTime(0, t);
    this.bed.out.gain.setTargetAtTime(1, t, 1.5);
    clearTimeout(this.timer);
    this._queue(rand(1, 3));
  }

  _makeBed(cfg) {
    const c = this.c;
    const out = gain(c, 0);
    out.connect(this.e.bus.ambience);
    const srcs = [];
    const nodes = [out];
    const add = (src, ...chain) => {
      let prev = src;
      for (const n of chain) { prev.connect(n); prev = n; nodes.push(n); }
      prev.connect(out);
      src.start(0, Math.random() * 2);
      srcs.push(src);
    };
    if (cfg.rumble) add(noiseSrc(c, this.e.noise.brown), filter(c, 'lowpass', cfg.rumble[0]), gain(c, cfg.rumble[1]));
    if (cfg.air) add(noiseSrc(c, this.e.noise.pink), filter(c, 'bandpass', cfg.air[0], 0.5), gain(c, cfg.air[1]));
    if (cfg.hum) {
      add(osc(c, 'sine', cfg.hum[0]), gain(c, cfg.hum[1]));
      add(osc(c, 'sine', cfg.hum[0] * 2), gain(c, cfg.hum[1] * 0.4));
    }
    if (cfg.drone) {
      const [f, g, trem] = cfg.drone;
      const am = gain(c, g);
      const lfo = osc(c, 'sine', trem);
      const lg = gain(c, g * 0.5);
      lfo.connect(lg); lg.connect(am.gain); lfo.start(); srcs.push(lfo); nodes.push(lg);
      add(osc(c, 'sawtooth', f), filter(c, 'lowpass', 260), am);
      add(osc(c, 'sawtooth', f * 1.505), filter(c, 'lowpass', 200), gain(c, g * 0.4));
    }
    if (cfg.wind) {
      const [f, g, depth] = cfg.wind;
      const bp = filter(c, 'bandpass', f, 0.9);
      const wg = gain(c, g);
      const bedTimers = [];
      let alive = true;
      add(noiseSrc(c, this.e.noise.pink), bp, wg);
      // Böen: Filter und Lautstärke wandern langsam
      const gust = () => {
        if (!alive) return;
        const t = c.currentTime;
        bp.frequency.setTargetAtTime(f * rand(0.6, 1.8), t, rand(0.8, 2));
        wg.gain.setTargetAtTime(g * rand(1 - depth * 4, 1 + depth * 6), t, rand(0.8, 2));
        bedTimers.push(setTimeout(gust, rand(1500, 4000)));
      };
      bedTimers.push(setTimeout(gust, 500));
      nodes.push({ disconnect: () => { alive = false; bedTimers.forEach(clearTimeout); } });
    }
    if (cfg.water) {
      // Wellen: tiefes Rauschen mit langsamer Lautstärke-Welle
      const wg = gain(c, 0.12);
      const lfo = osc(c, 'sine', 0.13);
      const lg = gain(c, 0.08);
      lfo.connect(lg); lg.connect(wg.gain); lfo.start(); srcs.push(lfo); nodes.push(lg);
      add(noiseSrc(c, this.e.noise.brown), filter(c, 'lowpass', 500), wg);
      const lap = gain(c, 0.02);
      add(noiseSrc(c, this.e.noise.white), filter(c, 'bandpass', 1400, 1.2), lap);
    }
    return {
      out,
      stop: () => {
        for (const s of srcs) { try { s.stop(); s.disconnect(); } catch { /* egal */ } }
        for (const n of nodes) { try { n.disconnect(); } catch { /* egal */ } }
      },
    };
  }

  _queue(sec) {
    this.timer = setTimeout(() => {
      try { this._event(); } catch (e) { console.warn('Ambiente', e); }
      const [a, b] = EVENT_GAP[this.section] || [4, 8];
      this._queue(rand(a, b));
    }, sec * 1000);
  }

  // Zufällige Position um die Kamera, eher in der Ferne
  _somewhere(min = 12, max = 35, dy = [-4, 10]) {
    const L = this.e.listener.pos;
    const a = Math.random() * Math.PI * 2, d = rand(min, max);
    return [L[0] + Math.cos(a) * d, L[1] + rand(dy[0], dy[1]), L[2] + Math.sin(a) * d];
  }

  _event() {
    const c = this.c;
    if (c.state !== 'running') return;
    const s = this.e.sfx;
    const name = pick(EVENTS[this.section] || EVENTS[0]);
    const t = c.currentTime;
    const pos = this._somewhere();
    // Ferne Ereignisse etwas dumpfer
    const make = (vol, p = pos) => {
      const g = this.e.out('ambience', p, vol);
      const lp = filter(c, 'lowpass', 2600);
      lp.connect(g);
      const done = (sec) => setTimeout(() => { for (const n of [lp, g, g._extra]) { try { n && n.disconnect(); } catch { /* egal */ } } }, (sec + 0.5) * 1000);
      return [lp, done];
    };
    switch (name) {
      case 'pa': { // Durchsage-Gong (ohne Sprache)
        const [o, done] = make(1.6, [pos[0], pos[1] + 8, pos[2]]);
        [76, 72, 67].forEach((n, i) => {
          s._tone(t + i * 0.45, o, { type: 'sine', f: mtof(n), peak: 0.16, a: 0.01, d: 1.4 });
          s._tone(t + i * 0.45, o, { type: 'sine', f: mtof(n) * 2.01, peak: 0.04, a: 0.01, d: 0.7 });
        });
        done(3);
        break;
      }
      case 'pallet': { // Palette wird abgesetzt
        const [o, done] = make(1.8);
        s._tone(t, o, { f: 90, f2: 45, peak: 0.5, d: 0.3 });
        s._burst(t, o, { kind: 'pink', type: 'bandpass', f: 600, q: 1.5, peak: 0.45, d: 0.15 });
        for (let i = 1; i < 4; i++) s._burst(t + i * rand(0.07, 0.12), o, { type: 'bandpass', f: rand(700, 1100), q: 2, peak: 0.25 / i, d: 0.06 });
        done(1);
        break;
      }
      case 'reverse': {
        const [o, done] = make(1.4);
        for (let i = 0; i < 6; i++) s._tone(t + i * 0.55, o, { type: 'square', f: 1040, peak: 0.07, a: 0.005, d: 0.25 });
        done(4);
        break;
      }
      case 'scanner': {
        const [o, done] = make(1.2, this._somewhere(8, 20, [-2, 3]));
        s._tone(t, o, { type: 'square', f: 2350, peak: 0.05, a: 0.002, d: 0.09 });
        done(0.4);
        break;
      }
      case 'door': { // Rolltor
        const [o, done] = make(1.3);
        const n = noiseSrc(c, this.e.noise.pink);
        const bp = filter(c, 'bandpass', 380, 2);
        const g = gain(c, 0);
        const am = osc(c, 'square', 14);
        const ag = gain(c, 0.12);
        am.connect(ag); ag.connect(g.gain);
        n.connect(bp); bp.connect(g); g.connect(o);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.4);
        g.gain.setValueAtTime(0.25, t + 2.4);
        g.gain.linearRampToValueAtTime(0, t + 2.9);
        n.start(t); am.start(t); n.stop(t + 3); am.stop(t + 3);
        n.onended = () => { [n, bp, g, am, ag].forEach((x) => x.disconnect()); };
        setTimeout(() => s._tone(c.currentTime, o, { f: 70, f2: 40, peak: 0.4, d: 0.3 }), 2900);
        done(4);
        break;
      }
      case 'creak': { // Regal knarzt unter Last
        const [o, done] = make(1.5, this._somewhere(6, 20, [-2, 6]));
        const os = osc(c, 'sawtooth', rand(45, 70));
        os.frequency.linearRampToValueAtTime(os.frequency.value * rand(0.7, 1.4), t + 0.9);
        const bp = filter(c, 'bandpass', rand(600, 1100), 8);
        const g = gain(c, 0);
        os.connect(bp); bp.connect(g); g.connect(o);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.2);
        g.gain.linearRampToValueAtTime(0, t + 1);
        os.start(t); os.stop(t + 1.05);
        os.onended = () => { [os, bp, g].forEach((x) => x.disconnect()); };
        done(1.5);
        break;
      }
      case 'clank': {
        const [o, done] = make(1.4);
        s._ring(t, o, rand(180, 420), 0.18, 1.1);
        s._tone(t, o, { f: 110, f2: 60, peak: 0.25, d: 0.2 });
        done(1.5);
        break;
      }
      case 'hiss':
      case 'pneumatic': {
        const [o, done] = make(1.3, this._somewhere(6, 20, [-2, 4]));
        s._burst(t, o, { type: 'highpass', f: 2800, peak: 0.22, a: 0.01, d: name === 'hiss' ? 0.7 : 0.25 });
        if (name === 'pneumatic') s._tone(t + 0.25, o, { f: 140, f2: 80, peak: 0.25, d: 0.1 });
        done(1);
        break;
      }
      case 'horn': { // Stapler-Hupe
        const [o, done] = make(1.3);
        for (const f of [392, 494]) s._tone(t, o, { type: 'sawtooth', f, peak: 0.05, a: 0.01, d: 0.35 });
        done(0.6);
        break;
      }
      case 'gull': {
        const [o, done] = make(1.5, this._somewhere(15, 40, [5, 20]));
        const n = Math.floor(rand(2, 5));
        for (let i = 0; i < n; i++) {
          const ti = t + i * rand(0.25, 0.35);
          const os = osc(c, 'sawtooth', 1500);
          os.frequency.setValueAtTime(1300, ti);
          os.frequency.linearRampToValueAtTime(1900, ti + 0.06);
          os.frequency.exponentialRampToValueAtTime(1000, ti + 0.22);
          const bp = filter(c, 'bandpass', 1800, 3);
          const g = gain(c, 0);
          os.connect(bp); bp.connect(g); g.connect(o);
          g.gain.setValueAtTime(0.0001, ti);
          g.gain.linearRampToValueAtTime(0.08, ti + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.24);
          os.start(ti); os.stop(ti + 0.26);
          os.onended = () => { [os, bp, g].forEach((x) => x.disconnect()); };
        }
        done(2);
        break;
      }
      case 'ship': { // Schiffshorn, tief und lang
        const [o, done] = make(2.2, this._somewhere(40, 44, [0, 2]));
        for (const f of [73.4, 110, 146.8]) {
          const os = osc(c, 'sawtooth', f);
          const lp = filter(c, 'lowpass', 500);
          const g = gain(c, 0);
          os.connect(lp); lp.connect(g); g.connect(o);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.06, t + 0.4);
          g.gain.setValueAtTime(0.06, t + 2.6);
          g.gain.linearRampToValueAtTime(0, t + 3.4);
          os.start(t); os.stop(t + 3.5);
          os.onended = () => { [os, lp, g].forEach((x) => x.disconnect()); };
        }
        done(4);
        break;
      }
      case 'chain': s.chainRattle({ pos, n: 14 }); break;
      case 'flap': { // Fahne / Plane im Wind
        const [o, done] = make(1.2, this._somewhere(6, 15, [-1, 4]));
        for (let i = 0; i < 8; i++) s._burst(t + i * rand(0.06, 0.11), o, { kind: 'pink', type: 'bandpass', f: rand(250, 500), q: 1.2, peak: rand(0.15, 0.3), d: 0.05 });
        done(1.2);
        break;
      }
      case 'plane': { // Flugzeug weit oben
        const [o, done] = make(1.0, this._somewhere(40, 44, [20, 30]));
        const n = noiseSrc(c, this.e.noise.pink);
        const bp = filter(c, 'bandpass', 300, 0.8);
        bp.frequency.linearRampToValueAtTime(220, t + 7);
        const g = gain(c, 0);
        n.connect(bp); bp.connect(g); g.connect(o);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.3, t + 3);
        g.gain.linearRampToValueAtTime(0, t + 7);
        n.start(t); n.stop(t + 7.1);
        n.onended = () => { [n, bp, g].forEach((x) => x.disconnect()); };
        done(7.5);
        break;
      }
    }
  }
}
