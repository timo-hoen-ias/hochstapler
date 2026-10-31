// Spielt jede Rätsel-Arena mit der echten Physik und Maschinen-Logik durch:
// Bediener steuern die Maschine, Mitfahrer stehen darauf und steigen am Ende aus.
// Prüft außerdem, dass die Rätsel wirklich Zusammenarbeit brauchen (der direkte Weg
// ist versperrt, einer allein schafft es nicht) und dass die Koop-Wände funktionieren.
import { buildLevel } from '../client/src/level.js';
import { Colliders, createBody, stepBody } from '../client/src/physics.js';
import { createMachines, NO_INPUT } from '../client/src/machines.js';
import { climbs } from './test-coop-climb.mjs';
import { COOP_WALL } from '../client/src/arenas.js';

const level = buildLevel(process.env.SEED ? { seed: Number(process.env.SEED) } : {});
const world = new Colliders(level);
world.forceOpen = true;
world.updatePlates([], 0);
const dt = 1 / 120;
let fails = 0;
const fail = (msg) => { fails++; console.log('✗ ' + msg); };
const ok = (msg) => console.log('✓ ' + msg);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function fresh() {
  const ms = createMachines(level);
  world.dyn = ms.flatMap((m) => m.boxes);
  return ms;
}
const exitOf = (m) => level.path.find((p) => p.how === 'machine' && p.machine === m.def.id).box;
const top = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1] + 0.02, (b.min[2] + b.max[2]) / 2];

// Ein Lauf: ctl(t) liefert die Eingaben je Platz, riders = Mitfahrer mit Eingabe-Funktion
function run(ms, m, { secs, ctl, riders = [], solo = false, until }) {
  let t = 1000;
  for (let s = 0; s < secs * 120; s++) {
    t += dt;
    world.update(t);
    world.solo = solo;
    for (const o of ms) {
      if (o === m) o.step(dt, ctl(t, s), { solo, auth: true, riders: riders.length > 0 });
      else o.step(dt, [], { solo, auth: false, riders: false });
    }
    for (const r of riders) {
      world.mates = [];
      stepBody(r.body, r.input ? r.input(t, s) : { x: 0, z: 0, jump: false, brace: true }, world, dt);
    }
    if (until && until(t)) return true;
  }
  return false;
}
const rider = (pos) => { const b = createBody(pos); b.grounded = false; return { body: b }; };
const onBox = (b, box) => b.grounded && b.ground === box;
const inArena = (r, y) => r.body.pos[1] > y - 0.5;

