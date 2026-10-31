// Feuer und Wasser: Schwimmen, Tauchen, Schleusen, steigendes Wasser,
// Feuer, Notdusche (nass = feuerfest), Feuerlöscher und Sprinkler.
import { buildLevel } from '../client/src/level.js';
import { Colliders, createBody, stepBody } from '../client/src/physics.js';
import { EL, updateFires, waterAt } from '../client/src/elements.js';

const level = buildLevel();
const world = new Colliders(level);
const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const mid = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
let t = 5000;
world.update(t);
const run = (body, input, secs, each) => {
  for (let s = 0; s < secs * 120; s++) {
    t += dt; world.update(t);
    world.updatePlates([body.pos], dt, 6);
    stepBody(body, input, world, dt);
    if (each && each(body) === false) return false;
  }
  return true;
};

// ── Schwimmen ──
const pools = level.waters.filter((w) => w.look === 'pool');
const tanks = level.waters.filter((w) => w.look === 'tank');
check(pools.length >= 3 && tanks.length >= 2, `Akt 8 hat ${pools.length} Schwimmkanäle und ${tanks.length} Flutkammern`);
const P = pools[0];
const [px, pz] = mid(P);
{
  const body = createBody([px, P.surf + 2, pz]);
  let splash = 0;
  run(body, { x: 0, z: 0, jump: false, brace: false }, 3, (b) => { splash = Math.max(splash, b.splash); });
  const d = P.surf - body.pos[1];
  check(splash > EL.splashSpeed && body.swim === P, `ins Becken fallen: es spritzt (${splash.toFixed(1)} m/s), man schwimmt`);
  check(Math.abs(d - EL.float) < 0.15, `treibt an der Oberfläche (Füße ${d.toFixed(2)} m unter Wasser)`);
  const y0 = body.pos[1];
  run(body, { x: 0, z: 0, jump: false, brace: true }, 0.8);
  check(y0 - body.pos[1] > 1.2, `Festhalten taucht ab (${(y0 - body.pos[1]).toFixed(2)} m)`);
  run(body, { x: 0, z: 0, jump: false, brace: false }, 2);
  check(Math.abs(P.surf - body.pos[1] - EL.float) < 0.25, `loslassen: wieder auftauchen (Füße ${(P.surf - body.pos[1]).toFixed(2)} m)`);
  check(body.wet === EL.wetTime, 'im Wasser ist man nass');
}

// Schleusen: ohne Tauchen kommt man nicht vorbei, mit Tauchen schon
{
  const i = level.path.findIndex((p) => p.water === P);
  const E = level.path[i + 1].box, entry = level.path[i - 1].box;
  const [ex, ez] = mid(E), [sx, sz] = mid(entry);
  const dir = Math.abs(ex - sx) > Math.abs(ez - sz) ? [Math.sign(ex - sx), 0] : [0, Math.sign(ez - sz)];
  const start = [Math.min(P.max[0] - 0.5, Math.max(P.min[0] + 0.5, sx)), P.surf - EL.float, Math.min(P.max[2] - 0.5, Math.max(P.min[2] + 0.5, sz))];
  const body = createBody(start);
  run(body, { x: dir[0], z: dir[1], jump: false, brace: false }, 8);
  const got = (body.pos[0] - start[0]) * dir[0] + (body.pos[2] - start[2]) * dir[1];
  const len = (ex - sx) * dir[0] + (ez - sz) * dir[1];
  check(got < len * 0.6, `ohne Tauchen bleibt man an der Schleuse hängen (${got.toFixed(1)} von ${len.toFixed(1)} m)`);
}

// Steigendes Wasser hebt den Schwimmer
{
  const T = tanks[0];
  const [tx, tz] = mid(T);
  const lo = T.max[1], hi = T.max[1] + T.rise.range;
  let mn = Infinity, mx = -Infinity, bodyMax = -Infinity;
  const body = createBody([tx, lo + 0.05, tz]);
  for (let s = 0; s < T.rise.period * 120; s++) {
    t += dt; world.update(t);
    stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt);
    mn = Math.min(mn, T.surf); mx = Math.max(mx, T.surf); bodyMax = Math.max(bodyMax, body.pos[1]);
  }
  check(Math.abs(mn - lo) < 0.05 && Math.abs(mx - hi) < 0.05, `Flutkammer: Pegel ${(mn - lo).toFixed(2)} … ${(mx - lo).toFixed(2)} m`);
  check(bodyMax > hi - EL.float - 0.3, `der Schwimmer steigt mit (${(bodyMax - lo).toFixed(1)} m)`);
}

