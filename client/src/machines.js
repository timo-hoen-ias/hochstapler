// Maschinen für die großen Rätsel-Plattformen: Gabelstapler, Laufkran, Turmkran,
// Kurbel-Aufzug und Draisine. Reine Logik ohne Grafik, damit Spiel, Tests und
// Simulation dieselbe Physik benutzen.
//
// Jede Maschine hat Bedienplätze (stations). Wer an einem Platz steht, ist dort
// festgemacht und steuert mit seinen Eingaben einen Teil der Maschine. Die meisten
// Maschinen brauchen zwei Leute (Koop). Wer allein spielt, kann an einem Platz
// alles bedienen.
//
// Netz: Ein Spieler rechnet die Maschine (die Autorität = Besetzer des ersten
// besetzten Platzes), die anderen bekommen den Zustand und gleiten hinterher.
// Ohne Besetzer rechnet jeder Client das passive Verhalten selbst; es endet immer
// in derselben Ruhelage (Gabel unten, Aufzug unten, Kran in der Ausgangslage).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function makeBox(m, mat, extra = {}) {
  return { min: [0, 0, 0], max: [0, 0, 0], mat, mover: true, pz: true, d: [0, 0, 0], c: [0, 0], machine: m, fresh: true, ...extra };
}
// Box auf neue Lage setzen und die Verschiebung seit dem letzten Mal merken (für Mitfahrer)
// Mitgenommen wird mit der Verschiebung der Mitte (die Hülle eines gedrehten Teils
// ändert beim Drehen ihre Größe, die Mitte nicht).
function setBox(b, cx, cz, hx, hz, y0, y1) {
  if (b.fresh) { b.d[0] = b.d[1] = b.d[2] = 0; b.fresh = false; }
  else { b.d[0] = cx - b.c[0]; b.d[1] = y1 - b.max[1]; b.d[2] = cz - b.c[1]; }
  b.c = [cx, cz];
  b.min[0] = cx - hx; b.min[1] = y0; b.min[2] = cz - hz;
  b.max[0] = cx + hx; b.max[1] = y1; b.max[2] = cz + hz;
}
const inter3 = (a, b) => a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1] && a.min[2] < b.max[2] && a.max[2] > b.min[2];

