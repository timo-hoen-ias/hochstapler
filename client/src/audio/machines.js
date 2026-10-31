// Räumliche Maschinengeräusche: Förderbänder, Stapler-Gabeln (Lifts),
// fahrende Stapler (Slides) und Kräne (Swings). Schleifen laufen nur, solange
// die Kamera in der Nähe ist; Start/Stopp der Bewegung erzeugt Einzelklänge.
import { moverProgress } from '../level.js';
import { osc, filter, gain, noiseSrc } from './synth.js';

const NEAR = 30;   // ab hier Schleife starten
const FAR = 36;    // ab hier Schleife beenden

function center(b) {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

// Bewegungsphase: 0 halten, 1 hin, 2 halten, 3 zurück – und Geschwindigkeit 0..1
function phaseOf(m, t) {
  const u = (((t / m.period) + m.phase) % 1 + 1) % 1;
  let seg = 0, x = 0;
  if (u < 0.2) seg = 0;
  else if (u < 0.5) { seg = 1; x = (u - 0.2) / 0.3; }
  else if (u < 0.7) seg = 2;
  else { seg = 3; x = (u - 0.7) / 0.3; }
  const speed = seg === 1 || seg === 3 ? 6 * x * (1 - x) / 1.5 : 0;
  return { seg, speed, s: moverProgress(u) };
}

export class Machines {
  constructor(engine, world) {
    this.e = engine;
    this.c = engine.ctx;
    this.belts = world.statics.filter((b) => b.belt).map((b) => ({ box: b, speed: Math.hypot(b.belt[0], b.belt[2]), voice: null }));
    this.movers = world.moverBoxes.map((b) => ({ box: b, m: b.mover, voice: null, seg: -1 }));
  }

  update(t) {
    if (t === undefined || t === null) return;
    for (const b of this.belts) this._belt(b);
    for (const m of this.movers) this._mover(m, t);
  }

  _spatialize(v, pos, vol) {
    const s = this.e.spatial(pos, 4, FAR);
    const now = this.c.currentTime;
    v.out.gain.setTargetAtTime(vol * s.gain, now, 0.08);
    v.pan.pan.setTargetAtTime(s.pan, now, 0.08);
    return s.dist;
  }

  _voice(build) {
    const c = this.c;
    const out = gain(c, 0);
    const pan = c.createStereoPanner();
    out.connect(pan); pan.connect(this.e.bus.ambience);
    const v = { out, pan, srcs: [], nodes: [out, pan] };
    build(v);
    for (const s of v.srcs) s.start(0, s.buffer ? Math.random() * 2 : undefined);
    return v;
  }

  _kill(v) {
    v.out.gain.setTargetAtTime(0, this.c.currentTime, 0.1);
    setTimeout(() => {
      for (const s of v.srcs) { try { s.stop(); } catch { /* egal */ } }
      for (const n of [...v.srcs, ...v.nodes]) { try { n.disconnect(); } catch { /* egal */ } }
    }, 600);
  }

  // Hilfsfunktion: Quelle → Kette → Ausgang
  _add(v, src, ...nodes) {
    let p = src;
    for (const n of nodes) { p.connect(n); p = n; v.nodes.push(n); }
    p.connect(v.out);
    v.srcs.push(src);
  }

  // ───── Förderband: Rollen-Rattern + Motor ─────
  _belt(b) {
    const pos = center(b.box);
    const d = Math.hypot(pos[0] - this.e.listener.pos[0], pos[1] - this.e.listener.pos[1], pos[2] - this.e.listener.pos[2]);
    if (!b.voice && d < NEAR) {
      b.voice = this._voice((v) => {
        const c = this.c;
        // Rattern: Rauschen, im Takt der Rollen moduliert
        const am = gain(c, 0.5);
        const lfo = osc(c, 'square', 4 + b.speed * 4);
        const lg = gain(c, 0.45);
        lfo.connect(lg); lg.connect(am.gain);
        v.srcs.push(lfo); v.nodes.push(lg);
        this._add(v, noiseSrc(c, this.e.noise.white), filter(c, 'bandpass', 900, 1.5), am, gain(c, 0.35));
        // Motor
        this._add(v, osc(c, 'sawtooth', 50 + b.speed * 6), filter(c, 'lowpass', 220), gain(c, 0.2));
        this._add(v, osc(c, 'sine', 100 + b.speed * 12), gain(c, 0.05));
      });
    } else if (b.voice && d > FAR) {
      this._kill(b.voice);
      b.voice = null;
    }
    if (b.voice) this._spatialize(b.voice, pos, 0.55);
  }

  // ───── Bewegliche Plattformen ─────
  _mover(mv, t) {
    const pos = center(mv.box);
    const L = this.e.listener.pos;
    const d = Math.hypot(pos[0] - L[0], pos[1] - L[1], pos[2] - L[2]);
    const ph = phaseOf(mv.m, t);
    const kind = mv.m.kind;

    if (!mv.voice && d < NEAR) mv.voice = this._voice((v) => this._buildMover(v, kind));
    else if (mv.voice && d > FAR) { this._kill(mv.voice); mv.voice = null; }

    if (mv.voice) {
      const v = mv.voice;
      const now = this.c.currentTime;
      const idle = kind === 'swing' ? 0.12 : 0.2;
      this._spatialize(v, pos, (idle + (1 - idle) * ph.speed) * 0.9);
      if (v.pitch) for (const [o, base, range] of v.pitch) o.frequency.setTargetAtTime(base + range * ph.speed, now, 0.08);
      if (v.loadGain) v.loadGain.gain.setTargetAtTime(ph.speed, now, 0.08);
    }

    // Übergänge → Einzelklänge (nur in Hörweite)
    if (mv.seg !== -1 && ph.seg !== mv.seg && d < FAR) {
      const s = this.e.sfx;
      if (ph.seg === 2 || ph.seg === 0) {
        s.clunk({ pos, ring: kind === 'swing' ? 180 : 260 });
        if (kind === 'lift') s.hiss({ pos, d: 0.35 });
      } else if (kind === 'swing') {
        s.chainRattle({ pos: [pos[0], pos[1] + 4, pos[2]], n: 12 });
      } else if (kind === 'slide' && ph.seg === 3) {
        s.beeps({ pos, n: Math.round(mv.m.period * 0.3 / 0.5) });
      } else if (kind === 'lift') {
        s.hiss({ pos, d: 0.25 });
      }
    }
    mv.seg = ph.seg;
  }

  _buildMover(v, kind) {
    const c = this.c;
    v.pitch = [];
    const load = gain(c, 0);
    v.loadGain = load;
    if (kind === 'lift') {
      // Hydraulik: tiefes Pumpen + Heulen, das mit der Last steigt
      const pump = osc(c, 'sawtooth', 70);
      this._add(v, pump, filter(c, 'lowpass', 380, 2), gain(c, 0.25));
      const whine = osc(c, 'triangle', 220);
      this._add(v, whine, load, gain(c, 0.12));
      v.pitch.push([pump, 55, 40], [whine, 180, 160]);
    } else if (kind === 'slide') {
      // Elektrostapler: Motorsurren + Reifen auf Beton
      const motor = osc(c, 'sawtooth', 120);
      const lp = filter(c, 'lowpass', 900, 3);
      this._add(v, motor, lp, gain(c, 0.12));
      this._add(v, noiseSrc(c, this.e.noise.pink), filter(c, 'lowpass', 700), load, gain(c, 0.5));
      this._add(v, osc(c, 'square', 42), filter(c, 'lowpass', 120), gain(c, 0.12));
      v.pitch.push([motor, 90, 260]);
    } else {
      // Kran: tiefes Brummen des Laufwerks, Seilwinde
      const drive = osc(c, 'sawtooth', 38);
      this._add(v, drive, filter(c, 'lowpass', 180), gain(c, 0.3));
      const winch = osc(c, 'square', 60);
      this._add(v, winch, filter(c, 'bandpass', 600, 4), load, gain(c, 0.08));
      v.pitch.push([drive, 34, 14], [winch, 48, 50]);
    }
  }
}

