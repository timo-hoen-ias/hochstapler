// Seil als Partikelkette (Verlet) mit Kollision gegen die Level-Boxen.
// Die Kette hängt durch, liegt auf Böden und legt sich über Kanten und um Säulen.
// Aus ihr wird der gespannte Seilweg (über die Umlenkpunkte) berechnet: Die Seilphysik
// zieht dann zum ersten Umlenkpunkt statt in gerader Linie durch die Wand zum Partner.
import { PHYS, topAt } from './physics.js';

export const ROPE = {
  segs: 18,        // Kettenglieder
  radius: 0.06,    // Kollisionsradius der Partikel (Seil selbst ist dünner)
  gravity: 20,
  damp: 0.985,
  friction: 0.55,  // so viel Gleiten bleibt bei Kontakt erhalten (1 = rutschig)
  iters: 8,
  shrink: 0.025,   // Sichtlinien-Test: Boxen etwas kleiner, damit aufliegende Partikel frei sehen
  teleport: 1.5,   // springt ein Ende weiter als das in einem Schritt: Kette neu anlegen
  settle: 0.25,    // so lange nach dem Neuanlegen gilt nur die gerade Linie
  maxExtra: 1.5,   // Seilweg länger als Seil + das: Kette hat sich verhakt -> neu anlegen
};

const solid = (b) => !b.hidden;

// Punkt in einer Box (um r vergrößert)? Schrägen und Rohre über ihre Oberkante.
function topOf(b, x, z) { return b.ramp || b.round ? topAt(b, x, z) : b.max[1]; }

// Partikel p aus Box b schieben (q = Position im letzten Schritt, für Seite und Reibung)
function pushOut(p, q, b, r, fr) {
  if (p[0] <= b.min[0] - r || p[0] >= b.max[0] + r || p[2] <= b.min[2] - r || p[2] >= b.max[2] + r) return false;
  if (p[1] <= b.min[1] - r) return false;
  const top = topOf(b, p[0], p[2]) + r;
  if (p[1] >= top) return false;
  if (b.round && Math.abs((b.round.axis === 0 ? p[2] : p[0]) - b.round.cl) > b.round.r + r) return false;
  // Kandidaten: alle sechs Seiten; bevorzugt die, auf der das Partikel vorher war
  let best = -1, bestD = Infinity, bestPrev = false;
  const lo = [b.min[0] - r, b.min[1] - r, b.min[2] - r];
  const hi = [b.max[0] + r, top, b.max[2] + r];
  for (let a = 0; a < 3; a++) {
    for (let s = 0; s < 2; s++) {
      const d = s ? hi[a] - p[a] : p[a] - lo[a];
      const prev = s ? q[a] >= hi[a] - 1e-4 : q[a] <= lo[a] + 1e-4;
      if ((prev && !bestPrev) || (prev === bestPrev && d < bestD)) { best = a * 2 + s; bestD = d; bestPrev = prev; }
    }
  }
  const a = best >> 1, s = best & 1;
  p[a] = s ? hi[a] : lo[a];
  // Normalgeschwindigkeit weg, Tangential gebremst (Reibung, damit das Seil auf Kanten liegen bleibt)
  q[a] = p[a];
  for (let o = 0; o < 3; o++) if (o !== a) q[o] = p[o] - (p[o] - q[o]) * fr;
  return true;
}

// Sichtlinie a→b frei von Box b? (Slab-Test, Box leicht geschrumpft)
function segHits(a, b, box, s) {
  if (box.ramp || box.round) {
    // Schrägen und Rohre: abtasten
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.15));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      if (x <= box.min[0] + s || x >= box.max[0] - s || z <= box.min[2] + s || z >= box.max[2] - s) continue;
      if (y <= box.min[1] + s || y >= topAt(box, x, z) - s) continue;
      if (box.round && Math.abs((box.round.axis === 0 ? z : x) - box.round.cl) > box.round.r - s) continue;
      return true;
    }
    return false;
  }
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k];
    const lo = box.min[k] + s, hi = box.max[k] - s;
    if (lo >= hi) return false;
    if (Math.abs(d) < 1e-9) { if (a[k] <= lo || a[k] >= hi) return false; continue; }
    let u0 = (lo - a[k]) / d, u1 = (hi - a[k]) / d;
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    if (u0 > t0) t0 = u0;
    if (u1 < t1) t1 = u1;
    if (t0 >= t1) return false;
  }
  return true;
}

