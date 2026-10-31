// Große Rätsel-Plattformen ("Arenen") zwischen den Kletterabschnitten. Jede Arena hat
// eine Maschine, die nur zusammen richtig funktioniert, und meist eine Koop-Wand
// (Räuberleiter oder Hochziehen). Wer allein spielt, bekommt kleine Hilfen:
// eine Klappleiter an der Koop-Wand und einen Platz, an dem man alles bedienen kann.
//
// Gebaut wird in einem Arena-Rahmen: a = entlang der Laufrichtung (ab der Kante der
// Einstiegsplattform), c = quer dazu (rechts positiv). Alle Teile tragen die Arena-ID,
// damit die Platzprüfung Teile derselben Arena nicht gegeneinander prüft.

// Welche Maschine in welchem Akt
export const ARENA_OF = {
  lager: 'forklift', // Akt 1: Staplerhof
  kuehl: 'crane', // Akt 2: Eiskran über dem Kälteschacht
  paket: 'lift', // Akt 3: Paketaufzug mit Sortierarm-Lasern
  silo: 'siloLift', // Akt 4: Siloaufzug im Böenschacht
  chemie: 'acidForklift', // Akt 5: Stapler durch das Säurebecken
  gleis: 'trolley', // Akt 6: Draisine über die Gleisbrücke
  kran: 'towerCrane', // Akt 7: Turmkran um den Betonkern
};

export const COOP_WALL = 4.3; // Räuberleiter-/Hochzieh-Wand: allein zu hoch (3,7 m), zu zweit machbar

