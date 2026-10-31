// Prozedurale Figuren-Animation für die Lageristen.
//
// Aufbau: ein kleines Gelenk-Skelett aus Boxen (Hüfte, Wirbelsäule, Kopf,
// Ober-/Unterarm, Ober-/Unterschenkel mit Stiefel). Jede Bewegungsart ist eine
// Pose-Funktion, die Gelenkwinkel in einen Vektor schreibt. Zustände werden mit
// geglätteten Gewichten überblendet, darüber liegen additive Schichten
// (Landefederung, Beschleunigungs-/Kurvenneigung, Seilzug, Stromschlag).
// So gibt es zwischen Zuständen keine Sprünge – und es kostet pro Figur nur ein
// paar Dutzend Sinus-Aufrufe, egal ob Handy oder Splitscreen.
//
// Die Bewegungsphysik bleibt unberührt: die Animation liest nur den Zustand.
import * as THREE from 'three';

// Bewegungsart, wie sie übers Netz geht (Feld `a` im Zustand), +8 = Stromschlag
export const MODE = { GROUND: 0, AIR: 1, HANG: 2, HOOK: 3, LADDER: 4 };

export function animCode(body) {
  const m = body.hang ? MODE.HANG : body.hook ? MODE.HOOK : body.ladder ? MODE.LADDER : body.grounded ? MODE.GROUND : MODE.AIR;
  return m | (body.hurt > 0 ? 8 : 0);
}

// Ältere Clients schicken kein `a`: dann aus Boden/Festhalten raten
export function decodeAnim(a, grounded, braced) {
  if (typeof a !== 'number') return { mode: grounded ? MODE.GROUND : braced ? MODE.HANG : MODE.AIR, hurt: false };
  return { mode: a & 7, hurt: (a & 8) !== 0 };
}

// ───────── Maße ─────────
const HIP_Y = 0.8;          // Hüftgelenk über dem Fußpunkt (Stand)
const THIGH = 0.4, SHIN = 0.4;
const UARM = 0.32, FARM = 0.3;
const GRIP_Y = 2.0;         // Hände beim Hängen (≈ PHYS.reach)

// Gemeinsame Geometrien für alle Figuren
let GEO = null;
function geometries() {
  if (GEO) return GEO;
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const merge = (list) => {
    // kleine Eigen-Zusammenführung (gleiches Material), spart Draw-Calls
    const parts = list.map((g) => g.toNonIndexed());
    let n = 0;
    for (const p of parts) n += p.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const size = parts[0].attributes[name].itemSize;
      const arr = new Float32Array(n * size);
      let o = 0;
      for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    return out;
  };
  const helmet = new THREE.SphereGeometry(0.23, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.26, 0);
  const brim = new THREE.CylinderGeometry(0.27, 0.27, 0.03, 14).translate(0, 0.26, 0.02);
  GEO = {
    torso: box(0.55, 0.72, 0.32, 0, 0.28, 0),
    belt: new THREE.TorusGeometry(0.3, 0.04, 5, 14).rotateX(Math.PI / 2).translate(0, -0.03, 0),
    head: new THREE.SphereGeometry(0.2, 14, 10).translate(0, 0.2, 0),
    helmet: merge([helmet, brim]),
    visor: box(0.3, 0.08, 0.05, 0, 0.2, 0.18),
    uarm: box(0.16, UARM, 0.16, 0, -UARM / 2, 0),
    // Unterarm mit Hand (hochgekrempelte Ärmel)
    farm: merge([box(0.13, FARM - 0.08, 0.13, 0, -(FARM - 0.08) / 2, 0), box(0.12, 0.12, 0.1, 0, -FARM + 0.04, 0.01)]),
    thigh: box(0.21, THIGH, 0.22, 0, -THIGH / 2, 0),
    // Unterschenkel mit Stiefel
    shin: merge([box(0.18, SHIN - 0.06, 0.19, 0, -(SHIN - 0.06) / 2, 0), box(0.2, 0.1, 0.3, 0, -SHIN + 0.04, 0.05)]),
  };
  return GEO;
}

// ───────── Pose-Vektor ─────────
// Arme/Beine: A = Seite +x, B = Seite −x.  sx < 0 = Arm nach vorn/oben,
// ab = abspreizen (nach außen), el = Ellbogen beugen; hx < 0 = Bein nach vorn,
// kn = Knie beugen.
const K = {
  hy: 0, hz: 1, hp: 2, hr: 3, sp: 4, sr: 5, sy: 6, np: 7, ny: 8,
  asx: 9, aab: 10, ael: 11, bsx: 12, bab: 13, bel: 14,
  ahx: 15, aab2: 16, akn: 17, bhx: 18, bab2: 19, bkn: 20, aft: 21, bft: 22,
};
const N = 23;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

// Knie- und Hüftwinkel, damit die Füße bei abgesenkter Hüfte unter dem Körper bleiben
function crouchLegs(o, drop) {
  const h = clamp(THIGH + SHIN - drop, 0.25, THIGH + SHIN);
  const a = Math.acos(h / (THIGH + SHIN));
  o[K.ahx] -= a; o[K.bhx] -= a;
  o[K.akn] += 2 * a; o[K.bkn] += 2 * a;
  o[K.hy] -= drop;
}

