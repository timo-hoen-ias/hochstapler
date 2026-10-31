// "Letzte sichere Stelle" für die Reset-Taste: der zuletzt ruhig betretene, harmlose
// Untergrund. Nach einem Absturz bleibt die Stelle oben, weil tiefer gelegene
// Landeplätze erst zählen, wenn man wieder in die Nähe hochgeklettert ist.

const STAND = 0.35;      // so lange muss man ruhig stehen, bis die Stelle zählt
const MAX_DROP = 2.2;    // tiefer gelegene Stellen zählen nur bis zu diesem Abstand

// Ist dieser Untergrund an dieser Stelle sicher genug zum Zurücksetzen?
export function safeGround(body, world) {
  const b = body.ground;
  if (!body.grounded || !b || body.hang || body.hook || body.ladder) return false;
  if (b.big || b.mover || b.blink || b.ramp || b.round || b.belt || b.bounce || b.fan || b.basin || b.ice || b.gate) return false;
  if (body.zapped || body.hurt) return false;
  if (world.zoneAt(body.pos, true) || world.zoneAt(body.pos)) return false; // Wind, Aufwind
  // keine Gefahr (auch keine gerade ausgeschaltete) auf dieser Plattform
  for (const z of world.hazards || []) {
    const c = z.cur || z;
    if (c.max[1] < b.max[1] - 0.1 || c.min[1] > b.max[1] + 2.5) continue;
    if (c.min[0] < b.max[0] && c.max[0] > b.min[0] && c.min[2] < b.max[2] && c.max[2] > b.min[2]) return false;
  }
  return true;
}

// Pro Spieler und Physikschritt aufrufen. s = Zustand des Spielers ({} am Anfang)
export function trackSafe(s, body, world, dt) {
  if (!safeGround(body, world)) { s.calm = 0; return; }
  const b = body.ground;
  s.calm = (s.calm || 0) + dt;
  if (s.calm < STAND) return;
  if (s.spot && b.max[1] < s.spot.y - MAX_DROP) return; // nach Absturz: die alte Stelle bleibt
  s.spot = { box: b, y: b.max[1], pos: [body.pos[0], b.max[1], body.pos[2]] };
}

// Neue Stelle erzwingen (Zwischenstopp, Neustart): ab hier zählt wieder alles
export function resetSafe(s, spot = null) { s.spot = spot; s.calm = 0; }

// Startplätze für n Spieler auf der Box: entlang der längeren Seite verteilt
export function spreadOn(box, center, n, i) {
  const pos = [...center];
  const sx = box.max[0] - box.min[0], sz = box.max[2] - box.min[2];
  const ax = sx >= sz ? 0 : 2, lat = ax === 0 ? 2 : 0;
  const len = Math.max(0, (ax === 0 ? sx : sz) - 0.7);
  const wid = Math.max(0, (ax === 0 ? sz : sx) - 0.7);
  if (n > 1) {
    const step = Math.min(0.8, len / (n - 1));
    pos[ax] += (i - (n - 1) / 2) * step;
    if (step < 0.5 && wid > 0.6) pos[lat] += (i % 2 ? 1 : -1) * Math.min(0.4, wid / 2);
  }
  // in der Box halten
  pos[0] = Math.min(box.max[0] - 0.35, Math.max(box.min[0] + 0.35, pos[0]));
  pos[2] = Math.min(box.max[2] - 0.35, Math.max(box.min[2] + 0.35, pos[2]));
  if (box.max[0] - box.min[0] < 0.7) pos[0] = (box.min[0] + box.max[0]) / 2;
  if (box.max[2] - box.min[2] < 0.7) pos[2] = (box.min[2] + box.max[2]) / 2;
  pos[1] = box.max[1] + 0.05;
  return pos;
}