export function buildArena(k, kind, T, id, mirror, shift = 0) {
  const f = k.fwd;
  const r = [-f[1], f[0]];
  const p = k.prev;
  const pc = [(p.min[0] + p.max[0]) / 2, (p.min[2] + p.max[2]) / 2];
  const half = f[0] ? (p.max[0] - p.min[0]) / 2 : (p.max[2] - p.min[2]) / 2;
  const gap = 1.3;
  // shift: Arena quer versetzt (die Einstiegsplattform ist breit genug)
  const O = [pc[0] + f[0] * (half + gap) + r[0] * shift, pc[1] + f[1] * (half + gap) + r[1] * shift];
  const m = mirror ? -1 : 1; // Arena gespiegelt (zweiter Versuch)
  const y0 = p.max[1] + 0.5;
  const W = (a, c) => [O[0] + f[0] * a + r[0] * c * m, O[1] + f[1] * a + r[1] * c * m];
  const rect = (a0, a1, c0, c1) => {
    const A = W(a0, c0), B = W(a1, c1);
    return { min: [Math.min(A[0], B[0]), Math.min(A[1], B[1])], max: [Math.max(A[0], B[0]), Math.max(A[1], B[1])] };
  };
  const B3 = (a0, a1, c0, c1, ya, yb) => {
    const q = rect(a0, a1, c0, c1);
    return { min: [q.min[0], ya, q.min[1]], max: [q.max[0], yb, q.max[1]] };
  };
  const solid = (a0, a1, c0, c1, ya, yb, mat, extra = {}) => {
    const b = B3(a0, a1, c0, c1, ya, yb);
    return k.solid(b.min, b.max, mat, { arena: id, ...extra });
  };
  const yawF = Math.atan2(f[0], f[1]);
  const dirF = [f[0], f[1]];
  const dirR = [r[0] * m, r[1] * m];
  const signText = (title, sub) => k.sign(title, sub);
  // Leiter an einer Wand, deren Fläche bei a = aFace liegt und nach -a zeigt
  const ladderAt = (aFace, c, yBot, yTop, o) => {
    const b = B3(aFace - 0.65, aFace, c - 0.45, c + 0.45, yBot - 0.05, yTop);
    return k.ladder(b.min, b.max, [-f[0], -f[1]], { arena: id, ...o });
  };
  // Koop-Wand: unten Einstieg (a 0..aWall), oben Plattform bis aTop. Allein: Klappleiter.
  function coopWall(aWall, aTop, cw, mat) {
    const lo = solid(0, aWall, -cw, cw, y0 - 0.6, y0, mat);
    k.addPath(lo, 'static', { arena: id });
    signText('RÄUBERLEITER', 'Einer hält fest (Shift), der andere springt von ihm ab – oben festhalten zieht hoch');
    const y1 = y0 + COOP_WALL;
    const hi = solid(aWall, aTop, -cw, cw, y0 - 0.6, y1, mat, { coopWall: true });
    k.addPath(hi, 'coop', { how: 'coop', arena: id });
    ladderAt(aWall, cw - 0.9, y0, y1, { solo: true });
    return { lo, hi, y1 };
  }
  const reserve = (a0, a1, c0, c1, ya, yb) => k.reserve(B3(a0, a1, c0, c1, ya, yb), id);
  const exitPath = (b, machine) => k.addPath(b, 'machine', { how: 'machine', machine: machine.id, arena: id });

  switch (kind) {
    case 'forklift':
    case 'acidForklift': {
      // Staplerhof: einer fährt, die anderen stehen auf der Gabel und steigen oben aufs Regal.
      // Der Fahrer kommt über die Notleiter nach, die oben per Hebel heruntergelassen wird.
      const acid = kind === 'acidForklift';
      const L = 26, H = 8;
      const floorMat = acid ? 'concrete' : 'concrete';
      const floor = solid(0, L, -H, H, y0 - 0.6, y0, floorMat, { arenaFloor: true });
      k.addPath(floor, 'static', { arena: id });
      signText(acid ? 'SÄUREBECKEN · STAPLER' : 'STAPLERHOF', acid ? 'Gabel hoch über die Säure! Einer fährt (G), die anderen fahren mit' : 'Einer fährt (G am Sitz), die anderen auf die Gabel – oben Hebel ziehen');
      if (acid) {
        // Säure auf dem Hallenboden: Stapler fährt hindurch, Füße verätzen
        const az = B3(6.5, 21.5, -H, H, y0, y0 + 0.2);
        k.hazard('spikes', az.min, az.max, { skin: 'acid', arena: id });
      }
      // Palettenstapel als Slalom
      const obsMat = acid ? 'drum' : 'goods';
      const o1 = solid(7.5, 9, -H, 0.5, y0, y0 + 1.5, obsMat);
      const o2 = solid(15, 16.5, -0.5, H, y0, y0 + 1.5, obsMat);
      // Regal am Ende: 4,8 m hoch (zu hoch für Räuberleiter und Hochziehen einzeln)
      const RACK = 4.8;
      const rack = solid(23.6, L, -6.5, -1.5, y0, y0 + RACK, 'goods', { rack: true });
      const fl = k.machine({
        type: 'forklift', arena: id, kind, y: y0,
        home: [...W(3.5, 4.5), yawF],
        area: rect(0.3, L - 0.3, -H + 0.3, H - 0.3),
        obstacles: [o1, o2, rack],
        forkMax: RACK - 0.5 - 0.12,
        stations: [
          { key: 'seat', label: 'Fahrersitz', hint: 'W/S fahren · A/D lenken · Leertaste/Shift Gabel' },
          { key: 'forkbtn', label: 'Hubtaster', hint: 'W/Leertaste hoch · S/Shift runter', soloOnly: true },
        ],
        acid,
        // Lösungsweg für die Simulation (test-arenas.mjs): Mitte des Staplers, zuletzt Gabel am Regal
        route: [[6, 4], [10, 4], [12.5, 0], [14, -4], [21.15, -4]].map(([a, c]) => W(a, c)),
      });
      // Notleiter und Hebel oben am Regal
      const flag = id + ':leiter';
      ladderAt(23.6, -5.6, y0, y0 + RACK, { flag });
      const lp = W(24.3, -2.2);
      k.lever({ arena: id, flag, pos: [lp[0], y0 + RACK, lp[1]], yaw: yawF + Math.PI, label: 'Notleiter ablassen' });
      exitPath(rack, fl);
      reserve(0, L, -H, H, y0, y0 + 6.8);
      break;
    }
    case 'crane': {
      // Eiskran: Plattform am Laufkran trägt alle über den Kälteschacht. Einer fährt die
      // Brücke, der andere Katze und Hubwerk. Eiswände zwingen zum Slalom, ein vereistes
      // Rohr mit Eiszapfen lässt nur ein schmales Höhenfenster.
      const H = 7;
      const { y1 } = coopWall(2.6, 5.6, H, 'ice');
      const o1 = solid(9.5, 10.5, -H, 1.2, y1 - 6, y1 + 6, 'ice', { frozenWall: true });
      const o2 = solid(14.5, 15.5, -1.2, H, y1 - 6, y1 + 6, 'ice', { frozenWall: true });
      const pipeLow = solid(18.4, 19.0, -H, H, y1 - 1.2, y1 - 0.6, 'pipe', { frozenPipe: true });
      const ceil = solid(18.0, 19.8, -H, H, y1 + 2.2, y1 + 2.8, 'ice', { icicles: true });
      const exit = solid(24, 28, -4, 4, y1 - 0.6, y1 + 1.2, 'crate');
      const hs = 1.6;
      const cr = k.machine({
        type: 'crane', kind: 'bridge', arena: id, y: y1,
        origin: W(0, 0), U: dirF, W: dirR, A: dirF, B: dirR, size: 2 * hs,
        home: [5.6 + hs + 0.05, 0, y1],
        range: [[5.6 + hs + 0.05, 24 - hs], [-H + hs, H - hs], [y1 - 1.5, y1 + 2.0]],
        speedU: 2.0, speedW: 1.8, speedH: 1.0, recall: 8,
        obstacles: [o1, o2, pipeLow, ceil, exit],
        route: [[7.25, 3.5, y1], [12.5, 3.5, y1], [12.5, -3.5, y1], [21.6, -3.5, y1], [21.6, 0, y1 + 1.2], [22.4, 0, y1 + 1.2]],
        stations: [
          { key: 'bridge', label: 'Kranfahrt', hint: 'Stick/WASD: Brücke vor und zurück (allein: alles)' },
          { key: 'trolley', label: 'Katze & Hubwerk', hint: 'Stick/WASD: Katze quer · Leertaste/Shift heben/senken' },
        ],
      });
      exitPath(exit, cr);
      reserve(2.6, 28, -H, H, y1 - 1.5, y1 + 7);
      break;
    }
    case 'lift':
    case 'siloLift': {
      // Kurbel-Aufzug: Korb mit zwei Kurbeln. Nur zu zweit geht es zügig nach oben,
      // einer allein schafft kaum etwas, und ohne Kurbeln rutscht der Korb ab.
      const silo = kind === 'siloLift';
      const H = 5;
      const { y1 } = coopWall(2.4, 6, H, silo ? 'concrete' : 'carton');
      const rise = silo ? 10 : 9;
      const half = 1.7;
      const cA = 6 + half + 0.05;
      const exit = solid(cA + half + 0.05, cA + half + 4.05, -3, 3, y1 + rise - 0.6, y1 + rise, silo ? 'grate' : 'goods');
      const lf = k.machine({
        type: 'lift', kind, arena: id, center: W(cA, 0), half,
        yMin: y1, yMax: y1 + rise, recall: 4,
        rails: [dirR, [-dirR[0], -dirR[1]]],
        stations: [
          { key: 'crankA', label: 'Kurbel', side: dirR, hint: 'W/Stick vor halten = kurbeln · Shift bremst' },
          { key: 'crankB', label: 'Kurbel', side: [-dirR[0], -dirR[1]], hint: 'W/Stick vor halten = kurbeln · Shift bremst' },
        ],
      });
      // Gefahren im Schacht
      const shaft = (ya, yb) => B3(cA - half - 0.3, cA + half + 0.3, -half - 0.3, half + 0.3, ya, yb);
      if (!silo) {
        // Sortierarme: Lichtgitter quer durch den Schacht, im Takt
        for (const [h, ph] of [[3.4, 0], [6.4, 0.5]]) {
          const z = shaft(y1 + h, y1 + h + 0.12);
          k.hazard('laser', z.min, z.max, { timer: { period: 4.2, phase: ph, on: 0.4 }, color: T.laser, arena: id, grid: true });
        }
        signText('PAKETAUFZUG', 'Zwei Kurbeln (G) – zusammen kurbeln. Lichtgitter abwarten (Shift bremst)');
      } else {
        // Böen quer durch den Schacht und ein Füllstandsensor
        const wz = shaft(y1 + 2, y1 + 8.5);
        k.wind({ min: wz.min, max: wz.max }, [f[0] * 7, 0, f[1] * 7], { period: 4.5, phase: 0.3 });
        const z = shaft(y1 + 5.2, y1 + 5.32);
        k.hazard('laser', z.min, z.max, { timer: { period: 4.2, phase: 0.2, on: 0.4 }, color: T.laser, arena: id, grid: true });
        signText('SILOAUFZUG', 'Zwei Kurbeln (G). Böen im Schacht – Mitfahrer halten sich fest (Shift)');
      }
      exitPath(exit, lf);
      reserve(2.4, cA + half + 4.05, -H, H, y1, y1 + rise + 3);
      break;
    }
    case 'trolley': {
      // Draisine: zwei Pumpgriffe. Im Wechsel pumpen – allein mit einem Griff reicht es
      // nicht die Steigung hinauf. Oben kreuzt eine Oberleitung mit Lichtbogen im Takt.
      const H = 5;
      const { y1 } = coopWall(2.4, 7, H, 'timber');
      const s0 = 7 + 1.5 + 0.05, len = 16, rise = 1.6;
      const exit = solid(s0 + len + 1.55, s0 + len + 5.5, -3, 3, y1 + rise - 0.6, y1 + rise, 'wagon');
      const tr = k.machine({
        type: 'trolley', arena: id, start: W(s0, 0), dir: dirF, len, y0: y1, rise, slope: [3, 11],
        push: 1.0, spring: 1.3, friction: 0.25, grade: 1.5, vmax: 5.5, recall: 5,
        stations: [
          { key: 'pumpA', label: 'Pumpgriff hinten', hint: 'Leertaste pumpen, wenn dein Griff oben ist · Shift bremst' },
          { key: 'pumpB', label: 'Pumpgriff vorne', hint: 'Leertaste pumpen, wenn dein Griff oben ist · Shift bremst' },
        ],
      });
      // Oberleitung mit Lichtbogen über dem Gleis
      const aArc = s0 + 13.6;
      const z = B3(aArc - 0.2, aArc + 0.2, -2.2, 2.2, y1 + rise - 0.1, y1 + rise + 2.6);
      k.hazard('laser', z.min, z.max, { timer: { period: 3.6, phase: 0.1, on: 0.4 }, arc: true, color: T.laser, arena: id });
      signText('DRAISINE', 'Zwei Pumpgriffe (G): abwechselnd pumpen (Leertaste) – Lichtbogen abwarten');
      exitPath(exit, tr);
      reserve(2.4, s0 + len + 5.5, -H, H, y1 - 1, y1 + rise + 3.5);
      break;
    }
    case 'towerCrane': {
      // Turmkran: Plattform am Haken, einer dreht den Kran, der andere fährt Katze und Hub.
      // Rechts steht der Betonkern im Weg, links ein Gerüst – dort nur mit eingezogener Katze.
      const H = 9;
      const { y1 } = coopWall(2.4, 6, 4, 'concrete');
      const piv = 13;
      const mast = solid(piv - 0.8, piv + 0.8, -0.8, 0.8, y1 - 8, y1 + 10, 'machine', { mast: true });
      const core = solid(9.5, 16.5, 3.4, H, y1 - 8, y1 + 10, 'concrete', { core: true });
      const scaff = solid(12, 14, -H, -5.5, y1 - 8, y1 + 10, 'grate', { scaffold: true });
      const exit = solid(21, 25, -3, 3, y1 + 2.5 - 0.6, y1 + 2.5, 'concrete');
      const hs = 1.6;
      const pv = W(piv, 0);
      const home = Math.atan2(-f[0], -f[1]);
      // Drehrichtung zum Gerüst (-c): wachsender Winkel bewegt die Plattform entlang (cos u, -sin u)
      const sgn = Math.cos(home) * -dirR[0] - Math.sin(home) * -dirR[1] > 0 ? 1 : -1;
      const ang = (t) => home + sgn * t;
      const tc = k.machine({
        type: 'crane', kind: 'tower', arena: id, y: y1,
        pivot: pv, A: dirF, B: dirR, size: 2 * hs,
        home: [home, piv - 6 - hs - 0.05, y1],
        range: sgn > 0 ? [[home - 0.5, home + Math.PI + 0.3], [3.5, 7.4], [y1 - 1, y1 + 3]] : [[home - Math.PI - 0.3, home + 0.5], [3.5, 7.4], [y1 - 1, y1 + 3]],
        speedU: 1.6, speedW: 1.5, speedH: 1.0, recall: 8,
        obstacles: [mast, core, scaff, exit],
        stations: [
          { key: 'slew', label: 'Drehwerk', hint: 'Stick/WASD: Kran drehen (allein: alles)' },
          { key: 'trolley', label: 'Katze & Hubwerk', hint: 'Stick/WASD: Katze rein/raus · Leertaste/Shift heben/senken' },
        ],
        route: [[ang(0), 3.6, y1], [ang(Math.PI), 3.6, y1], [ang(Math.PI), 3.6, y1 + 2.5], [ang(Math.PI), 6.35, y1 + 2.5]],
      });
      // Höhenwind über dem Schwenkbereich
      const wz = B3(6, 21, -H, 0, y1 - 1, y1 + 5);
      k.wind({ min: wz.min, max: wz.max }, [dirR[0] * 6, 0, dirR[1] * 6], { period: 5.5, phase: 0.4 });
      signText('TURMKRAN', 'Einer dreht, der andere fährt Katze und Hub (G) – Mitfahrer festhalten');
      exitPath(exit, tc);
      reserve(2.4, 25, -H, H, y1 - 1, y1 + 7);
      break;
    }
    default:
      throw new Error('Unbekannte Arena ' + kind);
  }
}
