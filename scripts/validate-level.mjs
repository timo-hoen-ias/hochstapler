// Prüft das Level auf Erreichbarkeit (Sprunghöhe/Weite), Überschneidungen und Kopffreiheit.
import { buildLevel } from '../client/src/level.js';

const MAX_GAP = 2.45;
const maxRise = (special) => (special === 'bounce' ? 3.3 : special === 'fan' ? 4.2 : 1.35);
const t0 = Date.now();
const level = buildLevel();
const buildMs = Date.now() - t0;
let problems = 0;
const report = (msg) => { problems++; if (problems < 40) console.log('✗ ' + msg); };

const inter = (a, b, pad = 0) =>
  a.min[0] < b.max[0] - pad && a.max[0] > b.min[0] + pad &&
  a.min[1] < b.max[1] - pad && a.max[1] > b.min[1] + pad &&
  a.min[2] < b.max[2] - pad && a.max[2] > b.min[2] + pad;

const gapXZ = (a, b) => {
  const gx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
  const gz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
  return Math.hypot(gx, gz);
};

const endBox = (p) => {
  if (!p.mover) return p.box;
  const d = p.mover.delta;
  return { min: p.box.min.map((v, i) => v + d[i]), max: p.box.max.map((v, i) => v + d[i]) };
};

const sweep = (m) => {
  const a = m.base, d = m.delta;
  const min = a.min.map((v, i) => Math.min(v, v + d[i]));
  const max = a.max.map((v, i) => Math.max(v, v + d[i]));
  if (m.kind === 'swing') min[1] -= m.dip;
  return { min, max };
};

// Grenzen je nach Art des Übergangs. Haken und Leitern prüft die Simulation.
function limits(A, B, rise) {
  if (B.how === 'ladder') return { rise: 6, gap: 0.05 };
  if (B.how === 'ledge') return { rise: 2.15, gap: 1.7 };
  if (A.special === 'slide') return { rise: 0.5, gap: 4.5 };
  if (B.how === 'long') return { rise: 0.4, gap: 3.6 + Math.max(0, -rise) * 0.6 };
  return { rise: maxRise(A.special), gap: MAX_GAP };
}
for (let i = 1; i < level.path.length; i++) {
  const A = level.path[i - 1], B = level.path[i];
  if (A.kind === 'hook' || B.kind === 'hook') continue;
  const from = endBox(A);
  const to = B.box;
  const rise = (to.ramp ? to.ramp.near : to.max[1]) - from.max[1];
  const gap = gapXZ(from, to);
  const lim = limits(A, B, rise);
  if (rise > lim.rise || gap > lim.gap) report(`Schritt ${i}: Anstieg ${rise.toFixed(2)} m, Lücke ${gap.toFixed(2)} m (${B.how || 'Sprung'})`);
}

const solids = level.statics.filter((s) => !s.big && !s.gate); // Rolltore öffnen sich
// Raster für schnelle Paarsuche
const cell = 6, grid = new Map();
solids.forEach((s, i) => {
  for (let x = Math.floor(s.min[0] / cell); x <= Math.floor(s.max[0] / cell); x++)
    for (let y = Math.floor(s.min[1] / cell); y <= Math.floor((s.max[1] + 2) / cell); y++)
      for (let z = Math.floor(s.min[2] / cell); z <= Math.floor(s.max[2] / cell); z++) {
        const k = `${x},${y},${z}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
});
const near = (b) => {
  const out = new Set();
  for (let x = Math.floor(b.min[0] / cell); x <= Math.floor(b.max[0] / cell); x++)
    for (let y = Math.floor(b.min[1] / cell); y <= Math.floor(b.max[1] / cell); y++)
      for (let z = Math.floor(b.min[2] / cell); z <= Math.floor(b.max[2] / cell); z++)
        for (const j of grid.get(`${x},${y},${z}`) || []) out.add(j);
  return out;
};

for (let i = 0; i < solids.length; i++) {
  const s = solids[i];
  for (const j of near(s)) if (j > i && inter(s, solids[j], 0.01)) report(`Überschneidung: #${i} (${s.mat}) und #${j} (${solids[j].mat})`);
  const head = { min: [s.min[0] - 0.3, s.max[1] + 0.01, s.min[2] - 0.3], max: [s.max[0] + 0.3, s.max[1] + 2.0, s.max[2] + 0.3] };
  const bare = { min: [s.min[0], s.max[1] + 0.01, s.min[2]], max: [s.max[0], s.max[1] + 2.0, s.max[2]] };
  // Leitertürme stehen direkt an der Plattform davor: nur echte Überdeckung zählt
  if (!s.basin) for (const j of near(head)) if (j !== i && inter(head, solids[j]) && (!solids[j].ladderBlock || inter(bare, solids[j]))) report(`Keine Kopffreiheit über #${i} (${s.mat}) wegen #${j} (${solids[j].mat})`);
}

for (const [k, m] of level.movers.entries()) {
  const sw = sweep(m);
  const room = { min: sw.min, max: [sw.max[0], sw.max[1] + 1.9, sw.max[2]] };
  for (const j of near(room)) if (inter(room, solids[j], 0.02)) report(`Mover ${k} (${m.kind}) kollidiert mit #${j} (${solids[j].mat})`);
}
for (const [k, z] of level.zones.entries()) {
  if (z.push) continue; // Wind darf über Plattformen wehen
  for (const j of near(z)) if (inter(z, solids[j], 0.02)) report(`Lüfter ${k} ist verbaut von #${j} (${solids[j].mat})`);
}

const top = level.goal.min[1];
const count = (k) => level.path.filter((p) => p.special === k || p.kind === k).length;
console.log(`${level.path.length} Kletterpunkte, ${level.movers.length} bewegliche Elemente, ${level.checkpoints.length} Zwischenstopps, ${level.sections.length} Abschnitte, Ziel bei ${top.toFixed(0)} m (gebaut in ${buildMs} ms)`);
console.log(`  Eis ${count('ice')}, Luftpolster ${count('bounce')}, Lüfter ${count('fan')}, Kippschalen ${count('blink')}, Bänder ${level.statics.filter((s) => s.belt).length}`);
const xs = solids.flatMap((s) => [s.min[0], s.max[0]]);
const zs = solids.flatMap((s) => [s.min[2], s.max[2]]);
console.log(`  Ausdehnung x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}, z ${Math.min(...zs).toFixed(0)}..${Math.max(...zs).toFixed(0)}`);
if (problems) { console.log(`${problems} Problem(e)`); process.exit(1); }
console.log('✓ Level ok');
