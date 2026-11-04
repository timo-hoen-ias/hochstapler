// E2E: Ein Spieler, dessen Verbindung stumm wird (kein close, keine Pings), wird nach
// ~30 s aus dem Raum entfernt. Voraussetzung: `npx wrangler dev --port 8799` läuft.
const BASE = process.env.WS_URL || 'ws://127.0.0.1:8799';
const room = 'STUMM' + Math.floor(Math.random() * 1e5);
const open = (name) => new Promise((res, rej) => {
  const ws = new WebSocket(`${BASE}/ws?room=${room}`);
  ws.msgs = [];
  ws.onmessage = (e) => ws.msgs.push(JSON.parse(e.data));
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', name })); res(ws); };
  ws.onerror = rej;
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const a = await open('Aktiv');
await sleep(500);
const b = await open('Stumm'); // schickt nach hello nichts mehr, schließt aber auch nicht
const t0 = Date.now();
const ping = setInterval(() => a.send(JSON.stringify({ t: 'ping', c: Date.now() })), 2000);
let left = null;
while (Date.now() - t0 < 45000) {
  left = a.msgs.find((m) => m.t === 'leave' && m.name === 'Stumm');
  if (left) break;
  await sleep(250);
}
clearInterval(ping);
const dt = (Date.now() - t0) / 1000;
const aStill = !a.msgs.some((m) => m.t === 'leave' && m.name === 'Aktiv') && a.readyState === 1;
a.close(); try { b.close(); } catch {}
if (!left) { console.error('FEHLER: stummer Spieler nach 45 s noch im Raum'); process.exit(1); }
if (dt < 29) { console.error(`FEHLER: zu früh entfernt (${dt.toFixed(1)} s)`); process.exit(1); }
if (!aStill) { console.error('FEHLER: aktiver Spieler wurde mit entfernt'); process.exit(1); }
console.log(`Stummer Spieler nach ${dt.toFixed(1)} s entfernt, aktiver bleibt: ok`);
process.exit(0);
