// Feuer und Wasser: Schwimmen, Tauchen, steigendes Wasser, Notduschen,
// Feuer (fest, im Takt, löschbar), Feuerlöscher und "nass = kurz feuerfest".
// Alles deterministisch aus Level-Daten und Serverzeit; gelöschte Feuer ergeben sich
// auf jedem Client aus den Positionen der Spieler mit Löscher (wie bei Druckplatten).
import { moverProgress, phaseOf } from './level.js';

export const EL = {
  float: 1.2,      // so tief liegen die Füße beim Treiben unter der Oberfläche
  enter: 0.95,     // ab dieser Tiefe (Füße unter der Oberfläche) wird geschwommen
  wade: 0.35,      // ab hier bremst das Wasser beim Gehen
  swimSpeed: 3.3,
  swimAccel: 10,
  diveSpeed: 2.8,  // Abtauchen mit Festhalten (Shift)
  diveAhead: 0.8,  // beim Tauchen etwas langsamer vorwärts
  buoy: 24,        // Auftrieb zur Schwimmlage
  damp: 6,
  leap: 7.8,       // Sprung aus dem Wasser
  splashSpeed: 3,  // ab dieser Fallgeschwindigkeit spritzt es
  wetTime: 8,      // so lange ist man nach dem Wasser feuerfest …
  wetBurn: 1,      // … Feuer trocknet zusätzlich (s pro s)
  extCharge: 7,    // Sekunden Löschschaum je Feuerlöscher
  extReach: [0.9, 1.8, 2.6], // Prüfpunkte vor dem Spieler
  extPad: 0.55,    // so weit darf der Schaum neben der Flamme liegen
  douse: 0.5,      // so lange muss man ein Feuer besprühen
  outTime: 9,      // so lange bleibt es aus …
  glow: 2,         // … die letzten Sekunden glimmt es (Warnung)
  pickR: 0.95,     // Feuerlöscher aus dem Schrank nehmen
};

// Wasser an Colliders hängen (aus dem Konstruktor aufgerufen)
export function initElements(world, level) {
  world.waters = (level.waters || []).filter((w) => !w.shower);
  world.showers = (level.waters || []).filter((w) => w.shower);
  for (const w of world.waters) w.surf = w.max[1];
  world.extinguishers = level.extinguishers || [];
  world.fires = world.hazards.filter((z) => z.kind === 'fire' && z.ext);
  for (const z of world.fires) { z.outT = 0; z.douse = 0; }
}

// Wasserspiegel zum Zeitpunkt t (steigendes Wasser: halten – steigen – halten – fallen)
export function updateWaters(world, t) {
  for (const w of world.waters) {
    if (!w.rise) continue;
    w.surf = w.max[1] + w.rise.range * moverProgress(phaseOf(w.rise.period, w.rise.phase, t));
  }
  // Löschbare Feuer: aus, solange gelöscht (Simulation: alle Rätsel gelöst)
  for (const z of world.fires) {
    if (world.forceOpen || z.outT > 0) {
      z.active = false;
      z.warn = z.outT > 0 && z.outT < EL.glow;
    }
  }
}

// Wasser, in dem der Fußpunkt p steht (Oberfläche über den Füßen)
export function waterAt(world, p) {
  for (const w of world.waters) {
    if (p[0] > w.min[0] && p[0] < w.max[0] && p[2] > w.min[2] && p[2] < w.max[2] && p[1] < w.surf && p[1] > w.min[1] - 0.6) return w;
  }
  return null;
}
function showerAt(world, p) {
  for (const w of world.showers) {
    if (p[0] > w.min[0] && p[0] < w.max[0] && p[2] > w.min[2] && p[2] < w.max[2] && p[1] + 1.8 > w.min[1] && p[1] < w.max[1]) return w;
  }
  return null;
}

// Vor dem normalen Schritt: nass werden, Feuerlöscher nehmen.
// Gibt das Wasser zurück, wenn geschwommen werden soll.
export function preStep(body, world, dt) {
  body.splash = 0;
  body.gotExt = false;
  body.wet = Math.max(0, (body.wet || 0) - dt);
  body.leap = Math.max(0, (body.leap || 0) - dt);
  if (world.showers.length && showerAt(world, body.pos)) body.wet = EL.wetTime;
  // Feuerlöscher aus dem Schrank nehmen (nur wenn der eigene leer ist)
  if (!(body.ext > 0.3)) {
    for (const e of world.extinguishers) {
      if (Math.abs(body.pos[0] - e.pos[0]) < EL.pickR && Math.abs(body.pos[2] - e.pos[2]) < EL.pickR && body.pos[1] > e.pos[1] - 0.3 && body.pos[1] < e.pos[1] + 1.2) {
        body.ext = 1; body.gotExt = true; break;
      }
    }
  }
  if (!world.waters.length) { body.swim = null; body.wade = 0; return null; }
  const w = waterAt(world, body.pos);
  const depth = w ? w.surf - body.pos[1] : 0;
  body.wade = w ? depth : 0;
  if (w) body.wet = EL.wetTime;
  const wasSwim = body.swim;
  // Beim Hechtsprung aus dem Wasser nicht sofort wieder einfangen
  if (!w || depth < (wasSwim ? EL.enter - 0.15 : EL.enter) || (body.leap > 0 && body.vel[1] > 0)) { body.swim = null; return null; }
  if (!wasSwim && body.vel[1] < -EL.splashSpeed) { body.splash = -body.vel[1]; body.vel[1] *= 0.3; }
  body.swim = w;
  return w;
}

