// Fester Physik-Takt (120 Hz) unabhängig von der Bildrate.
// Bei Bildschirmen über 120 Hz gibt es Frames ganz ohne Physikschritt. Ein Sprung,
// der in so einem Frame gedrückt wird, darf nicht verloren gehen: er bleibt
// gemerkt, bis der nächste Physikschritt ihn abholt.
export class FixedStep {
  constructor(step = 1 / 120, maxSteps = 12) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
    this.jump = false;
  }

  // Liefert die Anzahl der Physikschritte für diesen Frame.
  frame(dt, jumpPressed) {
    if (jumpPressed) this.jump = true;
    this.acc += dt;
    const steps = Math.min(this.maxSteps, Math.floor(this.acc / this.step));
    this.acc -= steps * this.step;
    if (this.acc > this.step) this.acc = 0; // nach einem Hänger nicht nachholen
    return steps;
  }

  // Sprung-Flanke für den nächsten Physikschritt (nur einmal true).
  takeJump() {
    const j = this.jump;
    this.jump = false;
    return j;
  }

  reset() { this.acc = 0; this.jump = false; }
}