// Gedrehtes Rechteck (Mitte c, Richtung d, halbe Länge hl, halbe Breite hw) gegen achsenparallele Box (nur x/z)
function rectHitsBox(c, d, hl, hw, b) {
  const r = [-d[1], d[0]];
  const ex = Math.abs(d[0]) * hl + Math.abs(r[0]) * hw;
  const ez = Math.abs(d[1]) * hl + Math.abs(r[1]) * hw;
  if (c[0] + ex <= b.min[0] || c[0] - ex >= b.max[0] || c[1] + ez <= b.min[2] || c[1] - ez >= b.max[2]) return false;
  // Achsen des Rechtecks
  const bc = [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
  const bh = [(b.max[0] - b.min[0]) / 2, (b.max[2] - b.min[2]) / 2];
  for (const [ax, h] of [[d, hl], [r, hw]]) {
    const dist = Math.abs((bc[0] - c[0]) * ax[0] + (bc[1] - c[1]) * ax[1]);
    const proj = bh[0] * Math.abs(ax[0]) + bh[1] * Math.abs(ax[1]);
    if (dist >= h + proj) return false;
  }
  return true;
}
function rectAabb(c, d, hl, hw) {
  const r = [-d[1], d[0]];
  return [Math.abs(d[0]) * hl + Math.abs(r[0]) * hw, Math.abs(d[1]) * hl + Math.abs(r[1]) * hw];
}

class Machine {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.type = def.type;
    this.boxes = [];
    this.occ = []; // Spieler-ID je Platz oder null
    this.target = null; // Zustand vom Netz (nur ohne Autorität)
    this.idle = 0;
    this.events = []; // Geräusche/Effekte für Grafik und Ton
  }
  get stations() { return this.def.stations; }
  // Welcher Platz darf gerade benutzt werden?
  stationAllowed(i, solo) {
    const st = this.def.stations[i];
    if (st.soloOnly && !solo) return false;
    return true;
  }
  occupied() { return this.occ.some((o) => o); }
  // Bereich, in dem Mitfahrer stehen (für "ist jemand drauf?")
  rideZone() {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const b of this.boxes) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
    min[0] -= 0.3; min[2] -= 0.3; max[0] += 0.3; max[2] += 0.3; min[1] -= 0.2; max[1] += 2.2;
    return { min, max };
  }
  hasRider(points) {
    const z = this.rideZone();
    return points.some((p) => p[0] > z.min[0] && p[0] < z.max[0] && p[2] > z.min[2] && p[2] < z.max[2] && p[1] > z.min[1] && p[1] < z.max[1]);
  }
  // Ein Rechenschritt. ins[i] = Eingabe am Platz i (oder null), ctx = { solo, auth, riders }
  step(dt, ins, ctx) {
    if (ctx.auth) this.simulate(dt, ins, ctx);
    else if (this.target) this.follow(dt);
    else this.simulate(dt, [], ctx); // niemand bedient: passives Verhalten
    this.apply();
  }
  follow(dt) {
    const k = Math.min(1, dt * 12);
    const keys = this.packKeys();
    keys.forEach((key, i) => {
      const t = this.target[i];
      if (!Number.isFinite(t)) return;
      const cur = this.s[key];
      if (key === 'yaw') this.s[key] = cur + wrapPi(t - cur) * k;
      else if (Math.abs(t - cur) > 6) this.s[key] = t; // Sprung (Rückruf): nicht quer durchs Bild
      else this.s[key] = cur + (t - cur) * k;
    });
  }
  pack() { return this.packKeys().map((k) => Math.round(this.s[k] * 1000) / 1000); }
  unpack(a) { if (Array.isArray(a) && a.length === this.packKeys().length && a.every(Number.isFinite)) this.target = a; }
  // Ruhelage sofort übernehmen (Neustart)
  reset() { this.s = { ...this.home() }; this.target = null; this.idle = 0; this.occ = this.occ.map(() => null); for (const b of this.boxes) b.fresh = true; this.apply(); }
  // Platz i: Fußpunkt und Blickrichtung des Bedieners
  stationPose(i) { return { pos: [0, 0, 0], yaw: 0 }; }
}

