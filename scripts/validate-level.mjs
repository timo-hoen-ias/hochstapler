// Prüft das Level auf Erreichbarkeit (Sprunghöhe/Weite), Überschneidungen und Kopffreiheit.
import { buildLevel } from '../client/src/level.js';

const MAX_RISE = 1.35;
const MAX_GAP = 2.45;
const level = buildLevel();
let problems = 0;

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

for (let i = 1; i < level.path.length; i++) {
  const from = endBox(level.path[i - 1]);
  const to = level.path[i].box;
  const rise = to.max[1] - from.max[1];
  const gap = gapXZ(from, to);
  if (rise > MAX_RISE || gap > MAX_GAP) {
    problems++;
    console.log(`✗ Schritt ${i}: Anstieg ${rise.toFixed(2)} m, Lücke ${gap.toFixed(2)} m`);
  }
}

const solids = level.statics.filter((s) => s.mat !== 'ground');
for (let i = 0; i < solids.length; i++) {
  for (let j = i + 1; j < solids.length; j++) {
    if (inter(solids[i], solids[j], 0.01)) {
      problems++;
      console.log(`✗ Überschneidung: #${i} (${solids[i].mat}) und #${j} (${solids[j].mat})`);
    }
  }
  // Kopffreiheit über jeder Oberfläche
  const s = solids[i];
  const head = { min: [s.min[0] + 0.05, s.max[1] + 0.01, s.min[2] + 0.05], max: [s.max[0] - 0.05, s.max[1] + 2.0, s.max[2] - 0.05] };
  for (let j = 0; j < solids.length; j++) {
    if (j !== i && inter(head, solids[j])) {
      problems++;
      console.log(`✗ Keine Kopffreiheit über #${i} (${s.mat}) wegen #${j} (${solids[j].mat})`);
    }
  }
}

for (const [k, m] of level.movers.entries()) {
  const sw = sweep(m);
  const room = { min: sw.min, max: [sw.max[0], sw.max[1] + 1.9, sw.max[2]] };
  for (const [j, s] of solids.entries()) {
    if (inter(room, s, 0.02)) {
      problems++;
      console.log(`✗ Mover ${k} (${m.kind}) kollidiert mit #${j} (${s.mat})`);
    }
  }
}

const top = Math.max(...level.statics.map((s) => s.max[1]));
console.log(`${level.path.length} Kletterpunkte, ${level.movers.length} bewegliche Elemente, Gipfel bei ${top.toFixed(1)} m`);
for (const s of level.sectionStarts) console.log(`  Abschnitt ${s.sec + 1} ab ${s.y.toFixed(1)} m`);
const xs = level.statics.filter((s) => s.mat !== 'ground').flatMap((s) => [s.min[0], s.max[0]]);
const zs = level.statics.filter((s) => s.mat !== 'ground').flatMap((s) => [s.min[2], s.max[2]]);
console.log(`  Ausdehnung x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}, z ${Math.min(...zs).toFixed(0)}..${Math.max(...zs).toFixed(0)}`);
if (problems) { console.log(`${problems} Problem(e)`); process.exit(1); }
console.log('✓ Level ok');
