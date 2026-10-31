// Prüft die Team-Logik (2 gegen 2) aus client/src/teams.js.
import assert from 'node:assert/strict';
import { hostOf, modeError, assignTeams, teamForNewcomer, ropeChain, ropeGroups } from '../client/src/teams.js';

const P = [0, 1, 2, 3].map((slot) => ({ id: 'p' + slot, slot }));

assert.equal(hostOf([P[2], P[1], P[3]]).id, 'p1', 'Gastgeber = niedrigster Slot');
assert.equal(modeError('teams', 4), null);
for (const n of [1, 2, 3]) assert.ok(modeError('teams', n), `2 gegen 2 mit ${n} Spielern abgelehnt`);
assert.equal(modeError('rope', 3), null);
assert.ok(modeError('chaos', 4));

const t = assignTeams(P);
assert.deepEqual(t, { p0: 0, p1: 0, p2: 1, p3: 1 }, 'Standard: Slot 0+1 gegen 2+3');
let seed = 3;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let k = 0; k < 50; k++) {
  const s = Object.values(assignTeams(P, rnd));
  assert.equal(s.filter((x) => x === 0).length, 2, 'Auslosen: immer 2 gegen 2');
}

// Lokaler Koop: zwei Spieler am selben Gerät landen im selben Team
const dev = [
  { id: 'a', slot: 0, dev: 'X' }, { id: 'b', slot: 1, dev: 'Y' },
  { id: 'c', slot: 2, dev: 'X' }, { id: 'd', slot: 3, dev: 'Z' },
];
for (let k = 0; k < 30; k++) {
  const s = assignTeams(dev, k ? rnd : null);
  assert.equal(s.a, s.c, 'Gerät X bleibt zusammen');
  assert.equal(Object.values(s).filter((x) => x === 0).length, 2);
}
// Vier Controller an einem Gerät: trotzdem 2 gegen 2
const couch = [0, 1, 2, 3].map((slot) => ({ id: 'k' + slot, slot, dev: 'C' }));
assert.equal(Object.values(assignTeams(couch)).filter((x) => x === 0).length, 2, 'Sofa-Duell 2 gegen 2');

assert.equal(teamForNewcomer([{ team: 0 }, { team: 0 }, { team: 1 }]), 1, 'Nachzügler ins kleinere Team');
assert.equal(teamForNewcomer([{ team: 0 }, { team: 1 }]), 0);

const teams = P.map((p) => ({ ...p, team: t[p.id] }));
assert.deepEqual(ropeChain(teams, 'p3', 'teams').map((p) => p.id), ['p2', 'p3'], 'Seil nur im eigenen Team');
assert.deepEqual(ropeChain(teams, 'p3', 'rope').map((p) => p.id), ['p0', 'p1', 'p2', 'p3'], 'Seilmodus: alle verbunden');
assert.equal(ropeGroups(teams, 'teams').length, 2);
assert.equal(ropeGroups(teams, 'rope')[0].length, 4);
console.log('Teams: 2-gegen-2-Logik ok');
