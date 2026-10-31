// Akt 1 von "Hochstapler": sechs handgebaute Abschnitte aus Set-Pieces.
// Jeder Abschnitt hat eine eigene Idee, geht auch mal abwärts oder in die Halle
// hinaus und endet mit einem Höhepunkt. Richtungen: f = vorwärts, l/r = links/rechts,
// b = zurück (relativ zur Abschnittsrichtung).

export function buildAct1(k) {
  const { HANDMADE: H, section, step, mover, ramp, pipe, hook, ladderUp, wind, prop, sign, markCheckpoint } = k;
  const top = () => k.prev.max[1];
  // Bereich über mehreren Boxen (für Windzonen)
  const span = (boxes, pad = 1, up = 4) => ({
    min: [Math.min(...boxes.map((b) => b.min[0])) - pad, Math.min(...boxes.map((b) => b.max[1])) - 0.5, Math.min(...boxes.map((b) => b.min[2])) - pad],
    max: [Math.max(...boxes.map((b) => b.max[0])) + pad, Math.max(...boxes.map((b) => b.max[1])) + up, Math.max(...boxes.map((b) => b.max[2])) + pad],
  });

  // ───────── 1 · Wareneingang: Paletten, LKW, erste Kante, Rohrbrücke ─────────
  section(H[0], [0, -1], 0);
  step('f', 1.0, 1.0, 2, 3, 'goods', { h: 'ground' });
  sign('TOR 1 · WARENEINGANG', 'Seil straff halten, gemeinsam springen');
  step('f', 1.4, 1.1, 2, 2, 'crate', { h: 'ground', off: 0.6 });
  step('r', 1.6, 0.5, 1.4, 1.4, 'carton', { h: 'ground' });
  step('f', 1.2, 0.9, 2.4, 2.4, 'goods', { h: 'ground', off: -0.4 });
  step('f', 1.0, 1.85, 3, 2.6, 'goods', { h: 'ground', how: 'ledge' });
  sign('ZU HOCH?', 'An die Kante springen und festhalten – Sprung zieht hoch');
  step('l', 1.2, 0.9, 2.6, 7, 'trailer', { h: 'ground' });
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
  sign('HALLE 2 · HOCHREGALLAGER', 'Traversen sind schmal – Mitte treffen');
  step('f', 1.3, 0.9, 3, 0.25, 'beam');
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
  sign('HALLE 3 · FÖRDERTECHNIK', 'Rutsche: am Ende abspringen');
  ladderUp('f', 0, 4.0, 3, 3, 'machine');
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
  sign('HALLE 4 · STAPLERZONE', 'Fässer rollen – mittig bleiben');
  mover('lift', 'f', 0.8, 2, 2, { range: 3, period: 7, model: 'forklift' });
  step('f', 1.2, 0.5, 2, 2, 'grate');
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
  sign('KAI 5 · CONTAINERHAFEN', 'Haken greifen – Sprung lässt los');
  step('f', 1.2, 1.0, 2.4, 6, 'container', { h: 2.6, supports: true });
  hook('f', 1.2, 2.6, { motion: { dist: 10, period: 11 }, len: 2.4, rail: true });
  step('f', 0.4, -1.0, 2.6, 2.6, 'container', { h: 2.6, supports: true });
  hook('l', 1.6, 2.6, { len: 2.2 });
  hook('l', 2.8, 1.95, { len: 2.2 });
  step('l', 1.6, -0.5, 2.4, 6, 'container', { h: 2.6, supports: true });
  step('f', 1.0, 1.9, 2.4, 2.4, 'container', { h: 2.6, supports: true, how: 'ledge' });
  mover('swing', 'f', 0.6, 1.6, 1.6, { dist: 7, period: 7, h: 1.1 });
  step('f', 0.8, 0.6, 6, 2.4, 'container', { h: 2.6, supports: true });
  step('r', 1.6, 1.2, 2.4, 2.4, 'crate', { h: 1.2 });
  step('r', 1.4, 1.8, 2.4, 6, 'container', { h: 2.6, supports: true, how: 'ledge' });
  pipe('f', 1.2, 0.2, 6, 0.25);
  step('f', 1.0, 0.5, 4, 4, 'grate');

  // ───────── 6 · Versanddach: Sheddächer im Wind, Lüftungskanal, Treppenhaus ─────────
  section(H[5], [-1, 0], top());
  step('f', 1.5, 0.6, 3, 3, 'checkpoint');
  markCheckpoint('Dach');
  sign('DACH · VERSAND', 'Böen! Festhalten (Shift) schützt');
  const windy = [];
  windy.push(ramp('f', 1.0, 0.2, 6, 3, -2.0, { mat: 'roofslope' }));
  windy.push(step('f', 2.4, -0.3, 3, 3, 'roof', { h: 0.6, how: 'long' }));
  windy.push(pipe('l', 1.2, 0.6, 6, 0.3, { mat: 'duct' }));
  windy.push(step('l', 1.0, 0.4, 2.4, 2.4, 'roof', { h: 0.6 }));
  const r = k.dirVec('r');
  wind(span(windy), [r[0] * 7, 0, r[1] * 7], { period: 6, phase: 0.2 });
  ladderUp('l', 0, 3.5, 2.4, 2.4, 'concrete');
  const w2 = [];
  w2.push(step('f', 2.0, 0.0, 2.5, 0.3, 'beam'));
  w2.push(step('f', 1.8, 0.4, 2.5, 0.3, 'beam'));
  wind(span(w2), [k.dirVec('l')[0] * 6, 0, k.dirVec('l')[1] * 6], { period: 5, phase: 0.6 });
  mover('lift', 'f', 0.8, 2, 2, { range: 4, period: 8 });
  step('f', 1.4, 1.9, 2.4, 2.4, 'concrete', { h: 1.2, how: 'ledge' });
  const roof = step('l', 1.6, 1.2, 7, 7, 'roof', { h: 0.6 });
  for (const b of [windy[1], windy[3], roof]) prop('vent', [b.max[0] - 0.5, b.max[1], b.max[2] - 0.5]);
  prop('skylight', [(roof.min[0] + roof.max[0]) / 2, roof.max[1], roof.min[2] + 1.2], { size: [4, 1.2] });
  markCheckpoint('Versanddach');
  k.landmarks.push({ kind: 'roof', pos: [(roof.min[0] + roof.max[0]) / 2, roof.max[1], (roof.min[2] + roof.max[2]) / 2] });
}
