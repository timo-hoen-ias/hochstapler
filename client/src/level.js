// Level-Daten für "Hochstapler". Alles ist deterministisch, damit alle Clients
// exakt dieselbe Welt bauen. Der Turm schraubt sich als eckige Spirale nach oben.
// Akt 1 (sechs Abschnitte) ist von Hand gebaut, danach folgen erzeugte Abschnitte
// mit steigender Schwierigkeit. Zwischenstopps speichern den Fortschritt.

import { buildAct1 } from './act1.js';

// Abschnitte von Akt 1 (handgebaut)
const HANDMADE = [
  { name: 'Wareneingang', hall: 'Tor 1', fog: 0xf1c08a },
  { name: 'Hochregallager', hall: 'Halle 2', fog: 0xe9b58a },
  { name: 'Fördertechnik', hall: 'Halle 3', fog: 0xd9a18a },
  { name: 'Staplerzone', hall: 'Halle 4', fog: 0xc28e92 },
  { name: 'Containerhafen', hall: 'Kai 5', fog: 0x9b84a3 },
  { name: 'Versanddach', hall: 'Dach', fog: 0x7a7aa8 },
];

// Themen der erzeugten Abschnitte. w = Gewichte der Elemente.
const THEMES = [
  { name: 'Kühlhaus', sub: 'Vorsicht, Boden gefroren', fog: 0xa9c6e0, mats: ['ice', 'crate', 'grate'], w: { block: 3, ice: 5, beam: 1, lift: 1 } },
  { name: 'Paketzentrum', sub: 'Kippschalen klappen weg', fog: 0xd9b48a, mats: ['carton', 'goods', 'grate'], w: { block: 3, belt: 3, blink: 3, slide: 1 } },
  { name: 'Reifenlager', sub: 'Reifenstapel federn – Shift bremst', fog: 0x9a8f86, mats: ['tires', 'goods', 'grate'], w: { block: 3, bounce: 3, beam: 1, swing: 1 } },
  { name: 'Kleinteilelager', sub: 'Shuttle-Regal in Bewegung', fog: 0x8fb0c4, mats: ['bin', 'grate', 'beam'], w: { block: 3, beam: 3, slide: 2, lift: 1 } },
  { name: 'Lüftungszentrale', sub: 'Aufwind nutzen', fog: 0xb7c4c9, mats: ['grate', 'concrete', 'bin'], w: { block: 3, fan: 3, beam: 2, blink: 1 } },
  { name: 'Gefahrstofflager', sub: 'Nur mit Schutzausrüstung', fog: 0xc9b56a, mats: ['drum', 'grate', 'crate'], w: { block: 3, beam: 2, blink: 2, belt: 1 } },
  { name: 'Holzlager', sub: 'Kranlasten schwingen', fog: 0xcf9f72, mats: ['timber', 'crate', 'goods'], w: { block: 4, swing: 2, beam: 2 } },
  { name: 'Getränkelager', sub: 'Lifte im Takt', fog: 0xc79a9a, mats: ['goods', 'drum', 'grate'], w: { block: 3, lift: 3, belt: 1, ice: 1 } },
  { name: 'Gleisanschluss', sub: 'Waggons rangieren', fog: 0x9a8a7c, mats: ['wagon', 'container', 'grate'], w: { block: 3, slide: 3, swing: 1 } },
  { name: 'Retourenhalle', sub: 'Alles durcheinander', fog: 0xb39bb8, mats: ['carton', 'tires', 'goods'], w: { block: 3, belt: 2, bounce: 2, blink: 1 } },
  { name: 'Schwerlastregal', sub: 'Große Abstände', fog: 0x8e94b2, mats: ['goods', 'beam', 'crate'], w: { block: 3, beam: 3, lift: 2, fan: 1 } },
  { name: 'Hochsilo', sub: 'Paternoster und Lüfter', fog: 0x7f86a8, mats: ['concrete', 'grate', 'bin'], w: { block: 2, lift: 3, fan: 3, blink: 1 } },
];