// Hochziehen: Dauer und Keyframes (Zeitpunkte PU.t, Werte je Gelenk)
const PULL_DUR = 0.72;
const PU = {
  t:   [0, 0.28, 0.52, 0.78, 1],
  sx:  [-2.9, -1.55, -0.35, 0.05, 0.04],
  el:  [0.2, 2.1, 0.55, 0.25, 0.2],
  // optischer Versatz: Anteil Höhe (v) und Weg nach vorn (h), der schon geschafft ist
  v:   [0, 0.3, 0.65, 0.93, 1],
  h:   [0, 0.05, 0.4, 0.85, 1],
  ab:  [0.2, 0.5, 0.4, 0.18, 0.1],
  sp:  [-0.06, 0.3, 0.8, 0.4, 0.04],
  hp:  [0, 0.05, 0.15, 0.05, 0],
  hy:  [-0.05, -0.02, -0.3, -0.18, -0.012],
  hz:  [-0.05, -0.08, 0.0, 0.05, 0],
  lhx: [0.08, -0.7, -1.55, -0.7, -0.02],
  lkn: [0.3, 1.2, 2.1, 1.0, 0.06],
  thx: [0.02, 0.35, 0.5, -0.25, 0.03],
  tkn: [0.25, 0.55, 0.95, 0.75, 0.06],
  lft: [0.4, 0.2, -0.1, 0, 0],
  tft: [0.4, 0.5, 0.6, 0.1, 0],
  np:  [-0.4, -0.35, 0.05, 0.05, -0.05],
  sr:  [0, -0.08, -0.12, -0.04, 0],
};
function key(u, v) {
  const t = PU.t;
  let i = 1;
  while (i < t.length - 1 && u > t[i]) i++;
  const f = sstep(0, 1, clamp((u - t[i - 1]) / (t[i] - t[i - 1]), 0, 1));
  return v[i - 1] + (v[i] - v[i - 1]) * f;
}

// Zustände, die überblendet werden
const ST = ['idle', 'loco', 'air', 'hang', 'hook', 'ladder', 'brace', 'pullup', 'hurt', 'swim'];