// ───────── Gabelstapler: Fahrersitz lenkt, Gas, Gabel hoch/runter ─────────
// Allein gibt es zusätzlich einen Hubtaster auf der Gabel. Im Koop sinkt die Gabel,
// sobald niemand im Sitz ist: einer muss unten bleiben und fahren.
export class Forklift extends Machine {
  constructor(def) {
    super(def);
    this.chassis = makeBox(this, 'forkBody');
    this.forks = makeBox(this, 'forkDark', { low: true });
    this.boxes.push(this.chassis, this.forks);
    this.occ = def.stations.map(() => null);
    this.reset();
  }
  home() { return { x: this.def.home[0], z: this.def.home[1], yaw: this.def.home[2], v: 0, fork: 0 }; }
  packKeys() { return ['x', 'z', 'yaw', 'v', 'fork']; }
  dir(yaw = this.s.yaw) { return [Math.sin(yaw), Math.cos(yaw)]; }
  // Grundriss: von 1,3 m hinter der Mitte bis zur Gabelspitze 2,4 m davor
  footprint(x, z, yaw) {
    const d = this.dir(yaw);
    return { c: [x + d[0] * 0.55, z + d[1] * 0.55], d, hl: 1.85, hw: 0.75 };
  }
  fits(x, z, yaw) {
    const f = this.footprint(x, z, yaw);
    const A = this.def.area;
    const r = [-f.d[1], f.d[0]];
    for (const sl of [-1, 1]) for (const sw of [-1, 1]) {
      const px = f.c[0] + f.d[0] * f.hl * sl + r[0] * f.hw * sw, pz = f.c[1] + f.d[1] * f.hl * sl + r[1] * f.hw * sw;
      if (px < A.min[0] || px > A.max[0] || pz < A.min[1] || pz > A.max[1]) return false;
    }
    for (const o of this.def.obstacles) if (rectHitsBox(f.c, f.d, f.hl, f.hw, o)) return false;
    return true;
  }
  simulate(dt, ins, ctx) {
    const s = this.s, D = this.def;
    const drv = ins[0];
    let thr = 0, steer = 0, lift = 0;
    if (drv) { thr = drv.fx; steer = drv.rx; lift = (drv.up ? 1 : 0) - (drv.down ? 1 : 0); }
    const btn = ins[1];
    if (btn && ctx.solo) lift = (btn.up || btn.fx > 0.3 ? 1 : 0) - (btn.down || btn.fx < -0.3 ? 1 : 0);
    // Gas: vorwärts schneller als rückwärts; ohne Gas ausrollen
    const want = thr > 0 ? thr * 4.2 : thr * 2.6;
    const acc = Math.abs(want) > Math.abs(s.v) || Math.sign(want) !== Math.sign(s.v) ? 5 : 7;
    s.v += clamp(want - s.v, -acc * dt, acc * dt);
    // Lenken: nur in Fahrt, rückwärts andersherum (wie ein Auto)
    const turn = -steer * 1.5 * clamp(s.v / 1.6, -1, 1) * dt;
    const nyaw = s.yaw + turn;
    const d = this.dir(nyaw);
    const nx = s.x + d[0] * s.v * dt, nz = s.z + d[1] * s.v * dt;
    if (this.fits(nx, nz, nyaw)) { s.x = nx; s.z = nz; s.yaw = nyaw; }
    else if (this.fits(s.x, s.z, nyaw)) { s.yaw = nyaw; if (Math.abs(s.v) > 1.5) this.events.push('bump'); s.v = 0; }
    else { if (Math.abs(s.v) > 1.5) this.events.push('bump'); s.v = 0; }
    s.yaw = wrapPi(s.yaw);
    // Gabel: Hydraulik. Im Koop sinkt sie ohne Fahrer langsam ab.
    const before = s.fork;
    if (lift) s.fork += lift * 1.25 * dt;
    else if (!ctx.solo && !this.occ[0]) s.fork -= 0.55 * dt;
    s.fork = clamp(s.fork, 0, D.forkMax);
    this.lifting = s.fork !== before ? Math.sign(s.fork - before) : 0;
    this.driving = Math.abs(s.v) > 0.05;
  }
  apply() {
    const s = this.s, y = this.def.y;
    const d = this.dir();
    // Fahrgestell
    const cc = [s.x - d[0] * 0.2, s.z - d[1] * 0.2];
    const [ex, ez] = rectAabb(d, d, 1.1, 0.7);
    setBox(this.chassis, cc[0], cc[1], ex, ez, y + 0.25, y + 1.15);
    // Gabel als Plattform vor dem Hubmast
    const fc = [s.x + d[0] * 1.75, s.z + d[1] * 1.75];
    const [fx, fz] = rectAabb(d, d, 0.65, 0.6);
    const top = y + 0.12 + s.fork;
    setBox(this.forks, fc[0], fc[1], fx, fz, top - 0.12, top);
  }
  stationPose(i) {
    const s = this.s, d = this.dir();
    if (i === 0) return { pos: [s.x - d[0] * 0.35, this.def.y + 1.2, s.z - d[1] * 0.35], yaw: s.yaw };
    return { pos: [s.x + d[0] * 1.7, this.forks.max[1], s.z + d[1] * 1.7], yaw: s.yaw };
  }
}

