// Koop-Klettern: Räuberleiter (Sprung von den Händen eines festhaltenden Mitspielers)
// und Hochziehen (oben hält jemand fest und greift zu). Prüft mit der echten Physik,
// welche Wandhöhen allein, mit Räuberleiter, mit Hochziehen und mit beidem gehen.
import { Colliders, createBody, stepBody, applyRope, PHYS } from '../client/src/physics.js';

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
// Am Seil hochziehen: oben hält einer fest und läuft rückwärts von der Kante weg.
// Gibt die Zeit zurück, bis der Gezogene oben steht (oder null).
// dangle: der Gezogene hängt frei unter der Kante (kein Boden darunter).
// anchor: der Untere hält selbst fest – dann geht es nicht weiter.
export function haul(H, { dangle = false, anchor = false, brace = true, seconds = 10 } = {}) {
  const statics = [{ min: [1, -30, -3], max: [8, H, 3], mat: 'concrete' }];
  if (!dangle) statics.push({ min: [-20, -1, -20], max: [1, 0, 20], mat: 'concrete' });
  const level = { statics, movers: [], hooks: [], ladders: [], zones: [], hazards: [], plates: [] };
  const w = new Colliders(level); w.update(0);
  const top = createBody([1.6, H, 0]); top.grounded = true; top.ground = statics[0];
  const low = createBody(dangle ? [0.65, H - 3.9, 0] : [0.5, 0, 0]);
  if (!dangle) { low.grounded = true; low.ground = statics[1]; }
  const dt = 1 / 120;
  let maxDist = 0;
  for (let s = 0; s < seconds * 120; s++) {
    const t = s * dt;
    const walk = t > 0.8 ? 1 : 0; // erst festhalten, dann zurücklaufen
    stepBody(top, { x: walk, z: 0, jump: false, brace }, w, dt);
    stepBody(low, { x: 0, z: 0, jump: false, brace: anchor }, w, dt);
    applyRope(top, low.pos, low.grounded, low.braced, w, dt);
    applyRope(low, top.pos, top.grounded, top.braced, w, dt);
    maxDist = Math.max(maxDist, Math.hypot(top.pos[0] - low.pos[0], top.pos[1] - low.pos[1], top.pos[2] - low.pos[2]));
    if (low.grounded && low.pos[1] > H - 0.05) return { t, maxDist, top };
    if (top.pos[1] < H - 0.5) return { fell: true, t, maxDist };
  }
  return { t: null, maxDist, low, top };
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
  for (const H of [3, 4.3]) {
    const r = haul(H);
    console.log(`Hochziehen am Seil, Wand ${H} m: ${r.t ? r.t.toFixed(2) + ' s' : 'geht nicht'}`);
    want(r.t && r.t < 6, `Am Seil hochziehen über ${H} m`);
  }
  for (const H of [5, 8]) {
    const d = haul(H, { dangle: true });
    console.log(`Frei hängend hochziehen (${H} m): ${d.t ? d.t.toFixed(2) + ' s' : 'geht nicht'}`);
    want(d.t && d.t < 6, `Frei hängenden Partner hochziehen (${H} m)`);
  }
  const a = haul(4.3, { anchor: true, seconds: 4 });
  want(!a.t && a.maxDist < PHYS.rope + 0.3, `Gegen einen festhaltenden Partner kommt man nicht weg (${a.maxDist.toFixed(2)} m)`);
  const n = haul(4.3, { brace: false, seconds: 4 });
  want(!n.t, 'Ohne Festhalten zieht man niemanden hoch');
  if (bad) process.exit(1);
  console.log('✓ Koop-Klettern ok');
}