// Schwimmen: Auftrieb zur Oberfläche, Festhalten = tauchen, Sprung = aus dem Wasser hechten.
// h = { moveAxis, grabLedge } aus physics.js (vermeidet Kreis-Importe)
export function stepSwim(body, input, world, cols, dt, w, h) {
  body.grounded = false; body.ground = null; body.coyote = 0;
  body.braced = false;
  const dive = !!input.brace;
  body.diving = dive;
  const depth = w.surf - body.pos[1];
  // Waagerecht: gemächlich schwimmen, Strömung treibt ab
  const sp = EL.swimSpeed * (dive ? EL.diveAhead : 1);
  let wantX = input.x * sp, wantZ = input.z * sp;
  if (w.current) { wantX += w.current[0]; wantZ += w.current[2]; }
  const dvx = wantX - body.vel[0], dvz = wantZ - body.vel[2];
  const dl = Math.hypot(dvx, dvz);
  if (dl > 0) { const k = Math.min(1, EL.swimAccel * dt / dl); body.vel[0] += dvx * k; body.vel[2] += dvz * k; }
  if (input.x || input.z) body.yaw = Math.atan2(input.x, input.z);
  // Senkrecht
  if (dive) body.vel[1] += (-EL.diveSpeed - body.vel[1]) * Math.min(1, 5 * dt);
  else {
    const err = (w.surf - EL.float) - body.pos[1];
    body.vel[1] += err * EL.buoy * dt;
    body.vel[1] *= Math.exp(-EL.damp * dt);
    if (body.vel[1] > 4.5) body.vel[1] = 4.5;
  }
  if (w.rise) body.vel[1] = Math.max(body.vel[1], -6);
  // Hechtsprung an der Oberfläche
  if (body.jumpBuf > 0 && !dive && depth < EL.float + 0.3) {
    body.vel[1] = EL.leap;
    body.jumpBuf = 0; body.jumped = true; body.leap = 0.4;
    body.swim = null;
  }
  const hy = h.moveAxis(body, 1, body.vel[1] * dt, cols);
  if (hy) body.vel[1] = 0;
  const hx = h.moveAxis(body, 0, body.vel[0] * dt, cols);
  if (hx) body.vel[0] = 0;
  const hz = h.moveAxis(body, 2, body.vel[2] * dt, cols);
  if (hz) body.vel[2] = 0;
  // Am Beckenrand oder Ausstieg festhalten (wie Kante greifen)
  if (!dive) h.grabLedge(body, input, world, hx, hz);
  body.justLanded = false;
  body.inFan = false;
}

// Feuer beim Berühren: nass = feuerfest (es zischt), sonst Rückstoß wie beim Laser.
// Gibt true zurück, wenn das Feuer nichts anrichtet.
export function fireProof(body, dt) {
  if (!(body.wet > 0)) return false;
  body.wet = Math.max(0, body.wet - EL.wetBurn * dt);
  body.steam = true;
  return true;
}

// Feuerlöscher: sprüht automatisch, sobald ein löschbares Feuer vor einem liegt.
// sprayers: [{ pos, yaw, ext }] – lokale Körper direkt, Mitspieler als Stellvertreter.
// Verbraucht die Ladung (ext) der Sprühenden. Setzt s.spray = Feuer oder null.
export function updateFires(world, sprayers, dt) {
  for (const z of world.fires) {
    if (z.outT > 0) z.outT = Math.max(0, z.outT - dt);
    z.douse = Math.max(0, z.douse - dt * 0.5);
    z.justOut = false;
  }
  for (const s of sprayers) {
    s.spray = null;
    if (!(s.ext > 0)) continue;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const y = s.pos[1] + 0.9;
    let hit = null;
    for (const d of EL.extReach) {
      const x = s.pos[0] + fx * d, zz = s.pos[2] + fz * d;
      for (const z of world.fires) {
        if (z.outT > 0 || world.forceOpen) continue;
        const b = z.cur, P = EL.extPad;
        if (x > b.min[0] - P && x < b.max[0] + P && zz > b.min[2] - P && zz < b.max[2] + P && y > b.min[1] - 1.2 && y < b.max[1] + 0.5) { hit = z; break; }
      }
      if (hit) break;
    }
    if (!hit) continue;
    s.spray = hit;
    s.ext = Math.max(0, s.ext - dt / EL.extCharge);
    hit.douse += dt * 1.5; // gegen das langsame Abklingen oben
    if (hit.douse >= EL.douse) { hit.outT = EL.outTime; hit.douse = 0; hit.justOut = true; }
  }
}
