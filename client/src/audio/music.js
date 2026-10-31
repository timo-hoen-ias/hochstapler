// Generative Musik: ein kleiner Sequenzer, der pro Abschnitt Tempo, Tonart,
// Akkordfolge und Instrumentierung wechselt. Der Wechsel passiert immer am Taktanfang.
import { mtof, osc, filter, gain, blip, play, noiseSrc, rand, clamp } from './synth.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

// Muster: 16 Sechzehntel pro Takt, 'x' = Schlag, 'o' = leiser Schlag
const P = (s) => [...s].map((ch) => (ch === 'x' ? 1 : ch === 'o' ? 0.5 : 0));

export const THEMES = [
  { // Wareneingang – entspannt, Arbeitsbeginn
    bpm: 90, root: 48, scale: MAJOR, prog: [0, 5, 3, 4], padCut: 1300,
    bass: P('x.....x...x.....'), kick: null, snare: null, hat: P('..o...o...o...o.'),
    clank: null, arp: 0.25, arpOct: 1, lead: 0,
  },
  { // Hochregallager – hoch, luftig, etwas geheimnisvoll
    bpm: 94, root: 45, scale: MINOR, prog: [0, 5, 2, 6], padCut: 1600,
    bass: P('x.......x..x....'), kick: P('x.........x.....'), snare: null, hat: P('..o...o...o...oo'),
    clank: P('....o.......o...'), arp: 0.45, arpOct: 2, lead: 0.15,
  },
  { // Fördertechnik – mechanisch, gleichmäßig
    bpm: 104, root: 50, scale: DORIAN, prog: [0, 3, 0, 6], padCut: 1100,
    bass: P('x..x..x...x..x..'), kick: P('x...x...x...x...'), snare: null, hat: P('o.o.o.o.o.o.o.o.'),
    clank: P('..x...o...x..o.o'), arp: 0.85, arpOct: 1, lead: 0,
  },
  { // Staplerzone – treibend
    bpm: 112, root: 52, scale: MINOR, prog: [0, 5, 6, 4], padCut: 1400,
    bass: P('x.x.x.x.x.x.x.x.'), bassLen: 0.45, kick: P('x...x...x...x..o'), snare: P('....x.......x...'), hat: P('oooooooooooooooo'),
    clank: P('......o.......o.'), arp: 0.5, arpOct: 1, lead: 0.2,
  },
  { // Containerhafen – weit, sehnsüchtig
    bpm: 98, root: 53, scale: LYDIAN, prog: [0, 1, 0, 4], padCut: 2000,
    bass: P('x.......x...x...'), kick: P('x.......x.......'), snare: P('....x.......x...'), hat: P('..o...o...o...o.'),
    clank: null, arp: 0.45, arpOct: 2, lead: 0.35,
  },
  { // Versanddach – Finale
    bpm: 120, root: 55, scale: MAJOR, prog: [0, 4, 5, 3], padCut: 2600,
    bass: P('x..x..x.x..x..x.'), bassLen: 0.6, kick: P('x...x...x...x...'), snare: P('....x.......x..o'), hat: P('oxoxoxoxoxoxoxox'),
    clank: null, arp: 0.9, arpOct: 2, lead: 0.4,
  },
];

export class Music {
  constructor(engine) {
    this.e = engine;
    this.c = engine.ctx;
    const c = this.c;
    this.out = gain(c, 0.9);
    this.out.connect(engine.bus.music);
    // Echo für Arpeggio und Melodie
    this.delay = c.createDelay(1.5);
    this.fb = gain(c, 0.32);
    this.delayLP = filter(c, 'lowpass', 2200);
    this.delayIn = gain(c, 0.35);
    this.delayIn.connect(this.delay);
    this.delay.connect(this.delayLP); this.delayLP.connect(this.fb); this.fb.connect(this.delay);
    this.delayLP.connect(this.out);
    this.cur = 0;
    this.want = 0;
    this.step = 0;
    this.timer = null;
    this.leadNote = 4;
  }