// ───── Gabelstapler ─────
function forklift(m0) {
  let ms = fresh();
  let m = ms[m0.def.id];
  const D = m.def, rack = exitOf(m);
  const fwd = [Math.sin(D.home[2]), Math.cos(D.home[2])];
  // Mitfahrer steht auf der Gabel; Gabel erst etwas anheben (über die Säure)
  const R = rider(top(m.forks));
  m.occ[0] = 'fahrer';
  let wp = 0, phase = 0, stuck = 0;
  const drive = (t, s) => {
    const st = m.s;
    if (phase === 0) { // Gabel auf 0,6 m
      if (st.fork >= 0.6) phase = 1;
      return [{ ...NO_INPUT, up: true }];
    }
    if (phase === 1) { // Route abfahren
      const T = D.route[wp];
      const dx = T[0] - st.x, dz = T[1] - st.z, dist = Math.hypot(dx, dz);
      const last = wp === D.route.length - 1;
      if (dist < (last ? 0.25 : 1.2)) { if (last) phase = 2; else wp++; return [NO_INPUT]; }
      const e = wrap(Math.atan2(dx, dz) - st.yaw);
      return [{ ...NO_INPUT, fx: Math.abs(e) > 0.7 ? 0.45 : last ? 0.5 : 1, rx: clamp(-e * 2.5, -1, 1) }];
    }
    if (phase === 2) { // ausrichten und an das Regal ranfahren
      const e = wrap(Math.atan2(fwd[0], fwd[1]) - st.yaw);
      if (Math.abs(st.v) < 0.01 && s > 0) stuck++; else stuck = 0;
      if (stuck > 60) phase = 3;
      return [{ ...NO_INPUT, fx: 0.4, rx: clamp(-e * 3, -1, 1) }];
    }
    if (phase === 3) { // Gabel ganz hoch
      if (st.fork >= D.forkMax - 1e-3) phase = 4;
      return [{ ...NO_INPUT, up: true }];
    }
    return [NO_INPUT];
  };
  let lost = null;
  R.input = (t, s) => {
    if (!lost && !(R.body.grounded && R.body.ground === m.forks) && phase < 4 && s > 30) lost = `Phase ${phase}, Stapler ${m.s.x.toFixed(1)}/${m.s.z.toFixed(1)} yaw ${m.s.yaw.toFixed(2)}, Mitfahrer ${R.body.pos.map((v) => v.toFixed(1))} auf ${R.body.ground?.mat}`;
    return phase === 4 ? { x: fwd[0], z: fwd[1], jump: s % 60 === 0, brace: false } : { x: 0, z: 0, jump: false, brace: true };
  };
  const done = run(ms, m, { secs: 60, ctl: drive, riders: [R], until: () => onBox(R.body, rack) });
  const name = D.acid ? 'Stapler durch die Säure' : 'Staplerhof';
  if (!done) fail(`${name}: Mitfahrer kommt nicht aufs Regal${lost ? ' – fiel herunter: ' + lost : ''} (Phase ${phase}, Wegpunkt ${wp}, Stapler ${m.s.x.toFixed(1)}/${m.s.z.toFixed(1)}, Gabel ${m.s.fork.toFixed(2)}, Mitfahrer y=${R.body.pos[1].toFixed(1)})`);
  else ok(`${name}: fahren, Gabel hoch, Mitfahrer steigt aufs Regal`);
  // Ohne Fahrer sinkt die Gabel im Koop, allein bleibt sie oben
  m.occ[0] = null;
  run(ms, m, { secs: 2, ctl: () => [] });
  if (!(m.s.fork < D.forkMax - 0.8)) fail(`${name}: Gabel sinkt im Koop ohne Fahrer nicht`);
  // Regal ist zu hoch für Räuberleiter oder Hochziehen allein
  const H = rack.max[1] - D.y;
  if (climbs(H, { boost: true }) || climbs(H, { pull: true })) fail(`${name}: Regal (${H.toFixed(1)} m) ist ohne Stapler erreichbar`);
  // Allein: Hubtaster auf der Gabel
  ms = fresh(); m = ms[m0.def.id];
  m.occ[1] = 'solo';
  run(ms, m, { secs: 5, solo: true, ctl: () => [null, { ...NO_INPUT, up: true }] });
  if (m.s.fork < D.forkMax - 1e-3) fail(`${name}: Hubtaster hebt allein nicht`);
  else ok(`${name}: allein mit dem Hubtaster`);
  // Notleiter: gibt es, mit Hebel
  const lad = level.ladders.find((l) => l.arena === D.arena && l.flag);
  const lev = level.levers.find((l) => l.flag === lad?.flag);
  if (!lad || !lev) fail(`${name}: Notleiter oder Hebel fehlt`);
}

