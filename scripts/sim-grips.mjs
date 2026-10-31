// Simulation für Kranhaken und Leitern (wird von simulate-path.mjs genutzt).
import { phaseOf } from '../client/src/level.js';
import { createBody, stepBody, PHYS } from '../client/src/physics.js';

const dt = 1 / 120;
const center = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const axisDir = (from, to) => {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  return Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
};
const gripPos = (h) => [h.cur[0], h.cur[1] - h.len, h.cur[2]];

// Zeitpunkt, an dem eine Laufkatze gerade am Anfang (u≈from) steht
function timeAt(h, from = 0) {
  let t = 5000;
  if (!h.motion) return t;
  for (let k = 0; k < 400000; k++) { t += 0.005; const u = phaseOf(h.motion.period, h.motion.phase, t); if (u > from && u < from + 0.01) return t; }
  return t;
}

// Fertig, wenn auf dem Ziel gelandet bzw. den Zielhaken gegriffen
function reached(body, B, world) {
  if (B.kind === 'hook') return body.hook && body.hook.h === B.hook;
  if (B.mover) return body.grounded && body.ground === world.moverBoxes[world.level.movers.indexOf(B.mover)];
  return body.grounded && body.ground === B.box;
}

// Von einer Plattform zum Haken springen
export function simToHook(level, world, A, B) {
  const h = B.hook;
  let t = timeAt(h, 0);
  world.t = null; world.update(t);
  const a = A.mover ? world.moverBoxes[level.movers.indexOf(A.mover)] : A.box;
  const g = gripPos(h);
  const dir = axisDir(center(a), g);
  const body = createBody(center(a));
  const half = dir[0] ? (a.max[0] - a.min[0]) / 2 : (a.max[2] - a.min[2]) / 2;
  const back = Math.max(0, half - 0.35);
  body.pos[0] -= dir[0] * back; body.pos[2] -= dir[1] * back;
  body.grounded = true; body.ground = a;
  let jumped = false;
  for (let s = 0; s < 120 * 6; s++) {
    t += dt; world.update(t);
    const gp = gripPos(h);
    let ix = dir[0], iz = dir[1], jump = false;
    if (!jumped) {
      const out = dir[0] ? (dir[0] > 0 ? body.pos[0] + 0.3 - a.max[0] : a.min[0] - (body.pos[0] - 0.3))
                         : (dir[1] > 0 ? body.pos[2] + 0.3 - a.max[2] : a.min[2] - (body.pos[2] - 0.3));
      if (out > 0.05 && body.grounded) { jump = true; jumped = true; }
    } else {
      const [nx, nz] = norm2(gp[0] - body.pos[0], gp[2] - body.pos[2]);
      const l = Math.hypot(gp[0] - body.pos[0], gp[2] - body.pos[2]);
      const k = Math.min(1, l * 1.5);
      ix = nx * k; iz = nz * k;
    }
    stepBody(body, { x: ix, z: iz, jump, brace: false }, world, dt);
    if (reached(body, B, world)) return { ok: true };
    if (jumped && body.grounded && s > 20) return { ok: false, why: `Haken verfehlt, gelandet auf ${body.ground?.mat}` };
  }
  return { ok: false, why: 'Haken nicht erreicht' };
}

// Vom Haken zum nächsten Ziel: in Schwung bringen und im richtigen Moment loslassen
export function simHookFrom(level, world, A, B) {
  const h = A.hook;
  const tries = [];
  if (h.motion) for (const u of [0.5, 0.55, 0.6, 0.65]) tries.push({ ride: u, thr: null });
  for (const thr of [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75]) tries.push({ ride: null, thr });
  let why = '';
  for (const tr of tries) {
    let t = timeAt(h, h.motion ? 0.0 : 0);
    world.t = null; world.update(t);
    const g = gripPos(h);
    const body = createBody([g[0], g[1] - PHYS.reach, g[2]]);
    body.hook = { h, last: [...h.cur] };
    const target = () => (B.kind === 'hook' ? gripPos(B.hook) : center(B.mover ? world.moverBoxes[level.movers.indexOf(B.mover)] : B.box));
    let released = false, swings = 0;
    for (let s = 0; s < 120 * 16; s++) {
      t += dt; world.update(t);
      const tc = target();
      let ix = 0, iz = 0, jump = false;
      if (!released) {
        const [dx, dz] = norm2(tc[0] - h.cur[0], tc[2] - h.cur[2]);
        const va = body.vel[0] * dx + body.vel[2] * dz;
        const disp = (body.pos[0] - h.cur[0]) * dx + (body.pos[2] - h.cur[2]) * dz;
        if (tr.ride !== null) {
          const u = phaseOf(h.motion.period, h.motion.phase, t);
          if (u > tr.ride && u < 0.7) { jump = true; released = true; }
        } else {
          const sgn = va >= 0 ? 1 : -1;
          ix = dx * sgn; iz = dz * sgn;
          if (disp > tr.thr * h.len && va > 0.5) { swings++; if (swings > 0) { jump = true; released = true; } }
        }
      } else {
        const l = Math.hypot(tc[0] - body.pos[0], tc[2] - body.pos[2]);
        const [nx, nz] = norm2(tc[0] - body.pos[0], tc[2] - body.pos[2]);
        const k = Math.min(1, l * 0.8);
        ix = nx * k; iz = nz * k;
      }
      stepBody(body, { x: ix, z: iz, jump, brace: false }, world, dt);
      if (reached(body, B, world)) return { ok: true };
      if (released && body.grounded) { why = `gelandet auf ${body.ground?.mat} (y ${body.pos[1].toFixed(1)})`; break; }
      if (released && body.pos[1] < tc[1] - 6) { why = 'abgestürzt'; break; }
    }
    if (!why) why = 'kein Absprung';
  }
  return { ok: false, why };
}

// Zur Leiter laufen, hochklettern, oben aussteigen
export function simLadder(level, world, A, B) {
  let t = 5000;
  world.t = null; world.update(t);
  const a = A.mover ? world.moverBoxes[level.movers.indexOf(A.mover)] : A.box;
  const ac = center(a);
  const lad = B.ladder;
  const lc = [(lad.min[0] + lad.max[0]) / 2, 0, (lad.min[2] + lad.max[2]) / 2];
  const body = createBody(ac);
  body.grounded = true; body.ground = a;
  for (let s = 0; s < 120 * 10; s++) {
    t += dt; world.update(t);
    let ix, iz;
    if (body.ladder) { ix = -lad.face[0]; iz = -lad.face[1]; }
    else if (body.pos[1] > lad.max[1] - 0.1) { ix = -lad.face[0]; iz = -lad.face[1]; }
    else { const [nx, nz] = norm2(lc[0] - lad.face[0] * 0.3 - body.pos[0], lc[2] - lad.face[1] * 0.3 - body.pos[2]); ix = nx; iz = nz; }
    stepBody(body, { x: ix, z: iz, jump: false, brace: false }, world, dt);
    if (reached(body, B, world)) return { ok: true };
    if (body.pos[1] < ac[1] - 3) return { ok: false, why: 'abgestürzt' };
  }
  return { ok: false, why: `nicht oben angekommen (y ${body.pos[1].toFixed(1)}, Leiter bis ${lad.max[1].toFixed(1)})` };
}
