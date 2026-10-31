// Level-Daten für "Hochstapler". Alles ist deterministisch, damit alle Clients
// exakt dieselbe Welt bauen. Der Turm schraubt sich als eckige Spirale nach oben.
// Akt 1 (sechs Abschnitte) ist von Hand gebaut, danach folgen erzeugte Abschnitte
// mit steigender Schwierigkeit. Zwischenstopps speichern den Fortschritt.

import { buildAct1 } from './act1.js';
import { buildActs } from './acts.js';

// Abschnitte von Akt 1 (handgebaut)
const HANDMADE = [
  { name: 'Wareneingang', hall: 'Tor 1', fog: 0xf1c08a },
  { name: 'Hochregallager', hall: 'Halle 2', fog: 0xe9b58a },
  { name: 'Fördertechnik', hall: 'Halle 3', fog: 0xd9a18a },
  { name: 'Staplerzone', hall: 'Halle 4', fog: 0xc28e92 },
  { name: 'Containerhafen', hall: 'Kai 5', fog: 0x9b84a3 },
  { name: 'Versanddach', hall: 'Dach', fog: 0x7a7aa8 },
];

export const GENERATED_SECTIONS = 42;
// Akt 1 zieht weit nach links hinaus – der Start liegt deshalb rechts im Hof
const START_X = 22;
const SEED = 0x5eed1e;
const DEBUG = typeof process !== 'undefined' && process.env && process.env.LVLDEBUG;

// Bewegungsprofil: halten – fahren – halten – zurückfahren.
function smooth(x) { return x * x * (3 - 2 * x); }
export function moverProgress(u) {
  if (u < 0.2) return 0;
  if (u < 0.5) return smooth((u - 0.2) / 0.3);
  if (u < 0.7) return 1;
  return 1 - smooth((u - 0.7) / 0.3);
}
export function phaseOf(period, phase, t) {
  return (((t / period) + phase) % 1 + 1) % 1;
}

// Versatz eines beweglichen Elements zum Zeitpunkt t (Sekunden, Serverzeit).
export function moverOffset(m, t, out) {
  const s = moverProgress(phaseOf(m.period, m.phase, t));
  out[0] = m.delta[0] * s;
  out[1] = m.delta[1] * s - (m.kind === 'swing' ? m.dip * Math.sin(Math.PI * s) : 0);
  out[2] = m.delta[2] * s;
  return out;
}

