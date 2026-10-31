// Einfache, deterministische Kletter-Physik mit achsenparallelen Boxen.
import { moverOffset } from './level.js';

export const PHYS = {
  gravity: 26,
  jump: 9.2,
  speed: 6,
  groundAccel: 70,
  airAccel: 22,
  half: [0.3, 0.9, 0.3],
  maxFall: 32,
  coyote: 0.12,
  jumpBuffer: 0.14,
  rope: 4.5,
};

const EPS = 1e-4;

export class Colliders {
  constructor(level) {
    this.level = level;
    this.statics = level.statics;
    this.moverBoxes = level.movers.map((m) => ({
      min: [...m.base.min], max: [...m.base.max], mat: m.mat, mover: m, d: [0, 0, 0], off: [0, 0, 0],
    }));
    this.all = [...this.statics, ...this.moverBoxes];
    this.tmp = [0, 0, 0];
    this.t = null;
  }

  // Bewegliche Elemente auf Zeitpunkt t setzen; d = Verschiebung seit letztem Update
  update(t) {
    for (const b of this.moverBoxes) {
      const o = moverOffset(b.mover, t, this.tmp);
      for (let i = 0; i < 3; i++) {
        b.d[i] = this.t === null ? 0 : o[i] - b.off[i];
        b.off[i] = o[i];
        b.min[i] = b.mover.base.min[i] + o[i];
        b.max[i] = b.mover.base.max[i] + o[i];
      }
    }
    this.t = t;
  }
}

export function createBody(pos) {
  return {
    pos: [...pos], vel: [0, 0, 0], grounded: false, ground: null,
    coyote: 0, jumpBuf: 0, braced: false, yaw: 0, lastJump: -1,
  };
}

function overlaps(p, h, b) {
  return p[0] - h[0] < b.max[0] - EPS && p[0] + h[0] > b.min[0] + EPS &&
    p[1] - h[1] < b.max[1] - EPS && p[1] + h[1] > b.min[1] + EPS &&
    p[2] - h[2] < b.max[2] - EPS && p[2] + h[2] > b.min[2] + EPS;
}

// Körpermittelpunkt liegt bei pos + [0, half.y, 0]; pos ist der Fußpunkt.
const center = [0, 0, 0];
function centerOf(body) {
  center[0] = body.pos[0];
  center[1] = body.pos[1] + PHYS.half[1];
  center[2] = body.pos[2];
  return center;
}

// Bewegt den Körper entlang einer Achse und löst Kollisionen. Gibt die getroffene Box zurück.
export function moveAxis(body, axis, amount, cols) {
  if (amount === 0) return null;
  body.pos[axis] += amount;
  const h = PHYS.half;
  let hit = null;
  const c = centerOf(body);
  for (const b of cols) {
    if (!overlaps(c, h, b)) continue;
    if (amount > 0) c[axis] = b.min[axis] - h[axis] - EPS;
    else c[axis] = b.max[axis] + h[axis] + EPS;
    hit = b;
  }
  body.pos[axis] = axis === 1 ? c[1] - h[1] : c[axis];
  return hit;
}

// Schiebt den Körper aus beweglichen Boxen heraus (wenn eine Plattform in ihn hineinfährt)
function depenetrate(body, cols) {
  const h = PHYS.half;
  const c = centerOf(body);
  for (const b of cols) {
    if (!overlaps(c, h, b)) continue;
    let best = Infinity, axis = 0, dir = 1;
    for (let i = 0; i < 3; i++) {
      const up = b.max[i] - (c[i] - h[i]);
      const down = (c[i] + h[i]) - b.min[i];
      if (up < best) { best = up; axis = i; dir = 1; }
      if (down < best) { best = down; axis = i; dir = -1; }
    }
    c[axis] += dir * (best + EPS);
    if (axis === 1 && dir > 0) { body.vel[1] = Math.max(body.vel[1], 0); body.grounded = true; body.ground = b; }
  }
  body.pos[0] = c[0]; body.pos[1] = c[1] - h[1]; body.pos[2] = c[2];
}

