// Spielmodus und Teams – reine Logik, genutzt von Server (Durable Object) und Client.
//
// Modi:
//   'rope'  – alle im Raum hängen an einem gemeinsamen Seil (Standard, auch bei 2 und 3 Spielern)
//   'teams' – 2 gegen 2: zwei Seilschaften klettern um die Wette auf denselben Turm.
//             Nur mit genau 4 Spielern wählbar; jedes Team hat eigene Zwischenstopps.

export const MODES = ['rope', 'teams'];
export const TEAM_SIZE = 2;
export const TEAMS = [
  { name: 'Team Gabelstapler', short: 'Gabelstapler', color: '#f2c014' },
  { name: 'Team Hubwagen', short: 'Hubwagen', color: '#4fb3ff' },
];

export function modeLabel(mode) {
  return mode === 'teams' ? '2 gegen 2' : 'Alle an einem Seil';
}

// Gastgeber ist, wer den niedrigsten Platz (Slot) im Raum hat.
export function hostOf(players) {
  let host = null;
  for (const p of players) if (!host || p.slot < host.slot) host = p;
  return host;
}

// Darf der Modus gewechselt werden? Liefert null oder einen Grund (deutsch).
export function modeError(mode, playerCount) {
  if (!MODES.includes(mode)) return 'Unbekannter Modus';
  if (mode === 'teams' && playerCount !== 4) return 'Für 2 gegen 2 braucht ihr genau 4 Spieler im Raum';
  return null;
}

// Teams neu verteilen. Spieler am selben Gerät (dev, lokaler Koop) bleiben möglichst
// zusammen, weil sie sich eine Kamera teilen. Ohne rnd nach Slot (0+1 gegen 2+3),
// mit rnd (Funktion wie Math.random) ausgelost. Liefert { [id]: 0|1 }.
export function assignTeams(players, rnd = null) {
  const cap = Math.ceil(players.length / 2);
  const groups = new Map();
  for (const p of [...players].sort((a, b) => a.slot - b.slot)) {
    const key = p.dev || p.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  let list = [...groups.values()];
  if (rnd) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  // Größere Gerätegruppen zuerst, damit sie nicht zerrissen werden (stabil sortiert)
  list = list.map((g, i) => [g, i]).sort((a, b) => b[0].length - a[0].length || a[1] - b[1]).map(([g]) => g);
  // Der Reihe nach auffüllen: erst Team 0, dann Team 1
  const out = {};
  let k = 0;
  for (const g of list) for (const p of g) out[p.id] = k++ < cap ? 0 : 1;
  return out;
}

// Neuer Spieler im Teammodus: ins kleinere Team (bei Gleichstand Team 0).
export function teamForNewcomer(players) {
  const n = [0, 0];
  for (const p of players) if (p.team === 0 || p.team === 1) n[p.team]++;
  return n[1] < n[0] ? 1 : 0;
}

// Seilschaften: wer hängt an wem? Im Seilmodus alle, im Teammodus nur das eigene Team.
// players: [{ id, slot, team }] – liefert die Kette (nach Slot sortiert), zu der `id` gehört.
export function ropeChain(players, id, mode) {
  const me = players.find((p) => p.id === id);
  const list = mode === 'teams' && me ? players.filter((p) => p.team === me.team) : [...players];
  return list.sort((a, b) => a.slot - b.slot);
}

// Alle Seilschaften (für das Zeichnen der Seile).
export function ropeGroups(players, mode) {
  if (mode !== 'teams') return [[...players].sort((a, b) => a.slot - b.slot)];
  return [0, 1].map((t) => players.filter((p) => p.team === t).sort((a, b) => a.slot - b.slot));
}
