// Akt 1 von "Hochstapler": sechs handgebaute Abschnitte aus Set-Pieces.
// Jeder Abschnitt hat eine eigene Idee, geht auch mal abwärts oder in die Halle
// hinaus und endet mit einem Höhepunkt. Richtungen: f = vorwärts, l/r = links/rechts,
// b = zurück (relativ zur Abschnittsrichtung).

export function buildAct1(k) {
  const { HANDMADE: H, section, step, mover, ramp, pipe, hook, ladderUp, wind, prop, sign, markCheckpoint, hazard, plate, gate } = k;
  const mid = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
  // Laserschranke quer über eine Plattform (dünn entlang der Laufachse ax)
  const laserAcross = (b, ax, h0, h1, o = {}) => {
    const [cx, cz] = mid(b);
    const t = 0.08, pad = 0.6;
    const min = ax === 0 ? [cx - t, b.max[1] + h0, b.min[2] - pad] : [b.min[0] - pad, b.max[1] + h0, cz - t];
    const max = ax === 0 ? [cx + t, b.max[1] + h1, b.max[2] + pad] : [b.max[0] + pad, b.max[1] + h1, cz + t];
    if (o.at !== undefined) { min[ax] += o.at; max[ax] += o.at; }
    return hazard('laser', min, max, o);
  };
  const top = () => k.prev.max[1];
  // Bereich über mehreren Boxen (für Windzonen)
  const span = (boxes, pad = 1, up = 4) => ({
    min: [Math.min(...boxes.map((b) => b.min[0])) - pad, Math.min(...boxes.map((b) => b.max[1])) - 0.5, Math.min(...boxes.map((b) => b.min[2])) - pad],
    max: [Math.max(...boxes.map((b) => b.max[0])) + pad, Math.max(...boxes.map((b) => b.max[1])) + up, Math.max(...boxes.map((b) => b.max[2])) + pad],
  });

  // ───────── 1 · Wareneingang: Paletten, LKW, erste Kante, Rohrbrücke ─────────
  section(H[0], [0, -1], 0);
  step('f', 1.0, 1.0, 2, 3, 'goods', { h: 'ground' });
  sign('TOR 1 · WARENEINGANG');
  step('f', 1.4, 1.1, 2, 2, 'crate', { h: 'ground', off: 0.6 });
  step('r', 1.6, 0.5, 1.4, 1.4, 'carton', { h: 'ground' });
  step('f', 1.2, 0.9, 2.4, 2.4, 'goods', { h: 'ground', off: -0.4 });
  step('f', 1.0, 1.85, 3, 2.6, 'goods', { h: 'ground', how: 'ledge' });
  const trailer = step('l', 1.2, 0.9, 2.6, 7, 'trailer', { h: 'ground' });
  {
    // Stachelstreifen mitten auf dem Auflieger: drüberspringen
    const [cx] = mid(trailer);
    hazard('spikes', [cx - 0.55, trailer.max[1], trailer.min[2]], [cx + 0.55, trailer.max[1] + 0.4, trailer.max[2]]);
  }
  pipe('l', 1.4, 0.2, 6, 0.28);
  step('l', 1.2, 0.3, 2.4, 6, 'container', { h: 'ground' });
  ladderUp('f', 0, 3.2, 2.6, 2.6, 'goods');
  step('r', 3.2, -0.8, 1.6, 1.6, 'crate', { h: 'ground', how: 'long' });
  step('f', 1.5, 1.2, 1.4, 1.4, 'carton', { h: 'ground', off: 0.5 });
  step('f', 1.8, 1.0, 2.4, 2.4, 'goods', { h: 'ground' });
  step('f', 1.2, 1.2, 6, 2.6, 'container', { h: 'ground' });

  // ───────── 2 · Hochregallager: schmale Traversen, Shuttle hinaus, Rückweg ─────────
  section(H[1], [-1, 0], top());
  const s2start = k.pathLength();
  step('f', 1.5, 0.6, 3, 3, 'checkpoint');
  markCheckpoint('Halle 2');
  sign('HALLE 2 · HOCHREGALLAGER');
  const b1 = step('f', 1.3, 0.9, 3, 0.25, 'beam');
  laserAcross(b1, 0, 0, 2.6, { timer: { period: 3.6, phase: 0, on: 0.5 } });
  step('f', 1.6, 0.7, 3, 0.25, 'beam', { off: 0.8 });
  step('f', 1.6, 0.6, 3, 0.25, 'beam', { off: -0.6 });
  step('l', 1.4, 1.0, 2.4, 1.6, 'goods', { h: 1.0 });
  ladderUp('l', 0, 3.0, 2, 2.4, 'goods');
  mover('slide', 'f', 0.8, 2, 2, { dist: 7, period: 8, model: 'shuttle' });
  step('f', 1.0, 0.2, 2.4, 0.3, 'beam');
  step('f', 2.6, -0.4, 1.4, 1.4, 'crate', { how: 'long' });
  step('r', 1.4, 1.1, 2, 2, 'grate');
  step('r', 1.5, 1.8, 2.4, 2.4, 'goods', { h: 1.4, how: 'ledge' });
  step('b', 1.5, 0.8, 3, 0.25, 'beam');
  step('b', 1.6, 0.6, 3, 0.25, 'beam', { off: 0.5 });
  step('l', 1.4, 1.0, 2, 2, 'grate');
  step('l', 1.6, 1.1, 2.4, 2.4, 'goods', { h: 1.0 });

  {
    // Regalwände links und rechts der Gasse
    const bs = k.pathBoxes(s2start);
    const bb = span(bs, 0, 0);
    const h = bb.max[1] + 3;
    prop('rack', null, { from: [bb.max[0] + 1, bb.min[2] - 2.6], to: [bb.min[0] - 1, bb.min[2] - 2.6], height: h });
    prop('rack', null, { from: [bb.min[0] - 1, bb.max[2] + 2.6], to: [bb.max[0] + 1, bb.max[2] + 2.6], height: h });
  }

  // ───────── 3 · Fördertechnik: Sortierturm, Paketrutsche, Trommeln ─────────
  section(H[2], [0, 1], top());
  step('f', 1.5, 0.8, 3, 3, 'checkpoint');
  markCheckpoint('Halle 3');
  sign('HALLE 3 · FÖRDERTECHNIK');
  const cp3 = k.prev;
  const tower = ladderUp('f', 0, 4.0, 3, 3, 'machine');
  {
    // Rätsel: Rolltor vor der Leiter. Platte unten öffnet, Platte oben hält offen
    const lad = k.ladderOf(tower);
    const [cx, cz] = mid(cp3);
    const back = k.dirVec('b'), right = k.dirVec('r');
    const p1 = plate(cp3, cx + back[0] * 0.8 + right[0] * 0.8, cz + back[1] * 0.8 + right[1] * 0.8);
    const [tx, tz] = mid(tower);
    const p2 = plate(tower, tx + back[0] * 0.8 - right[0] * 0.8, tz + back[1] * 0.8 - right[1] * 0.8);
    gate([lad.min[0] - 0.05, lad.min[1] + 0.05, lad.min[2] - 0.05], [lad.max[0] + 0.05, lad.max[1] - 0.02, lad.max[2] + 0.05], [p1, p2]);
  }
  ramp('f', 0, 0, 8, 1.6, 3.5, { slide: true });
  step('f', 3.0, -0.5, 6, 1.4, 'belt', { belt: [0, 0, -2.0], how: 'long' });
  step('r', 1.2, 0.9, 2, 2, 'crate');
  pipe('r', 1.4, 0.4, 4, 0.55, { spin: 1.4, model: 'drum', mat: 'cable' });
  step('r', 1.2, 0.6, 2, 2, 'grate');
  ramp('f', 1.0, 0.3, 5, 1.4, -1.8, { mat: 'beltramp' });
  step('f', 1.0, 0.5, 2, 2, 'crate');
  step('l', 1.6, 1.9, 2.4, 2.4, 'goods', { h: 1.2, how: 'ledge' });
  step('l', 1.0, 0.6, 5, 1.4, 'belt', { belt: [2.5, 0, 0] });
  step('l', 1.8, 1.0, 2, 2, 'crate');
  pipe('f', 1.3, 0.5, 5, 0.22);
  step('f', 1.0, 0.6, 3, 3, 'grate');

  // ───────── 4 · Staplerzone: Gabeln, rollende Fässer, Palettenrampe ─────────
  section(H[3], [1, 0], top());
  step('f', 1.5, 0.6, 3, 3, 'checkpoint');
  markCheckpoint('Halle 4');
  sign('HALLE 4 · STAPLERZONE');
  mover('lift', 'f', 0.8, 2, 2, { range: 3, period: 7, model: 'forklift' });
  const sp = step('f', 1.2, 0.5, 2, 2, 'grate');
  hazard('spikes', [sp.min[0], sp.max[1], sp.min[2]], [sp.max[0], sp.max[1] + 0.4, sp.max[2]], { timer: { period: 3.2, phase: 0.3, on: 0.45 } });
  pipe('f', 1.2, 0.3, 3.5, 0.4, { model: 'drums', mat: 'drum' });
  pipe('f', 1.0, 0.2, 3.5, 0.4, { model: 'drums', mat: 'drum', off: 0.6 });
  step('f', 1.2, 0.7, 2, 2, 'goods', { h: 0.9 });
  mover('slide', 'r', 0.6, 2, 2, { dist: 6, period: 8, model: 'forklift' });
  step('r', 1.0, 0.8, 1.5, 1.5, 'crate');
  step('r', 2.8, 0.2, 1.4, 1.4, 'crate', { how: 'long' });
  mover('lift', 'f', 0.8, 2, 2, { range: 3, period: 8, model: 'forklift' });
  step('f', 1.0, 1.85, 2.4, 2.4, 'goods', { h: 1.4, how: 'ledge' });
  ramp('l', 1.0, 0.2, 5, 1.6, -1.5, { mat: 'palletramp' });
  step('l', 1.4, 1.0, 2, 2, 'grate');
  mover('lift', 'f', 0.8, 2, 2, { range: 3, period: 6, model: 'forklift' });
  step('f', 1.2, 0.6, 3, 3, 'grate');

  // ───────── 5 · Containerhafen: Portalkran mit Laufkatze, Hakenkette ─────────
  section(H[4], [0, -1], top());
  step('f', 1.5, 0.8, 6, 2.4, 'container', { h: 2.6, supports: true });
  markCheckpoint('Kai 5');
  sign('KAI 5 · CONTAINERHAFEN');
  step('f', 1.2, 1.0, 2.4, 6, 'container', { h: 2.6, supports: true });
  hook('f', 1.2, 2.6, { motion: { dist: 10, period: 11 }, len: 2.4, rail: true });
  step('f', 0.4, -1.0, 2.6, 2.6, 'container', { h: 2.6, supports: true });
  hook('l', 1.6, 2.6, { len: 2.2 });
  hook('l', 2.8, 1.95, { len: 2.2 });
  step('l', 1.6, -0.5, 2.4, 6, 'container', { h: 2.6, supports: true });
  step('f', 1.0, 1.9, 2.4, 2.4, 'container', { h: 2.6, supports: true, how: 'ledge' });
  mover('swing', 'f', 0.6, 1.6, 1.6, { dist: 7, period: 7, h: 1.1 });
  const lc = step('f', 0.8, 0.6, 6, 2.4, 'container', { h: 2.6, supports: true });
  {
    // Wandernde Laserschranke auf Kniehöhe: drüberspringen
    const fz = k.dirVec('f');
    const ax = fz[0] ? 0 : 2;
    laserAcross(lc, ax, 0.05, 0.55, { at: -1.9 * (fz[0] || fz[1]), motion: { delta: ax === 0 ? [3.8 * fz[0], 0, 0] : [0, 0, 3.8 * fz[1]], period: 4.4 } });
  }
  step('r', 1.6, 1.2, 2.4, 2.4, 'crate', { h: 1.2 });
  step('r', 1.4, 1.8, 2.4, 6, 'container', { h: 2.6, supports: true, how: 'ledge' });
  pipe('f', 1.2, 0.2, 6, 0.25);
  step('f', 1.0, 0.5, 4, 4, 'grate');

  // ───────── 6 · Versanddach: Sheddächer im Wind, Lüftungskanal, Treppenhaus ─────────
  section(H[5], [-1, 0], top());
  step('f', 1.5, 0.6, 3, 3, 'checkpoint');
  markCheckpoint('Dach');
  sign('DACH · VERSAND');
  const windy = [];
  windy.push(ramp('f', 1.0, 0.2, 6, 3, -2.0, { mat: 'roofslope' }));
  windy.push(step('f', 2.4, -0.3, 3, 3, 'roof', { h: 0.6, how: 'long' }));
  windy.push(pipe('l', 1.2, 0.6, 6, 0.3, { mat: 'duct' }));
  windy.push(step('l', 1.0, 0.4, 2.4, 2.4, 'roof', { h: 0.6 }));
  const r = k.dirVec('r');
  wind(span(windy), [r[0] * 7, 0, r[1] * 7], { period: 6, phase: 0.2 });
  const st = ladderUp('l', 0, 3.5, 2.4, 2.4, 'concrete');
  const w2 = [];
  w2.push(step('f', 2.0, 0.0, 2.5, 0.3, 'beam'));
  w2.push(step('f', 1.8, 0.4, 2.5, 0.3, 'beam'));
  {
    // Rätsel: Laserzaun auf der ersten Traverse – Platte auf dem Treppenhaus oder auf der zweiten Traverse schaltet ihn ab
    const [sx, sz] = mid(st);
    const pa = plate(st, sx, sz, 1.0);
    const [bx2, bz2] = mid(w2[1]);
    const pb = plate(w2[1], bx2, bz2, 0.7);
    const fz = k.dirVec('f');
    const zA = laserAcross(w2[0], fz[0] ? 0 : 2, 0, 3.2, { plate: pa });
    zA.plate2 = pb;
  }
  wind(span(w2), [k.dirVec('l')[0] * 6, 0, k.dirVec('l')[1] * 6], { period: 5, phase: 0.6 });
  mover('lift', 'f', 0.8, 2, 2, { range: 4, period: 8 });
  step('f', 1.4, 1.9, 2.4, 2.4, 'concrete', { h: 1.2, how: 'ledge' });
  const roof = step('l', 1.6, 1.2, 7, 7, 'roof', { h: 0.6 });
  for (const b of [windy[1], windy[3], roof]) prop('vent', [b.max[0] - 0.5, b.max[1], b.max[2] - 0.5]);
  prop('skylight', [(roof.min[0] + roof.max[0]) / 2, roof.max[1], roof.min[2] + 1.2], { size: [4, 1.2] });
  markCheckpoint('Versanddach');
  k.landmarks.push({ kind: 'roof', pos: [(roof.min[0] + roof.max[0]) / 2, roof.max[1], (roof.min[2] + roof.max[2]) / 2] });
}
