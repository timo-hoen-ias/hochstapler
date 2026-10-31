// Akt 8 "Löschwasserwerk": Feuer und Wasser als Set-Pieces für acts.js.
// Schwimmkanal mit Tauchschleusen und brennendem Öl, Flutkammer mit steigendem
// Wasser, Brandhalle mit Feuerlöschern und Notdusche, Gasbrenner im Wellentakt,
// Flammenrohre über den Lücken und ein Sprinkler-Rätsel.

export const FIRE_ACT = {
  key: 'feuer', name: 'Löschwasserwerk', sub: 'Flammen, Feuerlöscher und Tauchbecken',
  fog: [0xd98a5a, 0x8fb4c8, 0xc77a52], mats: ['concrete', 'grate', 'crate', 'machine'], beam: 'beam', skin: 'spikes', laser: 0xff7a2a,
  sections: ['Pumpenhaus', 'Löschteich', 'Brandhalle', 'Flutkammer', 'Sprinklerzentrale', 'Brandmeldeturm'],
  pool: { burners: 3, jets: 3, fireroom: 2, canal: 0.6, flood: 0.8, stairs: 2, ledges: 2, pipes: 1, beams: 1 },
  puzzles: ['sprinkler', 'gate'], scenery: 'waterworks',
  // Leitstück je Abschnitt (an zweiter Stelle im Abschnittsplan)
  fixed: ['burners', 'canal', 'fireroom', 'flood', 'jets', 'canal'],
};

let grpId = 0;

