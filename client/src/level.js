// Level-Daten für "Hochstapler". Alles ist deterministisch, damit alle Clients
// exakt dieselbe Welt bauen. Der Turm schraubt sich als eckige Spirale nach oben,
// jeder Abschnitt ist ein anderer Bereich eines Logistikzentrums.

export const SECTIONS = [
  { name: 'Wareneingang', hall: 'Tor 1', fog: 0xf1c08a },
  { name: 'Hochregallager', hall: 'Halle 2', fog: 0xe9b58a },
  { name: 'Fördertechnik', hall: 'Halle 3', fog: 0xd9a18a },
  { name: 'Staplerzone', hall: 'Halle 4', fog: 0xc28e92 },
  { name: 'Containerhafen', hall: 'Kai 5', fog: 0x9b84a3 },
  { name: 'Versanddach', hall: 'Dach', fog: 0x7a7aa8 },
];

// Bewegungsprofil: halten – fahren – halten – zurückfahren.
function smooth(x) { return x * x * (3 - 2 * x); }
export function moverProgress(u) {
  if (u < 0.2) return 0;
  if (u < 0.5) return smooth((u - 0.2) / 0.3);
  if (u < 0.7) return 1;
  return 1 - smooth((u - 0.7) / 0.3);
}

// Versatz eines beweglichen Elements zum Zeitpunkt t (Sekunden, Serverzeit).
export function moverOffset(m, t, out) {
  const u = (((t / m.period) + m.phase) % 1 + 1) % 1;
  const s = moverProgress(u);
  out[0] = m.delta[0] * s;
  out[1] = m.delta[1] * s - (m.kind === 'swing' ? m.dip * Math.sin(Math.PI * s) : 0);
  out[2] = m.delta[2] * s;
  return out;
}

export function buildLevel() {
  const statics = [];
  const movers = [];
  const decor = [];
  const signs = [];
  const path = []; // Reihenfolge der Kletterpunkte (für Validierung)
  const sectionStarts = [];

  let sec = 0;
  let fwd = [0, -1];
  // "prev" ist der zuletzt platzierte Kletterpunkt (Box in Weltkoordinaten, Oberkante = top)
  let prev = { min: [-1, -1, 5], max: [1, 0, 7] };
  let containerColor = 0;

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
    const cx = pcx + dx * (phx + gap + sx / 2);
    const cz = pcz + dz * (phz + gap + sz / 2);
    return [cx, cz];
  }

  // Statischer Kletterpunkt. h: Höhe des Blocks ('ground' = bis zum Boden)
  function step(dir, gap, dy, a, l, mat, opts = {}) {
    const [sx, sz] = worldSize(a, l);
    const [cx, cz] = placeNext(dir, gap, sx, sz);
    const top = prev.max[1] + dy;
    let h = opts.h ?? defaultHeight(mat, top);
    if (h === 'ground') h = top;
    const b = box([cx - sx / 2, top - h, cz - sz / 2], [cx + sx / 2, top, cz + sz / 2], pickMat(mat), opts.extra);
    if (opts.belt) b.belt = opts.belt;
    if (mat === 'beam' || mat === 'grate') supports(b);
    path.push({ box: b, kind: 'static' });
    prev = b;
    return b;
  }

  function pickMat(mat) {
    if (mat === 'container') return 'container' + (containerColor++ % 4);
    return mat;
  }

  function defaultHeight(mat, top) {
    switch (mat) {
      case 'beam': return 0.18;
      case 'grate': return 0.15;
      case 'crate': return 1.1;
      case 'carton': return 0.9;
      case 'goods': return Math.min(top, 1.2);
      case 'container': return 2.6;
      case 'belt': return 0.35;
      case 'concrete': return 0.5;
      default: return Math.min(top, 1);
    }
  }

  // Regalstützen unter schwebenden Elementen (nur Optik). Sie stehen auf dem,
  // was darunter liegt – notfalls auf dem Hallenboden.
  const supported = [];
  function supports(b) { supported.push(b); }
  function buildSupports() {
    const t = 0.1;
    for (const b of supported) {
      const xs = [b.min[0] + t / 2, b.max[0] - t / 2];
      const zs = [b.min[2] + t / 2, b.max[2] - t / 2];
      for (const x of xs) for (const z of zs) {
        let y0 = 0;
        for (const s of statics) {
          if (s === b || s.max[1] > b.min[1] + 1e-3) continue;
          if (x > s.min[0] && x < s.max[0] && z > s.min[2] && z < s.max[2]) y0 = Math.max(y0, s.max[1]);
        }
        if (b.min[1] - y0 > 0.05) deco([x - t / 2, y0, z - t / 2], [x + t / 2, b.min[1], z + t / 2], 'upright');
      }
    }
  }

  // Bewegliche Plattform. kind: lift | slide | swing
  function mover(kind, dir, gap, a, l, opts) {
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
    const m = {
      kind, base, delta, period: opts.period, phase: (movers.length * 0.37) % 1,
      dip: opts.dip ?? 1.2, mat: opts.mat || (kind === 'swing' ? 'crate' : 'lift'), sec,
      side: dirVec('r'),
    };
    movers.push(m);
    path.push({ box: base, kind, mover: m });
    // Für den nächsten Schritt: Position am Ende der Fahrt
    prev = {
      min: [base.min[0] + delta[0], base.min[1] + delta[1], base.min[2] + delta[2]],
      max: [base.max[0] + delta[0], base.max[1] + delta[1], base.max[2] + delta[2]],
    };
    return m;
  }

  function section(i, dir, startY) {
    sec = i;
    fwd = dir;
    sectionStarts.push({ sec: i, y: startY });
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

  // ───────── Abschnitt 1: Wareneingang ─────────
  section(0, [0, -1], 0);
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
  section(1, [-1, 0], prev.max[1]);
  step('f', 1.5, 0.6, 3, 3, 'grate');
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
  section(2, [0, 1], prev.max[1]);
  step('f', 1.5, 0.8, 3, 3, 'grate');
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
  section(3, [1, 0], prev.max[1]);
  step('f', 1.5, 0.6, 3, 3, 'concrete');
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
  section(4, [0, -1], prev.max[1]);
  step('f', 1.5, 0.8, 6, 2.4, 'container');
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
  section(5, [-1, 0], prev.max[1]);
  step('f', 1.5, 0.6, 3, 3, 'grate');
  sign('DACH · VERSAND', 'Letzte Etappe – gemeinsam!');
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
  const goalPad = step('l', 1.6, 1.2, 7, 7, 'goal', { h: 0.6 });

  const goal = {
    min: [goalPad.min[0], goalPad.max[1], goalPad.min[2]],
    max: [goalPad.max[0], goalPad.max[1] + 3, goalPad.max[2]],
  };

  buildSupports();

  // Boden (großer Betonhof)
  statics.push({ min: [-70, -2, -70], max: [70, 0, 70], mat: 'ground', sec: 0 });

  return {
    statics, movers, decor, signs, path, sectionStarts, goal,
    spawn: [0, 0.05, 8],
    killY: -20,
  };
}

export function sectionAtHeight(level, y) {
  let s = 0;
  for (const st of level.sectionStarts) if (y >= st.y - 0.5) s = st.sec;
  return s;
}
