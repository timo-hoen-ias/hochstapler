// Spielt jeden Übergang des Kletterpfads mit der echten Spielphysik durch:
// Anlauf, Absprung an der Kante, Luftsteuerung zur Mitte des Ziels.
// Bewegliche Plattformen und Kippschalen werden im passenden Takt angesprungen.
import { buildLevel, phaseOf, BLINK_WARN } from '../client/src/level.js';
import { Colliders, createBody, stepBody, PHYS } from '../client/src/physics.js';

const level = buildLevel();
const world = new Colliders(level);
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
  tested++;
  let t = startTime(A, B);
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
  const body = createBody(ac);
  if (special !== 'bounce' && special !== 'fan' && !A.mover) {
    // Anlauf von der gegenüberliegenden Kante
    const half = dir[0] ? (a.max[0] - a.min[0]) / 2 : (a.max[2] - a.min[2]) / 2;
    const back = Math.max(0, half - 0.35);
    body.pos[0] -= dir[0] * back; body.pos[2] -= dir[1] * back;
  }
  if (special === 'bounce') body.pos[1] += 0.6;
  body.grounded = special !== 'bounce';
  body.ground = special === 'bounce' ? null : a;
  let jumped = special === 'bounce' || special === 'fan', ok = false, steering = false;
  for (let s = 0; s < 120 * 8; s++) {
    t += dt;
    world.update(t);
    const tb = bBox(), tc = center(tb);
    let ix = 0, iz = 0, jump = false;
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
    if (body.bounced === tb && steering) { ok = true; break; }
    if (B.special === 'fan' && body.inFan && world.zoneAt(body.pos) === B.zone) { ok = true; break; }
    if (jumped && s > 10 && body.grounded && (steering || body.ground !== a)) { ok = body.ground === tb; break; }
  }
  if (!ok) {
    fails++;
    if (fails < 30) console.log(`✗ ${i - 1}→${i} (${A.special || A.kind}:${a.mat} → ${B.special || B.kind}:${b.mat}) Abschnitt ${B.box.sec ?? B.mover?.sec}, gelandet auf ${body.ground ? body.ground.mat : 'nichts'} bei y=${body.pos[1].toFixed(1)} (Ziel ${tc0(b)})`);
  }
}
function tc0(b) { return b.max[1].toFixed(1); }
console.log(`${tested - fails}/${tested} Übergänge geschafft`);
process.exit(fails ? 1 : 0);
