// Simuliert Auf- und Absteigen an jedem beweglichen Element (Gabelstapler, Shuttle, Kranhaken).
import { buildLevel } from '../client/src/level.js';
import { Colliders, createBody, stepBody, PHYS } from '../client/src/physics.js';

const level = buildLevel();
const dt = 1 / 120;
let fails = 0;

const center = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
const phaseU = (m, t) => ((((t / m.period) + m.phase) % 1) + 1) % 1;

// Läuft von der aktuellen Position zu Box "target" (Funktion, liefert aktuelle Box), springt an der Kante.
function hop(body, world, from, getTarget, t0) {
  let t = t0, jumped = false;
  for (let s = 0; s < 120 * 5; s++) {
    t += dt;
    world.update(t);
    const tb = getTarget();
    const tc = center(tb);
    let tx = tc[0] - body.pos[0], tz = tc[2] - body.pos[2];
    const l = Math.hypot(tx, tz);
    let ix, iz, jump = false;
    if (!jumped) {
      ix = tx / l; iz = tz / l;
      // springen, sobald der Fuß die Kante der Startbox erreicht
      const f = from();
      const out = Math.max(f.min[0] - (body.pos[0] - 0.3) , (body.pos[0] + 0.3) - f.max[0], f.min[2] - (body.pos[2] - 0.3), (body.pos[2] + 0.3) - f.max[2]);
      if (out > 0.1 && body.grounded) { jump = true; jumped = true; }
    } else {
      const k = Math.min(1, l * 0.8) / Math.max(l, 1e-6); ix = tx * k; iz = tz * k;
    }
    stepBody(body, { x: ix, z: iz, jump, brace: false }, world, dt);
    if (jumped && s > 10 && body.grounded) return { ok: body.ground === tb, t, on: body.ground };
  }
  return { ok: false, t, on: null };
}

level.movers.forEach((m, k) => {
  const world = new Colliders(level);
  const idx = level.path.findIndex((p) => p.mover === m);
  const prev = level.path[idx - 1].box, next = level.path[idx + 1].box;
  const mb = world.moverBoxes[k];
  // Zeit finden, zu der der Mover gerade am Start ankommt (u ≈ 0.66 → fährt zurück; warten bis u=0)
  let t = 1000;
  while (phaseU(m, t) > 0.01) t += 0.005;
  world.update(t - dt);
  const body = createBody(center(prev));
  body.grounded = true;
  // Startbox Mitte → schon etwas Richtung Kante, damit der Absprung in die Haltezeit fällt
  let r = hop(body, world, () => prev, () => mb, t);
  if (!r.ok) { fails++; console.log(`✗ Mover ${k} (${m.kind}): Aufsprung misslungen, gelandet auf ${r.on ? r.on.mat : 'nichts'}`); return; }
  t = r.t;
  // mitfahren bis Ende der Fahrt (u in Haltephase 0.5–0.65)
  while (!(phaseU(m, t) > 0.5 && phaseU(m, t) < 0.52)) {
    t += dt; world.update(t);
    stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt);
    if (!body.grounded || body.ground !== mb) {
      fails++; console.log(`✗ Mover ${k} (${m.kind}): während der Fahrt heruntergefallen (y=${body.pos[1].toFixed(2)})`); return;
    }
  }
  r = hop(body, world, () => mb, () => next, t);
  if (!r.ok) { fails++; console.log(`✗ Mover ${k} (${m.kind}): Absprung misslungen, gelandet auf ${r.on ? r.on.mat : 'nichts'}`); return; }
  console.log(`✓ Mover ${k} (${m.kind})`);
});
process.exit(fails ? 1 : 0);