export const GENERATED_SECTIONS = 36;
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
    path.push({ box: b, kind: 'static', how: opts.how });
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
          if (s === b || s.max[1] > b.min[1] + 1e-3 || s.blink) continue;
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
  function prop(type, pos, o = {}) { props.push({ type, pos, ...o, sec }); }
  function face(dir) { fwd = dirVec(dir); }
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
    face, here, setPrev, shortcut, dirVec, landmarks,
    pathLength: () => path.length, pathBoxes: (from) => path.slice(from).map((p) => p.box),
    get prev() { return prev; }, get fwd() { return fwd; },
  });

  // ───────── Erzeugte Abschnitte ─────────
  const rnd = mulberry32(SEED);
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (weights) => {
    let sum = 0;
    for (const v of Object.values(weights)) sum += v;
    let r = rnd() * sum;
    for (const [k, v] of Object.entries(weights)) { r -= v; if (r <= 0) return k; }
    return Object.keys(weights)[0];
  };
  const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  const BOUND = 42;
  const inBounds = (b) => b.min[0] > -BOUND && b.max[0] < BOUND && b.min[2] > -BOUND && b.max[2] < BOUND;

  let hall = 7;
  for (let g = 0; g < generated; g++) {
    const d = generated > 1 ? g / (generated - 1) : 0; // Schwierigkeit 0..1
    const theme = THEMES[g % THEMES.length];
    const tier = Math.floor(g / THEMES.length);
    const info = { name: theme.name + (tier ? ' ' + 'I'.repeat(tier + 1) : ''), hall: 'Halle ' + hall++, fog: theme.fog, theme: theme.name };
    section(info, DIRS[(g + 1) % 4], prev.max[1]);

    // Startplattform = Zwischenstopp
    placeGenerated('checkpoint', { a: 3.2, l: 3.2, gap: 1.4, dy: 0.6 });
    markCheckpoint(info.hall);
    sign(`${info.hall.toUpperCase()} · ${info.name.toUpperCase()}`, theme.sub);

    const steps = Math.round(30 + 10 * d);
    let lastTimed = false;
    for (let s = 0; s < steps; s++) {
      if (s === Math.floor(steps / 2)) {
        placeGenerated('checkpoint', { a: 2.6, l: 2.6, gap: R(1.0, 1.6), dy: R(0.3, 0.8) });
        markCheckpoint(info.hall + ' Mitte');
        lastTimed = false;
        continue;
      }
      const gimmickChance = 0.25 + 0.35 * d;
      let kind = rnd() < gimmickChance ? pick(theme.w) : 'block';
      const timed = ['lift', 'slide', 'swing', 'blink'].includes(kind);
      if (timed && lastTimed) kind = 'block';
      if (['bounce', 'fan'].includes(kind) && ['bounce', 'fan'].includes(path[path.length - 1].special)) kind = 'block';
      placeGenerated(kind, { d, theme });
      const placed = path[path.length - 1];
      lastTimed = !!placed.mover || placed.kind === 'blink';
    }
  }

  // Ein Element des Generators platzieren – mit mehreren Versuchen, bis es passt.
  function placeGenerated(kind, o) {
    const d = o.d ?? 0;
    const theme = o.theme;
    const prevSpecial = path[path.length - 1]?.special;
    // Vor der Hallenwand abbiegen: so entsteht die Spirale
    const pc = [(prev.min[0] + prev.max[0]) / 2, (prev.min[2] + prev.max[2]) / 2];
    for (let turn = 0; turn < 4; turn++) {
      const ax = pc[0] + fwd[0] * 7, az = pc[1] + fwd[1] * 7;
      if (Math.abs(ax) < BOUND - 3 && Math.abs(az) < BOUND - 3) break;
      fwd = [-fwd[1], fwd[0]];
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      if (attempt === 30) fwd = [-fwd[1], fwd[0]];
      const late = attempt > 20;
      const dir = attempt % 30 < 22 ? (['f', 'f', 'l', 'r'])[Math.floor(rnd() * 4)] : (['f', 'l', 'r', 'b'])[attempt % 4];
      // Nach Luftpolster/Lüfter sind höhere Stufen erreichbar
      const boost = prevSpecial === 'bounce' ? R(2.0, 3.0) : prevSpecial === 'fan' ? R(2.8, 3.8) : 0;
      const maxGap = Math.min(2.3, 1.3 + 1.0 * d);
      const gap = o.gap ?? (late ? R(0.9, 1.3) : R(0.9, maxGap));
      const dyMax = Math.min(1.25, 0.7 + 0.5 * d);
      const dy = boost || (o.dy ?? R(0.2, dyMax));
      const sMin = Math.max(0.9, 2.6 - 1.4 * d), sMax = Math.max(1.4, 3.2 - 1.2 * d);
      let a = o.a ?? R(sMin, sMax), l = o.l ?? R(sMin, sMax);
      const mats = theme ? theme.mats : ['grate'];
      let mat = kind === 'checkpoint' ? 'checkpoint' : mats[Math.floor(rnd() * mats.length)];

      if (kind === 'block' || kind === 'checkpoint' || kind === 'ice' || kind === 'bounce' || kind === 'belt' || kind === 'blink' || kind === 'beam') {
        const extra = {};
        let useDy = dy, useGap = gap;
        if (kind === 'ice') { mat = 'ice'; a = Math.max(a, 2.4); l = Math.max(l, 2.4); extra.ice = true; }
        if (kind === 'bounce') { mat = 'tires'; a = l = R(1.6, 2.2); extra.bounce = true; }
        if (kind === 'blink') { mat = 'blink'; a = l = R(1.6, 2.2); }
        if (kind === 'beam') {
          mat = 'beam';
          const w = d > 0.7 ? 0.28 : 0.35;
          if (dir === 'f' || dir === 'b') { a = R(2.2, 3.2); l = w; } else { a = w; l = R(2.2, 3.2); }
        }
        let belt;
        if (kind === 'belt') {
          mat = 'belt';
          const len = R(4, 6), sp = R(2, 2.4 + 2 * d);
          const along = dirVec(dir);
          if (dir === 'f' || dir === 'b') { a = len; l = 1.4; } else { a = 1.4; l = len; }
          // gegen die Laufrichtung, mit ihr oder seitlich
          const mode = Math.floor(rnd() * 3);
          const v = mode === 0 ? [-along[0] * sp, -along[1] * sp] : mode === 1 ? [along[0] * sp * 0.8, along[1] * sp * 0.8] : [along[1] * sp, -along[0] * sp];
          belt = [v[0], 0, v[1]];
          // Wer mit dem Band läuft, springt weiter – Lücke danach nicht vergrößern
        }
        const c = candidate(dir, useGap, useDy, a, l, mat);
        if (!inBounds(c)) { if (DEBUG) console.log('bounds', dir, c.min.map(Math.round), c.max.map(Math.round)); continue; }
        const clr = clearVolumes(c, prev, kind === 'bounce' ? 3 : 0);
        if (!fits(c, clr, prev)) { if (DEBUG) console.log('fit', dir, why); continue; }
        const b = box(c.min, c.max, pickMat(mat), extra);
        if (belt) b.belt = belt;
        if (kind === 'blink') b.blink = { period: R(5 - 1.5 * d, 6 - 1.5 * d), phase: rnd() };
        if (mat !== 'goods' && mat !== 'container') supports(b);
        solids.push(b);
        clears.push(...clr);
        path.push({ box: b, kind: kind === 'blink' ? 'blink' : 'static', special: kind });
        prev = b;
        return b;
      }

      if (kind === 'fan') {
        const s = R(1.8, 2.4);
        const c = candidate(dir, gap, 0, s, s, 'fan');
        if (!inBounds(c)) continue;
        const height = 6.0;
        const zone = { min: [c.min[0], c.max[1], c.min[2]], max: [c.max[0], c.max[1] + height, c.max[2]], lift: 42 };
        const clr = [...clearVolumes(c, prev), zone];
        if (!fits(c, clr, prev)) continue;
        const b = box(c.min, c.max, 'fan', { fan: true });
        supports(b);
        zones.push(zone);
        solids.push(b);
        clears.push(...clr);
        path.push({ box: b, kind: 'static', special: 'fan', zone });
        prev = b;
        return b;
      }

      if (kind === 'lift' || kind === 'slide' || kind === 'swing') {
        const period = R(8 - 2.5 * d, 9 - 2.5 * d);
        const sz = R(1.6, 2.2);
        const opts = kind === 'lift'
          ? { range: R(3, 5 + 2 * d), period }
          : { dist: R(5, 7 + 2 * d), period, h: kind === 'swing' ? 1.1 : 0.3 };
        if (kind !== 'lift' && dir === 'b') continue;
        const c = moverCandidate(kind, dir, 0.7, sz, sz, opts);
        if (!inBounds(c.sweep)) continue;
        const clr = clearVolumes(c.sweep, prev);
        if (!fits(c.sweep, clr, prev)) continue;
        return mover(kind, dir, 0.7, sz, sz, { ...opts, mat: kind === 'swing' ? 'crate' : (theme && theme.name === 'Gleisanschluss' ? 'wagon' : 'lift') });
      }
    }
    if (kind !== 'block' && kind !== 'checkpoint') return placeGenerated('block', o);
    throw new Error(`Generator: kein Platz für ${kind} in Abschnitt ${sec}`);
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
    hooks, ladders, props, shortcuts,
    spawn: [START_X, 0.05, 8],
    killY: -20,
  };
}

export function sectionAtHeight(level, y) {
  let s = 0;
  for (const st of level.sections) if (y >= st.y - 0.5) s = st.sec;
  return s;
}