  get theme() { return THEMES[this.cur]; }

  start(section = 0) {
    this.cur = this.want = clamp(section, 0, THEMES.length - 1);
    this._setDelayTime();
    this.nextTime = this.c.currentTime + 0.1;
    this.step = 0;
    clearInterval(this.timer);
    this.timer = setInterval(() => this._tick(), 25);
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  setSection(i) { this.want = clamp(i, 0, THEMES.length - 1); }

  duck(seconds, level) {
    const t = this.c.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.9 * level, t, 0.15);
    g.setTargetAtTime(0.9, t + seconds, 1.2);
  }

  _setDelayTime() {
    const beat = 60 / this.theme.bpm;
    this.delay.delayTime.setTargetAtTime(beat * 0.75, this.c.currentTime, 0.05);
  }

  _tick() {
    const now = this.c.currentTime;
    if (this.c.state !== 'running') return;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05; // Tab war im Hintergrund
    while (this.nextTime < now + 0.15) {
      this._schedule(this.step, this.nextTime);
      this.nextTime += 60 / this.theme.bpm / 4;
      this.step++;
    }
  }

  _degree(deg, octave = 0) {
    const th = this.theme;
    const n = th.scale.length;
    const o = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    return th.root + 12 * (o + octave) + th.scale[idx];
  }

  _chord(bar) {
    const d = this.theme.prog[bar % this.theme.prog.length];
    return [d, d + 2, d + 4];
  }