const POSE = {
  idle(o, c) {
    const t = c.t;
    const br = Math.sin(t * 1.9);
    o[K.hy] = -0.012 + br * 0.007;
    o[K.sp] = 0.03 + br * 0.015;
    o[K.hr] = Math.sin(t * 0.45) * 0.035;           // Gewicht verlagern
    o[K.sr] = -o[K.hr] * 0.6;
    o[K.ny] = Math.sin(t * 0.31) * 0.35 * sstep(0.6, 1, Math.sin(t * 0.17)); // ab und zu umschauen
    o[K.np] = -0.05;
    o[K.asx] = 0.04 + br * 0.03; o[K.bsx] = 0.04 + br * 0.03;
    o[K.aab] = 0.1; o[K.bab] = 0.1;
    o[K.ael] = 0.2; o[K.bel] = 0.25;
    o[K.ahx] = -0.02; o[K.bhx] = 0.03;
    o[K.aab2] = 0.06 + o[K.hr]; o[K.bab2] = 0.06 - o[K.hr];
    o[K.akn] = 0.06 + Math.max(0, -o[K.hr]) * 1.5; o[K.bkn] = 0.06 + Math.max(0, o[K.hr]) * 1.5;
  },

  // Gehen ↔ Rennen, Schrittlänge wächst mit dem Tempo
  loco(o, c) {
    const r = c.runW, s = Math.sin(c.phase), co = Math.cos(c.phase);
    const amp = lerp(0.45, 0.85, r);
    const kb = lerp(0.08, 0.3, r), ka = lerp(0.65, 1.55, r);
    o[K.ahx] = -amp * s; o[K.bhx] = amp * s;
    o[K.akn] = kb + ka * Math.max(0, co) + 0.25 * r * Math.max(0, s);   // Schwungbein hoch, Fersen kicken
    o[K.bkn] = kb + ka * Math.max(0, -co) + 0.25 * r * Math.max(0, -s);
    o[K.aft] = 0.25 * Math.max(0, s) * r; o[K.bft] = 0.25 * Math.max(0, -s) * r;
    o[K.aab2] = 0.03; o[K.bab2] = 0.03;
    const arm = lerp(0.38, 0.95, r);
    o[K.asx] = arm * s - 0.1 * r; o[K.bsx] = -arm * s - 0.1 * r;
    o[K.ael] = lerp(0.25, 1.45, r) + 0.3 * r * Math.max(0, -s);
    o[K.bel] = lerp(0.25, 1.45, r) + 0.3 * r * Math.max(0, s);
    o[K.aab] = lerp(0.08, 0.16, r); o[K.bab] = o[K.aab];
    const s2 = s * s;
    o[K.hy] = lerp(-0.045 * s2, -0.05 + 0.06 * Math.abs(s) - 0.03, r);
    o[K.sp] = lerp(0.06, 0.3, r);
    o[K.hp] = lerp(0.02, 0.06, r);
    o[K.sy] = lerp(0.1, 0.2, r) * s;               // Schultern drehen gegen die Hüfte
    o[K.hr] = co * lerp(0.04, 0.03, r);
    o[K.sr] = -o[K.hr] * 0.7;
    o[K.np] = -o[K.sp] * 0.6;
  },

  // Absprung → Scheitel → Fallen, gesteuert über die Vertikalgeschwindigkeit
  air(o, c) {
    const vy = c.vy, t = c.t;
    const rise = sstep(1, 6, vy) * (1 - sstep(0.05, 0.5, c.airT) * 0.5);
    const fall = sstep(-1.5, -8, vy);
    const panic = sstep(-12, -22, vy);
    const apex = clamp(1 - rise - fall, 0, 1);
    const lead = c.lead;                              // Sprungbein wechselt je Sprung
    const L = lead > 0 ? [K.ahx, K.akn, K.bhx, K.bkn] : [K.bhx, K.bkn, K.ahx, K.akn];
    // Absprung: ein Knie hoch, das andere Bein gestreckt nach hinten, Arme reißen hoch
    o[L[0]] = -1.0 * rise - 0.75 * apex - 0.25 * fall;
    o[L[1]] = 1.3 * rise + 1.25 * apex + 0.4 * fall;
    o[L[2]] = 0.3 * rise - 0.5 * apex - 0.1 * fall;
    o[L[3]] = 0.35 * rise + 1.1 * apex + 0.25 * fall;
    o[K.aft] = 0.5 * rise; o[K.bft] = 0.5 * rise;
    o[K.aab2] = 0.04 + 0.12 * fall; o[K.bab2] = 0.04 + 0.12 * fall;
    const fl = Math.sin(t * 13) * (0.2 * fall + 0.35 * panic);
    o[K.asx] = -2.1 * rise - 0.7 * apex - 2.0 * fall + fl;
    o[K.bsx] = -1.5 * rise - 0.7 * apex - 2.0 * fall - fl;
    o[K.aab] = 0.25 * rise + 0.95 * apex + 0.75 * fall + 0.3 * panic;
    o[K.bab] = 0.25 * rise + 0.95 * apex + 0.75 * fall + 0.3 * panic;
    o[K.ael] = 0.35 * rise + 0.6 * apex + 0.35 * fall;
    o[K.bel] = 0.5 * rise + 0.6 * apex + 0.35 * fall;
    o[K.sp] = -0.05 * rise + 0.12 * apex - 0.08 * fall + 0.15 * c.runW;
    o[K.np] = 0.15 * fall + 0.2 * panic;             // beim Fallen nach unten schauen
    o[K.hy] = 0.02 * rise;
  },

  // An der Kante: Arme gestreckt nach oben, Beine pendeln
  hang(o, c) {
    const t = c.t, sw = Math.sin(t * 1.7);
    o[K.asx] = -2.95; o[K.bsx] = -2.95;
    o[K.aab] = 0.2; o[K.bab] = 0.2;
    o[K.ael] = 0.15 + Math.sin(t * 2.3) * 0.08; o[K.bel] = 0.15 + Math.sin(t * 2.3 + 0.6) * 0.08;
    o[K.ahx] = 0.08 + sw * 0.14; o[K.bhx] = 0.02 - sw * 0.14;
    o[K.akn] = 0.3 + Math.max(0, sw) * 0.2; o[K.bkn] = 0.25 + Math.max(0, -sw) * 0.2;
    o[K.aft] = 0.4; o[K.bft] = 0.4;
    o[K.sp] = -0.06; o[K.np] = -0.4;
    o[K.hy] = -0.05;
    o[K.hz] = -0.05;
  },

  // Am Kranhaken: beide Hände eng am Haken, Beine holen Schwung
  hook(o, c) {
    const vf = clamp(c.vf / 5, -1, 1), vs = clamp(c.vs / 5, -1, 1);
    o[K.asx] = -3.0; o[K.bsx] = -3.0;
    o[K.aab] = 0.06; o[K.bab] = 0.06;
    o[K.ael] = 0.3; o[K.bel] = 0.3;
    o[K.ahx] = -0.25 - 0.55 * vf; o[K.bhx] = -0.2 - 0.55 * vf;
    o[K.akn] = 0.45 + 0.4 * Math.max(0, -vf); o[K.bkn] = 0.5 + 0.4 * Math.max(0, -vf);
    o[K.aab2] = 0.05 + 0.15 * vs; o[K.bab2] = 0.05 - 0.15 * vs;
    o[K.aft] = 0.3; o[K.bft] = 0.3;
    o[K.sp] = -0.1 * vf; o[K.np] = -0.3;
    o[K.hy] = -0.05;
  },

  // Leiter: Hand und gegenüberliegender Fuß greifen gemeinsam
  ladder(o, c) {
    const s = Math.sin(c.lphase), co = Math.cos(c.lphase);
    o[K.asx] = -2.55 - 0.4 * s; o[K.bsx] = -2.55 + 0.4 * s;
    o[K.ael] = 0.7 + 0.45 * s; o[K.bel] = 0.7 - 0.45 * s;
    o[K.aab] = 0.12; o[K.bab] = 0.12;
    o[K.ahx] = -0.75 + 0.45 * s; o[K.bhx] = -0.75 - 0.45 * s;
    o[K.akn] = 1.15 - 0.45 * s; o[K.bkn] = 1.15 + 0.45 * s;
    o[K.aft] = 0.1; o[K.bft] = 0.1;
    o[K.sp] = 0.08; o[K.np] = -0.25 + co * 0.05;
    o[K.hy] = -0.1; o[K.hz] = -0.12;
    o[K.sy] = 0.06 * s;
  },

  // Festhalten am Boden: breiter Ausfallschritt, Seil vorm Bauch, nach hinten gelehnt
  brace(o, c) {
    const t = c.t;
    o[K.ahx] = -0.75; o[K.akn] = 0.95;
    o[K.bhx] = 0.55; o[K.bkn] = 0.25;
    o[K.aab2] = 0.12; o[K.bab2] = 0.12;
    o[K.aft] = 0.1; o[K.bft] = -0.2;
    o[K.hy] = -0.2;
    o[K.sp] = -0.22 + Math.sin(t * 7) * 0.012;
    o[K.hp] = -0.05;
    o[K.asx] = -0.95; o[K.bsx] = -0.7;
    o[K.ael] = 1.25; o[K.bel] = 1.35;
    o[K.aab] = -0.05; o[K.bab] = -0.1;
    o[K.np] = 0.12;
  },

  // Hochziehen über eine Kante oder vom Leiterende: Klimmzug → Knie auf die
  // Kante, Hände drücken nach unten → aufrichten. Keyframes über u = 0..1.
  pullup(o, c) {
    const u = clamp(c.pullT / PULL_DUR, 0, 1);
    const ub = clamp(u - 0.05, 0, 1);              // zweite Hand minimal später
    o[K.asx] = key(u, PU.sx); o[K.bsx] = key(ub, PU.sx);
    o[K.ael] = key(u, PU.el); o[K.bel] = key(ub, PU.el);
    o[K.aab] = key(u, PU.ab); o[K.bab] = key(ub, PU.ab);
    o[K.sp] = key(u, PU.sp); o[K.hp] = key(u, PU.hp);
    o[K.hy] = key(u, PU.hy);
    o[K.hz] = key(u, PU.hz);
    // Führungsbein (wechselt) kommt aufs Podest, das andere drückt nach
    const L = c.lead > 0 ? [K.ahx, K.akn, K.bhx, K.bkn, K.aft, K.bft] : [K.bhx, K.bkn, K.ahx, K.akn, K.bft, K.aft];
    o[L[0]] = key(u, PU.lhx); o[L[1]] = key(u, PU.lkn);
    o[L[2]] = key(u, PU.thx); o[L[3]] = key(u, PU.tkn);
    o[L[4]] = key(u, PU.lft); o[L[5]] = key(u, PU.tft);
    o[K.np] = key(u, PU.np);
    o[K.sr] = key(u, PU.sr) * c.lead;
  },

  // Schwimmen: im Stand Wassertreten, in Fahrt Brustschwimmen (Körper liegt flach),
  // beim Tauchen Kopf voran nach unten
  swim(o, c) {
    const m = c.swimMove, dv = c.dive;
    const ph = c.swimPh;
    const s = Math.sin(ph), co = Math.cos(ph);
    // Wassertreten: aufrecht, Arme paddeln flach, Beine radeln
    const tread = 1 - m;
    // Füße treiben 1,2 m unter der Oberfläche (EL.float): treten = Brust am Wasserspiegel,
    // schwimmen = Rücken knapp unter der Oberfläche, tauchen = tiefer
    o[K.hy] = -0.25 * tread + 0.2 * m * (1 - dv) - 0.3 * dv;
    o[K.hp] = 1.2 * m + 0.45 * dv;
    o[K.sp] = 0.1 * tread + 0.15 * m * (1 - dv) + 0.3 * dv;
    o[K.np] = -0.1 * tread - 1.05 * m * (1 - dv) - 0.2 * dv;
    o[K.hz] = -0.25 * m;
    // Brustzug: Arme vorstrecken, nach außen ziehen, unter die Brust zurück
    const reach = 0.5 + 0.5 * co;                     // 1 = ganz vorn
    const sweep = Math.max(0, -s);                    // Zugphase
    o[K.asx] = lerp(-0.9 + 0.25 * s, -2.9 + 1.4 * (1 - reach), m);
    o[K.bsx] = lerp(-0.9 - 0.25 * s, -2.9 + 1.4 * (1 - reach), m);
    o[K.aab] = lerp(0.9 + 0.2 * co, 0.15 + 0.9 * sweep, m);
    o[K.bab] = lerp(0.9 - 0.2 * co, 0.15 + 0.9 * sweep, m);
    o[K.ael] = lerp(0.9, 0.2 + 1.3 * (1 - reach), m);
    o[K.bel] = lerp(0.9, 0.2 + 1.3 * (1 - reach), m);
    // Beine: Radfahren beim Treten, Froschschlag in Fahrt (um eine halbe Phase versetzt)
    const kick = 0.5 + 0.5 * Math.sin(ph + Math.PI * 0.6);
    o[K.ahx] = lerp(-0.5 - 0.35 * s, -0.05 - 0.6 * kick, m);
    o[K.bhx] = lerp(-0.5 + 0.35 * s, -0.05 - 0.6 * kick, m);
    o[K.akn] = lerp(0.9 + 0.5 * s, 0.15 + 1.6 * kick, m);
    o[K.bkn] = lerp(0.9 - 0.5 * s, 0.15 + 1.6 * kick, m);
    o[K.aab2] = lerp(0.1, 0.1 + 0.45 * kick, m); o[K.bab2] = o[K.aab2];
    o[K.aft] = 0.5; o[K.bft] = 0.5;
  },

  // Stromschlag: Körper reißt nach hinten, Arme und Beine weg, Zucken
  hurt(o, c) {
    const u = clamp(c.hurtT / 0.8, 0, 1);
    const j = (1 - sstep(0.15, 0.5, u));
    const z = (f, ph) => Math.sin(c.t * f + ph) * 0.18 * j;
    o[K.sp] = -0.5 + z(47, 0); o[K.hp] = -0.35;
    o[K.np] = -0.5 + z(53, 1);
    o[K.asx] = -1.0 + z(41, 2); o[K.bsx] = -0.8 + z(44, 3);
    o[K.aab] = 1.45 + z(39, 4); o[K.bab] = 1.4 + z(43, 5);
    o[K.ael] = 0.35 + z(51, 6); o[K.bel] = 0.5 + z(37, 7);
    o[K.ahx] = 0.2 + z(46, 8); o[K.bhx] = -0.35 + z(42, 9);
    o[K.akn] = 0.6; o[K.bkn] = 0.8;
    o[K.aab2] = 0.3; o[K.bab2] = 0.3;
    o[K.aft] = 0.4; o[K.bft] = 0.4;
  },
};

