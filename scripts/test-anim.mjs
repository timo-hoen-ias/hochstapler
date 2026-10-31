// Prüft die Figuren-Animation: keine NaN, und kein Gelenk springt zwischen zwei
// Frames (Zustandswechsel werden überblendet). Läuft ohne Browser.
import { Rig, MODE } from '../client/src/anim.js';

const mats = new Proxy({}, { get: () => ({ emissive: { setRGB() {} } }) });
const rig = new Rig(mats);
const dt = 1 / 60;
const G = 26;
// Ablauf: stehen, rennen, springen, Kante, hochziehen, Leiter, Haken, Seilzug, Stromschlag, harter Sturz
const seq = [];
const push = (n, f) => { for (let i = 0; i < n; i++) seq.push(f(i * dt)); };
push(30, () => ({ pos: [0, 0, 0], vel: [0, 0, 0], yaw: 0, grounded: true, mode: MODE.GROUND }));
push(60, (t) => ({ pos: [0, 0, t * 6], vel: [0, 0, Math.min(6, t * 20)], yaw: 0, grounded: true, mode: MODE.GROUND }));
push(40, (t) => ({ pos: [0, Math.max(0, 9.2 * t - G * t * t / 2), 0], vel: [0, 9.2 - G * t, 6], yaw: 0, grounded: false, mode: MODE.AIR }));
push(60, () => ({ pos: [0, 0.2, 0], vel: [0, 0, 0], yaw: 0, grounded: false, braced: true, mode: MODE.HANG }));
push(60, () => ({ pos: [0, 2.15, 0.55], vel: [0, 0, 0], yaw: 0, grounded: true, mode: MODE.GROUND }));
push(60, (t) => ({ pos: [0, 2.15 + t * 3.4, 0.55], vel: [0, 0, 0], yaw: 0, grounded: false, braced: true, mode: MODE.LADDER }));
push(80, (t) => ({ pos: [0, 3, Math.sin(t * 2) * 1.2], vel: [0, 0, Math.cos(t * 2) * 2.4], yaw: 0, grounded: false, braced: true, mode: MODE.HOOK, grip: [0, 7, 0] }));
push(60, (t) => ({ pos: [0, 0, 0], vel: [0, 0, 0], yaw: 0, grounded: true, mode: MODE.GROUND, pull: [0, 0, t > 0.3 ? 1 : 0] }));
push(60, (t) => ({ pos: [0, 0, 0], vel: [0, 0, 0], yaw: 0, grounded: t > 0.6, mode: t > 0.6 ? MODE.GROUND : MODE.AIR, hurt: t < 0.8 }));
// Schwimmen: treten → schwimmen → tauchen → raus, dann mit Feuerlöscher laufen
push(150, (t) => ({ pos: [0, 0, t * (t > 0.8 ? 2.4 : 0)], vel: [0, 0, t > 0.8 ? 2.4 : 0], yaw: 0, grounded: false, mode: MODE.AIR, swim: true, dive: t > 1.8 }));
push(90, (t) => ({ pos: [0, 0, t * 3], vel: [0, 0, 3], yaw: 0, grounded: true, mode: MODE.GROUND, carry: t < 1 }));
push(60, (t) => { const y = Math.max(0, 8 - G * t * t / 2); return { pos: [0, y, 0], vel: [0, y > 0 ? -G * t : 0, 0], yaw: 0, grounded: y <= 0, mode: y > 0 ? MODE.AIR : MODE.GROUND }; });

let prev = null, worst = 0, at = -1, bad = 0;
seq.forEach((s, i) => {
  s.braced = !!s.braced; s.hurt = !!s.hurt;
  rig.update(s, dt);
  const P = rig.pose;
  for (const v of P) if (!Number.isFinite(v)) bad++;
  if (prev) {
    for (let k = 0; k < P.length; k++) {
      const d = Math.abs(P[k] - prev[k]);
      if (d > worst) { worst = d; at = i; if (process.env.DBG) console.log(i, k, prev[k], P[k], JSON.stringify(rig.w), rig.hardT, rig.crouch); }
    }
  }
  prev = Float32Array.from(P);
});
if (bad) { console.error(`✗ Animation: ${bad} ungültige Werte`); process.exit(1); }
// Stromschlag-Zucken darf schnell sein, ein echter Sprung wäre > 0.7 rad pro Frame
if (worst > 0.7) { console.error(`✗ Animation: Gelenk springt um ${worst.toFixed(2)} rad (Frame ${at})`); process.exit(1); }
console.log(`Animation: ${seq.length} Frames, größte Gelenkänderung ${worst.toFixed(2)} rad/Frame – kein Springen`);
