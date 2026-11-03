// Seil als Partikelkette: legt sich über Kanten und um Säulen, steckt nicht in Boxen,
// und das Hochziehen am Seil klappt auch mit Umlenkung über die Kante.
import { Colliders, createBody, stepBody, applyRope, PHYS } from '../client/src/physics.js';
import { RopeChain, ROPE } from '../client/src/rope.js';

const mk = (statics) => { const w = new Colliders({ statics, movers: [], hooks: [], ladders: [], zones: [], hazards: [], plates: [] }); w.update(0); return w; };
const att = (b) => [b.pos[0], b.pos[1] + PHYS.ropeAttach, b.pos[2]];
const dt = 1 / 120;
let bad = 0;
const want = (ok, msg) => { if (!ok) { bad++; console.log('✗ ' + msg); } };

// Wie tief steckt die Kette höchstens in einer Box?
function worstInside(rc, statics) {
  let worst = 0;
  for (const v of rc.p.slice(1, -1)) for (const b of statics) {
    if (v[0] <= b.min[0] || v[0] >= b.max[0] || v[1] <= b.min[1] || v[1] >= b.max[1] || v[2] <= b.min[2] || v[2] >= b.max[2]) continue;
    worst = Math.max(worst, Math.min(v[0] - b.min[0], b.max[0] - v[0], v[1] - b.min[1], b.max[1] - v[1], v[2] - b.min[2], b.max[2] - v[2]));
  }
  return worst;
}

// Wie scripts/test-coop-climb.mjs, aber mit Kette und Umlenkung
function haul(H, { dangle = false, reel = false, seconds = 10 } = {}) {
  const statics = [{ min: [1, -30, -3], max: [8, H, 3], mat: 'concrete' }];
  if (!dangle) statics.push({ min: [-20, -1, -20], max: [1, 0, 20], mat: 'concrete' });
  const w = mk(statics);
  const top = createBody([1.6, H, 0]); top.grounded = true; top.ground = statics[0];
  const low = createBody(dangle ? [0.65, H - 3.9, 0] : [0.5, 0, 0]);
  if (!dangle) { low.grounded = true; low.ground = statics[1]; }
  const rc = new RopeChain();
  let wrapped = 0, inside = 0;
  for (let s = 0; s < seconds * 120; s++) {
    const t = s * dt;
    const walk = t > 0.8 && !reel ? 1 : 0;
    stepBody(top, { x: walk, z: 0, jump: false, brace: true }, w, dt);
    stepBody(low, { x: 0, z: 0, jump: false, brace: false }, w, dt);
    rc.step(att(top), att(low), w, dt);
    if (rc.path.length) wrapped++;
    inside = Math.max(inside, worstInside(rc, statics));
    const wt = rc.wrapFor(0), wl = rc.wrapFor(1);
    applyRope(top, low.pos, low.grounded, low.braced, w, dt, wt);
    applyRope(low, top.pos, top.grounded, top.braced, w, dt, wl);
    if (low.grounded && low.pos[1] > H - 0.05) return { t, wrapped, inside, top };
    if (top.pos[1] < H - 0.5) return { fell: true, t, wrapped, inside };
  }
  return { t: null, wrapped, inside, top, low };
}

for (const H of [3, 4.3]) {
  const r = haul(H);
  console.log(`Seilkette: Hochziehen über ${H} m Wand ${r.t ? r.t.toFixed(2) + ' s' : 'geht nicht'}, umgelenkt in ${r.wrapped} Schritten, tiefstes Eindringen ${(r.inside * 100).toFixed(1)} cm`);
  want(r.t && r.t < 6, `Mit Seilkette über ${H} m hochziehen`);
  want(r.wrapped > 30, `Seil läuft über die Kante (${H} m)`);
  want(r.inside < 0.03, `Seil steckt nicht in der Wand (${H} m)`);
}
for (const H of [5, 8]) {
  const r = haul(H, { dangle: true });
  console.log(`Seilkette: frei hängend hochziehen (${H} m) ${r.t ? r.t.toFixed(2) + ' s' : 'geht nicht'}`);
  want(r.t && r.t < 6, `Mit Seilkette frei hängend hochziehen (${H} m)`);
  want(r.inside < 0.03, `Seil steckt nicht in der Wand (frei hängend ${H} m)`);
}
for (const [H, dangle] of [[4.3, false], [5, true]]) {
  const r = haul(H, { reel: true, dangle });
  console.log(`Seilkette: einholen ${dangle ? 'frei hängend' : 'Wand'} ${H} m ${r.t ? r.t.toFixed(2) + ' s' : 'geht nicht'}`);
  want(r.t && r.t < 6, `Mit Seilkette einholen (${H} m)`);
}