// Überblendgeschwindigkeit je Zielzustand (1/s)
const FADE = { idle: 10, loco: 10, air: 13, hang: 16, hook: 14, ladder: 12, brace: 12, pullup: 40, hurt: 35, swim: 7 };

// ───────── Figur ─────────
export class Rig {
  constructor(mats) {
    const G = geometries();
    const mesh = (geo, mat, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    this.mats = mats;
    this.root = new THREE.Group();           // Fußpunkt, dreht mit der Blickrichtung
    this.swing = new THREE.Group();          // Drehpunkt auf Griffhöhe (Haken, Kante)
    this.swing.position.y = GRIP_Y;
    this.root.add(this.swing);
    this.hips = new THREE.Group();
    this.swing.add(this.hips);
    this.spine = new THREE.Group();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    mesh(G.torso, mats.vest, this.spine);
    mesh(G.belt, mats.belt, this.hips);
    this.neck = new THREE.Group();
    this.neck.position.y = 0.66;
    this.spine.add(this.neck);
    mesh(G.head, mats.skin, this.neck);
    mesh(G.helmet, mats.hat, this.neck);
    mesh(G.visor, mats.visor, this.neck);
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(0.36 * side, 0.56, 0);
      this.spine.add(sh);
      mesh(G.uarm, mats.vest, sh);
      const el = new THREE.Group();
      el.position.y = -UARM;
      sh.add(el);
      mesh(G.farm, mats.skin, el);
      return { sh, el };
    };
    const leg = (side) => {
      const hp = new THREE.Group();
      hp.position.set(0.14 * side, 0, 0);
      this.hips.add(hp);
      mesh(G.thigh, mats.pants, hp);
      const kn = new THREE.Group();
      kn.position.y = -THIGH;
      hp.add(kn);
      const sh = mesh(G.shin, mats.pants, kn);
      return { hp, kn, sh };
    };
    this.armA = arm(1); this.armB = arm(-1);
    this.legA = leg(1); this.legB = leg(-1);

    this.pose = new Float32Array(N);
    this.tmp = new Float32Array(N);
    this.w = Object.fromEntries(ST.map((s) => [s, s === 'idle' ? 1 : 0]));
    this.t = Math.random() * 100;
    this.phase = 0; this.lphase = 0; this.lead = 1;
    this.mode = MODE.GROUND; this.airT = 0; this.minVy = 0; this.airVy = 0;
    this.crouch = 0; this.crouchV = 0; this.hardT = 9;
    this.pullT = 9; this.hurtT = 9; this.wasHurt = false;
    this.lastPos = null; this.vyM = 0; this.yawPrev = null; this.yawRate = 0;
    this.velPrev = [0, 0]; this.accF = 0; this.accS = 0;
    this.off = new THREE.Vector3(); this.stepOff = 0; this.stepT = 9; this.offStart = new THREE.Vector3(); this.offT = 9;
    this.swimMove = 0; this.swimPh = 0; this.dive = 0; this.carry = 0;
    this.tilt = new THREE.Euler(); this.pullS = 0; this.pullF = 0; this.pullSide = 0; this.pullUp = 0;
    this.events = { jumped: false, landed: 0, pulled: false };
  }

