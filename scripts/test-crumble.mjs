// Bruchpaletten: halten kurz, brechen weg, kommen wieder – aber nicht in jemandem.
import { Colliders, createBody, stepBody, PHYS } from '../client/src/physics.js';
const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fails++; };
const pal = { min: [-0.7, 4.7, -0.7], max: [0.7, 5, 0.7], mat: 'timber', crumble: true };
const level = { statics: [{ min: [-20, -1, -20], max: [20, 0, 20], mat: 'concrete', big: true }, pal], movers: [] };
const w = new Colliders(level);
w.update(0);
const b = createBody([0, 5.02, 0]);
let t = 0, broke = -1, back = -1;
for (let s = 0; s < 120 * 8; s++) {
  t += dt; w.update(t); w.updatePlates([b.pos], dt);
  stepBody(b, { x: 0, z: 0, jump: false, brace: false }, w, dt);
  if (broke < 0 && pal.hidden) broke = t;
  if (broke >= 0 && back < 0 && !pal.hidden) back = t;
}
check(broke > PHYS.crumbleHold - 0.05 && broke < PHYS.crumbleHold + 0.2, `Bruchpalette bricht nach ${broke.toFixed(2)} s weg`);
check(b.pos[1] < 1, 'wer drauf stand, fällt herunter');
check(back > broke + PHYS.crumbleGone - 0.1, `kommt nach ${(back - broke).toFixed(1)} s zurück`);
process.exit(fails ? 1 : 0);
