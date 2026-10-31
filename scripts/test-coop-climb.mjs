// Koop-Klettern: Räuberleiter (Sprung von den Händen eines festhaltenden Mitspielers)
// und Hochziehen (oben hält jemand fest und greift zu). Prüft mit der echten Physik,
// welche Wandhöhen allein, mit Räuberleiter, mit Hochziehen und mit beidem gehen.
import { Colliders, createBody, stepBody } from '../client/src/physics.js';

export function climbs(H, { boost = false, pull = false } = {}) {
  const level = { statics: [{ min: [-20, -1, -20], max: [20, 0, 20], mat: 'concrete' }, { min: [1, 0, -3], max: [4, H, 3], mat: 'concrete' }], movers: [], hooks: [], ladders: [], zones: [], hazards: [], plates: [] };
  const w = new Colliders(level); w.update(0);
  const b = createBody([-0.6, 0, 0]); b.grounded = true; b.ground = level.statics[0];
  if (boost) w.mates.push({ pos: [0.4, 0, 0], braced: true, grounded: true });
  if (pull) w.mates.push({ pos: [1.4, H, 0], braced: true, grounded: true });
  let jumped = false;
  for (let s = 0; s < 600; s++) {
    let jump = false;
    if (!jumped && b.pos[0] > 0.3) { jump = true; jumped = true; }
    if (b.hang) jump = s % 2 === 0;
    stepBody(b, { x: 1, z: 0, jump, brace: false }, w, 1 / 120);
    if (b.grounded && b.pos[1] > H - 0.1) return true;
  }
  return false;
}
const reach = (o) => { let m = 0; for (let H = 2; H < 7; H += 0.05) if (climbs(H, o)) m = H; return m; };
export const REACH = { solo: reach({}), boost: reach({ boost: true }), pull: reach({ pull: true }), both: reach({ boost: true, pull: true }) };

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Koop-Klettern: allein ${REACH.solo.toFixed(2)} m, Räuberleiter ${REACH.boost.toFixed(2)} m, Hochziehen ${REACH.pull.toFixed(2)} m, beides ${REACH.both.toFixed(2)} m`);
  let bad = 0;
  const want = (ok, msg) => { if (!ok) { bad++; console.log('✗ ' + msg); } };
  want(!climbs(4.3), 'Koop-Wand 4,3 m geht nicht allein');
  want(climbs(4.3, { boost: true }), 'Koop-Wand 4,3 m mit Räuberleiter');
  want(climbs(4.3, { pull: true }), 'Koop-Wand 4,3 m mit Hochziehen');
  want(!climbs(4.8, { boost: true }) && !climbs(4.8, { pull: true }), 'Stapler-Regal 4,8 m nicht mit nur einer Hilfe');
  if (bad) process.exit(1);
  console.log('✓ Koop-Klettern ok');
}
