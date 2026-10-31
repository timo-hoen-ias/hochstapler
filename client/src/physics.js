// Einfache, deterministische Kletter-Physik mit achsenparallelen Boxen.
import { moverOffset, blinkState } from './level.js';

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
  iceAccel: 9,
  bounce: 15.5,
  fanMax: 6.5,
  // Greifen und Klettern
  reach: 1.95,      // Hände über dem Fußpunkt beim Hängen
  ledgeMin: 1.15,   // Kante greifbar, wenn sie so hoch über den Füßen liegt …
  ledgeMax: 2.15,   // … bis hierhin
  hookGrab: 1.0,    // Greifradius am Kranhaken (waagerecht, um Haken und Kette)
  hookGrabLow: 0.9, // so weit darf die Hand unter dem Haken sein …
  hookGrabHigh: 1.6, // … und so weit darüber (an der Kette greifen)
  hookAssist: 2.4,  // in diesem Umkreis lenkt der Sprung sanft zum Haken
  hookAssistAccel: 12,
  hookPump: 9,      // Schwungkraft am Haken
  hookJump: 5.5,    // Absprung vom Haken
  windGround: 0.4,  // Wind: Abdrift (m/s je Einheit Windstärke) am Boden …
  windAir: 0.6,     // … und in der Luft
  ladderSpeed: 3.4,
  slideAccel: 15,
  slideMax: 12,
  stepUp: 0.35,     // Schrägen und Rohre: so viel geht man ohne Springen hoch
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Oberkante einer Box an der Stelle (x, z). Schrägen und Rohre sind nicht flach.
export function topAt(b, x, z) {
  if (b.ramp) {
    const r = b.ramp;
    const lo = b.min[r.axis], hi = b.max[r.axis];
    let t = clamp01(((r.axis === 0 ? x : z) - lo) / (hi - lo));
    if (r.dir < 0) t = 1 - t;
    return r.y0 + (b.max[1] - r.y0) * t;
  }
  if (b.round) {
    const o = b.round;
    const d = (o.axis === 0 ? z : x) - o.cl;
    return o.cy + Math.sqrt(Math.max(0, o.r * o.r - d * d));
  }
  return b.max[1];
}
// Seitlicher Abstand zur Rohrachse
function roundOffset(b, x, z) { return (b.round.axis === 0 ? z : x) - b.round.cl; }

const EPS = 1e-4;

const CELL = 4;

export class Colliders {
  constructor(level) {
    this.level = level;
    this.statics = level.statics;
    this.moverBoxes = level.movers.map((m) => ({
      min: [...m.base.min], max: [...m.base.max], mat: m.mat, mover: m, d: [0, 0, 0], off: [0, 0, 0],
    }));
    this.blinks = level.statics.filter((s) => s.blink);
    this.zones = level.zones || [];
    this.hooks = level.hooks || [];
    this.ladders = level.ladders || [];
    for (const h of this.hooks) h.cur = [...h.pivot];
    // Gefahren (Laser, Stacheln), Druckplatten und Rolltore
    this.hazards = level.hazards || [];
    for (const z of this.hazards) { z.cur = { min: [...z.min], max: [...z.max] }; z.active = true; z.warn = false; }
    this.plates = level.plates || [];
    for (const pl of this.plates) { pl.down = false; pl.hold = 0; pl.active = false; }
    this.gates = level.statics.filter((b) => b.gate);
    this.forceOpen = false; // Simulation: alle Rätsel gelöst
    this.big = level.statics.filter((s) => s.big);
    this.all = [...this.statics, ...this.moverBoxes];
    // Raumraster für statische Teile (Breitphase)
    this.grid = new Map();
    for (const b of this.statics) {
      if (b.big) continue;
      for (let x = Math.floor(b.min[0] / CELL); x <= Math.floor(b.max[0] / CELL); x++)
        for (let y = Math.floor(b.min[1] / CELL); y <= Math.floor(b.max[1] / CELL); y++)
          for (let z = Math.floor(b.min[2] / CELL); z <= Math.floor(b.max[2] / CELL); z++) {
            const k = x + ',' + y + ',' + z;
            let list = this.grid.get(k);
            if (!list) this.grid.set(k, (list = []));
            list.push(b);
          }
    }
    this.out = [];
    this.stamp = 0;
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
    for (const b of this.blinks) {
      b.state = blinkState(b, t);
      b.hidden = b.state === 0;
    }
    for (const z of this.hazards) {
      let on = true;
      z.warn = false;
      if (z.timer) {
        const u = (((t / z.timer.period) + z.timer.phase) % 1 + 1) % 1;
        on = u < z.timer.on;
        z.warn = !on && u > 1 - 0.18; // kurz vor dem Einschalten warnen
        z.phaseU = u;
      }
      if (z.plate !== undefined) on = on && !(this.forceOpen || this.plates[z.plate]?.active || (z.plate2 !== undefined && this.plates[z.plate2]?.active));
      z.active = on;
      if (z.motion) {
        moverOffset(z.motion, t, this.tmp);
        for (let i = 0; i < 3; i++) { z.cur.min[i] = z.min[i] + this.tmp[i]; z.cur.max[i] = z.max[i] + this.tmp[i]; }
      }
    }
    for (const h of this.hooks) {
      if (!h.motion) continue;
      moverOffset(h.motion, t, this.tmp);
      for (let i = 0; i < 3; i++) h.cur[i] = h.pivot[i] + this.tmp[i];
    }
    this.t = t;
  }

