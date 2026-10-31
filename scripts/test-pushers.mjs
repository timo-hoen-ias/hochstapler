// Harte Passagen: Rammböcke und Stanzpressen stoßen Spieler wirklich hinunter,
// auf Schiebebalken fährt man mit. Läuft mit der echten Physik am echten Level.
import { buildLevel, phaseOf } from '../client/src/level.js';
import { Colliders, createBody, stepBody } from '../client/src/physics.js';

const level = buildLevel();
const world = new Colliders(level);
world.forceOpen = true;
world.updatePlates([], 0);
const dt = 1 / 120;
let fails = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fails++; };

// Plattform direkt unter/neben einem Rammbock (gleiche Oberkante, überdeckt entlang der Laufrichtung)
function platformOf(m) {
  const b = m.base;
  const top = m.kind === 'press' ? b.min[1] + m.delta[1] : b.min[1];
  const cands = level.statics.filter((s) => Math.abs(s.max[1] - top) < 1e-6 && s.sec === m.sec);
  const sw = { min: b.min.map((v, i) => Math.min(v, v + m.delta[i])), max: b.max.map((v, i) => Math.max(v, v + m.delta[i])) };
  return cands.find((s) => s.min[0] < sw.max[0] && s.max[0] > sw.min[0] && s.min[2] < sw.max[2] && s.max[2] > sw.min[2]);
}
const timeAt = (m, u) => { let t = 1000; while (Math.abs(phaseOf(m.period, m.phase, t) - u) > 0.003) t += 0.002; return t; };

function knock(kind) {
  const ms = level.movers.filter((m) => m.kind === kind);
  let shoved = 0, fell = 0, tried = 0;
  for (const m of ms) {
    const p = platformOf(m);
    if (!p) continue;
    tried++;
    let t = timeAt(m, 0.3); // in Ruhe
    world.t = null; world.update(t);
    // Spieler auf der Plattform, dort wo der Kolben durchfährt
    const bx = (Math.max(p.min[0], m.base.min[0]) + Math.min(p.max[0], m.base.max[0])) / 2;
    const bz = (Math.max(p.min[2], m.base.min[2]) + Math.min(p.max[2], m.base.max[2])) / 2;
    const cx = m.delta[0] ? (p.min[0] + p.max[0]) / 2 : bx;
    const cz = m.delta[2] ? (p.min[2] + p.max[2]) / 2 : bz;
    const body = createBody([cx, p.max[1] + 0.01, cz]);
    body.grounded = true; body.ground = p;
    let hit = false;
    for (let s = 0; s < 120 * m.period; s++) {
      t += dt; world.update(t);
      stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt);
      if (body.shoved) hit = true;
    }
    if (hit) shoved++; else if (process.env.DBG) console.log("kein Stoß", kind, level.movers.indexOf(m), body.pos.map((v) => v.toFixed(2)).join(","), p.max[1].toFixed(2), body.ground && body.ground.mat);
    if (body.ground !== p && !(body.pos[1] > p.max[1] - 0.05 && body.pos[0] > p.min[0] && body.pos[0] < p.max[0] && body.pos[2] > p.min[2] && body.pos[2] < p.max[2])) fell++; // nicht mehr auf der Plattform
  }
  return { tried, shoved, fell, total: ms.length };
}
const r = knock('ram');
ok(r.tried > 20 && r.shoved === r.tried && r.fell === r.tried, `Rammböcke: ${r.fell}/${r.tried} Spieler hinuntergestoßen (${r.total} Rammböcke)`);
const p = knock('press');
ok(p.tried > 20 && p.shoved === p.tried && p.fell === p.tried, `Stanzpressen: ${p.fell}/${p.tried} Spieler von der Stufe gedrückt (${p.total} Pressen)`);

// Wer rechtzeitig weitergeht, kommt durch: Spieler in Ruhe neben dem eingefahrenen Kolben bleibt oben
{
  const m = level.movers.find((x) => x.kind === 'ram' && platformOf(x));
  const pl = platformOf(m);
  let t = timeAt(m, 0.05);
  world.t = null; world.update(t);
  const body = createBody([(pl.min[0] + pl.max[0]) / 2, pl.max[1] + 0.01, (pl.min[2] + pl.max[2]) / 2]);
  body.grounded = true; body.ground = pl;
  for (let s = 0; s < 60; s++) { t += dt; world.update(t); stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt); }
  ok(!body.shoved && body.grounded && Math.abs(body.pos[1] - pl.max[1]) < 0.05, 'Rammbock in Ruhe: Spieler steht sicher');
}

// Schiebebalken: man fährt quer mit und fällt nicht herunter
{
  const m = level.movers.find((x) => x.sidestep);
  const i = level.movers.indexOf(m);
  const box = world.moverBoxes[i];
  let t = timeAt(m, 0.05);
  world.t = null; world.update(t);
  const body = createBody([(box.min[0] + box.max[0]) / 2, box.max[1] + 0.01, (box.min[2] + box.max[2]) / 2]);
  body.grounded = true; body.ground = box;
  const x0 = [body.pos[0], body.pos[2]];
  for (let s = 0; s < 120 * m.period * 0.5; s++) { t += dt; world.update(t); stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt); }
  const moved = Math.hypot(body.pos[0] - x0[0], body.pos[2] - x0[1]);
  const want = Math.hypot(m.delta[0], m.delta[2]);
  ok(body.grounded && body.ground === box && Math.abs(moved - want) < 0.15, `Schiebebalken (${(box.max[0] - box.min[0]).toFixed(2)}×${(box.max[2] - box.min[2]).toFixed(2)} m): mitgefahren ${moved.toFixed(2)} von ${want.toFixed(2)} m`);
}

// Jeder Akt 2–7 hat mindestens zwei harte Passagen
{
  const acts = new Map();
  for (const q of level.path) if (['sliders', 'rams', 'gauntlet', 'presses'].includes(q.piece)) {
    const a = level.sections[q.box.sec ?? q.mover?.sec]?.act;
    if (!acts.has(a)) acts.set(a, new Set());
    acts.get(a).add(q.piece + (q.box.sec ?? q.mover?.sec));
  }
  const thin = [2, 3, 4, 5, 6, 7].filter((a) => !acts.has(a) || acts.get(a).size < 2);
  ok(!thin.length, `harte Passagen in allen Akten 2–7 (${[...acts].map(([a, s]) => `Akt ${a}: ${s.size}`).join(', ')})`);
}

if (fails) { console.log(`${fails} Fehler`); process.exit(1); }
console.log('✓ Harte Passagen ok');