  // s: { pos, vel, yaw, grounded, braced, mode, hurt, grip?, pull?, swim?, dive?, carry? }
  update(s, dt) {
    const ev = this.events; ev.jumped = false; ev.landed = 0; ev.pulled = false;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const pos = s.pos, vel = s.vel;
    // Gemessene Vertikalgeschwindigkeit (Leiter setzt die Position direkt)
    if (this.lastPos && dt > 0) {
      const dy = (pos[1] - this.lastPos[1]) / dt;
      this.vyM += (clamp(dy, -40, 40) - this.vyM) * damp(12, dt);
    }
    const jump = this.lastPos ? Math.hypot(pos[0] - this.lastPos[0], pos[1] - this.lastPos[1], pos[2] - this.lastPos[2]) : 0;
    const prevMode = this.mode;

    // ── Zustand bestimmen ──
    let mode = s.mode;
    if (mode === MODE.AIR || mode === MODE.GROUND) {
      // Kurzes Abheben auf Kanten/Rampen nicht als Sprung zeigen
      if (!s.grounded) this.airT += dt; else this.airT = 0;
      mode = s.grounded || (this.airT < 0.08 && vel[1] < 2.5 && vel[1] > -4) ? MODE.GROUND : MODE.AIR;
    } else this.airT = 0;

    // Sprung erkannt
    if (mode === MODE.AIR && prevMode !== MODE.AIR) {
      this.minVy = vel[1];
      if (vel[1] > 2.5) { this.lead = -this.lead; ev.jumped = true; }
    }
    if (mode === MODE.AIR) { this.minVy = Math.min(this.minVy, vel[1]); this.airVy = vel[1]; }
    // Landung: Feder je nach Aufprall
    if (mode === MODE.GROUND && prevMode === MODE.AIR) {
      const v = -this.minVy;
      ev.landed = v;
      if (v > 2) this.crouchV -= Math.min(4.5, 0.25 + v * 0.17);
      if (v > 13) this.hardT = 0;
    }
    // Hochziehen über eine Kante oder vom Leiterende
    if (mode === MODE.GROUND && prevMode === MODE.GROUND && this.lastPos) {
      const up = pos[1] - this.lastPos[1];
      if (up > 0.08 && up < 0.6 && jump < 0.8) { this.stepOff = clamp(this.stepOff - up, -0.6, 0); this.stepT = 0; }
    }
    // Kante gegriffen: die Physik setzt die Höhe sofort – optisch nachziehen
    if ((mode === MODE.HANG || mode === MODE.HOOK) && prevMode === MODE.AIR && this.lastPos && jump < 1) {
      this.stepOff = clamp(this.stepOff + this.lastPos[1] - pos[1], -0.8, 0.8);
    }
    if (mode === MODE.GROUND && (prevMode === MODE.HANG || prevMode === MODE.LADDER)) {
      this.pullT = 0; this.lead = -this.lead;
      ev.pulled = true;
      // Teleport des Körpers optisch nachführen: erst hoch, dann nach vorn
      if (jump > 0.3 && jump < 3 && this.lastPos) {
        this.offStart.set(this.lastPos[0] - pos[0], this.lastPos[1] - pos[1], this.lastPos[2] - pos[2]);
        this.offT = 0;
      }
    }
    // Stromschlag
    if (s.hurt && !this.wasHurt) this.hurtT = 0;
    this.wasHurt = s.hurt;
    this.mode = mode;

    // ── Laufen ──
    const sp = Math.hypot(vel[0], vel[2]);
    const yaw = s.yaw;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const vf = vel[0] * sy + vel[2] * cy, vs = vel[0] * cy - vel[2] * sy;
    // Beschleunigung und Drehrate für die Neigung
    if (dt > 0) {
      const af = (vf - this.velPrev[0]) / dt, as = (vs - this.velPrev[1]) / dt;
      this.accF += (clamp(af, -40, 40) - this.accF) * damp(8, dt);
      this.accS += (clamp(as, -40, 40) - this.accS) * damp(8, dt);
      if (this.yawPrev !== null) {
        let dy = yaw - this.yawPrev; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yawRate += (clamp(dy / dt, -12, 12) - this.yawRate) * damp(8, dt);
      }
    }
    this.velPrev[0] = vf; this.velPrev[1] = vs; this.yawPrev = yaw;
    const runW = sstep(2.6, 5.4, sp);
    const cycle = lerp(1.5, 2.8, runW);
    if (mode === MODE.GROUND) this.phase += (Math.PI * 2 * sp * dt) / cycle;
    if (mode === MODE.LADDER) this.lphase += (Math.abs(this.vyM) * dt / 0.55) * Math.PI;

    // ── Gewichte ──
    const moveW = sstep(0.25, 1.4, sp);
    this.pullT += dt; this.hurtT += dt; this.hardT += dt; this.offT += dt;
    let target;
    if (this.hurtT < 0.8) target = 'hurt';
    else if (s.swim) target = 'swim';
    else if (mode === MODE.HANG) target = 'hang';
    else if (mode === MODE.HOOK) target = 'hook';
    else if (mode === MODE.LADDER) target = 'ladder';
    else if (mode === MODE.AIR) target = 'air';
    else if (this.pullT < PULL_DUR && !(this.pullT > 0.4 && sp > 2)) target = 'pullup';
    else if (s.braced) target = 'brace';
    else target = moveW > 0.5 ? 'loco' : 'idle';
    // Boden: Stand und Laufen gleiten übers Tempo statt hart umzuschalten
    let sum = 0;
    for (const k of ST) {
      let want = k === target ? 1 : 0;
      if (target === 'idle' || target === 'loco') {
        if (k === 'idle') want = 1 - moveW;
        if (k === 'loco') want = moveW;
      }
      const rate = FADE[want > this.w[k] ? k : target];
      this.w[k] += (want - this.w[k]) * damp(rate, dt);
      sum += this.w[k];
    }

    // ── Posen mischen ──
    // Luftpose behält beim Ausblenden die letzte Fallgeschwindigkeit (sonst springt sie bei vy = 0)
    this.swimMove += (sstep(0.4, 1.6, sp) - this.swimMove) * damp(4, dt);
    this.swimPh += dt * lerp(2.6, 3.4, this.swimMove); // Phase aufsummieren: Tempowechsel ohne Sprung
    this.dive += ((s.swim && s.dive ? 1 : 0) - this.dive) * damp(5, dt);
    this.carry += ((s.carry ? 1 : 0) - this.carry) * damp(9, dt);
    const ctx = { t: this.t, phase: this.phase, lphase: this.lphase, runW, vy: this.airVy, airT: this.airT, vf, vs,
      lead: this.lead, pullT: this.pullT, hurtT: this.hurtT, swimMove: this.swimMove, dive: this.dive, swimPh: this.swimPh };
    const P = this.pose, T = this.tmp;
    P.fill(0);
    for (const k of ST) {
      const w = this.w[k] / sum;
      if (w < 0.002) continue;
      T.fill(0);
      POSE[k](T, ctx);
      for (let i = 0; i < N; i++) P[i] += T[i] * w;
    }

    // ── Schichten ──
    // Landefeder (gedämpfte Feder auf die Hüfthöhe)
    this.crouchV += (-90 * this.crouch - 13 * this.crouchV) * dt;
    this.crouch = clamp(this.crouch + this.crouchV * dt, -0.05, 0.42);
    const gW = this.w.idle + this.w.loco + this.w.brace + this.w.pullup;
    const cr = Math.max(0, this.crouch) * gW / sum;
    if (cr > 0.001) {
      crouchLegs(P, cr);
      P[K.sp] += cr * 1.4; P[K.np] -= cr * 0.8;
      P[K.aab] += cr * 1.6; P[K.bab] += cr * 1.6;
      P[K.asx] -= cr * 1.2; P[K.bsx] -= cr * 1.2;
    }
    // Harte Landung: eine Hand stützt sich ab, dann aufrichten
    if (this.hardT < 0.6) {
      const h = sstep(0, 0.07, this.hardT) * (1 - sstep(0.22, 0.6, this.hardT)) * gW / sum;
      P[K.hy] -= 0.18 * h; P[K.sp] += 0.55 * h;
      P[K.asx] = lerp(P[K.asx], -0.5, h); P[K.ael] = lerp(P[K.ael], 0.15, h); P[K.aab] = lerp(P[K.aab], 0.35, h);
      P[K.bab] += 0.6 * h; P[K.np] -= 0.3 * h;
      crouchLegs(P, 0.12 * h);
    }
    // Aufsteigen auf eine Stufe: Knie kurz hoch, Oberkörper nach vorn
    this.stepT += dt;
    if (this.stepT < 0.25) {
      const k = Math.sin(Math.PI * this.stepT / 0.25) * gW / sum;
      const front = Math.sin(this.phase) > 0;
      P[front ? K.ahx : K.bhx] -= 0.45 * k; P[front ? K.akn : K.bkn] += 0.7 * k;
      P[K.sp] += 0.12 * k;
    }
    // Neigung: in Laufrichtung beim Beschleunigen, in die Kurve beim Drehen
    const lw = (this.w.loco + this.w.idle) / sum;
    P[K.sp] += clamp(this.accF * 0.012, -0.25, 0.3) * lw;
    P[K.hr] += clamp(-this.yawRate * sp * 0.025, -0.3, 0.3) * lw;
    P[K.sr] += clamp(this.accS * -0.006, -0.15, 0.15) * lw;
    // Seilzug: Gurt wird gezogen, Oberkörper bleibt zurück, Arme greifen zum Seil
    const pull = s.pull;
    let pS = 0, pF = 0, pR = 0, pU = 0;
    if (pull) {
      const len = Math.hypot(pull[0], pull[1], pull[2]);
      if (len > 1e-3) {
        pS = clamp(len, 0, 1);
        pF = (pull[0] * sy + pull[2] * cy) / len; pR = (pull[0] * cy - pull[2] * sy) / len; pU = pull[1] / len;
      }
    }
    this.pullS += (pS - this.pullS) * damp(pS > this.pullS ? 18 : 5, dt);
    this.pullF += (pF - this.pullF) * damp(10, dt);
    this.pullSide += (pR - this.pullSide) * damp(10, dt);
    this.pullUp += (pU - this.pullUp) * damp(10, dt);
    const y = this.pullS * (1 - (this.w.hurt + this.w.hang + this.w.hook + this.w.ladder) / sum);
    if (y > 0.01) {
      const braced = this.w.brace / sum;
      const free = 1 - braced;
      // frei: Hüfte voraus, Oberkörper kippt weg; festhaltend: dagegenlehnen
      P[K.sp] += (-0.45 * this.pullF * free - 0.25 * this.pullF * braced) * y;
      P[K.sr] += (0.3 * this.pullSide * free - 0.2 * this.pullSide * braced) * y;
      P[K.hp] += 0.2 * this.pullF * free * y;
      const reach = free * y;
      const up = Math.max(0, this.pullUp);
      P[K.asx] = lerp(P[K.asx], -1.3 * this.pullF - 2.4 * up, reach * 0.8);
      P[K.bsx] = lerp(P[K.bsx], -1.1 * this.pullF - 2.4 * up, reach * 0.8);
      P[K.ael] = lerp(P[K.ael], 0.5, reach * 0.6); P[K.bel] = lerp(P[K.bel], 0.6, reach * 0.6);
      P[K.aab] += (0.4 * Math.max(0, this.pullSide) + 0.2) * reach;
      P[K.bab] += (0.4 * Math.max(0, -this.pullSide) + 0.2) * reach;
      P[K.np] -= 0.25 * up * reach;
    }

    // Feuerlöscher tragen: rechte Hand hält den Schlauch nach vorn, linke die Flasche
    const cw = this.carry * (this.w.idle + this.w.loco + this.w.air + this.w.brace) / sum;
    if (cw > 0.01) {
      P[K.asx] = lerp(P[K.asx], -1.15, cw); P[K.ael] = lerp(P[K.ael], 0.75, cw); P[K.aab] = lerp(P[K.aab], -0.12, cw);
      P[K.bsx] = lerp(P[K.bsx], -0.35, cw); P[K.bel] = lerp(P[K.bel], 1.35, cw); P[K.bab] = lerp(P[K.bab], 0.05, cw);
      P[K.sy] = lerp(P[K.sy], 0.12, cw);
    }

    this.apply(P, s, dt);
    this.lastPos = [pos[0], pos[1], pos[2]];
    return ev;
  }