// ───────── Kran: Laufkran (u = Fahrweg, w = Katze quer) oder Turmkran (u = Winkel, w = Ausladung) ─────────
// Platz 0 fährt den Kran (Laufkran: Brücke; Turmkran: Drehwerk), Platz 1 steuert Katze und Hubwerk.
// Allein steuert Platz 0 alles. Die Plattform am Haken trägt die ganze Seilschaft.
export class Crane extends Machine {
  constructor(def) {
    super(def);
    this.deck = makeBox(this, 'craneDeck', { low: true });
    this.boxes.push(this.deck);
    this.occ = def.stations.map(() => null);
    this.reset();
  }
  home() { return { u: this.def.home[0], w: this.def.home[1], h: this.def.home[2] }; }
  packKeys() { return ['u', 'w', 'h']; }
  center(u = this.uOf(), w = this.s.w) {
    const D = this.def;
    if (D.kind === 'tower') return [D.pivot[0] + Math.sin(u) * w, D.pivot[1] + Math.cos(u) * w];
    return [D.origin[0] + D.U[0] * u + D.W[0] * w, D.origin[1] + D.U[1] * u + D.W[1] * w];
  }
  uOf() { return this.s.u; }
  setU(v) { this.s.u = v; }
  // Raum, den Plattform und Mitfahrer brauchen
  volume(u, w, h) {
    const [cx, cz] = this.center(u, w), hs = this.def.size / 2;
    return { min: [cx - hs, h - 0.3, cz - hs], max: [cx + hs, h + 1.9, cz + hs] };
  }
  free(u, w, h) {
    const v = this.volume(u, w, h);
    for (const o of this.def.obstacles) if (inter3(v, o)) return false;
    return true;
  }
  simulate(dt, ins, ctx) {
    const s = this.s, D = this.def;
    const a = ins[0], b = ins[1];
    let du = 0, dw = 0, dh = 0;
    const tower = D.kind === 'tower';
    const axU = (u) => {
      if (!tower) return D.U;
      return [Math.cos(u), -Math.sin(u)]; // Tangente (Ableitung nach dem Winkel)
    };
    const axW = (u) => (tower ? [Math.sin(u), Math.cos(u)] : D.W);
    const u0 = this.uOf();
    const tU = axU(u0), tW = axW(u0);
    const solo = ctx.solo;
    if (a) {
      du = (a.x * tU[0] + a.z * tU[1]) * D.speedU;
      if (solo) { dw = (a.x * tW[0] + a.z * tW[1]) * D.speedW; dh = ((a.up ? 1 : 0) - (a.down ? 1 : 0)) * D.speedH; }
    }
    if (b && !solo) {
      dw = (b.x * tW[0] + b.z * tW[1]) * D.speedW;
      dh = ((b.up ? 1 : 0) - (b.down ? 1 : 0)) * D.speedH;
    }
    if (tower) du /= Math.max(2, s.w); // Winkelgeschwindigkeit
    const any = du || dw || dh;
    if (!any && !this.occupied() && !ctx.riders) {
      // Rückruf: niemand bedient, niemand fährt mit
      this.idle += dt;
      if (this.idle > D.recall) { this.s = { ...this.home() }; this.idle = 0; this.events.push('recall'); }
      this.moving = 0;
      return;
    }
    this.idle = 0;
    let u = u0;
    const nu = clamp(u + du * dt, D.range[0][0], D.range[0][1]);
    const nw = clamp(s.w + dw * dt, D.range[1][0], D.range[1][1]);
    const nh = clamp(s.h + dh * dt, D.range[2][0], D.range[2][1]);
    // Achsenweise bewegen: blockiert ein Hindernis, bleibt diese Achse stehen
    let hit = false;
    if (nu !== u) { if (this.free(nu, s.w, s.h)) u = nu; else hit = true; }
    let w = s.w;
    if (nw !== w) { if (this.free(u, nw, s.h)) w = nw; else hit = true; }
    let h = s.h;
    if (nh !== h) { if (this.free(u, w, nh)) h = nh; else hit = true; }
    if (hit && !this.blocked) this.events.push('bump');
    this.blocked = hit;
    this.moving = Math.abs(u - u0) + Math.abs(w - s.w) + Math.abs(h - s.h) > 1e-5 ? 1 : 0;
    this.setU(u); s.w = w; s.h = h;
  }
  apply() {
    const [cx, cz] = this.center(), hs = this.def.size / 2;
    setBox(this.deck, cx, cz, hs, hs, this.s.h - 0.25, this.s.h);
  }
  stationPose(i) {
    const [cx, cz] = this.center();
    const A = this.def.A, B = this.def.B; // feste Achsen der Plattform
    const sg = i === 0 ? -1 : 1, o = this.def.size / 2 - 0.45;
    return { pos: [cx - A[0] * o + B[0] * o * sg, this.s.h, cz - A[1] * o + B[1] * o * sg], yaw: Math.atan2(A[0], A[1]) };
  }
}

