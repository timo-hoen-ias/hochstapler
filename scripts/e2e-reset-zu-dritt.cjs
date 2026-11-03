// Online-Test zu dritt: drei Browser im selben Raum, alle stehen auf einer Plattform
// über einem Zwischenstopp, einer drückt Reset. Niemand darf dabei vom Seil in die Luft
// gerissen werden oder vom Zwischenstopp fallen.
// Start: npm run build && npx wrangler dev --port 8799, dann node scripts/e2e-reset-zu-dritt.cjs
// (braucht Playwright mit Chromium; URL über BASE=...)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8799';
const ROOM = 'T' + Math.random().toString(36).slice(2, 7).toUpperCase();
(async () => {
  const br = await chromium.launch({ args: ['--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [];
  for (const n of ['Anna', 'Ben', 'Cem']) {
    const ctx = await br.newContext({ viewport: { width: 200, height: 120 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hochstapler.settings', JSON.stringify({ quality: 'low', splitscreen: false })); } catch {} });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('ERR', n, e.message));
    await pg.goto(`${BASE}/?room=${ROOM}&name=${n}&autostart=1`);
    await pg.waitForFunction(() => window.__game && window.__game.netReady && window.__game.p1.online, null, { timeout: 90000 });
    await pg.evaluate(() => { const v = window.__game.view; v.renderer.render = () => {}; if (v.composer) v.composer.render = () => {}; });
    pages.push(pg);
    await pg.waitForTimeout(500);
  }
  await pages[0].waitForTimeout(1500);
  console.log('remotes', await Promise.all(pages.map((p) => p.evaluate(() => window.__game.remotes.size))));
  // Plattform suchen: 5,5–7,5 m vom Zwischenstopp, mind. 2 m darüber
  const pick = await pages[0].evaluate(() => {
    const g = window.__game, L = g.level, out = [];
    for (const cp of L.checkpoints) {
      if (!cp.box || cp.index < 3) continue;
      for (const pth of L.path) {
        const b = pth.box; if (b.ramp || b.round) continue;
        if (b.max[0] - b.min[0] < 1.8 || b.max[2] - b.min[2] < 1.8 || b.hidden || b.crumble || b.blink) continue;
        const c = [(b.min[0] + b.max[0]) / 2, b.max[1] + 0.05, (b.min[2] + b.max[2]) / 2];
        const d = Math.hypot(c[0] - cp.pos[0], c[1] - cp.pos[1], c[2] - cp.pos[2]);
        if (d > 5 && d < 7.8 && c[1] - cp.pos[1] > 1.5) out.push({ cp: cp.index, c, d });
      }
    }
    return out.filter((x, i, a) => a.findIndex((y) => y.cp === x.cp) === i).slice(0, 5);
  });
  console.log('Szenarien', pick.length);
  const results = [];
  for (const sc of pick) for (const who of [0, 1, 2]) {
    // alle auf die höhere Plattform, Zwischenstopp setzen
    for (const [i, pg] of pages.entries()) await pg.evaluate(([sc, i]) => {
      const g = window.__game; g.setCheckpoint(sc.cp, false, true);
      const b = g.p1.body; b.pos = [sc.c[0] + (i - 1) * 0.6, sc.c[1] + 0.1, sc.c[2]]; b.vel = [0, 0, 0];
      g.lastReset = 0; window.__trace = null;
    }, [sc, i]);
    await pages[0].waitForTimeout(1200);
    for (const pg of pages) await pg.evaluate((cp) => {
      const g = window.__game, cpY = g.level.checkpoints[cp].pos[1];
      window.__trace = { maxUp: -9, minY: 9, t0: performance.now() };
      const c = g.level.checkpoints[cp].pos;
      const tick = () => { const p = g.p1.body.pos, y = p[1] - cpY; const tr = window.__trace; if (!tr) return;
        if (!tr.on && Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < 1.6) tr.on = true;
        if (tr.on) { tr.maxUp = Math.max(tr.maxUp, y); tr.minY = Math.min(tr.minY, y); }
        if (performance.now() - tr.t0 < 2500) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, sc.cp);
    await pages[who].evaluate(() => window.__game.resetToSafe(window.__game.p1));
    await pages[0].waitForTimeout(2700);
    const r = await Promise.all(pages.map((pg) => pg.evaluate(() => {
      const g = window.__game, b = g.p1.body, cp = g.level.checkpoints[g.cpOf(g.p1)];
      const onCp = b.grounded && b.ground === cp.box;
      return { ...window.__trace, onCp, cpNow: g.cpOf(g.p1) };
    })));
    results.push({ cp: sc.cp, who, r });
    const bad = r.filter((x) => x.maxUp > 0.8 || x.minY < -0.5 || !x.onCp).length;
    console.log(`ZS ${sc.cp} Reset durch ${['Anna','Ben','Cem'][who]}: ` + r.map((x, i) => `${['A','B','C'][i]} hoch ${x.maxUp.toFixed(2)} tief ${x.minY.toFixed(2)} ${x.onCp ? 'steht' : 'NICHT auf ZS'}`).join(' | ') + (bad ? '  ✗' : ''));
  }
  const bad = results.flatMap((x) => x.r).filter((x) => x.maxUp > 0.8 || x.minY < -0.5 || !x.onCp).length;
  console.log('Spieler in die Luft / runter:', bad, 'von', results.length * 3);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
