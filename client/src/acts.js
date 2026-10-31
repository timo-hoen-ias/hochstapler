import { FIRE_ACT, firePieces, waterworksScenery } from './wasserwerk.js';

// Akte 2–7 von "Hochstapler". Jeder Akt hat ein eigenes Thema: eigene Materialien,
// Nebelfarbe, Kulisse, Gefahren-Optik und eine eigene Auswahl an Set-Pieces.
// Abschnitte werden aus Set-Pieces zusammengesetzt; jedes Stück wird probehalber
// gebaut und wieder entfernt, wenn es mit älteren Teilen kollidiert.

export const ACTS = [
  {
    key: 'kuehl', name: 'Kühlhaus', sub: 'Glatteis, Eiszapfen und Frostwind',
    fog: [0xa9c6e0, 0x9ebbd8, 0xb8d0e6], mats: ['ice', 'crate', 'grate', 'bin'], beam: 'beam', skin: 'icicle', laser: 0x6fd8ff,
    sections: ['Vorkühlzone', 'Tiefkühlregal', 'Eisfabrik', 'Kältetunnel', 'Frostdach', 'Gefrierturm'],
    pool: { sliders: 1, presses: 1, ice: 4, icicles: 3, poles: 3, shelves: 2, zigzag: 2, ledges: 1, hooks: 2, beams: 2, wind: 2, tower: 1, crumble: 1 },
    puzzles: ['gate', 'fence'], scenery: 'frostracks',
  },
  {
    key: 'paket', name: 'Paketzentrum', sub: 'Bänder, Kippschalen und Scanner',
    fog: [0xd9b48a, 0xd2a77f, 0xe0bf95], mats: ['carton', 'goods', 'grate'], beam: 'beam', skin: 'spikes', laser: 0xff3a2a,
    sections: ['Annahme', 'Sortierturm', 'Kippschalen', 'Rutschenhalle', 'Scannerbrücke', 'Verladung'],
    pool: { rams: 2, gauntlet: 1, sliders: 1, belts: 4, blinks: 3, lasers: 3, crumble: 3, swing: 2, shelves: 2, zigzag: 2, tower: 1, lifts: 1, drop: 1 },
    puzzles: ['fence', 'gate'], scenery: 'parcelracks',
  },
  {
    key: 'silo', name: 'Hochsilo', sub: 'Aufwind, Förderschnecken und Staub',
    fog: [0x8fa0b8, 0x8695ad, 0x9aabc2], mats: ['concrete', 'grate', 'machine', 'bin'], beam: 'beam', skin: 'spikes', laser: 0xff5a2a,
    sections: ['Silofuß', 'Schneckenförderer', 'Lüftungsschacht', 'Siloköpfe', 'Staubkammer', 'Silodach'],
    pool: { presses: 2, rams: 1, sliders: 1, fans: 4, drums: 3, pipes: 3, crumble: 2, poles: 2, wind: 2, ledges: 1, bounce: 1, tower: 1, zigzag: 1 },
    puzzles: ['gate', 'fence'], scenery: 'silos',
  },
  {
    key: 'chemie', name: 'Gefahrstofflager', sub: 'Säurebecken, Ventile und Laserraster',
    fog: [0xc9b56a, 0xbfae63, 0xd2c27a], mats: ['drum', 'grate', 'machine', 'bin'], beam: 'beam', skin: 'acid', laser: 0x9cff3a,
    sections: ['Fasslager', 'Rohrbrücke', 'Säurebecken', 'Ventilhalle', 'Laborturm', 'Sicherheitszone'],
    pool: { presses: 2, gauntlet: 2, rams: 1, acid: 4, pipes: 3, lasers: 3, spikes: 2, poles: 2, shelves: 2, zigzag: 2, drums: 1, hooks: 1, crumble: 1 },
    puzzles: ['fence', 'gate'], scenery: 'tanks',
  },
  {
    key: 'gleis', name: 'Gleisanschluss', sub: 'Waggons, Oberleitung und Kräne',
    fog: [0x9a8a7c, 0x8f8072, 0xa69585], mats: ['wagon', 'container', 'timber', 'grate'], beam: 'beam', skin: 'spikes', laser: 0x7fb6ff,
    sections: ['Rangiergleis', 'Waggonstapel', 'Oberleitung', 'Drehscheibe', 'Containerzug', 'Stellwerk'],
    pool: { sliders: 2, rams: 2, gauntlet: 1, lifts: 3, catenary: 3, swing: 3, trolley: 2, hooks: 2, crumble: 2, poles: 2, beams: 2, drop: 1, bounce: 1 },
    puzzles: ['gate', 'fence'], scenery: 'gantries',
  },
  {
    key: 'kran', name: 'Turmkran', sub: 'Ausleger, Haken und Höhenwind',
    fog: [0x7a7aa8, 0x6c6c9c, 0x5f5f8e], mats: ['concrete', 'grate', 'timber', 'machine'], beam: 'beam', skin: 'spikes', laser: 0xff3a2a,
    sections: ['Baugerüst', 'Betonkern', 'Kranmast', 'Ausleger', 'Gegengewicht', 'Gipfel'],
    pool: { sliders: 3, gauntlet: 2, presses: 1, rams: 1, hooks: 4, trolley: 3, wind: 3, beams: 3, poles: 3, swing: 2, crumble: 2, zigzag: 2, lasers: 1, spikes: 1 },
    puzzles: ['fence', 'gate'], scenery: 'mast',
  },
  FIRE_ACT, // Akt 8: Feuer und Wasser (wasserwerk.js)
];