// ───────── Kurbel-Aufzug: zwei Kurbeln im Korb ─────────
// Koop: beide kurbeln = schnell hoch, einer allein = kaum, keiner = Korb rutscht ab
// (Festhalten = Bremse). Allein: eine Kurbel reicht, die Sperrklinke hält.
export class Lift extends Machine {
  constructor(def) {
    super(def);
    this.deck = makeBox(this, 'liftDeck', { low: true });
    this.rails = def.rails.map(() => makeBox(this, 'liftRail'));
    this.boxes.push(this.deck, ...this.rails);
    this.occ = def.stations.map(() => null);
    this.reset();
  }
  home() { return { y: this.def.yMin, v: 0 }; }
  packKeys() { return ['y', 'v']; }
  simulate(dt, ins, ctx) {
    const s = this.s, D = this.def;
    let n = 0, down = 0, brake = false;
    for (const i of ins) {
      if (!i) continue;
      if (i.fx > 0.3 || i.up) n++;
      else if (i.fx < -0.3) down++;
      if (i.down) brake = true;
    }
    let want;
    if (ctx.solo) want = n ? 1.3 : down ? -1.1 : 0;
    else if (n >= 2) want = 1.3;
    else if (n === 1) want = brake ? 0.15 : 0.12;
    else if (down) want = -1.1;
    else want = brake ? 0 : -0.7;
    if (!this.occupied() && !ctx.riders) {
      this.idle += dt;
      want = this.idle > D.recall ? -1.6 : ctx.solo ? 0 : -0.7;
    } else this.idle = 0;
    s.v += clamp(want - s.v, -4 * dt, 4 * dt);
    s.y += s.v * dt;
    if (s.y <= D.yMin) { s.y = D.yMin; s.v = Math.max(0, s.v); }
    if (s.y >= D.yMax) { s.y = D.yMax; s.v = Math.min(0, s.v); }
    this.cranking = n;
  }
  apply() {
    const D = this.def, y = this.s.y, h = D.half;
    setBox(this.deck, D.center[0], D.center[1], h, h, y - 0.3, y);
    D.rails.forEach((r, i) => {
      // r = [nx, nz]: Seite des Korbs, an der ein Geländer steht
      const cx = D.center[0] + r[0] * (h - 0.06), cz = D.center[1] + r[1] * (h - 0.06);
      setBox(this.rails[i], cx, cz, r[0] ? 0.06 : h, r[1] ? 0.06 : h, y, y + 1.05);
    });
  }
  stationPose(i) {
    const D = this.def, st = D.stations[i];
    const n = st.side, o = D.half - 0.5;
    return { pos: [D.center[0] + n[0] * o, this.s.y, D.center[1] + n[1] * o], yaw: Math.atan2(n[0], n[1]) };
  }
}