// input: { x, z } gewünschte Laufrichtung (Welt, Länge ≤ 1), jump (gedrückt-Flanke), brace (gehalten)
export function stepBody(body, input, world, dt) {
  const cols = world.all;

  // Mit Plattform mitfahren / Förderband
  if (body.grounded && body.ground) {
    const g = body.ground;
    if (g.d) {
      moveAxis(body, 1, g.d[1], cols);
      moveAxis(body, 0, g.d[0], cols);
      moveAxis(body, 2, g.d[2], cols);
    }
    if (g.belt) {
      moveAxis(body, 0, g.belt[0] * dt, cols);
      moveAxis(body, 2, g.belt[2] * dt, cols);
    }
  }

  body.braced = !!input.brace && body.grounded;

  // Horizontale Steuerung
  const wantX = body.braced ? 0 : input.x * PHYS.speed;
  const wantZ = body.braced ? 0 : input.z * PHYS.speed;
  const acc = (body.grounded ? PHYS.groundAccel : PHYS.airAccel) * dt;
  const dvx = wantX - body.vel[0];
  const dvz = wantZ - body.vel[2];
  const dl = Math.hypot(dvx, dvz);
  if (dl > 0) {
    const k = Math.min(1, acc / dl);
    // In der Luft nur sanft abbremsen, damit Seilschwünge erhalten bleiben
    const airKeep = !body.grounded && input.x === 0 && input.z === 0 ? 0.15 : 1;
    body.vel[0] += dvx * k * airKeep;
    body.vel[2] += dvz * k * airKeep;
  }
  if (input.x || input.z) body.yaw = Math.atan2(input.x, input.z);

  // Springen mit Coyote-Time und Eingabepuffer
  body.coyote = body.grounded ? PHYS.coyote : body.coyote - dt;
  body.jumpBuf = input.jump ? PHYS.jumpBuffer : body.jumpBuf - dt;
  body.jumped = false;
  if (body.jumpBuf > 0 && body.coyote > 0 && !body.braced) {
    body.vel[1] = PHYS.jump;
    // Schwung der Plattform mitnehmen
    if (body.ground && body.ground.belt) { body.vel[0] += body.ground.belt[0] * 0.5; body.vel[2] += body.ground.belt[2] * 0.5; }
    body.jumpBuf = 0;
    body.coyote = 0;
    body.grounded = false;
    body.jumped = true;
  }

  body.vel[1] = Math.max(body.vel[1] - PHYS.gravity * dt, -PHYS.maxFall);

  // Achsenweise bewegen: zuerst vertikal (großzügiges Landen auf Kanten)
  const wasGround = body.ground;
  body.grounded = false;
  body.ground = null;
  const hy = moveAxis(body, 1, body.vel[1] * dt, cols);
  if (hy) {
    if (body.vel[1] < 0) { body.grounded = true; body.ground = hy; body.landSpeed = -body.vel[1]; }
    body.vel[1] = 0;
  }
  if (moveAxis(body, 0, body.vel[0] * dt, cols)) body.vel[0] = 0;
  if (moveAxis(body, 2, body.vel[2] * dt, cols)) body.vel[2] = 0;

  // Bodenprüfung: knapp unter den Füßen
  if (!body.grounded && body.vel[1] <= 0) {
    const probe = moveAxis(body, 1, -0.03, cols);
    if (probe) { body.grounded = true; body.ground = probe; }
    else body.pos[1] += 0.03;
  }

  depenetrate(body, world.moverBoxes);
  body.justLanded = body.grounded && !wasGround;
}

// Seil-Kopplung zu einem Partner. Gewichtung: festhalten = unbeweglich,
// am Boden = schwer, in der Luft = leicht. Gibt die Seilspannung (0..1+) zurück.
export function ropeWeight(grounded, braced) {
  if (grounded && braced) return 0;
  if (grounded) return 0.3;
  return 1;
}

export function applyRope(body, partnerPos, partnerGrounded, partnerBraced, world, dt) {
  const L = PHYS.rope;
  const ax = body.pos[0], ay = body.pos[1] + 1.1, az = body.pos[2];
  const dx = partnerPos[0] - ax, dy = partnerPos[1] + 1.1 - ay, dz = partnerPos[2] - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= L || dist < 1e-4) return dist / L;
  const wMe = ropeWeight(body.grounded, body.braced);
  const wP = ropeWeight(partnerGrounded, partnerBraced);
  if (wMe + wP === 0) return dist / L;
  const share = wMe / (wMe + wP);
  let corr = (dist - L) * share;
  corr = Math.min(corr, 0.9); // Netzwerk-Ruckler nicht als Teleport durchreichen
  const nx = dx / dist, ny = dy / dist, nz = dz / dist;
  if (corr > 0) {
    const cols = world.all;
    if (moveAxis(body, 1, ny * corr, cols) && ny < 0) { body.grounded = true; }
    moveAxis(body, 0, nx * corr, cols);
    moveAxis(body, 2, nz * corr, cols);
    // Geschwindigkeitsanteil weg vom Partner entfernen (Seil ist straff)
    const vr = body.vel[0] * nx + body.vel[1] * ny + body.vel[2] * nz;
    if (vr < 0) {
      body.vel[0] -= nx * vr; body.vel[1] -= ny * vr; body.vel[2] -= nz * vr;
    }
    // Wer am Boden gezogen wird, rutscht – Gegenlenken bremst
    if (body.grounded && !body.braced && share > 0) {
      body.dragged = 0.25;
    }
  }
  return dist / L;
}