// Richtung → Abmessungen (along = entlang der Laufrichtung, across = quer)
const dims = (dir, along, across) => (dir === 'f' || dir === 'b' ? [along, across] : [across, along]);

export function buildActs(k) {
  const rnd = k.rnd;
  const R = (a, b) => a + (b - a) * rnd();
  const pickW = (w, exclude = []) => {
    const ent = Object.entries(w).filter(([n]) => !exclude.includes(n));
    let sum = 0;
    for (const [, v] of ent) sum += v;
    let r = rnd() * sum;
    for (const [n, v] of ent) { r -= v; if (r <= 0) return n; }
    return ent[0][0];
  };
  const mid = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
  // Schwierigkeit: normale Sprünge weiter und auf kleinere Flächen, je höher desto mehr.
  // Die Lücke bleibt unter der sicheren Weite für den jeweiligen Anstieg.
  let G = 0;
  const KEEP = ['beam', 'belt', 'wagon', 'checkpoint', 'ice', 'fan', 'tires', 'blink', 'machine'];
  const maxGap = (dy) => 2.3 - 0.55 * Math.max(0, dy - 0.4);
  const S = (dir, gap, dy, along, across, mat, o = {}) => {
    if (!o.how && !o.exact) {
      gap = Math.min(gap * (1.3 + 0.35 * G), Math.max(gap, maxGap(dy)));
      if (!KEEP.includes(mat)) { const f = 0.85 - 0.25 * G; along = Math.max(1.1, along * f); across = Math.max(1.1, across * f); }
    }
    const [a, l] = dims(dir, along, across);
    return k.step(dir, gap, dy, a, l, mat, o);
  };
  const turn = () => (rnd() < 0.5 ? 'l' : 'r');

  // Laserschranke quer über eine Plattform (dünn entlang Weltachse ax)
  const laserAcross = (T, b, ax, h0, h1, o = {}) => {
    const [cx, cz] = mid(b);
    const t = 0.08, pad = 0.6;
    const min = ax === 0 ? [cx - t, b.max[1] + h0, b.min[2] - pad] : [b.min[0] - pad, b.max[1] + h0, cz - t];
    const max = ax === 0 ? [cx + t, b.max[1] + h1, b.max[2] + pad] : [b.max[0] + pad, b.max[1] + h1, cz + t];
    if (o.at !== undefined) { min[ax] += o.at; max[ax] += o.at; }
    return k.hazard('laser', min, max, { color: T.laser, ...o });
  };
  const axisOf = (dir) => (k.dirVec(dir)[0] ? 0 : 2);
  // Rammbock neben Plattform b: fährt quer zur Laufrichtung fv über sie hinweg und stößt alles hinunter.
  // side = +1 (von rechts) / -1 (von links). o: { period, phase, h, at (Lage entlang), thick }
  const ramAcross = (b, fv, side, o) => {
    const A = fv[0] ? 0 : 2, C = 2 - A;
    const rv = [-fv[1], fv[0]]; // rechts
    const ws = side * (rv[0] || rv[1]); // Weltrichtung, aus der er kommt
    const min = [0, b.max[1], 0], max = [0, b.max[1] + o.h, 0];
    if (o.at !== undefined) { min[A] = o.at - o.thick / 2; max[A] = o.at + o.thick / 2; }
    else { min[A] = b.min[A] - 0.1; max[A] = b.max[A] + 0.1; }
    const th = 0.5, gap = 0.12;
    if (ws > 0) { min[C] = b.max[C] + gap; max[C] = b.max[C] + gap + th; } else { max[C] = b.min[C] - gap; min[C] = b.min[C] - gap - th; }
    const travel = (b.max[C] - b.min[C]) + gap + 0.45;
    const delta = [0, 0, 0]; delta[C] = -ws * travel;
    return k.pusher(min, max, delta, { period: o.period, phase: o.phase });
  };
  const floorHazard = (T, b, o = {}) => k.hazard('spikes', [b.min[0], b.max[1], b.min[2]], [b.max[0], b.max[1] + (T.skin === 'acid' ? 0.2 : 0.4), b.max[2]], { skin: T.skin, ...o });

  // ───────── Set-Pieces ─────────
  // Jede Funktion baut ab k.prev in Richtung k.fwd. g = Schwierigkeit 0..1
  const P = {
    stairs(T, g) {
      const n = 4 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const dir = i === 0 ? 'f' : ['f', 'f', 'l', 'r'][Math.floor(rnd() * 4)];
        const s = R(Math.max(1.0, 2.2 - 1.1 * g), Math.max(1.4, 2.8 - 1.0 * g));
        S(dir, R(1.0, 1.7 + 0.7 * g), R(0.4, 1.0 + 0.25 * g), s, s, T.mats[Math.floor(rnd() * T.mats.length)], { off: R(-0.7, 0.7) });
      }
    },
    beams(T, g) {
      const n = 3 + Math.floor(rnd() * 3);
      const w = 0.35 - 0.13 * g;
      let side = 1;
      for (let i = 0; i < n; i++) {
        const dir = i === 0 ? 'f' : rnd() < 0.75 ? 'f' : turn();
        S(dir, R(1.2, 1.7 + 0.5 * g), R(-0.4, 0.9), R(2.2, 3.2), w, T.beam, { off: (side *= -1) * R(0.2, 0.8) });
      }
      S('f', R(1.2, 1.6), R(0.2, 0.8), 2.2, 2.2, T.mats[1]);
    },
    ledges(T, g) {
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        S(i ? turn() : 'f', R(0.9, 1.3), R(1.55, 1.9 + 0.15 * g), 2.4, 2.4, T.mats[Math.floor(rnd() * T.mats.length)], { h: 1.4, how: 'ledge' });
        if (rnd() < 0.5) S('f', R(1.2, 1.8), R(0.3, 0.8), 1.6, 1.6, T.mats[0]);
      }
    },
    tower(T, g) {
      S('f', R(1.0, 1.5), R(0.3, 0.8), 3, 3, 'grate');
      k.ladderUp('f', 0, R(3.5, 4.5), 3, 3, 'machine');
      k.ramp('f', 0, 0, R(6, 8), 1.6, R(2.4, 3.4), { slide: true, mat: T.key === 'kuehl' ? 'iceslide' : 'chute' });
      S('f', R(2.6, 3.2 + 0.4 * g), -0.5, 3, 2.2, T.mats[1], { how: 'long' });
    },
    hooks(T, g) {
      S('f', R(1.0, 1.5), R(0.3, 0.8), 2.4, 2.4, T.mats[1]);
      k.hook('f', 1.2, 2.6, { len: 2.2 });
      const n = 1 + (rnd() < 0.4 + 0.4 * g ? 1 : 0);
      for (let i = 0; i < n; i++) k.hook('f', R(2.4, 2.8 + 0.3 * g), 1.95, { len: 2.2 });
      S('f', 1.6, -0.5, 2.4, 3, T.mats[1]);
    },
    trolley(T, g) {
      S('f', R(1.0, 1.5), R(0.3, 0.8), 2.4, 2.4, T.mats[1]);
      k.hook('f', 1.2, 2.6, { len: 2.4, motion: { dist: R(8, 12), period: R(10, 12) - 2 * g } });
      S('f', 0.4, -1.0, 2.6, 2.6, T.mats[1]);
    },
    pipes(T, g) {
      const r = 0.3 - 0.1 * g;
      S('f', R(1.0, 1.4), R(0.3, 0.8), 2, 2, 'grate');
      k.pipe('f', 1.2, R(0.1, 0.4), R(4, 6), r, { mat: T.key === 'chemie' ? 'pipe' : 'duct' });
      k.pipe(turn(), 1.0, R(0.2, 0.5), R(4, 6), r, { mat: 'pipe' });
      if (rnd() < 0.6) k.pipe('f', 1.0, R(0.2, 0.5), R(3, 5), r, { mat: 'pipe' });
      S('f', 1.1, R(0.2, 0.5), 2.2, 2.2, T.mats[1]);
    },
    drums(T, g) {
      S('f', R(1.0, 1.4), R(0.3, 0.8), 2, 2, 'grate');
      const n = 2 + (rnd() < g ? 1 : 0);
      for (let i = 0; i < n; i++) {
        k.pipe(i ? turn() : 'f', 1.3, R(0.2, 0.5), 4, 0.55, { spin: (rnd() < 0.5 ? -1 : 1) * R(1.0, 1.4 + 0.6 * g), model: 'drum', mat: 'cable' });
        S('f', 1.2, R(0.2, 0.6), 2, 2, 'grate');
      }
    },
    lasers(T, g) {
      for (let i = 0; i < 3; i++) {
        const dir = i === 0 ? 'f' : rnd() < 0.7 ? 'f' : turn();
        const b = S(dir, R(1.2, 1.8), R(0.2, 0.8), R(3.4, 4.0), 2.4, T.mats[1]);
        const dv = k.dirVec(dir), ax = axisOf(dir), sg = dv[0] || dv[1];
        if (i === 1 && rnd() < 0.35 + 0.3 * g) {
          // wandernder Laser knapp über dem Boden: im richtigen Moment drüberhüpfen
          laserAcross(T, b, ax, 0.05, 0.55, { at: -1.2 * sg, motion: { delta: ax === 0 ? [2.4 * sg, 0, 0] : [0, 0, 2.4 * sg], period: 3.4 } });
        } else {
          laserAcross(T, b, ax, 0, 2.6, { at: 1.0 * sg, timer: { period: R(3.2, 4.2) - 0.6 * g, phase: rnd(), on: 0.5 } });
        }
      }
    },
    catenary(T, g) { // Oberleitung: zwischen den Waggons schlägt im Takt ein Lichtbogen über
      let a = S('f', R(1.2, 1.6), R(0.2, 0.8), R(4, 5.5), 2.6, 'wagon');
      for (let i = 0; i < 3; i++) {
        const dir = i && rnd() < 0.35 ? turn() : 'f';
        const gap = R(1.3, 1.8 + 0.3 * g);
        const b = S(dir, gap, R(-0.2, 0.5), R(4, 5.5), 2.6, 'wagon');
        // Bogen in der Lücke zwischen a und b
        const dv = k.dirVec(dir), ax = axisOf(dir);
        const lo = Math.min(a.max[1], b.max[1]) - 0.6, hi = Math.max(a.max[1], b.max[1]) + 2.6;
        const m0 = ax === 0 ? (dv[0] > 0 ? a.max[0] : b.max[0]) : (dv[1] > 0 ? a.max[2] : b.max[2]);
        const m1 = ax === 0 ? (dv[0] > 0 ? b.min[0] : a.min[0]) : (dv[1] > 0 ? b.min[2] : a.min[2]);
        const c = (m0 + m1) / 2, t = 0.08;
        const [bx, bz] = mid(b);
        const min = ax === 0 ? [c - t, lo, bz - 1.5] : [bx - 1.5, lo, c - t];
        const max = ax === 0 ? [c + t, hi, bz + 1.5] : [bx + 1.5, hi, c + t];
        k.hazard('laser', min, max, { color: T.laser, arc: true, timer: { period: R(3.0, 3.8) - 0.4 * g, phase: rnd(), on: 0.5 } });
        a = b;
      }
    },
    spikes(T, g) { // Stachelböden im Wellentakt: jede Platte fährt etwas später ein als die vorige
      const period = R(3.0, 3.6) - 0.4 * g;
      for (let i = 0; i < 3; i++) {
        const b = S(i && rnd() < 0.4 ? turn() : 'f', R(1.2, 1.8), R(0.2, 0.8), 2.2, 2.2, T.mats[1]);
        floorHazard(T, b, { timer: { period, phase: 1 - 0.3 * i, on: 0.45 } });
      }
      S('f', 1.4, 0.4, 2.2, 2.2, T.mats[0]);
    },
    icicles(T, g) { // Eiszapfen: feste Streifen auf langen Eisflächen, drüberspringen
      for (let i = 0; i < 2; i++) {
        const dir = i ? turn() : 'f';
        const b = S(dir, R(1.2, 1.6), R(0.3, 0.8), R(5, 6.5), 2.2, 'ice', { extra: { ice: true } });
        const ax = axisOf(dir);
        const dv = k.dirVec(dir), sg = dv[0] || dv[1];
        const [cx, cz] = mid(b);
        const half = 0.45, at = 1.3 * sg;
        const min = [b.min[0], b.max[1], b.min[2]], max = [b.max[0], b.max[1] + 0.45, b.max[2]];
        if (ax === 0) { min[0] = cx + at - half; max[0] = cx + at + half; } else { min[2] = cz + at - half; max[2] = cz + at + half; }
        k.hazard('spikes', min, max, { skin: 'icicle' });
      }
      S('f', 1.4, 0.5, 2, 2, 'crate');
    },
    acid(T, g) { // Säurebecken mit Trittsteinen (Fässer)
      const c = S('f', R(1.0, 1.4), R(-0.3, 0.2), 7.5, 3.2, 'grate', { h: 0.4, extra: { basin: true } });
      // Das Becken selbst ist kein Kletterpunkt: aus dem Pfad nehmen, nur die Fässer zählen
      const base = c;
      k.dropLastPath();
      floorHazard(T, base, { skin: 'acid' });
      const fv = k.dirVec('f');
      const [cx, cz] = mid(base);
      const s = 0.95 - 0.15 * g;
      for (let i = 0; i < 3; i++) {
        const t = -2.5 + i * 2.5;
        const off = (i % 2 ? 1 : -1) * R(0.2, 0.6);
        const sx = cx + fv[0] * t - fv[1] * off, sz = cz + fv[1] * t + fv[0] * off;
        const st = k.solid([sx - s / 2, base.max[1], sz - s / 2], [sx + s / 2, base.max[1] + R(0.6, 0.9), sz + s / 2], 'drum');
        k.addPath(st);
      }
      k.setPrev(base);
      const end = S('f', R(1.0, 1.4), R(0.7, 1.1), 2.2, 2.2, T.mats[1]);
      return end;
    },
    belts(T, g) {
      for (let i = 0; i < 3; i++) {
        const dir = i ? (rnd() < 0.6 ? 'f' : turn()) : 'f';
        const along = k.dirVec(dir);
        const sp = R(2, 2.4 + 1.6 * g);
        const mode = Math.floor(rnd() * 3);
        const v = mode === 0 ? [-along[0] * sp, -along[1] * sp] : mode === 1 ? [along[0] * sp * 0.8, along[1] * sp * 0.8] : [along[1] * sp, -along[0] * sp];
        S(dir, R(1.0, 1.6), R(0.2, 0.8), R(4, 6), 1.4, 'belt', { belt: [v[0], 0, v[1]] });
        S('f', R(1.0, 1.5), R(0.3, 0.9), 1.8, 1.8, T.mats[i % T.mats.length]);
      }
    },
    blinks(T, g) {
      for (let i = 0; i < 3; i++) {
        const b = S(i && rnd() < 0.4 ? turn() : 'f', R(1.0, 1.6), R(0.2, 0.8), 2, 2, 'blink');
        b.blink = { period: R(5 - 1.5 * g, 6 - 1.5 * g), phase: rnd() };
        k.markBlink();
      }
      S('f', 1.2, 0.4, 2.2, 2.2, T.mats[1]);
    },
    lifts(T, g) {
      const model = T.key === 'gleis' ? 'wagon' : 'forklift';
      k.mover('lift', 'f', 0.8, 2, 2, { range: R(3, 4), period: R(7, 8) - g, model: model === 'wagon' ? undefined : 'forklift' });
      S('f', 1.2, 0.5, 2, 2, 'grate');
      k.mover('slide', turn(), 0.6, 2, 2, { dist: R(5, 7), period: R(7, 9) - g, mat: T.key === 'gleis' ? 'wagon' : 'lift' });
      S('f', 1.0, 0.6, 2, 2, T.mats[1]);
    },
    wind(T, g) {
      const bs = [];
      const n = 3;
      // Immer geradeaus: der Wind kommt dann quer. Nach einer Kurve käme er von hinten oder
      // vorn und trüge einen über den schmalen Träger hinaus (in der Simulation unschaffbar).
      for (let i = 0; i < n; i++) { if (i) rnd(); bs.push(S('f', R(1.4, 2.0), R(0.0, 0.6), R(2.2, 3), 0.35 - 0.1 * g, T.beam)); }
      const r = k.dirVec(turn());
      const span = {
        min: [Math.min(...bs.map((b) => b.min[0])) - 1, Math.min(...bs.map((b) => b.max[1])) - 0.5, Math.min(...bs.map((b) => b.min[2])) - 1],
        max: [Math.max(...bs.map((b) => b.max[0])) + 1, Math.max(...bs.map((b) => b.max[1])) + 4, Math.max(...bs.map((b) => b.max[2])) + 1],
      };
      const f = 5 + 3 * g;
      k.wind(span, [r[0] * f, 0, r[1] * f], { period: R(4.5, 6), phase: rnd() });
      // Landeplatz hinter der Windstrecke liegt im Windschatten
      S('f', 2.2, 0.4, 2.2, 2.2, T.mats[1], { exact: true });
    },
    ice(T, g) {
      S('f', R(1.0, 1.4), R(0.3, 0.7), 3, 3, 'ice', { extra: { ice: true } });
      S('f', R(1.2, 1.8), R(0.3, 0.8), 2.4, 2.4, 'ice', { extra: { ice: true } });
      k.ramp(turn(), 1.0, 0.2, R(5, 6.5), 1.6, R(1.8, 2.6), { slide: true, mat: 'iceslide' });
      S('f', R(2.6, 3.2), -0.4, 2.8, 2.6, 'ice', { how: 'long', extra: { ice: true } });
      S('f', 1.4, 0.6, 2, 2, 'crate');
    },
    fans(T, g) {
      S('f', R(1.0, 1.4), R(0.3, 0.7), 2, 2, 'grate');
      const n = 1 + (rnd() < 0.6 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const s = R(1.8, 2.3);
        const f = S(i ? turn() : 'f', R(1.0, 1.5), 0, s, s, 'fan', { extra: { fan: true } });
        k.fanZone(f);
        S('f', R(1.0, 1.4), R(2.8, 3.6), 2.2, 2.2, T.mats[i % T.mats.length]);
      }
    },
    bounce(T, g) {
      const s = R(1.6, 2.1);
      S('f', R(1.0, 1.4), R(0.2, 0.6), s, s, 'tires', { extra: { bounce: true }, h: 0.8 });
      k.special('bounce');
      S('f', R(1.0, 1.4), R(2.0, 2.8), 2.2, 2.2, T.mats[1]);
    },
    drop(T, g) { // Abstieg: zwei Stufen nach unten, dann wieder hinauf
      S('f', R(1.2, 1.6), R(-1.4, -1.0), 2.2, 2.2, T.mats[0], { how: 'long' });
      S(turn(), R(1.6, 2.4), R(-1.6, -1.0), 1.6, 1.6, T.mats[1], { how: 'long' });
      S('f', R(1.2, 1.6), R(1.55, 1.9), 2.4, 2.4, T.mats[0], { h: 1.4, how: 'ledge' });
    },
    poles(T, g) { // Pfähle: kleine Trittflächen, Präzisionssprünge
      const n = 4 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const sz = R(0.55, 0.75) - 0.15 * g;
        S(i && rnd() < 0.35 ? turn() : 'f', R(1.3, 1.8 + 0.4 * g), R(-0.2, 0.7), sz, sz, 'machine', { exact: true, h: R(1.2, 2.2), supports: true });
      }
      S('f', R(1.2, 1.6), R(0.2, 0.6), 1.8, 1.8, T.mats[1]);
    },
    crumble(T, g) { // Bruchpaletten: brechen 0,9 s nach dem Betreten weg
      const n = 4 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        S(i && rnd() < 0.4 ? turn() : 'f', R(1.4, 2.0), R(0.0, 0.6), 1.4, 1.4, 'timber', { exact: true, h: 0.3, extra: { crumble: true } });
      }
      S('f', R(1.2, 1.6), R(0.2, 0.6), 2, 2, T.mats[1]);
    },
    swing(T, g) { // schwingende Kranlast: aufspringen, mitfahren, abspringen
      S('f', R(1.0, 1.4), R(0.2, 0.6), 2, 2, T.mats[1]);
      k.mover('swing', 'f', 0.7, 1.6, 1.6, { dist: R(5, 7), period: R(6.5, 7.5) - g, h: 1.1, mat: 'crate' });
      S('f', 0.7, R(0.0, 0.4), 2, 2, T.mats[0], { exact: true });
    },
    shelves(T, g) { // Regalböden: Kante greifen, hochziehen, sofort weiter
      const n = 3 + (rnd() < g ? 1 : 0);
      for (let i = 0; i < n; i++) S(i ? turn() : 'f', R(0.9, 1.2), R(1.6, 1.95), 1.6, 1.3, T.mats[i % T.mats.length], { h: 1.4, how: 'ledge' });
      S('f', R(1.2, 1.6), R(0.2, 0.6), 1.8, 1.8, T.mats[0]);
    },
    zigzag(T, g) { // kleine Kisten im Zickzack, weit auseinander
      let side = turn();
      for (let i = 0; i < 5; i++) {
        S(i % 2 ? side : 'f', R(1.8, 2.3), R(-0.1, 0.5), 1.1, 1.1, T.mats[i % T.mats.length], { exact: true });
        if (i % 2) side = side === 'l' ? 'r' : 'l';
      }
    },
    // ───── Schwere Passagen ─────
    sliders(T, g) { // Schiebebalken: schmale Träger fahren quer hin und her, im Gegentakt
      const period = R(4.6, 5.4) - 0.8 * g, phase = rnd();
      const w = 0.42 - 0.12 * g;
      const n = 3 + (rnd() < g ? 1 : 0);
      let sd = rnd() < 0.5 ? -1 : 1;
      S('f', R(1.0, 1.4), R(0.2, 0.6), 2.0, 2.0, T.mats[1]);
      k.sign('SCHIEBEBALKEN');
      for (let i = 0; i < n; i++) {
        k.mover('slide', 'f', R(1.0, 1.4 + 0.3 * g), R(2.2, 2.6), w, { side: true, dist: (sd *= -1) * R(1.8, 2.4 + 0.6 * g), period, phase, h: 0.25, mat: 'beam', dy: R(0.0, 0.4) });
      }
      S('f', R(1.0, 1.3), R(0.0, 0.4), 2.0, 2.0, T.mats[0], { exact: true });
    },
    rams(T, g) { // Rammböcke: jede Plattform wird im Takt leergefegt
      const period = R(3.0, 3.6) - 0.5 * g;
      const n = 3;
      const fv = k.dirVec('f');
      for (let i = 0; i < n; i++) {
        const b = S('f', R(1.3, 1.8 + 0.3 * g), R(0.0, 0.6), 1.8, 1.8, T.mats[1], { exact: true });
        if (i === 0) k.sign('RAMMBÖCKE');
        ramAcross(b, fv, rnd() < 0.5 ? -1 : 1, { period, phase: 0.18 * i, h: 1.15 });
      }
      S('f', R(1.2, 1.6), R(0.2, 0.6), 2.0, 2.0, T.mats[0], { exact: true });
    },
    gauntlet(T, g) { // Stoßgasse: langer schmaler Steg, Kolben stoßen abwechselnd von links und rechts
      const fv = k.dirVec('f');
      S('f', R(1.0, 1.4), R(0.2, 0.6), 2.0, 2.0, T.mats[1], { exact: true });
      k.sign('STOSSGASSE');
      const len = R(7.5, 9), w = 0.62 - 0.12 * g;
      const b = S('f', R(1.0, 1.3), R(0.0, 0.4), len, w, T.beam, { exact: true });
      const period = R(3.0, 3.5) - 0.4 * g;
      const n = 3;
      const ax = axisOf('f');
      const sg = fv[0] || fv[1];
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1); // Lage entlang des Stegs
        const at = ax === 0 ? (sg > 0 ? b.min[0] + t * len : b.max[0] - t * len) : (sg > 0 ? b.min[2] + t * len : b.max[2] - t * len);
        // Welle in Laufrichtung: der nächste Kolben stößt etwas später
        ramAcross(b, fv, i % 2 ? 1 : -1, { period, phase: (0.55 - 0.1 * i + 1) % 1, h: 1.05, at, thick: 0.9 });
      }
      S('f', R(1.0, 1.3), R(0.0, 0.4), 2.0, 2.0, T.mats[0], { exact: true });
    },
    presses(T, g) { // Stanzpressen: kleine Tritte unter Stempeln, die herunterknallen
      const period = R(2.8, 3.4) - 0.4 * g;
      const n = 3 + (rnd() < 0.3 + 0.5 * g ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const s = 1.3 - 0.2 * g;
        const b = S('f', R(1.3, 1.7 + 0.3 * g), R(-0.2, 0.5), s, s, 'machine', { exact: true, h: R(1.2, 2.0), supports: true });
        if (i === 0) k.sign('STANZPRESSEN');
        const top = b.max[1] + 2.75;
        k.pusher([b.min[0] - 0.05, top, b.min[2] - 0.05], [b.max[0] + 0.05, top + 1.1, b.max[2] + 0.05], [0, -2.75, 0], { press: true, period, phase: (0.15 * i) % 1 });
      }
      S('f', R(1.2, 1.6), R(0.2, 0.6), 2.0, 2.0, T.mats[1], { exact: true });
    },
    // ───── Rätsel ─────
    gate(T, g) {
      const base = S('f', R(1.0, 1.4), R(0.3, 0.7), 3.2, 3.2, 'grate');
      const tower = k.ladderUp('f', 0, R(3.6, 4.4), 3, 3, 'machine');
      const lad = k.ladderOf(tower);
      const [cx, cz] = mid(base);
      const back = k.dirVec('b'), right = k.dirVec('r');
      const p1 = k.plate(base, cx + back[0] * 0.9 + right[0] * 0.9, cz + back[1] * 0.9 + right[1] * 0.9);
      const [tx, tz] = mid(tower);
      const p2 = k.plate(tower, tx + back[0] * 0.8 - right[0] * 0.8, tz + back[1] * 0.8 - right[1] * 0.8);
      k.gate([lad.min[0] - 0.05, lad.min[1] + 0.05, lad.min[2] - 0.05], [lad.max[0] + 0.05, lad.max[1] - 0.02, lad.max[2] + 0.05], [p1, p2]);
      S('f', R(1.2, 1.6), R(0.2, 0.6), 2.2, 2.2, T.mats[1]);
    },
    fence(T, g) {
      const st = S('f', R(1.0, 1.4), R(0.3, 0.7), 2.6, 2.6, 'concrete');
      const [sx, sz] = mid(st);
      const pa = k.plate(st, sx, sz, 1.0);
      const b1 = S('f', R(1.6, 2.0), 0, R(2.4, 2.8), 0.32, T.beam);
      const b2 = S('f', R(1.6, 2.0), R(0.0, 0.4), R(2.4, 2.8), 0.32, T.beam);
      const [bx, bz] = mid(b2);
      const pb = k.plate(b2, bx, bz, 0.7);
      const z = laserAcross(T, b1, axisOf('f'), 0, 3.2, { plate: pa });
      z.plate2 = pb;
      S('f', 1.3, 0.3, 2.2, 2.2, T.mats[1]);
    },
  };

  Object.assign(P, firePieces(k, S, rnd));

  // Freier Platz vom Punkt aus in Richtung d bis zur Hallengrenze
  const room = (d) => {
    const [cx, cz] = mid(k.prev);
    const B = k.BOUND - 2;
    if (d[0] > 0) return B - cx; if (d[0] < 0) return cx + B;
    if (d[1] > 0) return B - cz; return cz + B;
  };
  const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  function orderedDirs() {
    return DIRS.map((d) => ({ d, r: room(d) + rnd() * 10 })).sort((a, b) => b.r - a.r).map((o) => o.d);
  }

  // Ein Stück bauen: alle Richtungen und mehrere Varianten probieren
  const FALLBACK = ['stairs', 'pad', 'escape'];
  function tryPiece(name, T, g, tries = 3) {
    for (const d of orderedDirs()) {
      for (let v = 0; v < tries; v++) {
        const snap = k.snapshot();
        k.face(null, d);
        let ok = true;
        try { P[name](T, g); } catch (e) { ok = false; if (k.debug) console.log('Stück', name, e.message); }
        if (ok && k.pieceOk(snap)) { k.tagPath(snap.path, name); return true; }
        if (k.debug) console.log('passt nicht', name, k.why?.());
        k.rollback(snap);
      }
    }
    return false;
  }
  // Ein Stück bauen: alle Richtungen und mehrere Varianten probieren, sonst Ersatzstücke
  function place(name, T, g) {
    if (tryPiece(name, T, g)) return;
    for (const f of FALLBACK) if (tryPiece(f, T, g, 6)) return;
    throw new Error('Akte: kein Platz mehr');
  }
  P.pad = (T) => S('f', R(1.0, 1.6), R(0.3, 0.8), 2, 2, 'grate');
  // Notausgang aus engem Gewühl: Leiterturm nach oben
  P.escape = (T) => { S('f', R(1.0, 1.4), R(0.2, 0.5), 2.4, 2.4, 'grate'); k.ladderUp('f', 0, R(3.6, 5), 2.6, 2.6, 'machine'); };

  function cpPad(label, T, size = 3.2) {
    for (const d of orderedDirs()) {
      for (let v = 0; v < 3; v++) {
        const snap = k.snapshot();
        k.face(null, d);
        S('f', R(1.2, 1.6), R(0.4, 0.8), size, size, 'checkpoint');
        if (k.pieceOk(snap)) { k.markCheckpoint(label); return; }
        k.rollback(snap);
      }
    }
    throw new Error('Akte: kein Platz für Zwischenstopp ' + label);
  }

  const HARD = ['sliders', 'rams', 'gauntlet', 'presses'];
  let hall = 7;
  const PIECES = 9; // Stücke je Abschnitt, Zwischenstopp nur am Abschnittsanfang
  ACTS.forEach((T, ai) => {
    const recent = [];
    const y0 = k.prev.max[1];
    for (let si = 0; si < 6; si++) {
      const g = Math.min(1, (ai + si / 6) / 5.5);
      G = g;
      const info = { name: T.sections[si], hall: 'Halle ' + hall++, fog: T.fog[si % T.fog.length], theme: T.name, act: ai + 2 };
      k.section(info, k.fwd, k.prev.max[1]);
      cpPad(info.hall, T);
      if (si === 0) k.sign(`AKT ${ai + 2} · ${T.name.toUpperCase()}`, T.sub);
      else k.sign(`${info.hall.toUpperCase()} · ${info.name.toUpperCase()}`, T.sub);
      // Abschnitt: Zwischenstopp, dann 9 Stücke am Stück, darunter ein Koop-Rätsel.
      const plan = [];
      for (let i = 0; i < PIECES; i++) {
        const name = pickW(T.pool, recent.slice(-3));
        plan.push(name);
        recent.push(name);
      }
      plan[3 + (si % 3)] = T.puzzles[si % 2];
      // Harte Passagen (Schiebebalken, Rammböcke, Stoßgasse, Pressen): mindestens zwei je Akt
      if (si === 2 || si === 5) {
        const hard = Object.fromEntries(Object.entries(T.pool).filter(([n]) => HARD.includes(n)));
        if (Object.keys(hard).length) plan[7] = pickW(hard);
      }
      // Große Rätsel-Plattform mit Maschine (arenas.js), einmal je Akt – sobald Platz ist
      if (si === 3) k.queueArena(T);
      if (T.fixed?.[si]) plan[1] = T.fixed[si];
      plan.forEach((name, i) => {
        k.tryArenas();
        place(name, T, g);
      });
    }
    scenery(T, y0 - 4, k.prev.max[1] + 4, ai === ACTS.length - 1);
  });

  // ───────── Kulisse je Akt (ohne Kollision, außerhalb der Kletterzone) ─────────
  function scenery(T, y0, y1, last) {
    const W = k.BOUND + 5; // Abstand der Kulissenwände
    const h = y1 - y0;
    const prop = (type, o) => k.prop(type, null, { y0, y1, ...o });
    switch (T.scenery) {
      case 'waterworks': waterworksScenery((type, o) => k.prop(type, null, { y0, y1, ...o }), W, y0, y1); break;
      case 'frostracks': // Tiefkühlregale hinter Isolierpaneelen
        prop('rack', { from: [-W + 2, -W + 3], to: [W - 2, -W + 3], height: h, base: y0, frost: true });
        prop('rack', { from: [-W + 3, W - 2], to: [-W + 3, -W + 2], height: h, base: y0, frost: true });
        prop('panelwall', { a: [-W, -W], b: [W, -W] });
        prop('panelwall', { a: [-W, W], b: [-W, -W] });
        // Verdampfer hängen an einer dritten Paneelwand statt frei in der Luft
        prop('panelwall', { a: [W, W], b: [W, -W] });
        for (let y = y0 + 6; y < y1; y += 9) prop('coolunit', { pos: [W - 0.65, y, -W + 6 + ((y * 7) % 30)] });
        break;
      case 'parcelracks': // Paketregale und Wendelrutschen
        prop('rack', { from: [W - 3, -W + 2], to: [W - 3, W - 2], height: h, base: y0 });
        prop('rack', { from: [-W + 2, W - 3], to: [W - 2, W - 3], height: h, base: y0 });
        prop('spiral', { pos: [-W + 4, -W + 4], r: 3.2 });
        prop('spiral', { pos: [W - 4, -W + 4], r: 3.2 });
        break;
      case 'silos': // Betonsilos rundherum, verbunden durch Förderbrücken
        for (const [x, z, r] of [[-W - 3, -W + 10, 7], [-W - 3, 8, 6], [W + 3, -W + 6, 6.5], [10, -W - 3, 7], [-14, W + 3, 6]]) prop('silo', { pos: [x, z], r, y0: y0 - 40 });
        for (let y = y0 + 10; y < y1; y += 16) prop('bridge', { a: [-W - 3, -W + 10], b: [10, -W - 3], y });
        break;
      case 'tanks': // Lagertanks, Rohrtrassen und Auffangwannen
        for (let y = y0 + 2, i = 0; y < y1; y += 14, i++) {
          prop('tank', { pos: [i % 2 ? W - 1 : -W + 1, y, -20 + (i * 13) % 40], r: 3.6, h: 10, color: i % 3 });
          prop('tank', { pos: [-20 + (i * 17) % 40, y + 6, i % 2 ? -W + 1 : W - 1], r: 3.2, h: 9, color: (i + 1) % 3 });
        }
        for (let y = y0 + 5; y < y1; y += 7) prop('piperun', { a: [-W + 1, -W + 1], b: [W - 1, -W + 1], y, n: 3 });
        for (let y = y0 + 8; y < y1; y += 9) prop('piperun', { a: [-W + 1, W - 1], b: [-W + 1, -W + 1], y, n: 2 });
        break;
      case 'gantries': // Portalkräne über Gleisen, Waggons auf Hochgleisen
        for (let y = y0 + 4, i = 0; y < y1; y += 12, i++) {
          prop('gantry', { a: [-W + 2, i % 2 ? -W - 2 : W + 2], b: [W - 2, i % 2 ? -W - 2 : W + 2], y });
          prop('railbridge', { a: [i % 2 ? W + 2 : -W - 2, -W + 2], b: [i % 2 ? W + 2 : -W - 2, W - 2], y: y + 5, wagons: 3 + (i % 3) });
        }
        break;
      case 'mast': { // Turmkran: Mast von unten bis über das Ziel, Ausleger über die ganze Halle
        const top = y1 + 14;
        prop('mast', { pos: [W - 1, W - 1], top });
        prop('jib', { pos: [W - 1, W - 1], to: [-W + 6, -W + 6], y: top, back: 16 });
        for (let y = y0; y < y1; y += 8) prop('scaffold', { a: [-W + 1, W - 1], b: [W - 8, W - 1], y });
        break;
      }
    }
  }
}