// ───────── Draisine: Pumphebel mit zwei Griffen ─────────
// Gepumpt wird, wenn der eigene Griff oben ist. Zu zweit im Wechsel geht es flott,
// einer allein muss warten, bis die Feder den Hebel zurückbringt – zu langsam für
// die Steigung. Allein darf man beide Griffe benutzen.
export class Trolley extends Machine {
  constructor(def) {
    super(def);
    this.deck = makeBox(this, 'trolleyDeck', { low: true });
    this.boxes.push(this.deck);
    this.occ = def.stations.map(() => null);
    this.cool = 0;
    this.reset();
  }
  home() { return { s: 0, v: 0, ph: -1, pt: 0 }; }
  packKeys() { return ['s', 'v', 'ph']; }
  deckY(s = this.s.s) {
    const D = this.def;
    const t = clamp((s - D.slope[0]) / (D.slope[1] - D.slope[0]), 0, 1);
    return D.y0 + D.rise * t;
  }
  onSlope(s) { const D = this.def; return s > D.slope[0] && s < D.slope[1]; }
  simulate(dt, ins, ctx) {
    const s = this.s, D = this.def;
    this.cool = Math.max(0, this.cool - dt);
    let brake = false, pushed = false;
    ins.forEach((i, k) => {
      if (!i) return;
      if (i.down) brake = true;
      if (!i.jump || this.cool > 0) return;
      const mine = k === 0 ? -1 : 1;
      if (!ctx.solo && s.ph !== mine) { this.events.push('clunk'); return; }
      s.v += (i.fx < -0.3 ? -1 : 1) * D.push;
      s.ph = -s.ph; s.pt = 0; this.cool = 0.28; pushed = true;
      this.events.push('pump');
    });
    // Feder: im Koop kommt der Hebel nach einer Weile zum letzten Pumper zurück
    s.pt += dt;
    if (!ctx.solo && !pushed && s.pt > D.spring) { s.ph = -s.ph; s.pt = 0; }
    if (!this.occupied() && !ctx.riders) {
      this.idle += dt;
      if (this.idle > D.recall && s.s > 0) { s.v = -2.5; }
    } else this.idle = 0;
    if (this.onSlope(s.s)) s.v -= D.grade * dt;
    s.v *= Math.exp(-D.friction * dt);
    if (brake) s.v -= clamp(s.v, -6 * dt, 6 * dt);
    s.v = clamp(s.v, -D.vmax, D.vmax);
    s.s += s.v * dt;
    if (s.s <= 0) { s.s = 0; s.v = Math.max(0, s.v); }
    if (s.s >= D.len) { if (s.v > 2) this.events.push('bump'); s.s = D.len; s.v = Math.min(0, s.v); }
  }
  apply() {
    const D = this.def, s = this.s.s;
    const cx = D.start[0] + D.dir[0] * s, cz = D.start[1] + D.dir[1] * s;
    const top = this.deckY(s);
    const along = D.dir[0] ? 0 : 2;
    const hx = along === 0 ? 1.5 : 1.1, hz = along === 0 ? 1.1 : 1.5;
    setBox(this.deck, cx, cz, hx, hz, top - 0.25, top);
  }
  stationPose(i) {
    const D = this.def, s = this.s.s;
    const sg = i === 0 ? -1 : 1;
    const cx = D.start[0] + D.dir[0] * (s + sg * 0.75), cz = D.start[1] + D.dir[1] * (s + sg * 0.75);
    // Blick zum Hebel in der Mitte
    return { pos: [cx, this.deckY(s), cz], yaw: Math.atan2(-D.dir[0] * sg, -D.dir[1] * sg) };
  }
}

const TYPES = { forklift: Forklift, crane: Crane, lift: Lift, trolley: Trolley };

export function createMachines(level) {
  return (level.machines || []).map((def) => new TYPES[def.type](def));
}

// Leere Eingabe (Platz besetzt, aber nichts gedrückt)
export const NO_INPUT = { x: 0, z: 0, fx: 0, rx: 0, up: false, down: false, jump: false };