  _schedule(step, t) {
    const s16 = step % 16;
    if (s16 === 0 && this.want !== this.cur) {
      this.cur = this.want;
      this._setDelayTime();
      this.step = step = 0;
    }
    const th = this.theme;
    const bar = Math.floor(step / 16);
    const beat = 60 / th.bpm;
    const chord = this._chord(bar);

    if (s16 === 0) this._pad(chord.map((d) => mtof(this._degree(d, 1))), t, beat * 4, th.padCut);
    if (th.bass && th.bass[s16]) {
      const root = chord[0];
      // auf der 3. Zählzeit gelegentlich zur Quinte
      const d = s16 >= 8 && Math.random() < 0.3 ? root + 4 : root;
      this._bass(mtof(this._degree(d, 0)), t, beat * (th.bassLen || 0.9), th.bass[s16]);
    }
    if (th.kick && th.kick[s16]) this._kick(t, th.kick[s16]);
    if (th.snare && th.snare[s16]) this._snare(t, th.snare[s16]);
    if (th.hat && th.hat[s16]) this._hat(t, th.hat[s16]);
    if (th.clank && th.clank[s16]) this._clank(t, th.clank[s16]);
    // Arpeggio über die Akkordtöne
    if (th.arp && (s16 % 2 === 0 || th.arp > 0.7) && Math.random() < th.arp) {
      const tones = [];
      for (let o = 0; o < th.arpOct; o++) for (const d of chord) tones.push(this._degree(d, 2 + o));
      const n = tones[(step >> (th.arp > 0.7 ? 0 : 1)) % tones.length];
      this._pluck(mtof(n), t, beat * 0.5);
    }
    // Melodie: Zufallsspaziergang auf der Tonleiter, Ziel sind Akkordtöne
    if (th.lead && (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 12) && Math.random() < th.lead + (s16 === 0 ? 0.3 : 0)) {
      if (s16 === 0) this.leadNote = chord[Math.floor(Math.random() * 3)] + 7;
      else this.leadNote += [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
      this.leadNote = clamp(this.leadNote, 4, 16);
      this._lead(mtof(this._degree(this.leadNote, 2)), t, beat * (s16 === 0 ? 1.5 : 1));
    }
  }

  // ───── Instrumente ─────
  _pad(freqs, t, dur, cut) {
    const c = this.c;
    const f = filter(c, 'lowpass', cut, 0.6);
    const g = gain(c);
    f.connect(g); g.connect(this.out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + Math.min(0.8, dur * 0.3));
    g.gain.setValueAtTime(0.09, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    for (const fr of freqs) {
      for (const det of [-8, 8]) {
        const o = osc(c, 'sawtooth', fr, det + rand(-2, 2));
        const og = gain(c, 0.16);
        o.connect(og); og.connect(f);
        play(o, t, t + dur + 0.6, og);
      }
    }
    setTimeout(() => { f.disconnect(); g.disconnect(); }, (t - c.currentTime + dur + 1) * 1000);
  }

  _bass(fr, t, dur, vel) {
    const c = this.c;
    const o = osc(c, 'triangle', fr);
    const sub = osc(c, 'sine', fr / 2);
    const f = filter(c, 'lowpass', 700, 1);
    const g = gain(c);
    o.connect(f); sub.connect(f); f.connect(g); g.connect(this.out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    play(o, t, t + dur, f, g);
    play(sub, t, t + dur);
  }

  _pluck(fr, t, dur) {
    const c = this.c;
    const o = osc(c, 'square', fr);
    const f = filter(c, 'lowpass', 3000, 3);
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = gain(c);
    o.connect(f); f.connect(g); g.connect(this.out); g.connect(this.delayIn);
    play(o, t, blip(g.gain, t, 0.05, 0.004, dur), f, g);
  }

  _lead(fr, t, dur) {
    const c = this.c;
    const o = osc(c, 'triangle', fr);
    const vib = osc(c, 'sine', 5.2);
    const vg = gain(c, fr * 0.006);
    vib.connect(vg); vg.connect(o.frequency);
    const g = gain(c);
    o.connect(g); g.connect(this.out); g.connect(this.delayIn);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.05);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.25);
    play(o, t, t + dur * 1.6, g);
    play(vib, t, t + dur * 1.6, vg);
  }

  _kick(t, vel) {
    const c = this.c;
    const o = osc(c, 'sine', 150);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    const g = gain(c);
    o.connect(g); g.connect(this.out);
    play(o, t, blip(g.gain, t, 0.55 * vel, 0.002, 0.28), g);
  }

  _noiseHit(t, type, f, q, peak, d) {
    const c = this.c;
    const n = noiseSrc(c, this.e.noise.white);
    const fl = filter(c, type, f, q);
    const g = gain(c);
    n.connect(fl); fl.connect(g); g.connect(this.out);
    n.start(t, Math.random());
    const end = blip(g.gain, t, peak, 0.001, d);
    n.stop(end + 0.02);
    n.onended = () => { n.disconnect(); fl.disconnect(); g.disconnect(); };
  }

  _hat(t, vel) { this._noiseHit(t, 'highpass', 7500, 0.7, 0.07 * vel, 0.035 + 0.02 * vel); }

  _snare(t, vel) {
    this._noiseHit(t, 'bandpass', 1900, 0.9, 0.22 * vel, 0.14);
    const c = this.c;
    const o = osc(c, 'triangle', 200);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = gain(c);
    o.connect(g); g.connect(this.out);
    play(o, t, blip(g.gain, t, 0.18 * vel, 0.001, 0.09), g);
  }

  // Industrie-Perkussion: metallischer Schlag (wie ein Schraubenschlüssel auf Stahl)
  _clank(t, vel) {
    const c = this.c;
    const f = filter(c, 'bandpass', 2600, 2.5);
    const g = gain(c);
    f.connect(g); g.connect(this.out); g.connect(this.delayIn);
    for (const r of [1, 1.47, 2.03, 2.79]) {
      const o = osc(c, 'square', 420 * r);
      o.connect(f);
      play(o, t, t + 0.2);
    }
    blip(g.gain, t, 0.05 * vel, 0.001, 0.12);
    setTimeout(() => { f.disconnect(); g.disconnect(); }, (t - c.currentTime + 0.5) * 1000);
  }
}
