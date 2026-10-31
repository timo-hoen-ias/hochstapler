// Spielt jeden Übergang des Kletterpfads mit der echten Spielphysik durch:
// Anlauf, Absprung an der Kante, Luftsteuerung zur Mitte des Ziels.
// Bewegliche Plattformen und Kippschalen werden im passenden Takt angesprungen.
import { buildLevel, phaseOf, BLINK_WARN } from '../client/src/level.js';
import { Colliders, createBody, stepBody, PHYS } from '../client/src/physics.js';
import { simHookFrom, simToHook, simLadder } from './sim-grips.mjs';
import { simIntoWater, simSwimOut } from './sim-water.mjs';

const level = buildLevel(process.env.SEED ? { seed: Number(process.env.SEED) } : {});
const world = new Colliders(level);
// Rätsel gelten als gelöst (Druckplatten gedrückt); Gefahren bleiben aktiv
world.forceOpen = true;
world.updatePlates([], 0);
const dt = 1 / 120;
const only = process.env.ONLY ? Number(process.env.ONLY) : null;
let fails = 0, tested = 0;

const center = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
const moverBox = (m) => world.moverBoxes[level.movers.indexOf(m)];

// Startzeit so wählen, dass das zeitgesteuerte Element gerade passt
function startTime(A, B) {
  let t = 5000;
  const want = (u) => { let k = 0; while (k++ < 200000) { t += 0.005; if (u()) return; } };
  if (B.mover) want(() => { const u = phaseOf(B.mover.period, B.mover.phase, t); return u > 0.0 && u < 0.01; });
  else if (B.kind === 'blink') want(() => { const u = phaseOf(B.box.blink.period, B.box.blink.phase, t); return u > 0.0 && u < 0.01; });
  else if (A.mover) want(() => { const u = phaseOf(A.mover.period, A.mover.phase, t); return u > 0.5 && u < 0.51; });
  else if (A.kind === 'blink') want(() => { const u = phaseOf(A.box.blink.period, A.box.blink.phase, t); return u > 0.0 && u < 0.01; });
  return t;
}

