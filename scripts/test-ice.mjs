// Auf Eis bremst Festhalten (Shift) nicht mehr sofort: man rutscht ein Stück weiter.
// Auf normalem Boden hält Festhalten weiter sofort an.
import { Colliders, createBody, stepBody, PHYS } from '../client/src/physics.js';

const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fails++; };

function slide(extra) {
  const floor = { min: [-60, -1, -60], max: [60, 0, 60], mat: 'ice', ...extra };
  const w = new Colliders({ statics: [floor], movers: [], zones: [] });
  w.update(0);
  const b = createBody([0, 0, 0]); b.grounded = true; b.ground = floor;
  b.vel[0] = PHYS.speed;
  let t = 0, stop = null;
  for (let s = 0; s < 480; s++) {
    t += dt; w.update(t);
    stepBody(b, { x: 0, z: 0, jump: false, brace: true }, w, dt);
    if (stop === null && Math.abs(b.vel[0]) < 0.05) stop = t;
  }
  return { dist: b.pos[0], stop, vel: b.vel[0] };
}
const ice = slide({ ice: true }), ground = slide({ mat: 'concrete' });
check(ice.dist > 2.5 && ice.dist < 6, `Festhalten auf Eis rutscht ein Stück: ${ice.dist.toFixed(2)} m`);
check(ice.stop !== null, `… kommt aber zum Stehen (nach ${ice.stop?.toFixed(2)} s)`);
check(ground.dist < 0.6, `Festhalten auf Beton stoppt sofort: ${ground.dist.toFixed(2)} m`);

if (fails) { console.log(`\n${fails} Fehler`); process.exit(1); }
console.log('\nEis-Bremsen ok');
