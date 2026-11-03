// Abstimmung „zurück zum Zwischenstopp“: Zählen, Verlassen, gleichzeitige Anfragen
import { ResetVote, voteWinner, VOTE_TIME } from '../client/src/vote.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('✗', msg); } };

const v = new ResetVote({ v: 'b1', by: 'A', byName: 'Anna', need: ['A', 'B', 'C'], now: 1000 });
ok(v.count === 1 && !v.done, 'Fragende stimmt automatisch zu');
ok(v.agree('B') && !v.agree('B'), 'Stimme zählt nur einmal');
ok(!v.agree('X'), 'Fremde (anderes Team / neu dazugekommen) zählen nicht');
ok(!v.done && v.count === 2, '2 von 3 reicht nicht');
v.drop('C');
ok(v.done, 'wer geht, muss nicht mehr zustimmen');
ok(v.secondsLeft(1000) === VOTE_TIME && v.secondsLeft(1000 + VOTE_TIME * 1000 + 5) === 0, 'Restzeit');

const w = new ResetVote({ v: 'a9', by: 'B', byName: 'Ben', need: ['A', 'B'] });
ok(voteWinner(v, w) === w && voteWinner(w, v) === w, 'gleichzeitige Anfragen: überall dieselbe gewinnt');

const solo = new ResetVote({ v: 'c', by: 'A', byName: 'Anna', need: [] });
ok(solo.need.length === 1 && solo.done, 'Fragender ist immer dabei');

if (fails) { console.log(`Abstimmung: ${fails} Fehler`); process.exit(1); }
console.log('Abstimmung: ok');
