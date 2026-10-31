// Soundeffekte: Spieler, Seil, Oberfläche und Rückmeldungen.
import { blip, osc, filter, gain, noiseSrc, play, mtof, rand, clamp } from './synth.js';

// Oberflächen-Klangfamilien je Material
function surface(mat = '') {
  if (mat.startsWith('container')) return 'container';
  if (mat === 'beam' || mat === 'lift' || mat === 'upright') return 'metal';
  if (mat === 'grate') return 'grate';
  if (mat === 'belt') return 'belt';
  if (mat === 'carton') return 'carton';
  if (mat === 'crate' || mat === 'goods' || mat === 'trailer') return 'wood';
  return 'concrete'; // concrete, ground, goal …
}

export class Sfx {
  constructor(engine) {
    this.e = engine;
    this.c = engine.ctx;
    this._initLoops();
  }

  // Ausgang (optional räumlich) inkl. Aufräumliste
  _out(o, vol) {
    const g = this.e.out('sfx', o.pos || null, vol * (o.remote ? 0.6 : 1));
    return [g, g._extra].filter(Boolean);
  }

  _noise(kind = 'white', rate = 1) { return noiseSrc(this.c, this.e.noise[kind], rate); }

  // Rauschstoß durch einen Filter
  _burst(t, outNode, { kind = 'white', type = 'bandpass', f = 1000, f2 = null, q = 1, peak = 0.5, a = 0.002, d = 0.1, rate = 1 }) {
    const c = this.c;
    const n = this._noise(kind, rate);
    n.loopStart = Math.random();
    const fl = filter(c, type, f, q);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = gain(c);
    n.connect(fl); fl.connect(g); g.connect(outNode);
    const end = blip(g.gain, t, peak, a, d);
    n.start(t, Math.random() * 1.5);
    n.stop(end + 0.05);
    n.onended = () => { n.disconnect(); fl.disconnect(); g.disconnect(); };
  }

  // Gedämpfter Ton mit Tonhöhenverlauf (Pauke, Schlag)
  _tone(t, outNode, { type = 'sine', f = 200, f2 = null, peak = 0.4, a = 0.003, d = 0.2, detune = 0 }) {
    const c = this.c;
    const o = osc(c, type, f, detune);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = gain(c);
    o.connect(g); g.connect(outNode);
    const end = blip(g.gain, t, peak, a, d);
    play(o, t, end, g);
  }

  // Metallisches Klingen aus unharmonischen Teiltönen
  _ring(t, outNode, base, peak, d, ratios = [1, 2.76, 5.4, 8.93]) {
    ratios.forEach((r, i) => this._tone(t, outNode, { type: 'sine', f: base * r, peak: peak / (i + 1), d: d / (1 + i * 0.6), a: 0.001 }));
  }

