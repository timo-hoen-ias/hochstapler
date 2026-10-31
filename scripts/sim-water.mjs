// Simulation für Schwimmstrecken (wird von simulate-path.mjs genutzt):
// ins Wasser springen bzw. durch die Tür waten, schwimmen, unter Schleusen und
// brennendem Öl durchtauchen, am Ausstieg festhalten und hochziehen.
import { createBody, stepBody } from '../client/src/physics.js';
import { waterAt } from '../client/src/elements.js';
import { phaseOf } from '../client/src/level.js';

const dt = 1 / 120;
const center = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
const axisDir = (from, to) => {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  return Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
};
const inside = (b, x, y, z, pad = 0) => x > b.min[0] - pad && x < b.max[0] + pad && y > b.min[1] && y < b.max[1] && z > b.min[2] - pad && z < b.max[2] + pad;

// Von der Plattform ins Wasser
export function simIntoWater(level, world, A, B) {
  const w = B.water;
  for (const off of [0, 3, 6, 9]) {
    const t0 = 5000 + off;
    world.t = null; world.update(t0);
    const a = A.box, ac = center(a), bc = center(w);
    const dir = axisDir(ac, bc);
    const half = dir[0] ? (a.max[0] - a.min[0]) / 2 : (a.max[2] - a.min[2]) / 2;
    const body = createBody([ac[0] - dir[0] * Math.max(0, half - 0.35), ac[1], ac[2] - dir[1] * Math.max(0, half - 0.35)]);
    body.grounded = true; body.ground = a;
    let t = t0;
    for (let s = 0; s < 120 * 8; s++) {
      t += dt; world.update(t);
      stepBody(body, { x: dir[0], z: dir[1], jump: false, brace: false }, world, dt);
      if (body.zapped) break;
      if (waterAt(world, body.pos) === w) return { ok: true };
    }
  }
  return { ok: false, why: 'nicht ins Wasser gekommen' };
}

// Durchs Wasser zum Ausstieg B. prevBox = woher man ins Wasser kam.
export function simSwimOut(level, world, A, B, prevBox) {
  const w = A.water;
  const bc = center(B.box);
  let last = 'nichts';
  // Steigendes Wasser: bei Tiefstand anfangen, damit das Warten mitgeprüft wird
  let tl = 5000;
  if (w.rise) while (phaseOf(w.rise.period, w.rise.phase, tl) > 0.01) tl += 0.005;
  for (const off of [0, 4, 8]) {
    const t0 = tl + off;
    world.t = null; world.update(t0);
    // Start: im Wasser auf der Seite, von der man kam
    const pc = center(prevBox);
    const sx = Math.min(w.max[0] - 0.5, Math.max(w.min[0] + 0.5, pc[0]));
    const sz = Math.min(w.max[2] - 0.5, Math.max(w.min[2] + 0.5, pc[2]));
    const body = createBody([sx, w.surf - 1.2, sz]);
    let t = t0, diveHold = 0, ok = false;
    for (let s = 0; s < 120 * 45; s++) {
      t += dt; world.update(t);
      let ix = bc[0] - body.pos[0], iz = bc[2] - body.pos[2];
      const l = Math.hypot(ix, iz) || 1;
      ix /= l; iz /= l;
      let jump = !!body.hang, brace = false;
      if (body.swim) {
        // Hindernis oder Feuer an der Oberfläche vor oder über einem: tauchen
        const y = w.surf + 0.1;
        let blocked = false;
        for (const d of [0, 0.5, 1.0]) {
          const x = body.pos[0] + ix * d, z = body.pos[2] + iz * d;
          for (const b of world.near([x, body.pos[1], z], 2)) if (!b.hidden && !b.big && b !== B.box && inside(b, x, y, z, 0.35) && b.min[1] > w.min[1] + 0.2) blocked = true;
          for (const h of world.hazards) if (h.active && inside(h.cur, x, w.surf, z, 0.5)) blocked = true;
        }
        if (blocked) diveHold = 0.35;
        diveHold -= dt;
        brace = diveHold > 0;
      }
      stepBody(body, { x: ix, z: iz, jump, brace }, world, dt);
      if (body.zapped) { last = 'Feuer'; break; }
      if (body.grounded && body.ground === B.box) { ok = true; break; }
      if (body.grounded && body.ground && !body.swim) last = body.ground.mat;
    }
    if (ok) return { ok: true };
  }
  return { ok: false, why: `Ausstieg nicht erreicht (zuletzt ${last})` };
}