// ── Feuer ──
const fires = level.hazards.filter((z) => z.kind === 'fire');
const ext = fires.filter((z) => z.ext);
check(fires.some((z) => z.burner) && fires.some((z) => z.jet) && fires.some((z) => z.oil) && fires.some((z) => z.sprinkler) && ext.length, 'alle Feuerarten im Level (Brandherd, Brenner, Flammenrohr, Ölbrand, Sprinkler)');
const F = ext[0];
const [fx, fz] = mid(F);
{
  const body = createBody([fx, F.min[1] + 0.02, fz]);
  body.grounded = true;
  world.update(t);
  run(body, { x: 0, z: 0, jump: false, brace: false }, 0.1);
  check(body.zapped === 'fire' || body.hurt > 0, 'Feuer wirft einen zurück');
  const wet = createBody([fx, F.min[1] + 0.02, fz]);
  wet.wet = EL.wetTime;
  let zapped = false, steam = false;
  run(wet, { x: 0, z: 0, jump: false, brace: false }, 1, (b) => { zapped ||= !!b.zapped; steam ||= b.steam; });
  check(!zapped && steam, `nass: das Feuer zischt nur (noch ${wet.wet.toFixed(1)} s feuerfest)`);
}

// Notdusche macht nass
{
  const sh = level.waters.find((w) => w.shower);
  const [sx, sz] = mid(sh);
  const body = createBody([sx, sh.min[1] + 0.01, sz]);
  run(body, { x: 0, z: 0, jump: false, brace: false }, 0.1);
  check(body.wet > EL.wetTime - 0.1 && !waterAt(world, body.pos), 'Notdusche macht nass, ohne zu schwimmen');
}

// Feuerlöscher: nehmen, auf das Feuer zulaufen, löschen, später brennt es wieder
{
  const cab = level.extinguishers[0];
  const body = createBody([cab.pos[0], cab.pos[1] + 0.02, cab.pos[2]]);
  run(body, { x: 0, z: 0, jump: false, brace: false }, 0.05);
  check(body.ext === 1, 'Feuerlöscher aus dem Schrank genommen');
  // vor das erste Feuer stellen, Blick darauf
  const fire = ext.find((z) => z.sec === cab.sec) || ext[0];
  const [cx, cz] = mid(fire);
  const sprayer = { pos: [cx - 1.0 - (fire.max[0] - fire.min[0]) / 2, fire.min[1], cz], yaw: Math.PI / 2, ext: 1 };
  let out = -1;
  for (let s = 0; s < 120 * 2; s++) {
    t += dt; world.update(t);
    updateFires(world, [sprayer], dt);
    if (!fire.active && out < 0) out = s / 120;
  }
  check(out > 0 && out < 1, `Feuer gelöscht nach ${out.toFixed(2)} s Sprühen`);
  check(sprayer.ext < 1 && sprayer.ext > 0.8, `Löscher verbraucht (${Math.round(sprayer.ext * 100)} % übrig)`);
  const far = { pos: [0, -100, 0], yaw: 0, ext: 1 };
  let back = -1;
  for (let s = 0; s < 120 * 12; s++) {
    t += dt; world.update(t);
    updateFires(world, [far], dt);
    if (fire.warn && back < 0) back = -2;
    if (fire.active) { back = s / 120; break; }
  }
  check(Math.abs(back - (EL.outTime - 1)) < 1.2, `brennt nach ${back.toFixed(1)} s wieder (vorher glimmt es)`);
  const empty = { pos: sprayer.pos, yaw: sprayer.yaw, ext: 0 };
  for (let s = 0; s < 120; s++) { t += dt; world.update(t); updateFires(world, [empty], dt); }
  check(fire.active, 'leerer Löscher löscht nicht');
}

// Sprinkler: Auslöser gedrückt = Feuer aus
{
  const z = fires.find((f) => f.sprinkler);
  const pl = level.plates[z.plate];
  const p = [(pl.min[0] + pl.max[0]) / 2, pl.min[1] + 0.05, (pl.min[2] + pl.max[2]) / 2];
  world.updatePlates([[0, -100, 0]], 10, 1.2);
  world.update(t);
  const before = z.active;
  world.updatePlates([p], dt, 1.2);
  world.update(t);
  check(before && !z.active, 'Sprinkler-Auslöser löscht die brennende Brücke');
}

if (fails) { console.log(`${fails} Fehler`); process.exit(1); }
console.log('Feuer und Wasser: alles ok');
