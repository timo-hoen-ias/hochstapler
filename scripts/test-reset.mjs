// Reset-Taste: die "letzte sichere Stelle" folgt dem Aufstieg, bleibt nach einem
// Absturz oben, liegt nie auf Gefahren/Beweglichem/Wind, und alle Spieler einer
// Seilschaft stehen nach dem Zurücksetzen sicher auf der Plattform.
import { buildLevel } from '../client/src/level.js';
import { Colliders, createBody, stepBody, releaseGrips } from '../client/src/physics.js';
import { trackSafe, safeGround, spreadOn } from '../client/src/safespot.js';

const level = buildLevel();
const world = new Colliders(level);
world.forceOpen = true; world.updatePlates([], 0);
const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fails++; };
const center = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1] + 0.02, (b.min[2] + b.max[2]) / 2];
let t = 5000;
function stand(body, pos, secs, s) {
  body.pos = [...pos]; body.vel = [0, 0, 0]; body.grounded = false; releaseGrips(body); body.hurt = 0;
  for (let k = 0; k < secs * 120; k++) { t += dt; world.update(t); stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt); if (s) trackSafe(s, body, world, dt); }
}

// 1) Aufstieg: auf jeder Plattform kurz stehen, die Stelle folgt nach oben
const s = {}, body = createBody([0, 0, 0]);
let followed = 0, safeBoxes = 0, bad = 0;
const statics = level.path.filter((p) => p.kind === 'static' && !p.box.ramp && !p.box.round);
let lower = 0;
for (const p of statics.slice(0, 400)) {
  const before = s.spot ? s.spot.y : -Infinity;
  stand(body, center(p.box), 0.5, s);
  if (body.ground === p.box && safeGround(body, world)) {
    // deutlich tiefer als die bisherige Stelle: zählt bewusst nicht (wie nach einem Absturz)
    if (p.box.max[1] < before - 2.2) { lower++; if (s.spot?.box === p.box) bad++; continue; }
    safeBoxes++; if (s.spot?.box === p.box) followed++;
  }
  const b = s.spot?.box;
  if (b && (b.mover || b.blink || b.ramp || b.belt || b.ice || b.bounce || b.big)) bad++;
}
check(safeBoxes > 100 && followed === safeBoxes, `sichere Stelle folgt dem Aufstieg: ${followed}/${safeBoxes} Plattformen (${lower} deutlich tiefer gelegene bleiben außen vor)`);
check(bad === 0, 'nie auf Beweglichem, Kippschalen, Bändern, Eis oder dem Hof');

// 2) Absturz: tief unten landen ändert die Stelle nicht
const top = s.spot;
const low = statics.find((p) => p.box.max[1] < top.y - 10 && !p.box.ice && !p.box.belt);
stand(body, center(low.box), 1.0, s);
check(s.spot === top, `nach Absturz (${(top.y - low.box.max[1]).toFixed(0)} m tiefer) bleibt die Stelle oben`);

// 3) Alle 4 Spieler einer Seilschaft stehen nach dem Reset auf der Plattform
let placed = 0, total = 0;
for (const p of statics) {
  const b = p.box;
  stand(body, center(b), 0.4);
  if (!(body.ground === b && safeGround(body, world))) continue;
  for (let i = 0; i < 4; i++) {
    total++;
    const q = createBody(spreadOn(b, center(b), 4, i));
    let tt = t;
    for (let k = 0; k < 60; k++) { tt += dt; world.update(tt); stepBody(q, { x: 0, z: 0, jump: false, brace: false }, world, dt); }
    if (q.grounded && q.ground === b) placed++;
  }
}
check(placed === total, `Reset-Plätze für 4 Spieler stehen sicher: ${placed}/${total}`);
process.exit(fails ? 1 : 0);
