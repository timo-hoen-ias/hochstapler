// Level-Daten für "Hochstapler". Alles ist deterministisch, damit alle Clients
// exakt dieselbe Welt bauen. Der Turm schraubt sich als eckige Spirale nach oben.
// Akt 1 (sechs Abschnitte) ist von Hand gebaut, danach folgen erzeugte Abschnitte
// mit steigender Schwierigkeit. Zwischenstopps speichern den Fortschritt.

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
  const sections = [];
  const checkpoints = [];

  let sec = 0;
  let fwd = [0, -1];
  // "prev" ist der zuletzt platzierte Kletterpunkt (Box in Weltkoordinaten, Oberkante = top)
  let prev = { min: [-1, -1, 5], max: [1, 0, 7] };
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
  function placeNext(dir, gap, sx, sz) {
    const [dx, dz] = dirVec(dir);
    const pcx = (prev.min[0] + prev.max[0]) / 2;
    const pcz = (prev.min[2] + prev.max[2]) / 2;
    const phx = (prev.max[0] - prev.min[0]) / 2;
    const phz = (prev.max[2] - prev.min[2]) / 2;
    return [pcx + dx * (phx + gap + sx / 2), pcz + dz * (phz + gap + sz / 2)];
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
    const [cx, cz] = placeNext(dir, gap, sx, sz);
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
    if (mat === 'beam' || mat === 'grate' || mat === 'blink' || mat === 'checkpoint' || mat === 'ice' || mat === 'bin' || mat === 'fan') supports(b);
    commitStatic(b, prev);
    path.push({ box: b, kind: 'static' });
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
    path.push({ box: c.base, kind, mover: m });
    prev = c.end;
    return m;
  }

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
  checkpoints.push({ index: 0, sec: 0, label: 'Tor 1', pos: [0, 0.05, 8], box: null });

  // ───────── Akt 1 · Abschnitt 1: Wareneingang ─────────
  section(HANDMADE[0], [0, -1], 0);
  step('f', 1.0, 1.0, 2, 3, 'goods', { h: 'ground' });
  sign('TOR 1 · WARENEINGANG', 'Seil straff halten, gemeinsam springen');
  step('f', 1.2, 1.1, 2, 2, 'crate', { h: 'ground' });
  step('r', 1.4, 0.9, 1.6, 1.6, 'carton', { h: 'ground' });
  step('f', 1.6, 1.0, 3, 2.4, 'goods', { h: 'ground' });
  step('f', 1.0, 1.2, 7, 2.6, 'trailer', { h: 'ground' });
  step('l', 1.8, 0.0, 1.2, 1.2, 'crate', { h: 'ground' });
  step('f', 1.5, 1.1, 2, 2, 'goods', { h: 'ground' });
  step('f', 2.0, 0.5, 1.4, 1.4, 'carton', { h: 'ground' });
  step('r', 1.5, 1.2, 2.4, 2.4, 'goods', { h: 'ground' });
  step('r', 1.2, 1.0, 1.2, 1.2, 'crate', { h: 'ground' });
  step('f', 1.8, 1.1, 6, 2.6, 'container', { h: 'ground' });
  step('f', 1.0, 1.2, 2, 2, 'goods', { h: 'ground' });

  // ───────── Abschnitt 2: Hochregallager ─────────
  section(HANDMADE[1], [-1, 0], prev.max[1]);
  step('f', 1.5, 0.6, 3, 3, 'checkpoint');
  markCheckpoint('Halle 2');
  sign('HALLE 2 · HOCHREGALLAGER', 'Traversen sind schmal');
  step('f', 1.2, 1.0, 3, 0.35, 'beam');
  step('f', 1.6, 0.8, 3, 0.35, 'beam');
  step('l', 1.4, 1.0, 2, 2, 'grate');
  step('l', 1.8, 0.4, 0.35, 3, 'beam');
  step('f', 1.5, 1.0, 2, 2, 'goods', { h: 1.0 });
  step('f', 2.2, 0.2, 2.5, 0.3, 'beam');
  step('r', 1.4, 1.1, 2, 2, 'grate');
  step('r', 1.4, 1.1, 1.5, 1.5, 'crate');
  step('f', 1.8, 0.6, 3, 0.3, 'beam');
  step('f', 1.6, 1.0, 3, 0.3, 'beam');
  step('l', 1.2, 1.2, 2, 2, 'grate');
  step('f', 2.0, 0.8, 2.4, 2.4, 'goods', { h: 1.0 });

  // ───────── Abschnitt 3: Fördertechnik ─────────
  section(HANDMADE[2], [0, 1], prev.max[1]);
  step('f', 1.5, 0.8, 3, 3, 'checkpoint');
  markCheckpoint('Halle 3');
  sign('HALLE 3 · FÖRDERTECHNIK', 'Bänder laufen immer');
  step('f', 1.0, 0.6, 6, 1.4, 'belt', { belt: [0, 0, -2.5] });
  step('f', 1.2, 1.0, 2, 2, 'crate');
  step('r', 1.4, 0.5, 1.6, 6, 'belt', { belt: [0, 0, 2.2] });
  step('r', 1.2, 1.0, 2, 2, 'goods', { h: 0.8 });
  step('f', 1.0, 0.8, 6, 1.4, 'belt', { belt: [-3.0, 0, 0] });
  step('f', 1.6, 1.1, 1.4, 1.4, 'crate');
  step('f', 1.8, 0.4, 5, 1.4, 'belt', { belt: [0, 0, 4.0] });
  step('f', 2.0, 0.6, 2, 2, 'grate');
  step('l', 1.2, 1.2, 1.5, 1.5, 'crate');
  step('l', 1.6, 1.0, 2, 5, 'belt', { belt: [0, 0, -2.4] });
  step('f', 1.4, 1.0, 3, 3, 'grate');

  // ───────── Abschnitt 4: Staplerzone ─────────
  section(HANDMADE[3], [1, 0], prev.max[1]);
  step('f', 1.5, 0.6, 3, 3, 'checkpoint');
  markCheckpoint('Halle 4');
  sign('HALLE 4 · STAPLERZONE', 'Gabeln heben – rechtzeitig aufsteigen');
  mover('lift', 'f', 0.8, 2, 2, { range: 4, period: 7 });
  step('f', 1.2, 0.5, 2, 2, 'grate');
  mover('slide', 'f', 0.6, 2, 2, { dist: 6, period: 8 });
  step('f', 1.0, 0.8, 2, 2, 'goods', { h: 0.9 });
  step('r', 1.4, 1.0, 1.5, 1.5, 'crate');
  mover('lift', 'r', 0.8, 2, 2, { range: 5, period: 8 });
  step('f', 1.0, 0.4, 3, 0.35, 'beam');
  mover('slide', 'f', 0.6, 2, 2, { dist: 7, period: 9 });
  step('f', 1.2, 1.0, 2, 2, 'grate');
  mover('lift', 'f', 0.8, 2, 2, { range: 4, period: 6 });
  step('f', 1.2, 0.6, 3, 3, 'grate');

  // ───────── Abschnitt 5: Containerhafen ─────────
  section(HANDMADE[4], [0, -1], prev.max[1]);
  step('f', 1.5, 0.8, 6, 2.4, 'container');
  markCheckpoint('Kai 5');
  sign('KAI 5 · CONTAINERHAFEN', 'Am Kranhaken hängen ist erlaubt');
  step('f', 1.2, 1.0, 2.4, 6, 'container');
  mover('swing', 'f', 0.6, 1.6, 1.6, { dist: 7, period: 7, h: 1.1 });
  step('f', 0.8, 0.6, 6, 2.4, 'container');
  step('l', 1.6, 1.2, 2.4, 2.4, 'crate', { h: 1.2 });
  step('l', 1.4, 1.0, 2.4, 6, 'container');
  mover('swing', 'f', 0.6, 1.6, 1.6, { dist: 8, period: 8, h: 1.1 });
  step('f', 0.8, 0.5, 3, 3, 'grate');
  step('r', 1.6, 1.1, 1.4, 1.4, 'crate');
  step('r', 1.8, 0.8, 6, 2.4, 'container');
  mover('lift', 'f', 0.8, 2, 2, { range: 5, period: 8, mat: 'lift' });
  step('f', 1.2, 0.6, 4, 4, 'grate');

  // ───────── Abschnitt 6: Versanddach ─────────
  section(HANDMADE[5], [-1, 0], prev.max[1]);
  step('f', 1.5, 0.6, 3, 3, 'checkpoint');
  markCheckpoint('Dach');
  sign('DACH · VERSAND', 'Ende von Akt 1 – es geht weiter nach oben');
  step('f', 2.0, 0.8, 2.5, 0.3, 'beam');
  step('l', 1.6, 1.1, 0.3, 2.5, 'beam');
  step('f', 0.8, 0.6, 5, 1.2, 'belt', { belt: [0, 0, 3.0] });
  step('f', 1.6, 1.1, 1.2, 1.2, 'crate');
  mover('slide', 'r', 0.6, 1.6, 1.6, { dist: 6, period: 6 });
  step('r', 1.0, 1.0, 1.2, 1.2, 'crate');
  step('f', 2.2, 0.3, 2, 0.3, 'beam');
  mover('lift', 'f', 0.8, 2, 2, { range: 6, period: 9 });
  step('f', 1.4, 0.8, 1.2, 1.2, 'crate');
  step('f', 1.8, 1.1, 1, 1, 'crate');
  const roof = step('l', 1.6, 1.2, 7, 7, 'roof', { h: 0.6 });
  markCheckpoint('Versanddach');
  const landmarks = [{ kind: 'roof', pos: [(roof.min[0] + roof.max[0]) / 2, roof.max[1], (roof.min[2] + roof.max[2]) / 2] }];

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
    spawn: [0, 0.05, 8],
    killY: -20,
  };
}

export function sectionAtHeight(level, y) {
  let s = 0;
  for (const st of level.sections) if (y >= st.y - 0.5) s = st.sec;
  return s;
}