// Freies Feld: kein Umlenkpunkt, Seilweg = gerade Linie
{
  const w = mk([{ min: [-20, -1, -20], max: [20, 0, 20], mat: 'concrete' }]);
  const rc = new RopeChain();
  for (let s = 0; s < 240; s++) rc.step([0, 0.85, 0], [3, 0.85, 1], w, dt);
  want(rc.path.length === 0 && Math.abs(rc.len - Math.hypot(3, 1)) < 1e-6, 'Freies Feld: Seil gerade, kein Umlenkpunkt');
  const minY = Math.min(...rc.p.map((v) => v[1]));
  want(minY > -0.001, 'Durchhängendes Seil liegt auf dem Boden, nicht darin');
  console.log(`Seilkette: freies Feld, tiefster Punkt ${minY.toFixed(3)} m über dem Boden`);
}

// Säule: Seil wird um sie herumgezogen und hält den Läufer früher auf
function pillar(useWrap) {
  const statics = [{ min: [-20, -1, -20], max: [20, 0, 20], mat: 'concrete' }, { min: [0.5, 0, -0.5], max: [1.5, 4, 0.5], mat: 'concrete' }];
  const w = mk(statics);
  const a = createBody([-0.5, 0, 0]); a.grounded = true; a.ground = statics[0];
  const b = createBody([0.9, 0, 1.6]); b.grounded = true; b.ground = statics[0];
  const rc = new RopeChain();
  let inside = 0;
  for (let s = 0; s < 6 * 120; s++) {
    const t = s * dt;
    const inp = t < 1.2 ? { x: 1, z: 0 } : { x: 0.3, z: -1 };
    stepBody(a, { x: 0, z: 0, jump: false, brace: true }, w, dt);
    stepBody(b, { ...inp, jump: false, brace: false }, w, dt);
    rc.step(att(a), att(b), w, dt);
    inside = Math.max(inside, worstInside(rc, statics));
    applyRope(b, a.pos, a.grounded, a.braced, w, dt, useWrap ? rc.wrapFor(1) : null);
  }
  return { z: b.pos[2], x: b.pos[0], wraps: rc.path.length, len: rc.len, straight: Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]), inside };
}
{
  const free = pillar(false), wr = pillar(true);
  console.log(`Seilkette: Säule – ohne Umlenkung bis z=${free.z.toFixed(2)}, mit bis z=${wr.z.toFixed(2)} (Seilweg ${wr.len.toFixed(2)} m, gerade ${wr.straight.toFixed(2)} m, ${wr.wraps} Umlenkpunkte)`);
  want(wr.wraps > 0, 'Seil legt sich um die Säule');
  want(wr.len < PHYS.rope + 0.05, 'Umgelenktes Seil wird nicht überdehnt');
  want(wr.straight < free.straight - 0.3, 'Um die Säule gelegtes Seil hält früher auf');
  want(wr.inside < 0.03, 'Seil steckt nicht in der Säule');
}

// Teleport (Neustart): Kette wird neu angelegt, nicht quer durchs Level gezogen
{
  const w = mk([{ min: [-20, -1, -20], max: [20, 0, 20], mat: 'concrete' }]);
  const rc = new RopeChain();
  for (let s = 0; s < 60; s++) rc.step([0, 0.85, 0], [2, 0.85, 0], w, dt);
  rc.step([10, 5.85, 0], [12, 5.85, 0], w, dt);
  want(rc.age < 0.02 && rc.wrapFor(0) === null, 'Nach Teleport: neue Kette, erst gerade Linie');
}

// Laufzeit: eine Kette in einem vollen Level
{
  const statics = [{ min: [-20, -1, -20], max: [20, 0, 20], mat: 'concrete', big: true }];
  for (let i = 0; i < 400; i++) { const x = (i % 20) * 2 - 20, z = Math.floor(i / 20) * 2 - 20; statics.push({ min: [x, 0, z], max: [x + 0.8, 0.5 + (i % 5), z + 0.8], mat: 'concrete' }); }
  const w = mk(statics);
  const rc = new RopeChain();
  const t0 = performance.now();
  for (let s = 0; s < 1200; s++) rc.step([0.3, 0.85 + Math.sin(s / 50), 0.3], [3.5, 0.85, 1.2 + Math.sin(s / 80)], w, dt);
  const ms = (performance.now() - t0) / 1200;
  console.log(`Seilkette: ${(ms * 1000).toFixed(0)} µs je Schritt (${ROPE.segs} Glieder)`);
  want(ms < 0.25, 'Seilkette ist schnell genug (< 0,25 ms je Schritt)');
}

if (bad) { console.log(`${bad} Seil-Prüfung(en) fehlgeschlagen`); process.exit(1); }
console.log('Seilkette: alle Prüfungen bestanden');