for (let i = 1; i < level.path.length; i++) {
  if (only !== null && i !== only) continue;
  const A = level.path[i - 1], B = level.path[i];
  if (B.how === 'coop' || B.how === 'machine') continue; // eigene Prüfung in test-arenas.mjs
  tested++;
  // Schwimmstrecken: hinein ins Wasser, hindurch, am Ausstieg hoch
  if (A.kind === 'swim' || B.kind === 'swim') {
    const r = B.kind === 'swim' ? simIntoWater(level, world, A, B) : simSwimOut(level, world, A, B, level.path[i - 2].box);
    if (!r.ok) {
      fails++;
      console.log(`✗ ${i - 1}→${i} (${A.kind} → ${B.kind}) Abschnitt ${B.box.sec ?? A.water?.sec}: ${r.why}`);
    }
    continue;
  }
  // Haken und Leitern haben eigene Abläufe
  if (A.kind === 'hook' || B.kind === 'hook' || B.how === 'ladder') {
    const r = A.kind === 'hook' ? simHookFrom(level, world, A, B) : B.kind === 'hook' ? simToHook(level, world, A, B) : simLadder(level, world, A, B);
    if (!r.ok) {
      fails++;
      console.log(`✗ ${i - 1}→${i} (${A.how || A.special || A.kind} → ${B.how || B.special || B.kind}) Abschnitt ${B.box.sec ?? B.hook?.sec}: ${r.why}`);
    }
    continue;
  }
  let ok = false, body, tc0b;
  // Gefahren mit Takt: notfalls etwas später loslaufen
  for (const off of [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2]) {
    let t = startTime(A, B) + off;
    world.t = null;
    world.update(t);
    const aBox = () => (A.mover ? moverBox(A.mover) : A.box);
    const bBox = () => (B.mover ? moverBox(B.mover) : B.box);
    const a = aBox(), b = bBox();
    const ac = center(a), bc = center(b);
    // Achsenrichtung zum Ziel
    const ddx = bc[0] - ac[0], ddz = bc[2] - ac[2];
    const dir = Math.abs(ddx) > Math.abs(ddz) ? [Math.sign(ddx), 0] : [0, Math.sign(ddz)];
    const special = A.special;
    body = createBody(ac);
    if (special !== 'bounce' && special !== 'fan' && !A.mover) {
      // Anlauf von der gegenüberliegenden Kante
      const half = dir[0] ? (a.max[0] - a.min[0]) / 2 : (a.max[2] - a.min[2]) / 2;
      const back = Math.max(0, half - 0.35);
      body.pos[0] -= dir[0] * back; body.pos[2] -= dir[1] * back;
    }
    if (special === 'bounce') body.pos[1] += 0.6;
    body.grounded = special !== 'bounce';
    body.ground = special === 'bounce' ? null : a;
    let jumped = special === 'bounce' || special === 'fan', steering = false;
    ok = false;
    for (let s = 0; s < 120 * 8; s++) {
      t += dt;
      world.update(t);
      const tb = bBox(), tc = center(tb);
      let ix = 0, iz = 0, jump = false;
      if (body.hang) jump = true; // an der Kante: hochziehen
      if (!process.env.NOHOP && !jumped && body.grounded && hazardAhead(body, dir)) jump = true; // über Stacheln/Laser hüpfen
      if (!jumped) {
        ix = dir[0]; iz = dir[1];
        const f = aBox();
        const out = dir[0] ? (dir[0] > 0 ? body.pos[0] + 0.3 - f.max[0] : f.min[0] - (body.pos[0] - 0.3))
                           : (dir[1] > 0 ? body.pos[2] + 0.3 - f.max[2] : f.min[2] - (body.pos[2] - 0.3));
        if (out > 0.1 && body.grounded) { jump = true; jumped = true; steering = true; }
      } else {
        if (!steering && body.pos[1] > tc[1] + 0.3 && (special === 'fan' || body.vel[1] > 0 || special === 'bounce')) steering = true;
        if (steering) {
          const tx = tc[0] - body.pos[0], tz = tc[2] - body.pos[2];
          const l = Math.hypot(tx, tz);
          const k = Math.min(1, l * 0.8) / Math.max(l, 1e-6);
          ix = tx * k || 1e-3; iz = tz * k;
        }
      }
      // auf Förderbändern gegensteuern
      if (body.grounded && body.ground && body.ground.belt) {
        ix -= body.ground.belt[0] / PHYS.speed * 0.9; iz -= body.ground.belt[2] / PHYS.speed * 0.9;
        const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
      }
      // Auf dem Ziel-Luftpolster nicht weiterhüpfen
      stepBody(body, { x: ix, z: iz, jump, brace: false }, world, dt);
      if (process.env.DEBUG) console.log(s, body.pos.map((v) => v.toFixed(2)).join(','), body.grounded, body.ground && body.ground.mat, steering);
      if (body.zapped) { ok = false; break; }
      if (body.bounced === tb && steering) { ok = true; break; }
      if (B.special === 'fan' && body.inFan && world.zoneAt(body.pos) === B.zone) { ok = true; break; }
      if (jumped && s > 10 && body.grounded && (steering || body.ground !== a)) { ok = body.ground === tb; if (ok || !A.special || (A.special !== 'slide' && A.special !== 'ramp' && A.special !== 'round')) break; }
    }
  if (ok) break;
  }
  if (!ok) {
    fails++;
    if (fails < 30) console.log(`✗ ${i - 1}→${i} (${A.special || A.kind}:${A.box.mat} → ${B.special || B.kind}:${B.box.mat}) Abschnitt ${B.box.sec ?? B.mover?.sec}, gelandet auf ${body.ground ? body.ground.mat : 'nichts'} bei y=${body.pos[1].toFixed(1)} (Ziel ${tc0(B.box)})`);
  }
}
function hazardAhead(body, dir) {
  const p = body.pos;
  for (const z of world.hazards) {
    if (!z.active && !z.warn) continue;
    const b = z.cur;
    if (b.min[1] > p[1] + 1.2 || b.max[1] < p[1]) continue;
    const ahead = dir[0] ? (dir[0] > 0 ? b.min[0] - (p[0] + 0.3) : (p[0] - 0.3) - b.max[0]) : (dir[1] > 0 ? b.min[2] - (p[2] + 0.3) : (p[2] - 0.3) - b.max[2]);
    const lat = dir[0] ? (p[2] > b.min[2] - 0.3 && p[2] < b.max[2] + 0.3) : (p[0] > b.min[0] - 0.3 && p[0] < b.max[0] + 0.3);
    if (lat && ahead > 0 && ahead < 0.9) return true;
  }
  return false;
}
function tc0(b) { return b.max[1].toFixed(1); }
console.log(`${tested - fails}/${tested} Übergänge geschafft`);
process.exit(fails ? 1 : 0);
