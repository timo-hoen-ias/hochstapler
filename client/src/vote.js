// Abstimmung „zurück zum Zwischenstopp“: Im Koop holt die Reset-Taste (R / View / ↺)
// die ganze Seilschaft zurück – aber erst, wenn alle darin zugestimmt haben.
// Wer fragt, entscheidet am Ende (schickt den Warp); die anderen zeigen nur den Stand.

export const VOTE_TIME = 20; // Sekunden, bis eine Abstimmung verfällt
export const VOTE_GRACE = 5; // so lange warten Mitspieler zusätzlich auf den Warp

export class ResetVote {
  // need: alle Spieler-IDs, die zustimmen müssen (inkl. dem, der fragt)
  constructor({ v, by, byName, need, team = 0, now = 0 }) {
    this.v = v;
    this.by = by;
    this.byName = byName;
    this.need = [...new Set(need)];
    if (!this.need.includes(by)) this.need.push(by);
    this.team = team;
    this.yes = new Set([by]);
    this.started = now;
    this.until = now + VOTE_TIME * 1000;
    this.closing = false; // alle dafür, Warp kommt gleich
  }

  // true, wenn die Stimme neu ist
  agree(id) {
    if (!this.need.includes(id) || this.yes.has(id)) return false;
    this.yes.add(id);
    return true;
  }

  // Spieler hat den Raum verlassen: zählt nicht mehr mit
  drop(id) {
    this.need = this.need.filter((x) => x !== id);
    this.yes.delete(id);
  }

  has(id) { return this.need.includes(id); }
  get count() { return this.need.filter((id) => this.yes.has(id)).length; }
  get done() { return this.need.every((id) => this.yes.has(id)); }
  secondsLeft(now) { return Math.max(0, Math.ceil((this.until - now) / 1000)); }
}

// Fragen zwei gleichzeitig, gewinnt überall dieselbe Abstimmung (kleinere Kennung)
export function voteWinner(a, b) {
  return a.v <= b.v ? a : b;
}

export function newVoteId() {
  return Math.random().toString(36).slice(2, 10);
}