function clear(a, b, cols, s) {
  for (const box of cols) if (solid(box) && segHits(a, b, box, s)) return false;
  return true;
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export class RopeChain {
  constructor() {
    this.p = null; this.q = null;
    this.age = 0;
    this.cols = [];
    this.path = null; // Umlenkpunkte (ohne die Enden)
    this.len = 0;     // Länge des gespannten Seilwegs
  }

  reset(a, b) {
    const n = ROPE.segs;
    this.p = []; this.q = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const v = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      this.p.push(v); this.q.push([...v]);
    }
    this.age = 0;
  }

  // Kollisionsboxen rund um die Kette (eine Abfrage je Schritt)
  gather(world) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const v of this.p) {
      if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0];
      if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1];
      if (v[2] < z0) z0 = v[2]; if (v[2] > z1) z1 = v[2];
    }
    const m = 0.6;
    x0 -= m; y0 -= m + 0.5; z0 -= m; x1 += m; y1 += m; z1 += m;
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const r = Math.max(x1 - x0, z1 - z0) / 2 + 0.5;
    const near = world.near(c, r, (y1 - y0) / 2 + 0.5);
    const out = this.cols;
    out.length = 0;
    for (const b of near) {
      if (b.max[0] < x0 || b.min[0] > x1 || b.max[1] < y0 || b.min[1] > y1 || b.max[2] < z0 || b.min[2] > z1) continue;
      out.push(b);
    }
    return out;
  }

  // a, b: Befestigungspunkte (Welt) der beiden Enden
  step(a, b, world, dt, L = PHYS.rope) {
    const n = ROPE.segs;
    if (!this.p || dist(this.p[0], a) > ROPE.teleport || dist(this.p[n], b) > ROPE.teleport) this.reset(a, b);
    this.age += dt;
    const { p, q } = this;
    const g = ROPE.gravity * dt * dt, d = ROPE.damp, r = ROPE.radius, fr = ROPE.friction;
    for (let i = 1; i < n; i++) {
      const v = p[i], o = q[i];
      for (let k = 0; k < 3; k++) {
        let vel = (v[k] - o[k]) * d;
        if (vel > 0.25) vel = 0.25; else if (vel < -0.25) vel = -0.25; // nicht durch dünne Teile tunneln
        o[k] = v[k];
        v[k] += vel;
      }
      v[1] -= g;
    }
    for (let k = 0; k < 3; k++) { q[0][k] = p[0][k]; p[0][k] = a[k]; q[n][k] = p[n][k]; p[n][k] = b[k]; }
    const cols = this.gather(world);
    const seg = L / n;
    for (let it = 0; it < ROPE.iters; it++) {
      // Glieder: nur Dehnung verhindern (ein Seil darf durchhängen)
      for (let i = 0; i < n; i++) {
        const u = p[i], w = p[i + 1];
        const dx = w[0] - u[0], dy = w[1] - u[1], dz = w[2] - u[2];
        const l = Math.hypot(dx, dy, dz);
        if (l <= seg || l < 1e-9) continue;
        const wu = i === 0 ? 0 : 1, ww = i + 1 === n ? 0 : 1;
        if (wu + ww === 0) continue;
        const f = (l - seg) / l / (wu + ww);
        if (wu) { u[0] += dx * f; u[1] += dy * f; u[2] += dz * f; }
        if (ww) { w[0] -= dx * f; w[1] -= dy * f; w[2] -= dz * f; }
      }
      // Kollision: Partikel und Gliedmitten (damit Glieder nicht über Ecken schneiden)
      for (let i = 1; i < n; i++) for (const box of cols) if (solid(box)) pushOut(p[i], q[i], box, r, fr);
      for (let i = 0; i < n; i++) {
        const u = p[i], w = p[i + 1];
        const mid = [(u[0] + w[0]) / 2, (u[1] + w[1]) / 2, (u[2] + w[2]) / 2];
        const qm = [(q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2, (q[i][2] + q[i + 1][2]) / 2];
        for (const box of cols) {
          if (!solid(box)) continue;
          const m0 = [...mid];
          if (!pushOut(mid, qm, box, r * 0.5, 1)) continue;
          const sx = mid[0] - m0[0], sy = mid[1] - m0[1], sz = mid[2] - m0[2];
          const iu = i === 0 ? 0 : 1, iw = i + 1 === n ? 0 : 1;
          const k = iu + iw ? 2 / (iu + iw) : 0;
          if (iu) { u[0] += sx * k; u[1] += sy * k; u[2] += sz * k; }
          if (iw) { w[0] += sx * k; w[1] += sy * k; w[2] += sz * k; }
        }
      }
    }
    this.solvePath(a, b, cols);
    return this;
  }

  // Gespannter Seilweg: von a aus die Kette entlang, so weit die Sicht frei bleibt. Schrittweise
  // (nicht gleich zum entferntesten freien Punkt), damit der Weg auf derselben Seite der
  // Hindernisse bleibt wie die Kette – sonst würde er um eine Säule herum "abkürzen".
  solvePath(a, b, cols) {
    const n = ROPE.segs, p = this.p, s = ROPE.shrink;
    const path = [];
    let len = 0, cur = a, i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && clear(cur, j + 1 === n ? b : p[j + 1], cols, s)) j++;
      const nx = j === n ? b : p[j];
      len += dist(cur, nx);
      if (j < n) path.push(p[j]);
      cur = nx; i = j;
    }
    this.path = path;
    this.len = len;
  }

  // Für die Seilphysik eines Endes: erster Umlenkpunkt und Restlänge dahinter (null = gerade Linie)
  wrapFor(end) {
    if (!this.path || !this.path.length || this.age < ROPE.settle) return null;
    if (this.len > PHYS.rope + ROPE.maxExtra) { this.p = null; return null; } // verhakt: neu anlegen
    const path = this.path;
    const first = end === 0 ? path[0] : path[path.length - 1];
    const other = end === 0 ? this.p[ROPE.segs] : this.p[0];
    let rest = 0;
    for (let i = 0; i < path.length; i++) {
      const u = path[i], w = i + 1 < path.length ? path[i + 1] : null;
      if (w) rest += dist(u, w);
    }
    rest += dist(end === 0 ? path[path.length - 1] : path[0], other);
    return { pt: [...first], rest };
  }
}

// Alle Seile eines Spiels, je Paar benannt
export class RopeSet {
  constructor() { this.map = new Map(); }
  get(key) {
    let c = this.map.get(key);
    if (!c) this.map.set(key, (c = new RopeChain()));
    return c;
  }
  // Nicht mehr benutzte Seile vergessen (Spieler weg, Seil ab)
  keep(keys) { for (const k of this.map.keys()) if (!keys.has(k)) this.map.delete(k); }
}
