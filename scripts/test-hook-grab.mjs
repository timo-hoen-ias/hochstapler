// Prüft, wie verzeihend das Greifen am Kranhaken ist: Sprünge mit ungenauer
// Steuerung (seitlicher Versatz, früher/später Absprung, nur Richtung halten)
// müssen den Haken trotzdem erwischen.
import { buildLevel, phaseOf } from '../client/src/level.js';
import { Colliders, createBody, stepBody } from '../client/src/physics.js';

const level = buildLevel();
const world = new Colliders(level);
world.forceOpen = true;
world.updatePlates([], 0);
const dt = 1 / 120;
const center = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
const grip = (h) => [h.cur[0], h.cur[1] - h.len, h.cur[2]];

function startTime(h, extra) {
  let t = 5000;
  if (h.motion) for (let k = 0; k < 400000; k++) { t += 0.005; const u = phaseOf(h.motion.period, h.motion.phase, t); if (u > 0 && u < 0.01) break; }
  return t + extra;
}

// Ein Versuch: von Plattform a aus auf den Haken zu, Richtung halten, an der Kante springen
function attempt(a, h, lateral, early, steer, delay) {
  let t = startTime(h, delay);
  world.t = null; world.update(t);
  const c = center(a), g = grip(h);
  const dx = g[0] - c[0], dz = g[2] - c[2];
  const dir = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const body = createBody(c);
  const half = dir[0] ? (a.max[0] - a.min[0]) / 2 : (a.max[2] - a.min[2]) / 2;
  const back = Math.max(0, half - 0.35);
  body.pos[0] -= dir[0] * back - dir[1] * lateral; body.pos[2] -= dir[1] * back + dir[0] * lateral;
  body.grounded = true; body.ground = a;
  let jumped = false;
  for (let s = 0; s < 120 * 5; s++) {
    t += dt; world.update(t);
    let ix = dir[0], iz = dir[1], jump = false;
    const out = dir[0] ? (dir[0] > 0 ? body.pos[0] + 0.3 - a.max[0] : a.min[0] - (body.pos[0] - 0.3))
                       : (dir[1] > 0 ? body.pos[2] + 0.3 - a.max[2] : a.min[2] - (body.pos[2] - 0.3));
    if (!jumped && body.grounded && out > -early) { jump = true; jumped = true; }
    if (jumped && steer) {
      // grobe Korrektur Richtung Haken (wie ein Spieler mit dem Stick)
      const gp = grip(h);
      const lx = gp[0] - body.pos[0], lz = gp[2] - body.pos[2], l = Math.hypot(lx, lz) || 1;
      ix = dir[0] * 0.6 + (lx / l) * 0.4; iz = dir[1] * 0.6 + (lz / l) * 0.4;
    }
    stepBody(body, { x: ix, z: iz, jump, brace: false }, world, dt);
    if (body.hook && body.hook.h === h) return true;
    if (jumped && s > 20 && (body.grounded || body.pos[1] < c[1] - 4)) return false;
  }
  return false;
}

let tries = 0, ok = 0;
const misses = [];
for (let i = 1; i < level.path.length; i++) {
  const A = level.path[i - 1], B = level.path[i];
  if (B.kind !== 'hook' || A.kind === 'hook' || A.mover) continue;
  const h = B.hook;
  for (const lateral of [-0.5, -0.25, 0, 0.25, 0.5]) for (const early of [0, 0.25, 0.5]) for (const steer of [false, true]) for (const delay of h.motion ? [0, 0.15, 0.3] : [0]) {
    tries++;
    if (attempt(A.box, h, lateral, early, steer, delay)) ok++;
    else misses.push(`${i} seitlich ${lateral} früh ${early} lenken ${steer}`);
  }
}
// Von Haken zu Haken: Schwung holen, irgendwann im Vorschwung loslassen, nur Richtung halten
function swing(h, h2, thr, delay) {
  let t = startTime(h, delay);
  world.t = null; world.update(t);
  const g = grip(h);
  const body = createBody([g[0], g[1] - 1.95, g[2]]);
  body.hook = { h, last: [...h.cur] };
  let released = false;
  for (let s = 0; s < 120 * 12; s++) {
    t += dt; world.update(t);
    const g2 = grip(h2);
    const lx = g2[0] - h.cur[0], lz = g2[2] - h.cur[2], l = Math.hypot(lx, lz) || 1;
    const dx = lx / l, dz = lz / l;
    let jump = false;
    if (!released) {
      const va = body.vel[0] * dx + body.vel[2] * dz;
      const disp = (body.pos[0] - h.cur[0]) * dx + (body.pos[2] - h.cur[2]) * dz;
      if (disp > thr * h.len && va > 0.5) { jump = true; released = true; }
      const sg = va >= 0 ? 1 : -1;
      stepBody(body, { x: dx * sg, z: dz * sg, jump, brace: false }, world, dt);
    } else stepBody(body, { x: dx, z: dz, jump: false, brace: false }, world, dt);
    if (body.hook && body.hook.h === h2) return true;
    if (released && (body.grounded || body.pos[1] < g[1] - 8)) return false;
  }
  return false;
}
for (let i = 1; i < level.path.length; i++) {
  const A = level.path[i - 1], B = level.path[i];
  if (A.kind !== 'hook' || B.kind !== 'hook') continue;
  for (const thr of [0.25, 0.35, 0.45, 0.55]) for (const delay of [0, 0.4]) {
    tries++;
    if (swing(A.hook, B.hook, thr, delay)) ok++;
    else misses.push(`${i} Haken→Haken loslassen bei ${thr}`);
  }
}
const rate = ok / tries;
console.log(`Haken greifen: ${ok}/${tries} ungenaue Sprünge erwischen den Haken (${(rate * 100).toFixed(0)} %)`);
if (process.env.VERBOSE) console.log(misses.join('\n'));
const MIN = Number(process.env.MIN_RATE || 0.9);
process.exit(rate >= MIN ? 0 : 1);
