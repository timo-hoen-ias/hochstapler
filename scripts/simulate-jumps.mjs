// Simuliert für jeden statischen Übergang einen Sprung mit der echten Spielphysik.
import { buildLevel } from '../client/src/level.js';
import { Colliders, createBody, stepBody, PHYS } from '../client/src/physics.js';

const level = buildLevel();
const world = new Colliders(level);
world.update(0);
const dt = 1 / 120;
let fails = 0, tested = 0;

for (let i = 1; i < level.path.length; i++) {
  const A = level.path[i - 1], B = level.path[i];
  if (A.mover || B.mover) continue;
  tested++;
  const a = A.box, b = B.box;
  const ac = [(a.min[0] + a.max[0]) / 2, a.max[1], (a.min[2] + a.max[2]) / 2];
  const bc = [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
  const dx = Math.sign(Math.round((bc[0] - ac[0]) * 100)), dz = Math.sign(Math.round((bc[2] - ac[2]) * 100));
  const body = createBody(ac);
  body.grounded = true;
  let jumped = false, ok = false;
  for (let s = 0; s < 120 * 4; s++) {
    let ix = dx, iz = dz, jump = false;
    if (!jumped) {
      const front = dx ? (dx > 0 ? body.pos[0] + 0.3 - a.max[0] : a.min[0] - (body.pos[0] - 0.3))
                       : (dz > 0 ? body.pos[2] + 0.3 - a.max[2] : a.min[2] - (body.pos[2] - 0.3));
      if (front > 0.15 && body.grounded) { jump = true; jumped = true; }
    } else {
      const tx = bc[0] - body.pos[0], tz = bc[2] - body.pos[2];
      const l = Math.hypot(tx, tz);
      const k = Math.min(1, l * 0.8) / Math.max(l, 1e-6); ix = tx * k || 1e-3; iz = tz * k;
    }
    // Auf Förderbändern gegensteuern wie ein Mensch
    if (body.grounded && body.ground && body.ground.belt) {
      ix -= body.ground.belt[0] / PHYS.speed * 0.9; iz -= body.ground.belt[2] / PHYS.speed * 0.9;
      const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    }
    if (process.env.DEBUG == i) console.log(s, body.pos.map(v=>v.toFixed(2)).join(','), body.grounded, body.ground && body.ground.mat, jump);
    stepBody(body, { x: ix, z: iz, jump, brace: false }, world, dt);
    if (jumped && body.grounded && s > 10) { ok = body.ground === b; break; }
  }
  if (!ok) { fails++; console.log(`✗ Sprung ${i - 1}→${i} (${a.mat}→${b.mat}) gelandet auf ${body.ground ? body.ground.mat : 'nichts'} bei y=${body.pos[1].toFixed(2)}`); }
}
console.log(`${tested - fails}/${tested} Sprünge geschafft`);
process.exit(fails ? 1 : 0);