// ───── Kran (Laufkran und Turmkran) ─────
function crane(m0) {
  const ms = fresh();
  const m = ms[m0.def.id];
  const D = m.def, exit = exitOf(m);
  const tower = D.kind === 'tower';
  const name = tower ? 'Turmkran' : 'Eiskran';
  // Direkter Weg zum Ziel versperrt? (nur Fahren/Drehen)
  {
    const u0 = m.s.u;
    const dirU = Math.sign(D.route[D.route.length - 1][0] - u0);
    const tU = tower ? [Math.cos(u0), -Math.sin(u0)] : D.U;
    m.occ[0] = 'a';
    run(ms, m, { secs: 12, ctl: () => [{ ...NO_INPUT, x: tU[0] * dirU, z: tU[1] * dirU }] });
    const prog = Math.abs(m.s.u - u0) / Math.abs(D.route[D.route.length - 1][0] - u0);
    if (prog > 0.7) fail(`${name}: direkter Weg ist nicht versperrt (${(prog * 100).toFixed(0)} %)`);
    m.reset();
  }
  const riders = [rider([m.deck.min[0] + 0.9, m.s.h + 0.05, (m.deck.min[2] + m.deck.max[2]) / 2]), rider([m.deck.max[0] - 0.9, m.s.h + 0.05, (m.deck.min[2] + m.deck.max[2]) / 2])];
  m.occ[0] = 'a'; m.occ[1] = 'b';
  let wp = 0, out = false, stall = 0, lastKey = '';
  const ctl = () => {
    if (wp >= D.route.length) return [NO_INPUT, NO_INPUT];
    const T = D.route[wp], s = m.s;
    const u = s.u;
    const tU = tower ? [Math.cos(u), -Math.sin(u)] : D.U;
    const tW = tower ? [Math.sin(u), Math.cos(u)] : D.W;
    const du = T[0] - u, dw = T[1] - s.w, dh = T[2] - s.h;
    const a = { ...NO_INPUT }, b = { ...NO_INPUT };
    const tolU = tower ? 0.01 : 0.05;
    if (Math.abs(du) > tolU) { const k = clamp(du * (tower ? 8 : 2), -1, 1); a.x = tU[0] * k; a.z = tU[1] * k; }
    else if (Math.abs(dw) > 0.05) { const k = clamp(dw * 2, -1, 1); b.x = tW[0] * k; b.z = tW[1] * k; }
    else if (Math.abs(dh) > 0.04) { b.up = dh > 0; b.down = dh < 0; }
    else { wp++; }
    const key = `${wp}:${u.toFixed(3)}:${s.w.toFixed(3)}:${s.h.toFixed(3)}`;
    stall = key === lastKey ? stall + 1 : 0; lastKey = key;
    return [a, b];
  };
  const toward = [exit.min[0] + exit.max[0], exit.min[2] + exit.max[2]].map((v, i) => v / 2 - (i ? m.center()[1] : m.center()[0]));
  const tl = Math.hypot(...toward) || 1;
  for (const r of riders) r.input = (t, s) => (out ? { x: toward[0] / tl, z: toward[1] / tl, jump: s % 60 === 0, brace: false } : { x: 0, z: 0, jump: false, brace: true });
  const done = run(ms, m, {
    secs: 90, ctl, riders,
    until: () => {
      if (stall > 240) return true;
      if (wp >= D.route.length) out = true;
      return riders.every((r) => onBox(r.body, exit));
    },
  });
  if (!done || stall > 240 || !riders.every((r) => onBox(r.body, exit))) {
    fail(`${name}: Route ${wp}/${D.route.length} – Kran bei u=${m.s.u.toFixed(2)} w=${m.s.w.toFixed(2)} h=${(m.s.h - D.y).toFixed(2)}, Mitfahrer ${riders.map((r) => r.body.pos[1].toFixed(1) + (r.body.ground ? ':' + (r.body.ground.mat || '') : '')).join(', ')}${stall > 240 ? ' (blockiert)' : ''}`);
  } else ok(`${name}: Fahrt um die Hindernisse, alle steigen am Ziel aus`);
}

// ───── Kurbel-Aufzug ─────
function lift(m0) {
  let ms = fresh();
  let m = ms[m0.def.id];
  const D = m.def, exit = exitOf(m);
  const name = D.kind === 'siloLift' ? 'Siloaufzug' : 'Paketaufzug';
  const planes = level.hazards.filter((z) => z.arena === D.arena && z.grid);
  const riders = [-0.6, 0.6].map((o) => rider([D.center[0] + (D.rails[0][1] ? o : 0), D.yMin + 0.05, D.center[1] + (D.rails[0][0] ? o : 0)]));
  m.occ = ['a', 'b'];
  let out = false, zapped = 0;
  const ctl = () => {
    if (m.s.y >= D.yMax - 1e-3) { out = true; return [NO_INPUT, NO_INPUT]; }
    // nächstes Lichtgitter über dem Korb: warten, solange es an ist, dann zügig durch
    const y = m.s.y;
    for (const z of planes) {
      const gapAbove = z.min[1] - y;
      if (gapAbove > 1.85 && gapAbove < 2.5 && (z.active || z.warn)) return [{ ...NO_INPUT, down: true }, { ...NO_INPUT, down: true }];
    }
    return [{ ...NO_INPUT, fx: 1 }, { ...NO_INPUT, fx: 1 }];
  };
  const dir = [(exit.min[0] + exit.max[0]) / 2 - D.center[0], (exit.min[2] + exit.max[2]) / 2 - D.center[1]];
  const dl = Math.hypot(...dir);
  for (const r of riders) r.input = () => (out ? { x: dir[0] / dl, z: dir[1] / dl, jump: false, brace: false } : { x: 0, z: 0, jump: false, brace: true });
  const done = run(ms, m, {
    secs: 60, ctl, riders,
    until: () => { for (const r of riders) if (r.body.zapped) zapped++; return riders.every((r) => onBox(r.body, exit)); },
  });
  if (!done) fail(`${name}: Korb bei ${(m.s.y - D.yMin).toFixed(1)} m, Mitfahrer y=${riders.map((r) => (r.body.pos[1] - D.yMin).toFixed(1)).join('/')}, Stromschläge ${zapped}`);
  else ok(`${name}: zwei Kurbeln, ${planes.length} Lichtgitter abgewartet, alle oben`);
  // Einer allein im Koop: kommt in 30 s nicht hoch
  ms = fresh(); m = ms[m0.def.id];
  m.occ = ['a', 'b'];
  run(ms, m, { secs: 30, ctl: () => [{ ...NO_INPUT, fx: 1 }, NO_INPUT], riders: [rider([D.center[0], D.yMin + 0.05, D.center[1]])] });
  if (m.s.y - D.yMin > (D.yMax - D.yMin) * 0.5) fail(`${name}: eine Kurbel allein schafft es im Koop (${(m.s.y - D.yMin).toFixed(1)} m)`);
  // Allein (solo): eine Kurbel reicht
  ms = fresh(); m = ms[m0.def.id];
  m.occ = ['a', null];
  run(ms, m, { secs: 12, solo: true, ctl: () => [{ ...NO_INPUT, fx: 1 }, null], riders: [rider([D.center[0], D.yMin + 0.05, D.center[1]])] });
  if (m.s.y < D.yMax - 1e-3) fail(`${name}: allein kommt man nicht hoch`);
  else ok(`${name}: allein mit einer Kurbel`);
}