  // Alle Kollisionsboxen in der Nähe eines Punktes (Radius r)
  near(p, r = 3, ry = r + 1) {
    const out = this.out;
    out.length = 0;
    const st = ++this.stamp;
    for (const b of this.big) out.push(b);
    const x0 = Math.floor((p[0] - r) / CELL), x1 = Math.floor((p[0] + r) / CELL);
    const y0 = Math.floor((p[1] - ry) / CELL), y1 = Math.floor((p[1] + ry + 2) / CELL);
    const z0 = Math.floor((p[2] - r) / CELL), z1 = Math.floor((p[2] + r) / CELL);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const list = this.grid.get(x + ',' + y + ',' + z);
          if (!list) continue;
          for (const b of list) if (b._st !== st) { b._st = st; out.push(b); }
        }
    for (const b of this.moverBoxes) {
      if (b.max[0] < p[0] - r - 1 || b.min[0] > p[0] + r + 1 || b.max[2] < p[2] - r - 1 || b.min[2] > p[2] + r + 1) continue;
      if (b.max[1] < p[1] - ry - 1 || b.min[1] > p[1] + ry + 3) continue;
      out.push(b);
    }
    return out;
  }

  zoneAt(p, wind = false) {
    const y = p[1] + 0.5;
    for (const z of this.zones) {
      if (!!z.push !== wind) continue;
      if (p[0] > z.min[0] && p[0] < z.max[0] && p[2] > z.min[2] && p[2] < z.max[2] && y > z.min[1] && y < z.max[1]) return z;
    }
    return null;
  }

  // Stärke einer Windböe (0..1) – deterministisch über die Serverzeit
  gust(z) {
    const g = z.gust;
    if (!g) return 1;
    const u = (((this.t || 0) / g.period + g.phase) % 1 + 1) % 1;
    return 0.25 + 0.75 * Math.max(0, Math.sin(u * Math.PI * 2));
  }

  // Druckplatten: gedrückt, solange jemand darauf steht. latch = Nachlaufzeit
  // (allein länger, damit Rätsel auch solo lösbar sind). points = Fußpunkte aller Spieler.
  updatePlates(points, dt, latch = 1.2) {
    for (const pl of this.plates) {
      const down = points.some((p) => p[0] > pl.min[0] && p[0] < pl.max[0] && p[2] > pl.min[2] && p[2] < pl.max[2] && p[1] > pl.min[1] - 0.15 && p[1] < pl.min[1] + 0.4);
      pl.down = down;
      pl.hold = down ? latch : Math.max(0, pl.hold - dt);
      pl.active = this.forceOpen || down || pl.hold > 0;
    }
    for (const g of this.gates) {
      const open = this.forceOpen || g.gate.some((i) => this.plates[i]?.active);
      if (open) { g.hidden = true; g.openT = Math.min(1, (g.openT || 0) + dt * 2.5); continue; }
      // Nicht auf jemanden herunterfahren
      const blocked = points.some((p) => p[0] > g.min[0] - 0.3 && p[0] < g.max[0] + 0.3 && p[2] > g.min[2] - 0.3 && p[2] < g.max[2] + 0.3 && p[1] + 1.8 > g.min[1] && p[1] < g.max[1]);
      if (!blocked) { g.hidden = false; g.openT = Math.max(0, (g.openT || 0) - dt * 2.5); }
    }
  }

  // Nächster Haken, den die Hand erwischt: Zylinder um Haken und unteres Kettenstück
  hookNear(hand, r, low = PHYS.hookGrabLow, high = PHYS.hookGrabHigh) {
    let best = null, bd = Infinity;
    for (const h of this.hooks) {
      const g = h.cur, gy = g[1] - h.len;
      const dv = hand[1] - gy;
      if (dv < -low || dv > high) continue;
      const dh = Math.hypot(hand[0] - g[0], hand[2] - g[2]);
      if (dh > r) continue;
      const d = dh + Math.abs(dv) * 0.3;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  ladderAt(p) {
    const y = p[1] + 0.4;
    for (const l of this.ladders) {
      if (p[0] > l.min[0] && p[0] < l.max[0] && p[2] > l.min[2] && p[2] < l.max[2] && y > l.min[1] && p[1] < l.max[1]) return l;
    }
    return null;
  }
}

export function createBody(pos) {
  return {
    pos: [...pos], vel: [0, 0, 0], grounded: false, ground: null,
    coyote: 0, jumpBuf: 0, braced: false, yaw: 0, lastJump: -1,
    hang: null, hook: null, ladder: null, gripCool: 0,
  };
}

// Alle Griffe lösen (z. B. beim Zurücksetzen auf einen Zwischenstopp)
export function releaseGrips(body) {
  body.hang = body.hook = body.ladder = null;
  body.gripCool = 0.3;
}

function overlaps(p, h, b) {
  if (b.hidden) return false;
  let top = b.max[1];
  if (b.ramp || b.round) {
    if (b.round && Math.abs(roundOffset(b, p[0], p[2])) > b.round.r + 0.22) return false;
    top = topAt(b, p[0], p[2]);
  }
  return p[0] - h[0] < b.max[0] - EPS && p[0] + h[0] > b.min[0] + EPS &&
    p[1] - h[1] < top - EPS && p[1] + h[1] > b.min[1] + EPS &&
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
    if (axis === 1) {
      if (amount > 0) c[1] = b.min[1] - h[1] - EPS;
      else c[1] = (b.ramp || b.round ? topAt(b, c[0], c[2]) : b.max[1]) + h[1] + EPS;
      hit = b;
      continue;
    }
    // Schrägen und Rohre: kleine Stufen hinaufgehen statt anstoßen
    if (b.ramp || b.round) {
      const top = topAt(b, c[0], c[2]);
      if (top - (c[1] - h[1]) <= PHYS.stepUp) { c[1] = top + h[1] + EPS; continue; }
    }
    if (amount > 0) c[axis] = b.min[axis] - h[axis] - EPS;
    else c[axis] = b.max[axis] + h[axis] + EPS;
    hit = b;
  }
  body.pos[0] = c[0]; body.pos[1] = c[1] - h[1]; body.pos[2] = c[2];
  return hit;
}