  _finish(nodes, after) {
    setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch { /* egal */ } } }, (after + 0.3) * 1000);
  }

  // ───── Spieler ─────
  jump(o = {}) {
    const t = this.c.currentTime;
    const nodes = this._out(o, 0.5);
    const out = nodes[0];
    this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 500, f2: 2200, q: 1.2, peak: 0.35, a: 0.01, d: 0.16 });
    this._tone(t, out, { type: 'triangle', f: rand(260, 300), f2: 460, peak: 0.12, a: 0.005, d: 0.08 });
    this._finish(nodes, 0.3);
  }

  land(o = {}) {
    const t = this.c.currentTime;
    const sp = clamp((o.speed || 6) / 20, 0.15, 1.3);
    const nodes = this._out(o, 0.35 + sp * 0.55);
    const out = nodes[0];
    const kind = surface(o.mat);
    // Grundlegender Aufprall (Körper)
    this._tone(t, out, { f: 130, f2: 45, peak: 0.6 * sp, d: 0.16 + sp * 0.1 });
    this._burst(t, out, { kind: 'brown', type: 'lowpass', f: 500 + sp * 400, peak: 0.6 * sp, d: 0.08 });
    switch (kind) {
      case 'wood':
        this._burst(t, out, { type: 'bandpass', f: 700, q: 3, peak: 0.5 * sp, d: 0.09 });
        this._tone(t, out, { type: 'triangle', f: 210, f2: 160, peak: 0.25 * sp, d: 0.12 });
        break;
      case 'carton':
        this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 380, q: 1.5, peak: 0.5 * sp, d: 0.12 });
        break;
      case 'metal':
        this._ring(t, out, 410, 0.18 * sp, 0.6);
        this._burst(t, out, { type: 'highpass', f: 3500, peak: 0.15 * sp, d: 0.05 });
        break;
      case 'grate':
        this._ring(t, out, 520, 0.12 * sp, 0.35, [1, 2.4, 4.1, 6.7]);
        for (let i = 0; i < 4; i++) this._burst(t + i * 0.022 + rand(0, 0.01), out, { type: 'bandpass', f: 2800, q: 4, peak: 0.25 * sp / (i + 1), d: 0.03 });
        break;
      case 'container':
        this._tone(t, out, { f: 72, f2: 60, peak: 0.55 * sp, d: 0.7 });
        this._ring(t, out, 155, 0.14 * sp, 0.9, [1, 2.13, 3.55]);
        break;
      case 'belt':
        this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 260, q: 1, peak: 0.45 * sp, d: 0.14 });
        this._ring(t, out, 330, 0.06 * sp, 0.25);
        break;
      default:
        this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 900, q: 0.8, peak: 0.3 * sp, d: 0.07 });
    }
    // Harte Landung: Ächzen
    if ((o.speed || 0) > 17 && !o.remote) this._tone(t + 0.02, out, { type: 'sawtooth', f: 150, f2: 95, peak: 0.07, a: 0.02, d: 0.2 });
    this._finish(nodes, 1.2);
  }

  step(o = {}) {
    const t = this.c.currentTime;
    const nodes = this._out(o, 0.22);
    const out = nodes[0];
    const kind = surface(o.mat);
    const v = rand(0.8, 1.1);
    switch (kind) {
      case 'metal':
      case 'grate':
        this._burst(t, out, { type: 'bandpass', f: kind === 'grate' ? 2400 : 1600, q: 3, peak: 0.35 * v, d: 0.05 });
        this._ring(t, out, kind === 'grate' ? rand(560, 640) : rand(420, 470), 0.05 * v, 0.18);
        break;
      case 'container':
        this._tone(t, out, { f: rand(85, 95), f2: 70, peak: 0.25 * v, d: 0.18 });
        this._burst(t, out, { type: 'bandpass', f: 1200, q: 2, peak: 0.2 * v, d: 0.04 });
        break;
      case 'wood':
        this._burst(t, out, { type: 'bandpass', f: rand(650, 800), q: 2.5, peak: 0.4 * v, d: 0.05 });
        break;
      case 'carton':
        this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 420, q: 1.4, peak: 0.45 * v, d: 0.06 });
        break;
      case 'belt':
        this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 300, q: 1.2, peak: 0.45 * v, d: 0.06 });
        break;
      default:
        this._burst(t, out, { kind: 'white', type: 'bandpass', f: rand(1100, 1500), q: 1.2, peak: 0.28 * v, d: 0.045 });
        this._burst(t + 0.015, out, { kind: 'pink', type: 'lowpass', f: 400, peak: 0.25 * v, d: 0.04 });
    }
    this._finish(nodes, 0.4);
  }

  grip() {
    const t = this.c.currentTime;
    const out = this.e.out('sfx', null, 0.35);
    this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 1800, q: 2, peak: 0.4, d: 0.05 });
    this._burst(t + 0.03, out, { kind: 'brown', type: 'lowpass', f: 300, peak: 0.4, d: 0.08 });
    this._finish([out], 0.3);
  }

  // Aufklatschen: dumpfer Aufprall, nasses Platschen, Helm scheppert, Nachtropfen
  splat(o = {}) {
    const t = this.c.currentTime;
    const nodes = this._out(o, 0.9);
    const out = nodes[0];
    this._tone(t, out, { f: 95, f2: 32, peak: 0.9, a: 0.003, d: 0.35 });
    this._burst(t, out, { kind: 'brown', type: 'lowpass', f: 900, f2: 200, peak: 0.9, d: 0.22 });
    for (let i = 0; i < 5; i++) {
      const f = rand(500, 1400);
      this._burst(t + 0.015 + i * rand(0.02, 0.05), out, { kind: 'pink', type: 'bandpass', f, f2: f * 0.4, q: 3, peak: 0.45 / (1 + i * 0.4), d: rand(0.06, 0.14) });
    }
    this._ring(t + 0.35, out, 880, 0.08, 0.3, [1, 2.7, 5.2]);
    this._ring(t + 0.62, out, 930, 0.05, 0.25, [1, 2.7, 5.2]);
    for (let i = 0; i < 4; i++) this._tone(t + 0.5 + i * rand(0.15, 0.3), out, { type: 'sine', f: rand(900, 1300), f2: rand(400, 600), peak: 0.05, a: 0.002, d: 0.06 });
    this._finish(nodes, 2);
  }

  respawn() {
    const t = this.c.currentTime;
    const out = this.e.out('sfx', null, 0.4);
    this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 300, f2: 3000, q: 2, peak: 0.25, a: 0.15, d: 0.25 });
    [0, 4, 7, 12].forEach((s, i) => this._tone(t + 0.12 + i * 0.05, out, { type: 'triangle', f: mtof(67 + s), peak: 0.1, d: 0.25 }));
    this._finish([out], 1);
  }

  // ───── Seil ─────
  ropeTwang() {
    const t = this.c.currentTime;
    const c = this.c;
    const out = this.e.out('sfx', null, 0.5);
    // gezupfte, tiefe Saite: Sägezahn durch sich schließenden Tiefpass
    const o = osc(c, 'sawtooth', rand(92, 104));
    o.frequency.exponentialRampToValueAtTime(o.frequency.value * 0.94, t + 0.4);
    const f = filter(c, 'lowpass', 2400, 6);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.35);
    const g = gain(c);
    o.connect(f); f.connect(g); g.connect(out);
    play(o, t, blip(g.gain, t, 0.35, 0.002, 0.45), f, g);
    this._burst(t, out, { kind: 'pink', type: 'bandpass', f: 900, q: 3, peak: 0.25, d: 0.12 });
    this._finish([out], 0.9);
  }

  _initLoops() {
    const c = this.c;
    // Seil-Knarzen: gefiltertes Rauschen mit unregelmäßigem "Reiben"
    this.creakSrc = this._noise('white', 1);
    this.creakF = filter(c, 'bandpass', 700, 9);
    this.creakAM = gain(c, 0);
    this.creakG = gain(c, 0);
    const lfo = osc(c, 'sawtooth', 11);
    const lfoG = gain(c, 0.5);
    lfo.connect(lfoG); lfoG.connect(this.creakAM.gain);
    this.creakAM.gain.value = 0.5;
    this.creakLfo = lfo;
    this.creakSrc.connect(this.creakF); this.creakF.connect(this.creakAM); this.creakAM.connect(this.creakG);
    this.creakG.connect(this.e.bus.sfx);
    this.creakSrc.start(); lfo.start();

    // Fallwind
    this.windSrc = this._noise('pink', 1);
    this.windF = filter(c, 'bandpass', 500, 0.8);
    this.windG = gain(c, 0);
    this.windSrc.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.e.bus.sfx);
    this.windSrc.start();
  }

  setTension(ten) {
    const t = this.c.currentTime;
    const k = clamp((ten - 0.93) / 0.12);
    this.creakG.gain.setTargetAtTime(k * 0.22, t, 0.05);
    this.creakF.frequency.setTargetAtTime(500 + k * 700 + Math.random() * 120, t, 0.03);
    this.creakLfo.frequency.setTargetAtTime(7 + k * 9 + Math.random() * 3, t, 0.1);
  }

  // Fallwind und Sturmböen teilen sich ein Rauschen. gust = Böenstärke 0..1 am Spieler
  setFall(speed, vy, gust = 0) {
    const t = this.c.currentTime;
    const k = Math.max(vy < -6 ? clamp((speed - 9) / 18) : 0, gust > 0 ? 0.25 + 0.6 * gust : 0);
    this.windG.gain.setTargetAtTime(k * 0.4, t, 0.12);
    this.windF.frequency.setTargetAtTime(350 + k * 1300, t, 0.15);
  }

  // ───── Rückmeldungen / Oberfläche ─────
  _chime(notes, { type = 'triangle', gap = 0.09, d = 0.35, peak = 0.14, vol = 0.5 } = {}) {
    const t = this.c.currentTime;
    const out = this.e.out('sfx', null, vol);
    notes.forEach((n, i) => {
      this._tone(t + i * gap, out, { type, f: mtof(n), peak, d });
      this._tone(t + i * gap, out, { type: 'sine', f: mtof(n + 12), peak: peak * 0.3, d: d * 0.6 });
    });
    this._finish([out], notes.length * gap + d + 0.2);
  }

  ui() { this._chime([76], { gap: 0, d: 0.08, peak: 0.12, type: 'square', vol: 0.25 }); }
  uiBack() { this._chime([71], { gap: 0, d: 0.08, peak: 0.12, type: 'square', vol: 0.25 }); }
  uiHover() { this._chime([88], { gap: 0, d: 0.03, peak: 0.06, type: 'sine', vol: 0.2 }); }
  join() { this._chime([67, 71, 74, 79]); }
  leave() { this._chime([74, 70, 67], { gap: 0.12 }); }
  toast() { this._chime([79], { d: 0.15, peak: 0.08, type: 'sine', vol: 0.3 }); }
  mute() { this._chime([72, 67], { gap: 0.07, d: 0.1, type: 'square', vol: 0.25 }); }

  emote(o = {}) {
    // Zuruf: zwei kurze "Pfiffe", je Zuruf andere Melodie
    const melodies = [[79, 74], [72, 79], [84, 84]];
    const m = melodies[(o.index || 0) % melodies.length];
    const t = this.c.currentTime;
    const out = this.e.out('sfx', o.pos || null, 0.4);
    m.forEach((n, i) => {
      const c = this.c;
      const o2 = osc(c, 'sine', mtof(n) * 0.97);
      o2.frequency.linearRampToValueAtTime(mtof(n), t + i * 0.16 + 0.04);
      const g = gain(c);
      o2.connect(g); g.connect(out);
      play(o2, t + i * 0.16, blip(g.gain, t + i * 0.16, 0.18, 0.02, 0.13), g);
    });
    this._finish([out, out._extra].filter(Boolean), 0.8);
  }

  section(o = {}) {
    // Abschnitt erreicht: Gong + Durakkord
    const t = this.c.currentTime;
    const out = this.e.out('sfx', null, 0.45);
    this._ring(t, out, 220 * 2 ** ((o.section || 0) / 12), 0.25, 2.2, [1, 2.0, 2.76, 4.07, 5.4]);
    [0, 4, 7].forEach((s, i) => this._tone(t + 0.05 + i * 0.07, out, { type: 'triangle', f: mtof(64 + s + (o.section || 0)), peak: 0.1, a: 0.01, d: 0.9 }));
    this._finish([out], 2.6);
  }

  finish() {
    this.e.duckMusic(5, 0.15);
    const t = this.c.currentTime;
    const out = this.e.out('sfx', null, 0.6);
    const fan = [[60, 0], [64, 0.14], [67, 0.28], [72, 0.42], [67, 0.62], [72, 0.76], [76, 0.9]];
    for (const [n, dt] of fan) {
      this._tone(t + dt, out, { type: 'sawtooth', f: mtof(n), peak: 0.06, a: 0.01, d: 0.3 });
      this._tone(t + dt, out, { type: 'triangle', f: mtof(n), peak: 0.12, a: 0.01, d: 0.35 });
    }
    [60, 64, 67, 72, 76].forEach((n) => this._tone(t + 1.1, out, { type: 'triangle', f: mtof(n), peak: 0.09, a: 0.02, d: 2.2 }));
    this._burst(t + 0.9, out, { type: 'highpass', f: 5000, peak: 0.25, a: 0.25, d: 1.6 });
    this._finish([out], 3.6);
  }

  // ───── Maschinen-Einzelklänge (räumlich) ─────
  clunk(o = {}) {
    const t = this.c.currentTime;
    const nodes = [this.e.out('ambience', o.pos, 0.6)];
    if (nodes[0]._extra) nodes.push(nodes[0]._extra);
    this._tone(t, nodes[0], { f: 95, f2: 50, peak: 0.5, d: 0.25 });
    this._ring(t, nodes[0], o.ring || 240, 0.12, 0.5);
    this._finish(nodes, 0.9);
  }

  hiss(o = {}) {
    const t = this.c.currentTime;
    const nodes = [this.e.out('ambience', o.pos, 0.4)];
    if (nodes[0]._extra) nodes.push(nodes[0]._extra);
    this._burst(t, nodes[0], { type: 'highpass', f: 3000, peak: 0.3, a: 0.02, d: o.d || 0.5 });
    this._finish(nodes, (o.d || 0.5) + 0.2);
  }

  beeps(o = {}) {
    // Rückfahrwarner: n kurze Pieptöne
    const t = this.c.currentTime;
    const nodes = [this.e.out('ambience', o.pos, o.vol || 0.35)];
    if (nodes[0]._extra) nodes.push(nodes[0]._extra);
    const n = o.n || 4;
    for (let i = 0; i < n; i++) this._tone(t + i * 0.5, nodes[0], { type: 'square', f: o.f || 1040, peak: 0.12, a: 0.005, d: 0.22 });
    this._finish(nodes, n * 0.5 + 0.3);
  }

  chainRattle(o = {}) {
    const t = this.c.currentTime;
    const nodes = [this.e.out('ambience', o.pos, 0.5)];
    if (nodes[0]._extra) nodes.push(nodes[0]._extra);
    const n = o.n || 10;
    for (let i = 0; i < n; i++) {
      this._burst(t + i * 0.045 + rand(0, 0.02), nodes[0], { type: 'bandpass', f: rand(2400, 3600), q: 5, peak: rand(0.1, 0.25), d: 0.04 });
    }
    this._finish(nodes, n * 0.05 + 0.3);
  }
}