// ───── Draisine ─────
function trolley(m0) {
  let ms = fresh();
  let m = ms[m0.def.id];
  const D = m.def, exit = exitOf(m);
  const arc = level.hazards.find((z) => z.arena === D.arena && z.arc);
  const arcS = ((arc.min[0] + arc.max[0]) / 2 - D.start[0]) * D.dir[0] + ((arc.min[2] + arc.max[2]) / 2 - D.start[1]) * D.dir[1];
  const stopS = arcS - 1.5 - 0.6 - 0.4;
  const riders = [-0.75, 0.75].map((o) => rider([D.start[0] + D.dir[0] * o, D.y0 + 0.05, D.start[1] + D.dir[1] * o]));
  m.occ = ['a', 'b'];
  let last = -1, out = false, waited = false, zapped = 0;
  const ctl = (t, s) => {
    const st = m.s;
    if (st.s >= D.len - 1e-3) { out = true; return [NO_INPUT, NO_INPUT]; }
    // vor dem Lichtbogen anhalten, bis er ausgeht
    if (st.s > stopS - 0.3 && st.s < stopS + 0.4 && (arc.active || (arc.phaseU > 0.6 && !waited))) {
      waited = true;
      return [{ ...NO_INPUT, down: true }, { ...NO_INPUT, down: true }];
    }
    const ins = [{ ...NO_INPUT }, { ...NO_INPUT }];
    if (s - last > 36) { // ~0,3 s Takt
      const who = st.ph === -1 ? 0 : 1;
      ins[who].jump = true;
      last = s;
    }
    return ins;
  };
  const dir = D.dir;
  for (const r of riders) r.input = () => (out ? { x: dir[0], z: dir[1], jump: false, brace: false } : { x: 0, z: 0, jump: false, brace: true });
  const done = run(ms, m, { secs: 60, ctl, riders, until: () => { for (const r of riders) if (r.body.zapped) zapped++; return riders.every((r) => onBox(r.body, exit)); } });
  if (!done) fail(`Draisine: s=${m.s.s.toFixed(1)}/${D.len}, Mitfahrer ${riders.map((r) => r.body.pos[1].toFixed(1)).join('/')}, Stromschläge ${zapped}`);
  else ok('Draisine: im Wechsel gepumpt, Lichtbogen abgewartet, alle drüben');
  // Einer allein im Koop: kommt die Steigung nicht hinauf
  ms = fresh(); m = ms[m0.def.id];
  m.occ = ['a', 'b'];
  let l2 = -1;
  run(ms, m, { secs: 40, ctl: (t, s) => { const i = [{ ...NO_INPUT }, NO_INPUT]; if (s - l2 > 36) { i[0].jump = true; l2 = s; } return i; } });
  if (m.s.s > D.slope[1]) fail(`Draisine: ein Pumper allein schafft die Steigung (s=${m.s.s.toFixed(1)})`);
  else ok(`Draisine: einer allein bleibt an der Steigung hängen (s=${m.s.s.toFixed(1)})`);
  // Allein (solo): beide Griffe
  ms = fresh(); m = ms[m0.def.id];
  m.occ = ['a', null];
  let l3 = -1;
  run(ms, m, { secs: 30, solo: true, ctl: (t, s) => { const i = [{ ...NO_INPUT }, null]; if (s - l3 > 36) { i[0].jump = true; l3 = s; } return i; } });
  if (m.s.s < D.slope[1]) fail(`Draisine: allein kommt man die Steigung nicht hinauf (s=${m.s.s.toFixed(1)})`);
}