// Kippschalen: sichtbar/begehbar im ersten Teil des Takts
export const BLINK_ON = 0.62;
export const BLINK_WARN = 0.47;
export function blinkState(b, t) {
  const u = phaseOf(b.blink.period, b.blink.phase, t);
  return u < BLINK_WARN ? 2 : u < BLINK_ON ? 1 : 0; // 2 = fest, 1 = Warnung, 0 = weg
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inter = (a, b) =>
  a.min[0] < b.max[0] && a.max[0] > b.min[0] &&
  a.min[1] < b.max[1] && a.max[1] > b.min[1] &&
  a.min[2] < b.max[2] && a.max[2] > b.min[2];

export function buildLevel(opts = {}) {
  const generated = opts.generated ?? GENERATED_SECTIONS;
  const statics = [];
  const movers = [];
  const decor = [];
  const signs = [];
  const zones = [];
  const path = []; // Reihenfolge der Kletterpunkte (für Validierung)
  const hooks = [];
  const ladders = [];
  const props = []; // Modelle ohne Kollision (Kulisse)
  const shortcuts = []; // Abkürzungen: [{ from, to, how }]
  const hazards = []; // Laser und Stacheln
  const plates = []; // Druckplatten
  const waters = []; // Wasserbecken, Flutkammern, Notduschen (elements.js)
  const extinguishers = []; // Feuerlöscher-Schränke
  const sections = [];
  const checkpoints = [];

  let sec = 0;
  let fwd = [0, -1];
  // "prev" ist der zuletzt platzierte Kletterpunkt (Box in Weltkoordinaten, Oberkante = top)
  let prev = { min: [START_X - 1, -1, 5], max: [START_X + 1, 0, 7] };
  let containerColor = 0;

  // Für die Kollisionsprüfung beim Erzeugen: feste Teile und freizuhaltende Räume
  const solids = [];
  const clears = [];

  const box = (min, max, mat, extra = {}) => {
    const b = { min, max, mat, sec, ...extra };
    statics.push(b);
    return b;
  };
  const deco = (min, max, mat) => decor.push({ min, max, mat });

  // Richtung relativ zum Abschnitt: f = vorwärts, l = links, r = rechts, b = zurück
  const dirVec = (d) => {
    const [fx, fz] = fwd;
    const right = [-fz, fx];
    switch (d) {
      case 'f': return [fx, fz];
      case 'b': return [-fx, -fz];
      case 'r': return right;
      case 'l': return [-right[0], -right[1]];
    }
    throw new Error('dir ' + d);
  };
  // Größe "a" entlang der Abschnitts-Vorwärtsrichtung, "l" quer dazu → Weltgröße x/z
  const worldSize = (a, l) => (fwd[0] !== 0 ? [a, l] : [l, a]);

  // Mittelpunkt neben prev in Richtung dir mit gegebenem Abstand (Kante zu Kante)
  // off = seitlicher Versatz quer zur Richtung (gegen das Raster)
  function placeNext(dir, gap, sx, sz, off = 0) {
    const [dx, dz] = dirVec(dir);
    const pcx = (prev.min[0] + prev.max[0]) / 2;
    const pcz = (prev.min[2] + prev.max[2]) / 2;
    const phx = (prev.max[0] - prev.min[0]) / 2;
    const phz = (prev.max[2] - prev.min[2]) / 2;
    return [pcx + dx * (phx + gap + sx / 2) + -dz * off, pcz + dz * (phz + gap + sz / 2) + dx * off];
  }

  function defaultHeight(mat, top) {
    switch (mat) {
      case 'beam': return 0.18;
      case 'grate': case 'checkpoint': return 0.15;
      case 'crate': return 1.1;
      case 'carton': return 0.9;
      case 'goods': return Math.min(top, 1.2);
      case 'container': return 2.6;
      case 'wagon': return 1.6;
      case 'belt': return 0.35;
      case 'concrete': return 0.5;
      case 'ice': return 0.6;
      case 'tires': return 0.8;
      case 'drum': return 0.9;
      case 'bin': return 0.4;
      case 'timber': return 0.5;
      case 'blink': return 0.15;
      case 'fan': return 0.5;
      default: return Math.min(top, 1);
    }
  }

  function pickMat(mat) {
    if (mat === 'container') return 'container' + (containerColor++ % 4);
    return mat;
  }

  // Kandidat für einen statischen Kletterpunkt berechnen (noch nicht eingetragen)
  function candidate(dir, gap, dy, a, l, mat, opts = {}) {
    const [sx, sz] = worldSize(a, l);
    const [cx, cz] = placeNext(dir, gap, sx, sz, opts.off || 0);
    const top = prev.max[1] + dy;
    let h = opts.h ?? defaultHeight(mat, top);
    if (h === 'ground') h = top;
    return { min: [cx - sx / 2, top - h, cz - sz / 2], max: [cx + sx / 2, top, cz + sz / 2] };
  }

  // Räume, die frei bleiben müssen: über der Fläche und der Sprungkorridor von prev
  function clearVolumes(b, from, extraUp = 0) {
    const P = 0.35; // halbe Spielerbreite + Luft
    const head = { min: [b.min[0] - P, b.max[1], b.min[2] - P], max: [b.max[0] + P, b.max[1] + 2.4 + extraUp, b.max[2] + P] };
    const lo = Math.min(from.max[1], b.max[1]);
    const hi = Math.max(from.max[1], b.max[1]) + 2.4;
    const corr = {
      min: [Math.min(b.min[0], from.min[0]), lo, Math.min(b.min[2], from.min[2])],
      max: [Math.max(b.max[0], from.max[0]), hi, Math.max(b.max[2], from.max[2])],
    };
    return [head, corr];
  }

  let why = '';
  function fits(solid, clr, ignore) {
    for (const s of solids) {
      if (s === ignore) continue;
      if (inter(solid, s)) { why = 'solid'; return false; }
      for (const c of clr) if (inter(c, s)) { why = 'clr-vs-solid ' + (s.mat||'sweep') + ' ' + s.min.map(Math.round); return false; }
    }
    for (const c of clears) if (inter(solid, c)) { why = 'solid-in-clear'; return false; }
    return true;
  }

  function commitStatic(b, from, extraUp = 0) {
    solids.push(b);
    clears.push(...clearVolumes(b, from, extraUp));
  }

  // Statischer Kletterpunkt. h: Höhe des Blocks ('ground' = bis zum Boden)
  function step(dir, gap, dy, a, l, mat, opts = {}) {
    const c = candidate(dir, gap, dy, a, l, mat, opts);
    const b = box(c.min, c.max, pickMat(mat), opts.extra);
    if (opts.belt) b.belt = opts.belt;
    if (opts.model) b.model = opts.model;
    if (mat === 'beam' || mat === 'grate' || mat === 'blink' || mat === 'checkpoint' || mat === 'ice' || mat === 'bin' || mat === 'fan' || opts.supports) supports(b);
    commitStatic(b, prev);
    path.push({ box: b, kind: 'static', how: opts.how, special: opts.extra?.ice ? 'ice' : undefined });
    prev = b;
    return b;
  }

  // Regalstützen unter schwebenden Elementen (nur Optik). Sie stehen auf dem,
  // was darunter liegt – notfalls auf dem Hallenboden.
  const supported = [];
  function supports(b) { supported.push(b); }
  function buildSupports() {
    const t = 0.1;
    // grobes Raster der statischen Teile, damit die Suche schnell bleibt
    const cell = 8, grid = new Map();
    const key = (x, z) => `${x},${z}`;
    for (const s of statics) {
      for (let x = Math.floor(s.min[0] / cell); x <= Math.floor(s.max[0] / cell); x++) {
        for (let z = Math.floor(s.min[2] / cell); z <= Math.floor(s.max[2] / cell); z++) {
          const k = key(x, z);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(s);
        }
      }
    }
    for (const b of supported) {
      const xs = [b.min[0] + t / 2, b.max[0] - t / 2];
      const zs = [b.min[2] + t / 2, b.max[2] - t / 2];
      for (const x of xs) for (const z of zs) {
        let y0 = 0;
        for (const s of grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []) {
          if (s === b || s.max[1] > b.min[1] + 1e-3 || s.blink || s.crumble) continue;
          if (x > s.min[0] && x < s.max[0] && z > s.min[2] && z < s.max[2]) y0 = Math.max(y0, s.max[1]);
        }
        // Nur kurze Stützen – lange Stangen durch den ganzen Turm verdecken die Sicht
        const len = b.min[1] - y0;
        if (len > 0.05 && len <= 8) deco([x - t / 2, y0, z - t / 2], [x + t / 2, b.min[1], z + t / 2], 'upright');
      }
    }
  }

  // Bewegliche Plattform. kind: lift | slide | swing
  function moverCandidate(kind, dir, gap, a, l, opts) {
    const [sx, sz] = worldSize(a, l);
    const [cx, cz] = placeNext(dir, gap, sx, sz);
    const top = prev.max[1] + (opts.dy || 0);
    const h = opts.h ?? 0.3;
    const base = { min: [cx - sx / 2, top - h, cz - sz / 2], max: [cx + sx / 2, top, cz + sz / 2] };
    let delta = [0, 0, 0];
    if (kind === 'lift') delta = [0, opts.range, 0];
    else {
      const [dx, dz] = dirVec(dir);
      delta = [dx * opts.dist, 0, dz * opts.dist];
    }
    const dip = opts.dip ?? 1.2;
    const sweepMin = base.min.map((v, i) => Math.min(v, v + delta[i]));
    const sweepMax = base.max.map((v, i) => Math.max(v, v + delta[i]));
    if (kind === 'swing') sweepMin[1] -= dip;
    const sweep = { min: sweepMin, max: sweepMax };
    const end = { min: base.min.map((v, i) => v + delta[i]), max: base.max.map((v, i) => v + delta[i]) };
    return { kind, base, delta, dip, sweep, end };
  }

  function mover(kind, dir, gap, a, l, opts) {
    const c = moverCandidate(kind, dir, gap, a, l, opts);
    const m = {
      kind, base: c.base, delta: c.delta, period: opts.period, phase: (movers.length * 0.37) % 1,
      dip: c.dip, mat: opts.mat || (kind === 'swing' ? 'crate' : 'lift'), sec,
      side: dirVec('r'),
    };
    movers.push(m);
    solids.push(c.sweep);
    clears.push(...clearVolumes(c.sweep, prev));
    if (opts.model) m.model = opts.model;
    path.push({ box: c.base, kind, mover: m, how: opts.how });
    prev = c.end;
    return m;
  }

  // ───── Neue Bausteine ─────
  const center2 = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];

  // Schräge entlang dir: dy = Höhe des nahen Endes über prev, drop = wie viel tiefer das ferne Ende liegt
  // (negativ = steigt an). slide: Rutsche, auf der man nicht stehen bleibt.
  const alongSize = (dir, len, w) => (dir === 'f' || dir === 'b' ? worldSize(len, w) : worldSize(w, len));
  function ramp(dir, gap, dy, len, w, drop, opts = {}) {
    const [sx, sz] = alongSize(dir, len, w);
    const [cx, cz] = placeNext(dir, gap, sx, sz, opts.off || 0);
    const near = prev.max[1] + dy, far = near - drop;
    const th = opts.th ?? 0.3;
    const b = box([cx - sx / 2, Math.min(near, far) - th, cz - sz / 2], [cx + sx / 2, Math.max(near, far), cz + sz / 2], opts.mat || (opts.slide ? 'chute' : 'ramp'));
    const [dx, dz] = dirVec(dir);
    const axis = dx !== 0 ? 0 : 2;
    const sgn = dx !== 0 ? dx : dz; // Laufrichtung in Weltachse
    // ramp.dir: +1 = steigt in positiver Weltachse
    b.ramp = { axis, dir: (far > near ? 1 : -1) * sgn, y0: Math.min(near, far), near, slide: !!opts.slide };
    b.model = opts.slide ? 'chute' : 'ramp';
    supports(b);
    solids.push(b);
    path.push({ box: b, kind: 'static', how: opts.how || (opts.slide ? 'slide' : undefined), special: opts.slide ? 'slide' : 'ramp' });
    // Für die nächste Platzierung zählt das ferne Ende
    const e = 0.6;
    const end = { min: [...b.min], max: [...b.max] };
    if (axis === 0) { if (sgn > 0) end.min[0] = b.max[0] - e; else end.max[0] = b.min[0] + e; }
    else { if (sgn > 0) end.min[2] = b.max[2] - e; else end.max[2] = b.min[2] + e; }
    end.max[1] = far;
    prev = end;
    return b;
  }

  // Liegendes Rohr / Fass / Kabeltrommel entlang dir. dy bezieht sich auf die Oberkante.
  function pipe(dir, gap, dy, len, r, opts = {}) {
    const [sx, sz] = alongSize(dir, len, 2 * r);
    const [cx, cz] = placeNext(dir, gap, sx, sz, opts.off || 0);
    const top = prev.max[1] + dy;
    const b = box([cx - sx / 2, top - 2 * r, cz - sz / 2], [cx + sx / 2, top, cz + sz / 2], opts.mat || 'pipe');
    const [dx] = dirVec(dir);
    const axis = dx !== 0 ? 0 : 2;
    b.round = { axis, r, cy: top - r, cl: axis === 0 ? cz : cx };
    b.model = opts.model || 'pipe';
    if (opts.spin) {
      // Drehende Trommel: Oberfläche läuft quer zur Achse
      b.belt = axis === 0 ? [0, 0, opts.spin] : [opts.spin, 0, 0];
      b.spin = opts.spin;
    }
    if (!opts.noSupports) supports(b);
    solids.push(b);
    path.push({ box: b, kind: 'static', how: opts.how, special: 'round' });
    prev = b;
    return b;
  }

  // Kranhaken: Griffpunkt gap Meter vor prev, Hände dy über prev. motion: { dist, period, dir }
  function hook(dir, gap, dy, opts = {}) {
    const [dx, dz] = dirVec(dir);
    const [pcx, pcz] = center2(prev);
    const hx = (prev.max[0] - prev.min[0]) / 2, hz = (prev.max[2] - prev.min[2]) / 2;
    const off = opts.off || 0;
    const gx = pcx + dx * (hx + gap) - dz * off, gz = pcz + dz * (hz + gap) + dx * off;
    const gy = prev.max[1] + dy;
    const len = opts.len ?? 2.2;
    const h = { pivot: [gx, gy + len, gz], len, sec, index: hooks.length, along: [dx, dz] };
    if (opts.motion) {
      const [mx, mz] = dirVec(opts.motion.dir || dir);
      h.motion = { kind: 'slide', delta: [mx * opts.motion.dist, 0, mz * opts.motion.dist], period: opts.motion.period, phase: opts.motion.phase ?? 0 };
    }
    h.rail = opts.rail;
    hooks.push(h);
    const feet = gy - 1.95;
    const fb = { min: [gx - 0.3, feet - 0.1, gz - 0.3], max: [gx + 0.3, feet, gz + 0.3] };
    if (h.motion) {
      // für die nächste Platzierung: Endpunkt der Fahrt
      for (let i = 0; i < 3; i++) { fb.min[i] += h.motion.delta[i]; fb.max[i] += h.motion.delta[i]; }
    }
    path.push({ box: fb, kind: 'hook', hook: h, how: 'hook' });
    prev = fb;
    return h;
  }

  // Block, an dessen prev zugewandter Seite eine Leiter steht (gap 0 = direkt anschließend)
  function ladderUp(dir, gap, height, a, l, mat, opts = {}) {
    const b = step(dir, gap, height, a, l, mat, { h: opts.h ?? height + 0.4, how: 'ladder', model: opts.model, off: opts.off });
    const [dx, dz] = dirVec(dir);
    const w = opts.w ?? 0.9;
    const [cx, cz] = center2(b);
    // Leiter auf der zugewandten Seite, seitlich versetzt möglich
    const lo = opts.lo || 0;
    const fx = -dx, fz = -dz; // zeigt von der Wand weg
    const faceX = dx > 0 ? b.min[0] : dx < 0 ? b.max[0] : null;
    const faceZ = dz > 0 ? b.min[2] : dz < 0 ? b.max[2] : null;
    const y0 = b.max[1] - height - 0.05;
    let min, max;
    if (faceX !== null) {
      const x0 = faceX + fx * 0.65;
      min = [Math.min(faceX, x0), y0, cz - dx * lo - w / 2];
      max = [Math.max(faceX, x0), b.max[1], cz - dx * lo + w / 2];
    } else {
      const z0 = faceZ + fz * 0.65;
      min = [cx + dz * lo - w / 2, y0, Math.min(faceZ, z0)];
      max = [cx + dz * lo + w / 2, b.max[1], Math.max(faceZ, z0)];
    }
    b.ladderBlock = true;
    const lad = { min, max, face: [fx, fz], sec };
    ladders.push(lad);
    path[path.length - 1].ladder = lad;
    return b;
  }

  // Windzone über einem Bereich { min, max }: push = Kraft (m/s²), gust = Böentakt
  function wind(area, push, gust) {
    zones.push({ min: area.min, max: area.max, push, gust, lift: 0, sec });
  }
  // Gefahrenbereich: kind = 'laser' | 'spikes'. timer { period, phase, on } = an im ersten Teil des Takts,
  // plate = Druckplatte, die ihn abschaltet, motion = wandernder Laser { delta, period }
  function hazard(kind, min, max, o = {}) {
    const z = { kind, min, max, sec, ...o };
    if (o.motion) z.motion = { kind: 'slide', phase: 0, ...o.motion };
    hazards.push(z);
    return z;
  }
  // Druckplatte auf der Oberseite von b (Mitte cx/cz, Größe s)
  function plate(b, cx, cz, s = 1.1) {
    const pl = { min: [cx - s / 2, b.max[1], cz - s / 2], max: [cx + s / 2, b.max[1] + 0.08, cz + s / 2], index: plates.length, sec };
    plates.push(pl);
    return pl.index;
  }
  // Rolltor (fest, solange keine der Platten gedrückt ist)
  function gate(min, max, plateIds) {
    const b = box(min, max, 'gate', { gate: plateIds, nogrip: true });
    return b;
  }
  function prop(type, pos, o = {}) { props.push({ type, pos, ...o, sec }); }
  // Wasser { min, max } (max[1] = Wasserspiegel). o: rise { range, period, phase }, current [x, 0, z], shower
  function water(min, max, o = {}) { const w = { min, max, sec, index: waters.length, ...o }; waters.push(w); return w; }
  function extinguisher(pos, face) { extinguishers.push({ pos, face, sec, index: extinguishers.length }); }
  function face(dir, world) { fwd = world ? [...world] : dirVec(dir); }
  function here() { return prev; }
  function setPrev(b) { prev = b; }
  function shortcut(from, to, how) { shortcuts.push({ from, to, how }); }

  function section(info, dir, startY) {
    sec = sections.length;
    fwd = dir;
    sections.push({ ...info, sec, y: startY });
  }

  function sign(text, sub) {
    const cx = (prev.min[0] + prev.max[0]) / 2;
    const cz = (prev.min[2] + prev.max[2]) / 2;
    const [rx, rz] = dirVec('r');
    const hx = (prev.max[0] - prev.min[0]) / 2;
    const hz = (prev.max[2] - prev.min[2]) / 2;
    signs.push({
      text, sub,
      pos: [cx + rx * (hx + 0.4), prev.max[1] + 2.6, cz + rz * (hz + 0.4)],
      face: [-fwd[0], -fwd[1]],
    });
  }

  // Den zuletzt gesetzten Kletterpunkt zum Zwischenstopp machen
  function markCheckpoint(label) {
    const b = prev;
    b.cp = checkpoints.length;
    checkpoints.push({
      index: checkpoints.length, sec, label,
      pos: [(b.min[0] + b.max[0]) / 2, b.max[1] + 0.05, (b.min[2] + b.max[2]) / 2],
      box: b,
    });
  }

  // Start = Zwischenstopp 0
  checkpoints.push({ index: 0, sec: 0, label: 'Tor 1', pos: [START_X, 0.05, 8], box: null });

  // ───────── Akt 1: handgebaute Set-Pieces (act1.js) ─────────
  const landmarks = [];
  buildAct1({
    HANDMADE, section, step, mover, ramp, pipe, hook, ladderUp, wind, prop, deco, sign, markCheckpoint,
    face, here, setPrev, shortcut, dirVec, landmarks, hazard, plate, gate,
    ladderOf: (b) => ladders.find((l) => path.some((p) => p.box === b && p.ladder === l)),
    pathLength: () => path.length, pathBoxes: (from) => path.slice(from).map((p) => p.box),
    get prev() { return prev; }, get fwd() { return fwd; },
  });

  // ───────── Akte 2–7: Set-Pieces mit eigenem Thema je Akt (acts.js) ─────────
  const BOUND = 54; // halbe Hallenbreite: viel Platz für weite Wege
  const inBounds = (b) => b.min[0] > -BOUND && b.max[0] < BOUND && b.min[2] > -BOUND && b.max[2] < BOUND;
  // Zustand sichern / zurücksetzen, damit ein Set-Piece, das nicht passt, spurlos verschwindet
  const corridors = []; // Sprungräume zwischen Kletterpunkten, die frei bleiben müssen
  const lists = { corridors, statics, movers, decor, signs, zones, path, hooks, ladders, props, hazards, plates, solids, clears, supported, checkpoints, waters, extinguishers };
  function snapshot() {
    const s = { prev, fwd, containerColor };
    for (const [k, v] of Object.entries(lists)) s[k] = v.length;
    return s;
  }
  function rollback(s) {
    for (const [k, v] of Object.entries(lists)) v.length = s[k];
    prev = s.prev; fwd = s.fwd; containerColor = s.containerColor;
  }
  // Neue Teile dürfen nichts schneiden und brauchen Kopffreiheit (gleiche Regeln wie validate-level)
  let pieceWhy = '';
  function pieceOk(s) {
    const all = solids.filter((o) => !o.gate);
    const firstNew = s.solids;
    // Kopffreiheit großzügig: auch keine greifbaren Kanten knapp über einer Plattform
    const head = (b) => ({ min: [b.min[0] - 0.4, b.max[1] + 0.01, b.min[2] - 0.4], max: [b.max[0] + 0.5, b.max[1] + 2.6, b.max[2] + 0.4] });
    const bare = (b) => ({ min: [b.min[0], b.max[1] + 0.01, b.min[2]], max: [b.max[0], b.max[1] + 2.6, b.max[2]] });
    const blocks = (lo, hi) => {
      if (lo.basin) { pieceWhy = 'R1'; return false; } // Säurebecken: Fässer stehen darin
      if (lo.grp && lo.grp === hi.grp) return false; // Becken/Kammer: Wände gehören dazu
      if (!inter(head(lo), hi)) { pieceWhy = 'R2'; return false; }
      return !hi.ladderBlock || inter(bare(lo), hi);
    };
    const hookRoom = (h) => {
      const d = h.motion ? h.motion.delta : [0, 0, 0];
      return {
        min: [Math.min(h.pivot[0], h.pivot[0] + d[0]) - 1.2, h.pivot[1] - h.len - 3.3, Math.min(h.pivot[2], h.pivot[2] + d[2]) - 1.2],
        max: [Math.max(h.pivot[0], h.pivot[0] + d[0]) + 1.2, h.pivot[1] + 1.2, Math.max(h.pivot[2], h.pivot[2] + d[2]) + 1.2],
      };
    };
    const news = solids.slice(firstNew).filter((o) => !o.gate);
    for (const n of news) {
      if (!inBounds(n)) { pieceWhy = 'R3'; return false; }
      for (const o of all) {
        if (o === n) continue;
        if (o.max[1] < n.min[1] - 3.2 || o.min[1] > n.max[1] + 3.2) continue;
        const sweepN = !n.mat, sweepO = !o.mat; // Fahrwege beweglicher Teile
        if (inter(n, o) && !(n.basin && o.mat === 'drum') && !(o.basin && n.mat === 'drum')) { pieceWhy = 'R4'; return false; }
        if (!sweepN && !sweepO && (blocks(n, o) || blocks(o, n))) { pieceWhy = 'R5'; return false; }
      }
      // Lüfter-Aufwind darf nicht verbaut werden, Wind anderer Stücke nicht hineinwehen
      for (const z of zones) if (z.lift && z.max[1] > n.min[1] && inter(z, n)) { pieceWhy = 'R6'; return false; }
      for (const z of zones.slice(0, s.zones)) if (z.push && n.mat && inter(z, n)) { pieceWhy = 'R7'; return false; }
      // Wasser älterer Stücke bleibt frei
      for (const w of waters.slice(0, s.waters)) if (n.mat && inter(w, n)) { pieceWhy = 'W1'; return false; }
    }
    for (const w of waters.slice(s.waters)) {
      if (!inBounds(w)) { pieceWhy = 'W2'; return false; }
      for (const o of solids.slice(0, firstNew)) if (o.mat && inter(w, o)) { pieceWhy = 'W3'; return false; }
    }
    // Fahrwege beweglicher Plattformen samt Platz für den Spieler darauf
    const room = (m) => {
      const mn = m.base.min.map((v, i) => Math.min(v, v + m.delta[i]));
      const mx = m.base.max.map((v, i) => Math.max(v, v + m.delta[i]));
      if (m.kind === 'swing') mn[1] -= m.dip;
      mx[1] += 1.95;
      return { min: mn, max: mx };
    };
    for (const m of movers.slice(s.movers)) {
      const r = room(m);
      for (const o of all) if (o.mat && inter(r, o)) { pieceWhy = 'R8'; return false; }
    }
    for (const m of movers.slice(0, s.movers)) {
      const r = room(m);
      for (const n of news) if (n.mat && inter(r, n)) { pieceWhy = 'R9'; return false; }
    }
    for (const z of zones.slice(s.zones)) {
      if (z.push) { for (const o of solids.slice(0, firstNew)) if (o.mat && o !== s.prev && inter(z, o)) { pieceWhy = 'R10'; return false; } continue; }
      if (!z.lift) continue;
      for (const o of all) if (inter(z, o)) { pieceWhy = 'R11'; return false; }
    }
    // Sprungkorridore: neue Übergänge gegen alle Teile, alte Übergänge gegen neue Teile
    const skip = (o, c) => !o.mat || o.gate || o.basin || o === c.a || o === c.b;
    const fresh = [];
    for (let i = Math.max(1, s.path); i < path.length; i++) {
      const A = path[i - 1], B = path[i];
      if (A.kind === 'swim' || B.kind === 'swim') continue; // Schwimmstrecken prüft die Simulation
      const ta = A.box.max[1], tb = B.box.ramp ? B.box.ramp.near : B.box.max[1];
      let hi = Math.max(ta, tb) + 3.3;
      if (A.special === 'fan' && A.zone) hi = Math.max(hi, A.zone.max[1] + 0.3);
      if (A.special === 'bounce') hi += 1.2;
      // Raum zwischen den einander zugewandten Seiten: überlappende Achsen → Schnittmenge,
      // getrennte Achsen → Lücke plus ein Stück in beide Boxen hinein
      const mn = [0, Math.min(ta, tb) + 0.05, 0], mx = [0, hi, 0];
      for (const ax of [0, 2]) {
        const lo = Math.max(A.box.min[ax], B.box.min[ax]), up = Math.min(A.box.max[ax], B.box.max[ax]);
        if (up > lo) { mn[ax] = lo - 0.3; mx[ax] = up + 0.3; }
        else { mn[ax] = up - 0.6; mx[ax] = lo + 0.6; }
      }
      fresh.push({ min: mn, max: mx, a: A.box, b: B.box });
    }
    for (const h of hooks.slice(s.hooks)) fresh.push({ ...hookRoom(h), a: null, b: null });
    for (const c of fresh) for (const o of all) if (!skip(o, c) && inter(c, o)) { pieceWhy = 'R12'; return false; }
    for (const c of corridors) for (const n of news) if (!skip(n, c) && inter(c, n)) { pieceWhy = 'R13'; return false; }
    corridors.push(...fresh);
    const extras = [...hooks.slice(s.hooks).map(hookRoom), ...hazards.slice(s.hazards), ...ladders.slice(s.ladders)];
    const olds = solids.slice(0, firstNew);
    const anchor = s.prev;
    for (const e of extras) {
      if (!inBounds(e)) { pieceWhy = 'R14'; return false; }
      for (const o of olds) if (o !== anchor && o.max[1] > e.min[1] - 0.5 && o.min[1] < e.max[1] && inter(e, o)) { pieceWhy = 'R15'; return false; }
    }
    return true;
  }
  function solid(min, max, mat, extra) { const b = box(min, max, pickMat(mat), extra); solids.push(b); return b; }
  function special(name) { path[path.length - 1].special = name; }
  function addPath(b, kind = 'static', o = {}) { path.push({ box: b, kind, ...o }); prev = b; return b; }
  function tagPath(from, name) { for (let i = from; i < path.length; i++) path[i].piece = name; }
  function dropLastPath() { path.pop(); }
  function markBlink() { path[path.length - 1].kind = 'blink'; path[path.length - 1].special = 'blink'; }
  function fanZone(b, height = 6) {
    const zone = { min: [b.min[0], b.max[1], b.min[2]], max: [b.max[0], b.max[1] + height, b.max[2]], lift: 42, sec };
    zones.push(zone);
    path[path.length - 1].special = 'fan';
    path[path.length - 1].zone = zone;
    clears.push(zone);
    return zone;
  }
  if (generated > 0) {
    buildActs({
      section, step, mover, ramp, pipe, hook, ladderUp, wind, prop, deco, sign, markCheckpoint, hazard, plate, gate,
      face, dirVec, snapshot, rollback, pieceOk, solid, special, fanZone, supports, addPath, markBlink, setPrev, dropLastPath, tagPath,
      water, extinguisher,
      ladderOf: (b) => ladders.find((l) => path.some((p) => p.box === b && p.ladder === l)),
      pathLength: () => path.length, pathBoxes: (from) => path.slice(from).map((p) => p.box),
      get prev() { return prev; }, get fwd() { return fwd; },
      BOUND, rnd: mulberry32(SEED), debug: DEBUG, why: () => pieceWhy,
    });
  }

  // Ziel ganz oben
  const goalPad = placeGoal();
  function placeGoal() {
    for (const dir of ['f', 'l', 'r', 'b']) {
      const c = candidate(dir, 1.4, 1.0, 7, 7, 'goal', { h: 0.6 });
      if (fits(c, clearVolumes(c, prev), prev)) return step(dir, 1.4, 1.0, 7, 7, 'goal', { h: 0.6 });
    }
    throw new Error('Kein Platz für das Ziel');
  }
  markCheckpoint('Ziel');
  landmarks.push({ kind: 'goal', pos: [(goalPad.min[0] + goalPad.max[0]) / 2, goalPad.max[1], (goalPad.min[2] + goalPad.max[2]) / 2] });

  const goal = {
    min: [goalPad.min[0], goalPad.max[1], goalPad.min[2]],
    max: [goalPad.max[0], goalPad.max[1] + 3, goalPad.max[2]],
  };

  buildSupports();

  // Boden (großer Betonhof)
  statics.push({ min: [-70, -2, -70], max: [70, 0, 70], mat: 'ground', sec: 0, big: true });

  return {
    statics, movers, decor, signs, zones, path, sections, checkpoints, goal, landmarks,
    hooks, ladders, props, shortcuts, hazards, plates, waters, extinguishers,
    spawn: [START_X, 0.05, 8],
    killY: -20,
  };
}

export function sectionAtHeight(level, y) {
  let s = 0;
  for (const st of level.sections) if (y >= st.y - 0.5) s = st.sec;
  return s;
}
