// Windböen müssen spürbar abtreiben: am Boden, in der Luft, und Festhalten (Shift) schützt.
// Danach: in jeder Windzone des Levels treibt eine volle Böe einen stehenden Spieler ab.
import { buildLevel } from '../client/src/level.js';
import { Colliders, createBody, stepBody } from '../client/src/physics.js';

const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fails++; };

// Zeit mit voller Böe (sin = 1) für eine Zone
const peak = (z) => (z.gust ? (0.25 - z.gust.phase + 10) * z.gust.period : 0);

// Kleine Testwelt: großer Boden, eine Windzone mit 7 m/s² nach +x
const zone = { min: [-20, 0, -20], max: [20, 6, 20], push: [7, 0, 0], gust: { period: 6, phase: 0.2 } };
const flat = { statics: [{ min: [-30, -1, -30], max: [30, 0, 30], mat: 'concrete' }], movers: [], zones: [zone] };
function drift(o) {
  const w = new Colliders(flat);
  let t = peak(zone) - 0.5;
  w.update(t);
  const b = createBody([0, o.air ? 3 : 0, 0]);
  if (!o.air) { b.grounded = true; b.ground = flat.statics[0]; }
  for (let s = 0; s < 120; s++) {
    t += dt; w.update(t);
    if (o.air) { b.pos[1] = 3; b.vel[1] = 0; } // schwebend halten, nur Seitendrift messen
    stepBody(b, { x: 0, z: 0, jump: false, brace: !!o.brace }, w, dt);
  }
  return b.pos[0];
}
const g = drift({}), a = drift({ air: true }), br = drift({ brace: true });
check(g > 1.2, `Böe am Boden treibt in 1 s ab: ${g.toFixed(2)} m`);
check(a > 1.8, `Böe in der Luft treibt in 1 s ab: ${a.toFixed(2)} m`);
check(Math.abs(br) < 0.05, `Festhalten (Shift) hält gegen die Böe: ${br.toFixed(2)} m`);

// Gegen den Wind laufen geht noch, nur langsamer
{
  const w = new Colliders(flat);
  let t = peak(zone) - 0.5; w.update(t);
  const b = createBody([0, 0, 0]); b.grounded = true; b.ground = flat.statics[0];
  for (let s = 0; s < 120; s++) { t += dt; w.update(t); stepBody(b, { x: -1, z: 0, jump: false, brace: false }, w, dt); }
  check(b.pos[0] < -1.5, `gegen die Böe laufen kommt voran: ${b.pos[0].toFixed(2)} m`);
}

// Alle Windzonen im Level
const level = buildLevel();
const world = new Colliders(level);
world.forceOpen = true; world.updatePlates([], 0);
let n = 0, ok = 0;
for (const z of level.zones) {
  if (!z.push) continue;
  // eine Plattform im Wind suchen (Oberkante in der Zone)
  const p = level.path.find((e) => e.kind === 'static' && !e.box.ramp && !e.box.round && (() => {
    const c = [(e.box.min[0] + e.box.max[0]) / 2, e.box.max[1], (e.box.min[2] + e.box.max[2]) / 2];
    return world.zoneAt(c, true) === z;
  })());
  if (!p) continue;
  n++;
  let t = peak(z) - 0.3;
  world.t = null; world.update(t);
  const c = [(p.box.min[0] + p.box.max[0]) / 2, p.box.max[1], (p.box.min[2] + p.box.max[2]) / 2];
  const b = createBody(c); b.grounded = true; b.ground = p.box;
  for (let s = 0; s < 60; s++) { t += dt; world.update(t); stepBody(b, { x: 0, z: 0, jump: false, brace: false }, world, dt); }
  const d = (b.pos[0] - c[0]) * Math.sign(z.push[0] || 0) + (b.pos[2] - c[2]) * Math.sign(z.push[2] || 0);
  if (d > 0.4) ok++; else console.log(`  Windzone bei y=${z.min[1].toFixed(0)} schiebt kaum: ${d.toFixed(2)} m`);
}
check(n > 0 && ok === n, `Windzonen im Level schieben: ${ok}/${n}`);
process.exit(fails ? 1 : 0);