  apply(P, s, dt) {
    const r = this.root;
    // Optischer Versatz nach dem Hochziehen: Höhe zuerst, dann nach vorn
    if (this.offT < PULL_DUR) {
      // Höhe folgt dem Klimmzug (Hände bleiben an der Kante), nach vorn geht es beim Aufstützen
      const u = this.offT / PULL_DUR;
      const v = key(u, PU.v), h = key(u, PU.h);
      this.off.set(this.offStart.x * (1 - h), this.offStart.y * (1 - v), this.offStart.z * (1 - h));
    } else this.off.set(0, 0, 0);
    // Stufen/Rohre ohne Sprung: Höhensprung der Physik weich nachziehen
    this.stepOff *= Math.exp(-dt * 20);
    r.position.set(s.pos[0] + this.off.x, s.pos[1] + this.off.y + this.stepOff, s.pos[2] + this.off.z);
    // weiche Drehung (Haken/Leiter/Stromschlag schneller)
    let dy = s.yaw - r.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    r.rotation.y += dy * damp(12, dt);

    // Pendeln am Haken: ganze Figur um die Hände kippen, Richtung zum Aufhängepunkt
    let tx = 0, tz = 0;
    const hw = this.w.hook / ST.reduce((a, k) => a + this.w[k], 0);
    if (s.grip && hw > 0.01) {
      const ry = r.rotation.y, c = Math.cos(ry), sn = Math.sin(ry);
      const gx = s.grip[0] - s.pos[0], gy = s.grip[1] - (s.pos[1] + GRIP_Y), gz = s.grip[2] - s.pos[2];
      const f = gx * sn + gz * c, sd = gx * c - gz * sn;
      const up = Math.max(0.3, gy);
      tx = Math.atan2(f, up) * hw;      // Aufhängepunkt vorn → Füße nach hinten
      tz = -Math.atan2(sd, up) * hw;
    }
    this.tilt.x += (tx - this.tilt.x) * damp(14, dt);
    this.tilt.z += (tz - this.tilt.z) * damp(14, dt);
    this.swing.rotation.set(this.tilt.x, 0, this.tilt.z);

    this.hips.position.set(0, HIP_Y - GRIP_Y + P[K.hy], P[K.hz]);
    this.hips.rotation.set(P[K.hp], 0, P[K.hr]);
    this.spine.rotation.set(P[K.sp], P[K.sy], P[K.sr]);
    this.neck.rotation.set(P[K.np] - P[K.sp] * 0.3, P[K.ny], 0);
    const A = this.armA, B = this.armB;
    A.sh.rotation.set(P[K.asx], 0, P[K.aab]);
    B.sh.rotation.set(P[K.bsx], 0, -P[K.bab]);
    A.el.rotation.x = -P[K.ael];
    B.el.rotation.x = -P[K.bel];
    const LA = this.legA, LB = this.legB;
    LA.hp.rotation.set(P[K.ahx], 0, P[K.aab2]);
    LB.hp.rotation.set(P[K.bhx], 0, -P[K.bab2]);
    LA.kn.rotation.x = P[K.akn];
    LB.kn.rotation.x = P[K.bkn];
    // Stiefel waagerecht halten (in den Unterschenkel eingebaut: als leichte Kniekorrektur)
    LA.sh.rotation.x = clamp(-(P[K.hp] + P[K.ahx] + P[K.akn]) * 0.35 + P[K.aft], -0.6, 0.6) * 0.5;
    LB.sh.rotation.x = clamp(-(P[K.hp] + P[K.bhx] + P[K.bkn]) * 0.35 + P[K.bft], -0.6, 0.6) * 0.5;

    // Stromschlag: Weste und Haut flackern bläulich
    const zap = this.hurtT < 0.5 ? (Math.sin(this.t * 60) > 0 ? 1 : 0.35) * (1 - this.hurtT / 0.5) : 0;
    if (zap > 0 || this.zapOn) {
      this.zapOn = zap > 0;
      for (const m of [this.mats.vest, this.mats.skin]) m.emissive.setRGB(0.45 * zap, 0.7 * zap, 1.2 * zap);
    }
  }
}
