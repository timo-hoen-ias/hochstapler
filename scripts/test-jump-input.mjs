// Prüft, dass ein Sprung-Tastendruck beim Laufen nie verloren geht – bei jeder
// Bildrate (60–240 Hz, mit Frame-Zittern). Bildet die Spielschleife aus main.js nach.
import { Colliders, createBody, stepBody } from '../client/src/physics.js';
import { FixedStep } from '../client/src/loop.js';

const level = { statics: [{ min: [-500, -1, -500], max: [500, 0, 500], mat: 'floor' }], movers: [], zones: [] };
const world = new Colliders(level);
world.update(0);

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let fails = 0;

for (const hz of [30, 60, 75, 90, 120, 144, 165, 240, 360]) {
  const clock = new FixedStep(1 / 120);
  const body = createBody([0, 0, 0]);
  let presses = 0, lost = 0, frames = 0;
  // 2 Minuten laufen, nach jeder Landung nach zufälliger Zeit springen
  let waitFrames = 10;
  for (; frames < hz * 120; frames++) {
    const dt = Math.min(0.1, (1 / hz) * (0.85 + 0.3 * rnd()));
    let press = false;
    if (body.grounded && --waitFrames <= 0) { press = true; presses++; waitFrames = 5 + Math.floor(rnd() * 30); }
    const dir = frames % 600 < 300 ? 1 : -1;
    const input = { x: dir, z: 0.3, jump: press, brace: false };
    const steps = clock.frame(dt, press);
    let jumped = false;
    for (let i = 0; i < steps; i++) {
      stepBody(body, { ...input, jump: clock.takeJump() }, world, clock.step);
      if (body.jumped) jumped = true;
    }
    // Spätestens im nächsten Frame mit Physikschritt muss der Sprung kommen
    if (press && !jumped) {
      let later = false;
      for (let k = 0; k < 4 && !later; k++) {
        const s2 = clock.frame(1 / hz, false);
        for (let i = 0; i < s2; i++) {
          stepBody(body, { ...input, jump: clock.takeJump() }, world, clock.step);
          if (body.jumped) later = true;
        }
        if (s2) break;
      }
      if (!later) lost++;
    }
  }
  const ok = lost === 0;
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${String(hz).padStart(3)} Hz: ${presses} Sprünge gedrückt, ${lost} verloren`);
}
if (fails) { console.error(`${fails} Bildraten mit verlorenen Sprüngen`); process.exit(1); }
console.log('Sprung-Eingabe: keine verlorenen Sprünge');