// ───── Koop-Wände (Räuberleiter / Hochziehen) ─────
function coopWalls() {
  fresh();
  let n = 0;
  for (let i = 1; i < level.path.length; i++) {
    const B = level.path[i];
    if (B.how !== 'coop') continue;
    const A = level.path[i - 1];
    const lo = A.box, hi = B.box;
    const H = hi.max[1] - lo.max[1];
    if (Math.abs(H - COOP_WALL) > 1e-6) fail(`Koop-Wand ${B.arena}: Höhe ${H.toFixed(2)} m`);
    // Wand-Richtung: von lo nach hi
    const dx = (hi.min[0] + hi.max[0]) / 2 - (lo.min[0] + lo.max[0]) / 2, dz = (hi.min[2] + hi.max[2]) / 2 - (lo.min[2] + lo.max[2]) / 2;
    const ax = Math.abs(dx) > Math.abs(dz) ? 0 : 2, sg = Math.sign(ax === 0 ? dx : dz);
    const face = sg > 0 ? hi.min[ax] : hi.max[ax];
    const c = [(lo.min[0] + lo.max[0]) / 2, lo.max[1], (lo.min[2] + lo.max[2]) / 2];
    const at = (d) => { const p = [...c]; p[ax] = face - sg * d; return p; };
    for (const mode of ['boost', 'pull', 'none']) {
      const b = createBody(at(1.6)); b.grounded = true; b.ground = lo;
      world.mates = mode === 'boost' ? [{ pos: at(0.55), braced: true, grounded: true }]
        : mode === 'pull' ? [{ pos: (() => { const p = at(-0.6); p[1] = hi.max[1]; return p; })(), braced: true, grounded: true }] : [];
      let jumped = false, up = false;
      const inp = [0, 0]; inp[ax === 0 ? 0 : 1] = sg;
      for (let s = 0; s < 600 && !up; s++) {
        world.update(1000 + s * dt);
        let jump = false;
        const dist = sg * (face - b.pos[ax]);
        if (!jumped && dist < (mode === 'boost' ? 0.75 : 0.9)) { jump = true; jumped = true; }
        if (b.hang) jump = s % 2 === 0;
        stepBody(b, { x: inp[0], z: inp[1], jump, brace: false }, world, dt);
        if (b.grounded && b.ground === hi) up = true;
      }
      if (mode === 'none' && up) fail(`Koop-Wand ${B.arena}: allein erreichbar`);
      if (mode !== 'none' && !up) fail(`Koop-Wand ${B.arena}: ${mode === 'boost' ? 'Räuberleiter' : 'Hochziehen'} klappt nicht`);
    }
    if (!level.ladders.some((l) => l.solo && l.arena === B.arena)) fail(`Koop-Wand ${B.arena}: Klappleiter für Solo fehlt`);
    n++;
  }
  world.mates = [];
  ok(`${n} Koop-Wände: Räuberleiter und Hochziehen klappen, allein nur mit Klappleiter`);
}

const all = createMachines(level);
const seen = new Set();
for (const m of all) {
  seen.add(m.def.kind || m.type);
  if (m.type === 'forklift') forklift(m);
  else if (m.type === 'crane') crane(m);
  else if (m.type === 'lift') lift(m);
  else if (m.type === 'trolley') trolley(m);
}
coopWalls();
if (all.length !== 7) fail(`Erwartet 7 Rätsel-Arenen (eine je Akt), gefunden ${all.length}`);
if (fails) { console.log(`${fails} Problem(e) in den Rätsel-Arenen`); process.exit(1); }
console.log(`✓ Rätsel-Arenen ok (${all.length} Maschinen: ${[...seen].join(', ')})`);
