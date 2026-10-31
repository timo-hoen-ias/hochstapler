// Generative Musik: ein kleiner Sequenzer mit mehreren Soundtracks.
// Jeder Soundtrack hat sechs Themen, die mit dem Abschnitt innerhalb eines Akts
// lauter und schneller werden (Abschnitt 0 ruhig … Abschnitt 5 Finale).
// Tempo, Tonart, Akkorde und Instrumente wechseln immer am Taktanfang.
import { mtof, osc, filter, gain, blip, play, noiseSrc, rand, clamp } from './synth.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

// Muster: ein Zeichen pro Sechzehntel, 'x' = Schlag, 'o' = leiser Schlag
const P = (s) => [...s].map((ch) => (ch === 'x' ? 1 : ch === 'o' ? 0.5 : 0));

// ───────── Soundtracks ─────────
// voices: welches Instrument Akkorde (pad), Bass, Arpeggio und Melodie spielt
// kit: Klang von Bassdrum und Snare; spb: Sechzehntel pro Takt (12 = Dreiertakt)
export const TRACKS = [
  {
    id: 'schicht', name: 'Schichtbeginn', desc: 'Ruhiger Elektro-Pop, das Original',
    voices: { pad: 'saw', bass: 'tri', arp: 'square', lead: 'tri' }, kit: { kick: 'normal', snare: 'normal' },
    themes: [
      { bpm: 90, root: 48, scale: MAJOR, prog: [0, 5, 3, 4], padCut: 1300,
        bass: P('x.....x...x.....'), hat: P('..o...o...o...o.'), arp: 0.25, arpOct: 1 },
      { bpm: 94, root: 45, scale: MINOR, prog: [0, 5, 2, 6], padCut: 1600,
        bass: P('x.......x..x....'), kick: P('x.........x.....'), hat: P('..o...o...o...oo'),
        perc: P('....o.......o...'), arp: 0.45, arpOct: 2, lead: 0.15 },
      { bpm: 104, root: 50, scale: DORIAN, prog: [0, 3, 0, 6], padCut: 1100,
        bass: P('x..x..x...x..x..'), kick: P('x...x...x...x...'), hat: P('o.o.o.o.o.o.o.o.'),
        perc: P('..x...o...x..o.o'), arp: 0.85, arpOct: 1 },
      { bpm: 112, root: 52, scale: MINOR, prog: [0, 5, 6, 4], padCut: 1400,
        bass: P('x.x.x.x.x.x.x.x.'), bassLen: 0.45, kick: P('x...x...x...x..o'), snare: P('....x.......x...'), hat: P('oooooooooooooooo'),
        perc: P('......o.......o.'), arp: 0.5, arpOct: 1, lead: 0.2 },
      { bpm: 98, root: 53, scale: LYDIAN, prog: [0, 1, 0, 4], padCut: 2000,
        bass: P('x.......x...x...'), kick: P('x.......x.......'), snare: P('....x.......x...'), hat: P('..o...o...o...o.'),
        arp: 0.45, arpOct: 2, lead: 0.35 },
      { bpm: 120, root: 55, scale: MAJOR, prog: [0, 4, 5, 3], padCut: 2600,
        bass: P('x..x..x.x..x..x.'), bassLen: 0.6, kick: P('x...x...x...x...'), snare: P('....x.......x..o'), hat: P('oxoxoxoxoxoxoxox'),
        arp: 0.9, arpOct: 2, lead: 0.4 },
    ],
  },
  {
    id: 'nacht', name: 'Nachtschicht', desc: 'Lo-Fi mit E-Piano, entspannt und mit Swing',
    voices: { pad: 'epiano', bass: 'sub', arp: 'bell', lead: 'whistle' }, kit: { kick: 'soft', snare: 'rim' },
    swing: 0.17, sevenths: true, crackle: true,
    themes: [
      { bpm: 74, root: 53, scale: MAJOR, prog: [1, 4, 0, 5], padCut: 1800, comp: P('x.........o.....'), compLen: 2.2,
        bass: P('x.....x.........'), bassLen: 1.4, hat: P('..o...o...o...o.'), arp: 0.12, arpOct: 1 },
      { bpm: 78, root: 50, scale: DORIAN, prog: [0, 3, 0, 3], padCut: 1700, comp: P('x.....o...x.....'), compLen: 1.2,
        bass: P('x.....x...x.....'), kick: P('x.......x.x.....'), snare: P('....x.......x...'), hat: P('o.o.o.o.o.o.o.o.'),
        arp: 0.15, arpOct: 1, lead: 0.15 },
      { bpm: 82, root: 55, scale: MINOR, prog: [0, 5, 3, 4], padCut: 1600, comp: P('x.....x...o.....'), compLen: 1,
        bass: P('x.....x.x.......'), kick: P('x......x..x.....'), snare: P('....x.......x...'), hat: P('oooooooooooooooo'),
        arp: 0.25, arpOct: 2, lead: 0.25 },
      { bpm: 86, root: 48, scale: MAJOR, prog: [3, 2, 1, 4], padCut: 1900, comp: P('x..o..x...x..o..'), compLen: 0.8,
        bass: P('x.....x.x..x....'), kick: P('x......x..x...o.'), snare: P('....x.......x...'), hat: P('oooooooooooooooo'),
        perc: P('..........o.....'), arp: 0.3, arpOct: 2, lead: 0.3 },
      { bpm: 80, root: 51, scale: LYDIAN, prog: [0, 1, 5, 4], padCut: 2200, comp: P('x.......x.......'), compLen: 1.8,
        bass: P('x.......x...x...'), kick: P('x.......x.......'), snare: P('....x.......x...'), hat: P('..o...o...o...o.'),
        arp: 0.35, arpOct: 2, lead: 0.4 },
      { bpm: 90, root: 53, scale: MAJOR, prog: [1, 4, 2, 5], padCut: 2400, comp: P('x..o..x...x.o...'), compLen: 0.9,
        bass: P('x.....x.x..x..o.'), kick: P('x......x..x.x...'), snare: P('....x.......x..o'), hat: P('oxoxoxoxoxoxoxox'),
        arp: 0.45, arpOct: 2, lead: 0.45 },
    ],
  },
  {
    id: 'neon', name: 'Neonlager', desc: 'Synthwave mit Achtel-Bass und Klatschern',
    voices: { pad: 'gated', bass: 'saw', arp: 'saw', lead: 'saw' }, kit: { kick: 'normal', snare: 'clap' }, bassOctaves: true,
    themes: [
      { bpm: 100, root: 45, scale: MINOR, prog: [0, 5, 2, 6], padCut: 1200, comp: P('x...............'), compLen: 4,
        bass: P('x.x.x.x.x.x.x.x.'), bassLen: 0.4, hat: P('..o...o...o...o.'), arp: 0.3, arpOct: 1 },
      { bpm: 104, root: 47, scale: MINOR, prog: [0, 6, 5, 6], padCut: 1500, comp: P('x.x.x.x.x.x.x.x.'), compLen: 0.4,
        bass: P('x.x.x.x.x.x.x.x.'), bassLen: 0.4, kick: P('x...x...x...x...'), hat: P('..o...o...o...o.'), arp: 0.6, arpOct: 1 },
      { bpm: 110, root: 50, scale: DORIAN, prog: [0, 3, 6, 4], padCut: 1700, comp: P('x.xxx.xxx.xxx.xx'), compLen: 0.22,
        bass: P('xxxxxxxxxxxxxxxx'), bassLen: 0.22, kick: P('x...x...x...x...'), snare: P('....x.......x...'), hat: P('o.o.o.o.o.o.o.o.'),
        arp: 0.9, arpOct: 2 },
      { bpm: 116, root: 52, scale: MINOR, prog: [0, 5, 6, 4], padCut: 2000, comp: P('x.x.x.x.x.x.x.x.'), compLen: 0.4,
        bass: P('x.x.x.x.x.x.x.x.'), bassLen: 0.4, kick: P('x...x...x...x...'), snare: P('....x.......x...'), hat: P('oxoxoxoxoxoxoxox'),
        arp: 0.7, arpOct: 2, lead: 0.35 },
      { bpm: 108, root: 48, scale: MAJOR, prog: [5, 3, 0, 4], padCut: 2400, comp: P('x...............'), compLen: 4,
        bass: P('x.x.x.x.x.x.x.x.'), bassLen: 0.4, kick: P('x.......x.......'), snare: P('....x.......x...'), hat: P('..o...o...o...o.'),
        arp: 0.8, arpOct: 2, lead: 0.45 },
      { bpm: 124, root: 52, scale: MINOR, prog: [5, 6, 0, 0], padCut: 2800, comp: P('xxxxxxxxxxxxxxxx'), compLen: 0.2,
        bass: P('xxxxxxxxxxxxxxxx'), bassLen: 0.22, kick: P('x...x...x...x...'), snare: P('....x.......x..o'), hat: P('oxoxoxoxoxoxoxox'),
        arp: 1, arpOct: 2, lead: 0.5 },
    ],
  },
  {
    id: 'hafen', name: 'Hafenkneipe', desc: 'Shanty im Dreiertakt mit Akkordeon',
    voices: { pad: 'accordion', bass: 'oompah', arp: 'mallet', lead: 'accordion' }, kit: { kick: 'soft', snare: 'rim' },
    spb: 12, bassFifths: true, leadSteps: [0, 4, 8, 10],
    themes: [
      { bpm: 120, root: 50, scale: DORIAN, prog: [0, 0, 6, 6], padCut: 1800, comp: P('....x...x...'), compLen: 0.6,
        bass: P('x...........'), bassLen: 0.8, arp: 0.1, arpOct: 1, lead: 0.3 },
      { bpm: 126, root: 50, scale: MINOR, prog: [0, 6, 2, 4], padCut: 2000, comp: P('....x...x...'), compLen: 0.6,
        bass: P('x...........'), bassLen: 0.8, kick: P('x...........'), tamb: P('....x...x...'), arp: 0.15, arpOct: 1, lead: 0.4 },
      { bpm: 132, root: 52, scale: DORIAN, prog: [0, 3, 0, 6], padCut: 2000, comp: P('....x...x...'), compLen: 0.55,
        bass: P('x.......o...'), bassLen: 0.7, kick: P('x...........'), snare: P('........o...'), tamb: P('..o.x.o.x.o.'),
        arp: 0.25, arpOct: 2, lead: 0.45 },
      { bpm: 138, root: 50, scale: MINOR, prog: [0, 5, 6, 4], padCut: 2200, comp: P('....x...x...'), compLen: 0.5,
        bass: P('x.......o...'), bassLen: 0.7, kick: P('x...........'), snare: P('....o...x...'), tamb: P('o.o.x.o.x.o.'),
        arp: 0.3, arpOct: 2, lead: 0.5 },
      { bpm: 116, root: 55, scale: MIXO, prog: [0, 6, 3, 0], padCut: 2400, comp: P('....x...x...'), compLen: 0.7,
        bass: P('x...........'), bassLen: 0.9, kick: P('x...........'), tamb: P('....x...x...'), arp: 0.2, arpOct: 2, lead: 0.55 },
      { bpm: 144, root: 52, scale: DORIAN, prog: [0, 6, 3, 4], padCut: 2600, comp: P('....x...x...'), compLen: 0.5,
        bass: P('x.......x...'), bassLen: 0.6, kick: P('x...........'), snare: P('....x...x...'), tamb: P('oooox.ooxooo'),
        arp: 0.4, arpOct: 2, lead: 0.6 },
    ],
  },
  {
    id: 'stahl', name: 'Stahlwerk', desc: 'Industrial-Techno mit Acid-Bass und Metallschlägen',
    voices: { pad: 'saw', bass: 'acid', arp: 'saw', lead: null }, kit: { kick: 'hard', snare: 'clap' },
    themes: [
      { bpm: 118, root: 40, scale: PHRYGIAN, prog: [0, 0, 1, 0], padCut: 500,
        bass: P('x..x..x...x..x..'), bassLen: 0.3, hat: P('..o...o...o...o.'), perc: P('....o.......o...'), arp: 0.1, arpOct: 1 },
      { bpm: 122, root: 40, scale: PHRYGIAN, prog: [0, 0, 1, 0], padCut: 600,
        bass: P('x.xx..x.x.xx..x.'), bassLen: 0.3, kick: P('x...x...x...x...'), hat: P('..o...o...o...o.'), perc: P('..o...x...o...xo'), arp: 0.15, arpOct: 1 },
      { bpm: 126, root: 41, scale: MINOR, prog: [0, 0, 5, 6], padCut: 700,
        bass: P('x.xxx.x.x.xx.x.x'), bassLen: 0.25, kick: P('x...x...x...x...'), snare: P('....x.......x...'), hat: P('oxoxoxoxoxoxoxox'),
        perc: P('..x...o...x..o.o'), arp: 0.2, arpOct: 1 },
      { bpm: 130, root: 40, scale: PHRYGIAN, prog: [0, 1, 0, 6], padCut: 800,
        bass: P('xxxxx.xxx.xx.xxx'), bassLen: 0.22, kick: P('x...x...x...x...'), snare: P('....x.......x...'), hat: P('oxoxoxoxoxoxoxox'),
        perc: P('x.o.x.o.x.o.x.oo'), arp: 0.3, arpOct: 1 },
      { bpm: 124, root: 43, scale: MINOR, prog: [0, 5, 3, 4], padCut: 1100,
        bass: P('x.xx..x.x.xx..x.'), bassLen: 0.3, kick: P('x...x...x...x...'), snare: P('....x.......x...'), hat: P('..o...o...o...o.'),
        perc: P('....o.......o...'), arp: 0.45, arpOct: 2 },
      { bpm: 134, root: 40, scale: PHRYGIAN, prog: [0, 1, 6, 0], padCut: 900,
        bass: P('xxxxxxxxxxxxxxxx'), bassLen: 0.2, kick: P('x...x...x...x...'), snare: P('....x.......x..o'), hat: P('oxoxoxoxoxoxoxox'),
        perc: P('x.o.x.oxx.o.x.ox'), arp: 0.5, arpOct: 1 },
    ],
  },
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || null;

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
    this.track = TRACKS[0];
    this.wantTrack = TRACKS[0];
    this.cur = 0;
    this.want = 0;
    this.step = 0;
    this.timer = null;
    this.leadNote = 4;
    this.leadF = 0;
    this.bassHit = 0;
  }

  get theme() { return this.track.themes[this.cur]; }
  get spb() { return this.track.spb || 16; }

  // Abschnitt → Thema: jeder Akt hat sechs Abschnitte, jeder Soundtrack sechs Themen
  _themeIndex(section) { return ((Math.max(0, section | 0) % 6) + 6) % 6; }

  start(section = 0, trackId = null) {
    this.track = this.wantTrack = trackById(trackId) || this.track;
    this.cur = this.want = this._themeIndex(section);
    this._setDelayTime();
    this.nextTime = this.c.currentTime + 0.1;
    this.step = 0;
    clearInterval(this.timer);
    this.timer = setInterval(() => this._tick(), 25);
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  setSection(i) { this.want = this._themeIndex(i); }

  // Soundtrack wechseln: am nächsten Taktanfang, mit kurzem Ausblenden des alten
  setTrack(id) {
    const t = trackById(id);
    if (!t || t === this.wantTrack) return;
    this.wantTrack = t;
    if (t !== this.track) {
      const now = this.c.currentTime;
      this.out.gain.setTargetAtTime(0.35, now, 0.25);
    }
  }

  get playing() { return this.wantTrack; }

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
    return this.track.sevenths ? [d, d + 2, d + 4, d + 6] : [d, d + 2, d + 4];
  }

  _schedule(step, t) {
    let s = step % this.spb;
    if (s === 0 && (this.want !== this.cur || this.wantTrack !== this.track)) {
      if (this.wantTrack !== this.track) {
        this.track = this.wantTrack;
        this.out.gain.cancelScheduledValues(t);
        this.out.gain.setTargetAtTime(0.9, t, 0.3);
      }
      this.cur = this.want;
      this._setDelayTime();
      this.step = step = 0;
      s = 0;
    }
    const tr = this.track;
    const th = this.theme;
    const spb = this.spb;
    const bar = Math.floor(step / spb);
    const beat = 60 / th.bpm;
    // Swing: jede zweite Sechzehntel etwas später
    if (tr.swing && s % 2 === 1) t += tr.swing * beat / 4;
    const chord = this._chord(bar);
    const v = tr.voices;

    // Akkorde: ohne comp-Muster einmal pro Takt lang, sonst rhythmisch
    if (v.pad) {
      const freqs = chord.map((d) => mtof(this._degree(d, 1)));
      if (th.comp) { if (th.comp[s]) this._pad(v.pad, freqs, t, beat * (th.compLen || 0.5), th.padCut, th.comp[s]); }
      else if (s === 0) this._pad(v.pad, freqs, t, beat * spb / 4, th.padCut, 1);
    }
    if (th.bass && th.bass[s]) {
      const root = chord[0];
      this.bassHit++;
      let d = root, oct = 0;
      if (tr.bassFifths) d = this.bassHit % 2 ? root : root + 4;
      else if (s >= spb / 2 && Math.random() < 0.3) d = root + 4;
      if (tr.bassOctaves && this.bassHit % 2 === 0) oct = 1;
      this._bass(v.bass, mtof(this._degree(d, oct)), t, beat * (th.bassLen || 0.9), th.bass[s]);
    }
    if (th.kick && th.kick[s]) this._kick(t, th.kick[s], tr.kit.kick);
    if (th.snare && th.snare[s]) this._snare(t, th.snare[s], tr.kit.snare);
    if (th.hat && th.hat[s]) this._hat(t, th.hat[s]);
    if (th.tamb && th.tamb[s]) this._tamb(t, th.tamb[s]);
    if (th.perc && th.perc[s]) this._clank(t, th.perc[s]);
    if (tr.crackle && Math.random() < 0.3) this._crackle(t);
    // Arpeggio über die Akkordtöne
    if (v.arp && th.arp && (s % 2 === 0 || th.arp > 0.7) && Math.random() < th.arp) {
      const tones = [];
      for (let o = 0; o < th.arpOct; o++) for (const d of chord) tones.push(this._degree(d, 2 + o));
      const n = tones[(step >> (th.arp > 0.7 ? 0 : 1)) % tones.length];
      this._arp(v.arp, mtof(n), t, beat * 0.5);
    }
    // Melodie: Zufallsspaziergang auf der Tonleiter, Ziel sind Akkordtöne
    const leadSteps = tr.leadSteps || [0, 6, 8, 12];
    if (v.lead && th.lead && leadSteps.includes(s) && Math.random() < th.lead + (s === 0 ? 0.3 : 0)) {
      if (s === 0) this.leadNote = chord[Math.floor(Math.random() * 3)] + 7;
      else this.leadNote += [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
      this.leadNote = clamp(this.leadNote, 4, 16);
      const next = leadSteps.find((x) => x > s) ?? spb;
      this._lead(v.lead, mtof(this._degree(this.leadNote, 2)), t, beat * Math.max(0.5, (next - s) / 4) * 0.95);
    }
  }

  // ───── Akkord-Instrumente ─────
  _pad(kind, freqs, t, dur, cut, vel) {
    const c = this.c;
    const f = filter(c, 'lowpass', cut, 0.6);
    const g = gain(c);
    f.connect(g); g.connect(this.out);
    let end;
    if (kind === 'epiano') {
      // E-Piano: FM-Glocke, schnell an, lang ausklingend
      end = t + dur + 0.5;
      g.gain.value = 0.5 * vel;
      for (const fr of freqs) {
        const car = osc(c, 'sine', fr);
        const mod = osc(c, 'sine', fr);
        const mg = gain(c);
        mg.gain.setValueAtTime(fr * 1.8, t);
        mg.gain.exponentialRampToValueAtTime(fr * 0.15, t + 0.4);
        mod.connect(mg); mg.connect(car.frequency);
        const ng = gain(c);
        car.connect(ng); ng.connect(f);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.linearRampToValueAtTime(0.11, t + 0.006);
        ng.gain.exponentialRampToValueAtTime(0.04, t + 0.35);
        ng.gain.exponentialRampToValueAtTime(0.0001, end);
        play(car, t, end, ng);
        play(mod, t, end, mg);
      }
    } else if (kind === 'accordion') {
      // Akkordeon: Rechteck + Sägezahn, leicht verstimmt, mit Tremolo
      end = t + dur + 0.08;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15 * vel, t + 0.03);
      g.gain.setValueAtTime(0.15 * vel, t + dur);
      g.gain.linearRampToValueAtTime(0.0001, end);
      const trem = osc(c, 'sine', 6);
      const tg = gain(c, 0.03 * vel);
      trem.connect(tg); tg.connect(g.gain);
      play(trem, t, end, tg);
      for (const fr of freqs) {
        for (const [type, det, lvl] of [['square', -5, 0.07], ['sawtooth', 6, 0.1]]) {
          const o = osc(c, type, fr, det);
          const og = gain(c, lvl);
          o.connect(og); og.connect(f);
          play(o, t, end, og);
        }
      }
    } else {
      // 'saw': weiche Fläche; 'gated': kurze, rhythmische Synthie-Akkorde
      const gated = kind === 'gated' && dur < 2;
      const peak = (gated ? 0.08 : 0.09) * vel;
      const rel = gated ? 0.06 : 0.6;
      end = t + dur + rel;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + (gated ? 0.008 : Math.min(0.8, dur * 0.3)));
      g.gain.setValueAtTime(peak, t + dur * (gated ? 0.8 : 0.85));
      g.gain.linearRampToValueAtTime(0.0001, end);
      for (const fr of freqs) {
        for (const det of [-8, 8]) {
          const o = osc(c, 'sawtooth', fr, det + rand(-2, 2));
          const og = gain(c, 0.16);
          o.connect(og); og.connect(f);
          play(o, t, end, og);
        }
      }
    }
    setTimeout(() => { f.disconnect(); g.disconnect(); }, (end - c.currentTime + 0.5) * 1000);
  }

  // ───── Bass ─────
  _bass(kind, fr, t, dur, vel) {
    const c = this.c;
    const g = gain(c);
    g.connect(this.out);
    const srcs = [];
    let f;
    if (kind === 'sub') {
      f = filter(c, 'lowpass', 420, 0.7);
      srcs.push(osc(c, 'sine', fr), osc(c, 'triangle', fr * 2));
      srcs[1].connect(gain(c, 0.15)).connect(f);
      srcs[0].connect(f);
    } else if (kind === 'saw') {
      f = filter(c, 'lowpass', 1800, 4);
      f.frequency.setValueAtTime(1800, t);
      f.frequency.exponentialRampToValueAtTime(260, t + dur);
      srcs.push(osc(c, 'sawtooth', fr), osc(c, 'sine', fr / 2));
      for (const s of srcs) s.connect(f);
    } else if (kind === 'acid') {
      // Acid: Sägezahn durch stark resonanten Tiefpass, Hüllkurve je Ton zufällig
      const top = rand(400, 3200) * (vel > 0.7 ? 1.3 : 0.8);
      f = filter(c, 'lowpass', top, 13);
      f.frequency.setValueAtTime(top, t);
      f.frequency.exponentialRampToValueAtTime(160, t + dur);
      const o = osc(c, 'sawtooth', fr * (Math.random() < 0.2 ? 2 : 1));
      srcs.push(o);
      o.connect(f);
      vel *= 0.7;
    } else if (kind === 'oompah') {
      // Tuba-artig: kurz, rund, mit etwas Rechteck
      f = filter(c, 'lowpass', 850, 1);
      srcs.push(osc(c, 'triangle', fr), osc(c, 'square', fr));
      srcs[0].connect(f);
      srcs[1].connect(gain(c, 0.12)).connect(f);
    } else {
      f = filter(c, 'lowpass', 700, 1);
      srcs.push(osc(c, 'triangle', fr), osc(c, 'sine', fr / 2));
      for (const s of srcs) s.connect(f);
    }
    f.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const s of srcs) play(s, t, t + dur);
    setTimeout(() => { f.disconnect(); g.disconnect(); }, (t + dur - c.currentTime + 0.4) * 1000);
  }

  // ───── Arpeggio ─────
  _arp(kind, fr, t, dur) {
    const c = this.c;
    const g = gain(c);
    g.connect(this.out); g.connect(this.delayIn);
    if (kind === 'bell') {
      const car = osc(c, 'sine', fr);
      const mod = osc(c, 'sine', fr * 3.5);
      const mg = gain(c);
      mg.gain.setValueAtTime(fr * 1.2, t);
      mg.gain.exponentialRampToValueAtTime(fr * 0.05, t + 0.5);
      mod.connect(mg); mg.connect(car.frequency);
      car.connect(g);
      const end = blip(g.gain, t, 0.05, 0.003, dur * 2.5);
      play(car, t, end, g);
      play(mod, t, end, mg);
    } else if (kind === 'mallet') {
      const o = osc(c, 'triangle', fr);
      const o2 = osc(c, 'sine', fr * 4);
      const g2 = gain(c, 0.2);
      o.connect(g); o2.connect(g2); g2.connect(g);
      const end = blip(g.gain, t, 0.08, 0.002, dur * 0.8);
      play(o, t, end, g);
      play(o2, t, end, g2);
    } else {
      const o = osc(c, kind === 'saw' ? 'sawtooth' : 'square', fr);
      const f = filter(c, 'lowpass', 3000, 3);
      f.frequency.setValueAtTime(kind === 'saw' ? 4200 : 3200, t);
      f.frequency.exponentialRampToValueAtTime(500, t + dur);
      o.connect(f); f.connect(g);
      play(o, t, blip(g.gain, t, kind === 'saw' ? 0.04 : 0.05, 0.004, dur), f, g);
    }
  }

  // ───── Melodie ─────
  _lead(kind, fr, t, dur) {
    const c = this.c;
    const g = gain(c);
    g.connect(this.out); g.connect(this.delayIn);
    const srcs = [];
    const vib = osc(c, 'sine', kind === 'accordion' ? 6 : 5.2);
    const vg = gain(c, fr * (kind === 'whistle' ? 0.009 : 0.006));
    vib.connect(vg);
    let peak = 0.08;
    if (kind === 'saw') {
      const o = osc(c, 'sawtooth', this.leadF || fr);
      o.frequency.setTargetAtTime(fr, t, 0.03); // Portamento
      const f = filter(c, 'lowpass', 2600, 2);
      o.connect(f); f.connect(g);
      srcs.push(o);
      peak = 0.055;
    } else if (kind === 'accordion') {
      for (const [type, det, lvl] of [['square', -5, 0.5], ['sawtooth', 7, 0.6]]) {
        const o = osc(c, type, fr, det);
        const og = gain(c, lvl);
        const f = filter(c, 'lowpass', 2400);
        o.connect(f); f.connect(og); og.connect(g);
        srcs.push(o);
      }
      peak = 0.07;
    } else if (kind === 'whistle') {
      const o = osc(c, 'sine', fr * 2);
      o.connect(g);
      srcs.push(o);
      vg.gain.value *= 2;
      peak = 0.06;
    } else {
      const o = osc(c, 'triangle', fr);
      o.connect(g);
      srcs.push(o);
    }
    for (const o of srcs) vg.connect(o.frequency);
    this.leadF = fr;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.05);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.25);
    const end = t + dur * 1.6;
    for (const o of srcs) play(o, t, end);
    play(vib, t, end, vg);
    setTimeout(() => { try { g.disconnect(); } catch { /* egal */ } }, (end - c.currentTime + 0.4) * 1000);
  }

  // ───── Schlagzeug ─────
  _kick(t, vel, kind = 'normal') {
    const c = this.c;
    const o = osc(c, 'sine', kind === 'hard' ? 170 : kind === 'soft' ? 120 : 150);
    o.frequency.exponentialRampToValueAtTime(kind === 'hard' ? 40 : 45, t + (kind === 'hard' ? 0.1 : 0.13));
    const g = gain(c);
    o.connect(g); g.connect(this.out);
    const peak = (kind === 'hard' ? 0.7 : kind === 'soft' ? 0.4 : 0.55) * vel;
    play(o, t, blip(g.gain, t, peak, 0.002, kind === 'hard' ? 0.35 : 0.28), g);
    if (kind === 'hard') this._noiseHit(t, 'highpass', 3000, 0.7, 0.12 * vel, 0.012);
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

  _tamb(t, vel) {
    this._noiseHit(t, 'bandpass', 9000, 2, 0.1 * vel, 0.09);
    this._noiseHit(t + 0.012, 'highpass', 6000, 0.7, 0.05 * vel, 0.06);
  }

  _crackle(t) { this._noiseHit(t + Math.random() * 0.1, 'highpass', 2500, 0.7, rand(0.01, 0.04), 0.004); }

  _snare(t, vel, kind = 'normal') {
    const c = this.c;
    if (kind === 'clap') {
      for (let i = 0; i < 3; i++) this._noiseHit(t + i * 0.011, 'bandpass', 1300, 1.2, 0.16 * vel, 0.02);
      this._noiseHit(t + 0.033, 'bandpass', 1300, 1, 0.2 * vel, 0.18);
      return;
    }
    if (kind === 'rim') {
      const o = osc(c, 'square', 820);
      const g = gain(c);
      const f = filter(c, 'bandpass', 1700, 3);
      o.connect(f); f.connect(g); g.connect(this.out);
      play(o, t, blip(g.gain, t, 0.09 * vel, 0.001, 0.035), f, g);
      this._noiseHit(t, 'bandpass', 3200, 2, 0.08 * vel, 0.03);
      return;
    }
    this._noiseHit(t, 'bandpass', 1900, 0.9, 0.22 * vel, 0.14);
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