// Schiebt den Körper aus beweglichen Boxen heraus (wenn eine Plattform in ihn hineinfährt)
function depenetrate(body, cols) {
  const h = PHYS.half;
  const c = centerOf(body);
  for (const b of cols) {
    if (!b.mover) continue;
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

// Prüft, ob ein Spieler (Fußpunkt p) dort frei stehen kann
function freeAt(p, cols) {
  const c = [p[0], p[1] + PHYS.half[1] + 0.02, p[2]];
  for (const b of cols) if (overlaps(c, PHYS.half, b)) return false;
  return true;
}

// An einer Kante hängen: festhalten, Sprung = hochziehen, weg drücken = loslassen
function stepHang(body, input, cols) {
  const g = body.hang;
  body.vel[0] = body.vel[1] = body.vel[2] = 0;
  body.braced = true;
  const n = g.n; // Richtung zur Wand
  const push = input.x * n[0] + input.z * n[1];
  if (input.jump || body.jumpBuf > 0) {
    const up = [body.pos[0] + n[0] * 0.55, g.top + EPS, body.pos[2] + n[1] * 0.55];
    body.hang = null; body.jumpBuf = 0; body.braced = false;
    if (freeAt(up, cols)) {
      body.pos = up; body.grounded = true; body.ground = g.box; body.climbed = true;
    } else { body.vel[1] = PHYS.jump * 0.6; body.gripCool = 0.3; }
    return;
  }
  if (push < -0.5) { body.hang = null; body.braced = false; body.gripCool = 0.4; }
}

// Am Kranhaken: Pendel um den Aufhängepunkt, Sprung = loslassen mit Schwung
function stepHook(body, input, world, dt) {
  const hk = body.hook.h, L = hk.len;
  const P = hk.cur;
  body.braced = true;
  if (input.jump || body.jumpBuf > 0) {
    body.hook = null; body.braced = false; body.jumpBuf = 0;
    body.vel[1] = Math.max(body.vel[1], 0) + PHYS.hookJump;
    body.vel[0] *= 1.15; body.vel[2] *= 1.15;
    body.gripCool = 0.45;
    body.jumped = true;
    return;
  }
  const H = [body.pos[0], body.pos[1] + PHYS.reach, body.pos[2]];
  // Aufhängepunkt bewegt sich mit (Laufkatze)
  const prev = body.hook.last || P;
  for (let i = 0; i < 3; i++) H[i] += P[i] - prev[i];
  body.hook.last = [...P];
  body.vel[1] -= PHYS.gravity * dt;
  body.vel[0] += input.x * PHYS.hookPump * dt;
  body.vel[2] += input.z * PHYS.hookPump * dt;
  const damp = Math.exp(-0.25 * dt);
  for (let i = 0; i < 3; i++) { body.vel[i] *= damp; H[i] += body.vel[i] * dt; }
  const d = [H[0] - P[0], H[1] - P[1], H[2] - P[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const nrm = [d[0] / l, d[1] / l, d[2] / l];
  for (let i = 0; i < 3; i++) H[i] = P[i] + nrm[i] * L;
  const vr = body.vel[0] * nrm[0] + body.vel[1] * nrm[1] + body.vel[2] * nrm[2];
  if (vr > 0) for (let i = 0; i < 3; i++) body.vel[i] -= nrm[i] * vr;
  body.pos[0] = H[0]; body.pos[1] = H[1] - PHYS.reach; body.pos[2] = H[2];
  if (input.x || input.z) body.yaw = Math.atan2(input.x, input.z);
}

// Auf der Leiter: zur Wand drücken = hoch, weg = loslassen, Sprung = abspringen
function stepLadder(body, input, cols, dt) {
  const l = body.ladder;
  const n = l.face; // zeigt von der Wand weg
  body.braced = true;
  body.vel[0] = body.vel[2] = 0; body.vel[1] = 0;
  body.yaw = Math.atan2(-n[0], -n[1]);
  if (input.jump || body.jumpBuf > 0) {
    body.ladder = null; body.braced = false; body.jumpBuf = 0;
    body.vel[0] = n[0] * 4; body.vel[2] = n[1] * 4; body.vel[1] = PHYS.jump * 0.75;
    body.gripCool = 0.4; body.jumped = true;
    return;
  }
  const toward = -(input.x * n[0] + input.z * n[1]);
  if (toward < -0.5) { body.ladder = null; body.braced = false; body.gripCool = 0.4; return; }
  if (toward > 0.3) {
    body.pos[1] += PHYS.ladderSpeed * dt;
    if (body.pos[1] >= l.max[1] - 0.05) {
      const up = [body.pos[0] - n[0] * 0.75, l.max[1] + EPS, body.pos[2] - n[1] * 0.75];
      body.ladder = null; body.braced = false;
      if (freeAt(up, cols)) { body.pos = up; body.grounded = true; body.climbed = true; }
      else body.pos[1] = l.max[1] - 0.05;
    }
  } else if (toward < -0.1) body.pos[1] = Math.max(l.min[1], body.pos[1] - PHYS.ladderSpeed * dt);
}

// input: { x, z } gewünschte Laufrichtung (Welt, Länge ≤ 1), jump (gedrückt-Flanke), brace (gehalten)
// Laser und Stacheln: Stromschlag mit Rückstoß, Griffe lösen sich – man fällt
function checkHazards(body, world, dt) {
  body.zapped = null;
  if (body.hurt > 0) { body.hurt -= dt; return; }
  const p = body.pos, h = PHYS.half;
  for (const z of world.hazards) {
    if (!z.active) continue;
    const b = z.cur;
    if (p[0] + h[0] < b.min[0] || p[0] - h[0] > b.max[0] || p[2] + h[2] < b.min[2] || p[2] - h[2] > b.max[2]) continue;
    if (p[1] + 1.8 < b.min[1] || p[1] > b.max[1]) continue;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    // weg von der Gefahr, quer zur dünnen Seite eines Lasers
    let dx = p[0] - cx, dz = p[2] - cz;
    if (z.kind === 'laser') { if (b.max[0] - b.min[0] < b.max[2] - b.min[2]) dz = 0; else dx = 0; }
    if (Math.hypot(dx, dz) < 1e-3) { dx = -body.vel[0]; dz = -body.vel[2]; }
    const l = Math.hypot(dx, dz) || 1;
    releaseGrips(body);
    body.gripCool = 0.7;
    body.vel[0] = (dx / l) * 6; body.vel[2] = (dz / l) * 6; body.vel[1] = 6.5;
    body.grounded = false; body.ground = null; body.coyote = 0;
    body.hurt = 0.8;
    body.zapped = z.kind;
    return;
  }
}

export function stepBody(body, input, world, dt) {
  const cols = world.near(body.pos, 3);
  body.jumped = false;
  body.bounced = null;
  body.climbed = false;
  body.gripCool = Math.max(0, (body.gripCool || 0) - dt);
  if (input.jump) body.jumpBuf = PHYS.jumpBuffer;
  if (world.hazards.length) checkHazards(body, world, dt);

  // Festhalten an Kante, Haken oder Leiter
  if (body.hang || body.hook || body.ladder) {
    body.grounded = false; body.ground = null; body.coyote = 0;
    if (body.hang) stepHang(body, input, cols);
    else if (body.hook) stepHook(body, input, world, dt);
    else stepLadder(body, input, cols, dt);
    body.jumpBuf = Math.max(0, body.jumpBuf - dt);
    body.justLanded = body.climbed;
    body.inFan = false;
    return;
  }

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
  const g0 = body.grounded ? body.ground : null;
  const onIce = g0 && g0.ice;
  const onSlide = g0 && g0.ramp && g0.ramp.slide;
  const onRound = g0 && g0.round;
  let wantX = body.braced ? 0 : input.x * PHYS.speed;
  let wantZ = body.braced ? 0 : input.z * PHYS.speed;
  // Wind: Böen treiben den Spieler ab. Als Zielgeschwindigkeit eingerechnet, sonst hebt die
  // Laufsteuerung (70 m/s²) die Windkraft sofort wieder auf. Festhalten (Shift) schützt.
  const wind = world.zoneAt(body.pos, true);
  body.inWind = wind ? world.gust(wind) : 0;
  let windy = false;
  if (wind && !body.braced) {
    const f = body.inWind * (body.grounded ? PHYS.windGround : PHYS.windAir);
    wantX += wind.push[0] * f; wantZ += wind.push[2] * f;
    windy = body.inWind > 0.3;
  }
  // In der Luft Schwung behalten (Rutsche, Haken, Luftpolster): nur die Richtung lenken
  const hs = Math.hypot(body.vel[0], body.vel[2]);
  if (!body.grounded && hs > PHYS.speed && (input.x || input.z)) {
    const k = hs / PHYS.speed;
    const along = (input.x * body.vel[0] + input.z * body.vel[2]) / hs;
    if (along > 0) { wantX *= k; wantZ *= k; }
  }
  const accBase = body.grounded ? (onIce || onSlide ? PHYS.iceAccel : onRound ? PHYS.iceAccel * 2 : PHYS.groundAccel) : PHYS.airAccel;
  const acc = accBase * dt;
  const dvx = wantX - body.vel[0];
  const dvz = wantZ - body.vel[2];
  const dl = Math.hypot(dvx, dvz);
  if (dl > 0) {
    const k = Math.min(1, acc / dl);
    // In der Luft nur sanft abbremsen, damit Seilschwünge erhalten bleiben
    const idle = input.x === 0 && input.z === 0 && !body.braced;
    const slick = onIce || onSlide;
    const airKeep = idle && !windy && (!body.grounded || slick) ? (slick ? 0.05 : 0.15) : 1;
    body.vel[0] += dvx * k * airKeep;
    body.vel[2] += dvz * k * airKeep;
  }
  // Rutsche: zieht bergab
  if (onSlide && !body.braced) {
    const r = g0.ramp, s = -r.dir;
    const i = r.axis;
    body.vel[i] += s * PHYS.slideAccel * dt;
    if (Math.abs(body.vel[i]) > PHYS.slideMax) body.vel[i] = Math.sign(body.vel[i]) * PHYS.slideMax;
  }
  // Rohre und liegende Fässer: wer nicht mittig steht, rollt herunter
  if (onRound && !body.braced) {
    const d = roundOffset(g0, body.pos[0], body.pos[2]);
    const lat = g0.round.axis === 0 ? 2 : 0;
    body.vel[lat] += Math.sign(d) * Math.min(1, Math.abs(d) / g0.round.r) * 11 * dt;
  }
  if (input.x || input.z) body.yaw = Math.atan2(input.x, input.z);

  // Springen mit Coyote-Time und Eingabepuffer
  body.coyote = body.grounded ? PHYS.coyote : body.coyote - dt;
  if (!input.jump) body.jumpBuf -= dt;
  if (body.jumpBuf > 0 && body.coyote > 0 && !body.braced) {
    body.vel[1] = PHYS.jump;
    // Schwung der Plattform mitnehmen
    if (body.ground && body.ground.belt) { body.vel[0] += body.ground.belt[0] * 0.5; body.vel[2] += body.ground.belt[2] * 0.5; }
    body.jumpBuf = 0;
    body.coyote = 0;
    body.grounded = false;
    body.jumped = true;
  }

  // Lüfter: Aufwind
  const zone = world.zoneAt(body.pos);
  body.inFan = !!zone;
  if (zone && !body.braced) body.vel[1] = Math.min(body.vel[1] + zone.lift * dt, PHYS.fanMax);

  body.vel[1] = Math.max(body.vel[1] - PHYS.gravity * dt, -PHYS.maxFall);

  // Achsenweise bewegen: zuerst vertikal (großzügiges Landen auf Kanten)
  const wasGround = body.ground;
  body.grounded = false;
  body.ground = null;
  const hy = moveAxis(body, 1, body.vel[1] * dt, cols);
  if (hy) {
    const falling = body.vel[1] < 0;
    body.vel[1] = 0;
    if (falling) {
      body.grounded = true; body.ground = hy;
      // Luftpolster/Reifen federn – mit Festhalten (Shift) bleibt man stehen
      if (hy.bounce && !input.brace) {
        body.vel[1] = PHYS.bounce;
        body.grounded = false;
        body.bounced = hy;
      }
    }
  }
  const hx = moveAxis(body, 0, body.vel[0] * dt, cols);
  if (hx) body.vel[0] = 0;
  const hz = moveAxis(body, 2, body.vel[2] * dt, cols);
  if (hz) body.vel[2] = 0;

  // Bodenprüfung: knapp unter den Füßen (auf Schrägen und Rohren etwas tiefer, damit man haften bleibt)
  if (!body.grounded && body.vel[1] <= 0) {
    const sticky = wasGround && (wasGround.ramp || wasGround.round) && !body.jumped;
    const pd = sticky ? 0.4 : 0.03;
    const y0 = body.pos[1];
    const probe = moveAxis(body, 1, -pd, cols);
    if (probe && !(probe.bounce && !input.brace)) { body.grounded = true; body.ground = probe; }
    else body.pos[1] = y0;
  }

  // Kante greifen: in der Luft gegen eine Wand, deren Oberkante in Griffhöhe liegt
  if (!body.grounded && body.gripCool <= 0 && body.vel[1] < 2) {
    for (const [hit, ax] of [[hx, 0], [hz, 2]]) {
      if (!hit || hit.mover || hit.ramp || hit.round || hit.blink || hit.nogrip) continue;
      const rel = hit.max[1] - body.pos[1];
      if (rel < PHYS.ledgeMin || rel > PHYS.ledgeMax) continue;
      const s = (hit.min[ax] + hit.max[ax]) / 2 > body.pos[ax] ? 1 : -1;
      const n = ax === 0 ? [s, 0] : [0, s];
      if (input.x * n[0] + input.z * n[1] < 0.3) continue;
      const up = [body.pos[0] + n[0] * 0.55, hit.max[1] + EPS, body.pos[2] + n[1] * 0.55];
      if (!freeAt(up, world.near(up, 2))) continue;
      body.hang = { box: hit, n, top: hit.max[1] };
      body.pos[1] = hit.max[1] - PHYS.reach;
      body.vel[0] = body.vel[1] = body.vel[2] = 0;
      body.yaw = Math.atan2(n[0], n[1]);
      body.jumpBuf = 0;
      break;
    }
  }

  // Kranhaken greifen. Im Sprung lenkt eine sanfte Hilfe zum nahen Haken,
  // damit man ihn nicht knapp verfehlt; gegriffen wird an Haken und Kette.
  if (!body.grounded && !body.hang && body.gripCool <= 0 && world.hooks.length) {
    const hand = [body.pos[0], body.pos[1] + PHYS.reach, body.pos[2]];
    const hk = world.hookNear(hand, PHYS.hookGrab);
    if (hk) { body.hook = { h: hk, last: [...hk.cur] }; body.jumpBuf = 0; }
    else {
      const near = world.hookNear(hand, PHYS.hookAssist, 1.6, 2.4);
      if (near) {
        const g = near.cur;
        const lx = g[0] - hand[0], lz = g[2] - hand[2], l = Math.hypot(lx, lz) || 1;
        // nur helfen, wenn man ohnehin ungefähr auf den Haken zu fliegt
        const toward = (body.vel[0] * lx + body.vel[2] * lz) / l;
        if (toward > -0.5) {
          const a = PHYS.hookAssistAccel * dt * Math.min(1, l / 0.6);
          body.vel[0] += lx / l * a; body.vel[2] += lz / l * a;
        }
      }
    }
  }

  // Leiter: in der Leiterzone zur Wand drücken
  if (!body.hang && !body.hook && body.gripCool <= 0 && world.ladders.length) {
    const l = world.ladderAt(body.pos);
    if (l && -(input.x * l.face[0] + input.z * l.face[1]) > 0.3) {
      body.ladder = l; body.grounded = false; body.ground = null;
    }
  }

  depenetrate(body, cols);
  body.justLanded = body.grounded && !wasGround;
}

// Seil-Kopplung zu einem Partner. Gewichtung: festhalten = unbeweglich,
// am Boden = schwer, in der Luft = leicht. Gibt die Seilspannung (0..1+) zurück.
export function ropeWeight(grounded, braced) {
  // festhalten am Boden, an einer Kante, am Haken oder auf der Leiter = Anker
  if (braced) return 0;
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
    const cols = world.near(body.pos, 3);
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