// k = Baukasten aus level.js, S = Stufen-Helfer aus acts.js, rnd = Zufall (fester Seed)
export function firePieces(k, S, rnd) {
  const R = (a, b) => a + (b - a) * rnd();
  const turn = () => (rnd() < 0.5 ? 'l' : 'r');
  const mid = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];

  // Lokales Gitter ab der Vorderkante von prev: a = entlang der Laufrichtung, c = quer (rechts +)
  function frame(gap = 0) {
    const p = k.prev, f = k.dirVec('f'), r = k.dirVec('r');
    const [cx, cz] = mid(p);
    const half = f[0] ? (p.max[0] - p.min[0]) / 2 : (p.max[2] - p.min[2]) / 2;
    const ox = cx + f[0] * (half + gap), oz = cz + f[1] * (half + gap);
    const pt = (a, c) => [ox + f[0] * a + r[0] * c, oz + f[1] * a + r[1] * c];
    return {
      f, r, pt,
      box(a0, a1, c0, c1, y0, y1) {
        const p0 = pt(a0, c0), p1 = pt(a1, c1);
        return { min: [Math.min(p0[0], p1[0]), y0, Math.min(p0[1], p1[1])], max: [Math.max(p0[0], p1[0]), y1, Math.max(p0[1], p1[1])] };
      },
      vec: (s) => [f[0] * s, 0, f[1] * s],
    };
  }
  const put = (b, mat, extra) => k.solid(b.min, b.max, mat, extra);

  return {
    // ───── Schwimmkanal: hineinspringen, unter Schleusen durchtauchen, unter brennendem Öl hindurch ─────
    canal(T, g) {
      const A = S('f', R(1.0, 1.3), R(0.3, 0.6), 2.2, 2.2, T.mats[1], { exact: true });
      const grp = ++grpId;
      const F = frame(1.2);
      const Wd = 3.2, rim = 0.4, L = R(13, 15.5), depth = 3.1;
      const W = Wd / 2, O = W + rim;
      const top = A.max[1] + R(0.3, 0.6), surf = top - 0.8, fl = surf - depth;
      // Startblock (Sprungbrett) bildet die vordere Beckenwand
      const entry = put(F.box(0, 2.2, -O, O, fl - 0.4, top), 'pooltile', { grp });
      k.addPath(entry);
      k.prop('diveboard', null, { box: entry, f: F.f });
      const a0 = 2.2, a1 = a0 + L;
      const floor = put(F.box(a0, a1 + rim, -O, O, fl - 0.4, fl), 'pooltile', { grp, basin: true });
      k.supports(floor);
      put(F.box(a1, a1 + rim, -O, O, fl, surf + 0.3), 'pooltile', { grp });
      // Tauchschleusen: Wand quer über den Kanal bis knapp unter die Oberfläche
      const cs = g > 0.5 ? [a0 + L * 0.28, a0 + L * 0.55] : [a0 + L * 0.42];
      let last = a0;
      const rims = (to) => {
        put(F.box(last, to, -O, -W, fl, surf + 0.3), 'pooltile', { grp });
        put(F.box(last, to, W, O, fl, surf + 0.3), 'pooltile', { grp });
      };
      for (const c of cs) {
        rims(c);
        put(F.box(c, c + 0.5, -W, W, surf - 0.9, surf + 2.8), 'lock', { grp, nogrip: true });
        put(F.box(c, c + 0.5, -O, -W, fl, surf + 2.8), 'lock', { grp, nogrip: true });
        put(F.box(c, c + 0.5, W, O, fl, surf + 2.8), 'lock', { grp, nogrip: true });
        last = c + 0.5;
      }
      rims(a1);
      const eLen = 1.6;
      const wb = F.box(a0, a1 - eLen, -W, W, fl, surf);
      const w = k.water(wb.min, wb.max, { current: g > 0.6 ? F.vec(-0.8) : undefined, look: 'pool', depth });
      k.addPath({ min: wb.min, max: wb.max }, 'swim', { water: w });
      // Brennendes Öl auf dem Wasser hinter der letzten Schleuse: darunter durchtauchen
      if (g > 0.35) {
        const s0 = last + 0.7, s1 = Math.min(last + 3.0, a1 - eLen - 0.8);
        if (s1 - s0 > 1.2) { const fb = F.box(s0, s1, -W, W, surf - 0.3, surf + 1.3); k.hazard('fire', fb.min, fb.max, { oil: true }); }
      }
      const E = put(F.box(a1 - eLen, a1, -W, W, fl, surf + 0.35), 'pooltile', { grp });
      k.addPath(E, 'static', { how: 'swimout' });
      k.sign('LÖSCHTEICH', 'Festhalten (Shift) = tauchen · unter den Schleusen durch');
      S('f', 1.3, 0.3, 2.2, 2.2, T.mats[1], { exact: true });
    },

    // ───── Flutkammer: durch die Tür hinein, das Wasser steigt im Takt bis zum Ausstieg ─────
    flood(T, g) {
      const grp = ++grpId;
      S('f', R(1.0, 1.3), R(0.2, 0.5), 2.4, 2.4, T.mats[1], { exact: true, extra: { grp } });
      const F = frame(0);
      const inner = 4.2, Wd = 1.8, wt = 0.4, O = Wd + wt, door = 0.75;
      const fl = k.prev.max[1];
      const low = 0.5, rise = R(4.6, 5.2);
      const shelf = fl + low + rise + 0.35, H = shelf + 2.8;
      const wall = { grp, nogrip: true };
      put(F.box(0, wt, -O, -door, fl - 0.4, H), 'tank', wall);
      put(F.box(0, wt, door, O, fl - 0.4, H), 'tank', wall);
      put(F.box(0, wt, -door, door, fl + 2.7, H), 'tank', wall);
      put(F.box(0, wt, -door, door, fl - 0.4, fl), 'tank', { grp });
      const floor = put(F.box(wt, wt + inner, -O, O, fl - 0.4, fl), 'pooltile', { grp, basin: true });
      k.supports(floor);
      put(F.box(wt, wt + inner, -O, -Wd, fl, H), 'tank', wall);
      put(F.box(wt, wt + inner, Wd, O, fl, H), 'tank', wall);
      put(F.box(wt + inner, wt + inner + wt, -O, O, fl - 0.4, shelf), 'tank', { grp });
      const eLen = 1.2;
      const wb = F.box(wt, wt + inner - eLen, -Wd, Wd, fl, fl + low);
      const period = R(15, 17) - 2 * g;
      const w = k.water(wb.min, wb.max, { rise: { range: rise, period, phase: rnd() }, look: 'tank', top: H });
      k.addPath({ min: wb.min, max: wb.max }, 'swim', { water: w });
      const E = put(F.box(wt + inner - eLen, wt + inner, -Wd, Wd, fl, shelf), 'pooltile', { grp });
      k.addPath(E, 'static', { how: 'swimout' });
      k.prop('floodtank', null, { box: F.box(0, wt + inner + wt, -O, O, fl - 0.4, H), f: F.f, water: w.index });
      k.sign('FLUTKAMMER', 'Das Wasser steigt – oben am Podest festhalten');
      S('f', 1.3, 0.2, 2.2, 2.2, T.mats[1], { exact: true });
    },

    // ───── Brandhalle: Feuerlöscher nehmen oder unter der Notdusche nass werden ─────
    fireroom(T, g) {
      const st = S('f', R(1.0, 1.4), R(0.3, 0.6), 3.2, 3.2, 'concrete', { exact: true });
      const [cx, cz] = mid(st);
      const r = k.dirVec('r'), b = k.dirVec('b');
      k.extinguisher([cx + r[0] * 1.15 + b[0] * 0.7, st.max[1], cz + r[1] * 1.15 + b[1] * 0.7], [-r[0], -r[1]]);
      const sx = cx - r[0] * 1.0 + b[0] * 0.7, sz = cz - r[1] * 1.0 + b[1] * 0.7;
      k.water([sx - 0.5, st.max[1], sz - 0.5], [sx + 0.5, st.max[1] + 2.7, sz + 0.5], { shower: true });
      k.sign('BRANDHALLE', 'Feuerlöscher: auf die Flammen zulaufen · Notdusche: kurz feuerfest');
      const n = 3 + (g > 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = S(i && rnd() < 0.35 ? turn() : 'f', R(1.3, 1.7), R(0.0, 0.5), 2.4, 2.4, T.mats[(i + 2) % T.mats.length], { exact: true });
        k.hazard('fire', [p.min[0], p.max[1], p.min[2]], [p.max[0], p.max[1] + 2.3, p.max[2]], { ext: true });
      }
      S('f', 1.3, 0.3, 2.4, 2.4, T.mats[1], { exact: true });
    },

    // ───── Gasbrenner: Flammensäulen im Wellentakt ─────
    burners(T, g) {
      const period = R(3.2, 3.6) - 0.3 * g;
      for (let i = 0; i < 3; i++) {
        const p = S(i && rnd() < 0.4 ? turn() : 'f', R(1.2, 1.7), R(0.1, 0.6), 2.2, 2.2, 'grate', { exact: true });
        k.hazard('fire', [p.min[0] + 0.15, p.max[1], p.min[2] + 0.15], [p.max[0] - 0.15, p.max[1] + 2.2, p.max[2] - 0.15], { burner: true, timer: { period, phase: 1 - 0.3 * i, on: 0.42 } });
      }
      S('f', 1.4, 0.4, 2.2, 2.2, T.mats[0], { exact: true });
    },

    // ───── Flammenrohre: Stichflammen quer über die Lücken ─────
    jets(T, g) {
      let a = S('f', R(1.0, 1.4), R(0.2, 0.6), 2.4, 2.4, T.mats[1], { exact: true });
      for (let i = 0; i < 3; i++) {
        const dir = i && rnd() < 0.35 ? turn() : 'f';
        const b = S(dir, R(1.5, 1.9), R(-0.2, 0.5), 2.4, 2.4, T.mats[i % T.mats.length], { exact: true });
        const dv = k.dirVec(dir), ax = dv[0] ? 0 : 2;
        const lo = Math.min(a.max[1], b.max[1]) - 0.6, hi = Math.max(a.max[1], b.max[1]) + 2.6;
        const m0 = ax === 0 ? (dv[0] > 0 ? a.max[0] : b.max[0]) : (dv[1] > 0 ? a.max[2] : b.max[2]);
        const m1 = ax === 0 ? (dv[0] > 0 ? b.min[0] : a.min[0]) : (dv[1] > 0 ? b.min[2] : a.min[2]);
        const c = (m0 + m1) / 2, t = 0.12;
        const [bx, bz] = mid(b);
        const min = ax === 0 ? [c - t, lo, bz - 1.5] : [bx - 1.5, lo, c - t];
        const max = ax === 0 ? [c + t, hi, bz + 1.5] : [bx + 1.5, hi, c + t];
        k.hazard('fire', min, max, { jet: true, timer: { period: R(2.8, 3.4) - 0.3 * g, phase: rnd(), on: 0.45 } });
        a = b;
      }
    },

    // ───── Rätsel: Sprinkler-Auslöser halten, der Partner läuft über die brennende Brücke ─────
    sprinkler(T, g) {
      const st = S('f', R(1.0, 1.4), R(0.3, 0.7), 2.6, 2.6, 'concrete', { exact: true });
      const [sx, sz] = mid(st);
      const pa = k.plate(st, sx, sz, 1.0);
      k.sign('SPRINKLER', 'Einer hält den Auslöser, der andere läuft durchs Feuer');
      const b1 = S('f', R(1.5, 1.8), 0, R(4.6, 5.4), 0.9, 'grate', { exact: true });
      const b2 = S('f', R(1.4, 1.7), R(0.0, 0.3), 2.2, 2.2, 'grate', { exact: true });
      const [bx, bz] = mid(b2);
      const pb = k.plate(b2, bx, bz, 0.8);
      const z = k.hazard('fire', [b1.min[0] - 0.2, b1.max[1], b1.min[2] - 0.2], [b1.max[0] + 0.2, b1.max[1] + 2.6, b1.max[2] + 0.2], { plate: pa, sprinkler: true });
      z.plate2 = pb;
      S('f', 1.3, 0.3, 2.2, 2.2, T.mats[1], { exact: true });
    },
  };
}

// Kulisse: Löschwassertanks, Pumpenleitungen und ein Schlauchturm
export function waterworksScenery(prop, W, y0, y1) {
  for (let y = y0 + 2, i = 0; y < y1; y += 13, i++) {
    prop('tank', { pos: [i % 2 ? W - 1 : -W + 1, y, -24 + (i * 15) % 48], r: 3.8, h: 10, color: 3 });
    prop('tank', { pos: [-24 + (i * 19) % 48, y + 6, i % 2 ? -W + 1 : W - 1], r: 3.2, h: 9, color: 3 });
  }
  for (let y = y0 + 4; y < y1; y += 6) prop('piperun', { a: [-W + 1, -W + 1], b: [W - 1, -W + 1], y, n: 2, red: true });
  for (let y = y0 + 7; y < y1; y += 8) prop('piperun', { a: [W - 1, -W + 1], b: [W - 1, W - 1], y, n: 3, red: true });
}
