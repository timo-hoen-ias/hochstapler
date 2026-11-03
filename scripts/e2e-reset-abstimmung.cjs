// Online-Test: R im Koop startet eine Abstimmung. Erst wenn alle drei zugestimmt
// haben, geht die Seilschaft zum Zwischenstopp (und niemand fliegt dabei weg).
// Start: npm run build && npx wrangler dev --port 8799, dann node scripts/e2e-reset-abstimmung.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8799';
const ROOM = 'V' + Math.random().toString(36).slice(2, 7).toUpperCase();
let fails = 0;
const ok = (c, msg) => { console.log(c ? '✓' : '✗', msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [];
  for (const n of ['Anna', 'Ben', 'Cem']) {
    const ctx = await br.newContext({ viewport: { width: 200, height: 120 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hochstapler.settings', JSON.stringify({ quality: 'low', splitscreen: false })); } catch {} });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('ERR', n, e.message));
    await pg.goto(`${BASE}/?room=${ROOM}&name=${n}&autostart=1&debug=timo`);
    await pg.waitForFunction(() => window.__game && window.__game.netReady && window.__game.p1.online, null, { timeout: 90000 });
    await pg.evaluate(() => { const v = window.__game.view; v.renderer.render = () => {}; if (v.composer) v.composer.render = () => {}; });
    pages.push(pg);
    await pg.waitForTimeout(500);
  }
  await pages[0].waitForTimeout(1500);
  const all = (fn, arg) => Promise.all(pages.map((p) => p.evaluate(fn, arg)));
  // Zwischenstopp 5 erreicht, alle stehen etwas weiter oben
  const sc = await pages[0].evaluate(() => {
    const g = window.__game, cp = g.level.checkpoints[5];
    return { cp: 5, pos: cp.pos };
  });
  const place = async () => {
    for (const [i, pg] of pages.entries()) await pg.evaluate(([sc, i]) => {
      const g = window.__game; g.setCheckpoint(sc.cp, false, true);
      const b = g.p1.body; b.pos = [sc.pos[0] + (i - 1) * 0.5, sc.pos[1] + 40, sc.pos[2]]; b.vel = [0, 0, 0];
      g.p1.fly = true; g.lastReset = 0;
    }, [sc, i]);
    await pages[0].waitForTimeout(600);
  };
  const atCp = () => all(() => { const g = window.__game, c = g.level.checkpoints[g.cpOf(g.p1)].pos, p = g.p1.body.pos; return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < 3; });

  await place();
  // Anna drückt R
  await pages[0].evaluate(() => window.__game.requestReset(window.__game.p1));
  await pages[0].waitForTimeout(700);
  let st = await all(() => { const g = window.__game, v = [...g.votes.values()][0]; return v ? { n: v.count, of: v.need.length, ui: !document.getElementById('vote').classList.contains('hidden'), txt: document.getElementById('vote').textContent } : null; });
  ok(st.every((s) => s && s.n === 1 && s.of === 3 && s.ui), 'Abstimmung bei allen sichtbar (1/3)');
  console.log('  Anzeige:', st[1] && st[1].txt);
  ok((await atCp()).every((x) => !x), 'noch niemand zurückgesetzt');
  // Ben stimmt zu
  await pages[1].evaluate(() => window.__game.requestReset(window.__game.p1));
  await pages[0].waitForTimeout(700);
  st = await all(() => { const v = [...window.__game.votes.values()][0]; return v ? v.count : -1; });
  ok(st.every((n) => n === 2), '2/3 bei allen');
  ok((await atCp()).every((x) => !x), 'mit 2/3 noch kein Reset');
  // Cem stimmt zu -> alle zurück
  await all(() => { window.__game.p1.fly = false; });
  await pages[2].evaluate(() => window.__game.requestReset(window.__game.p1));
  await pages[0].waitForTimeout(2500);
  ok((await atCp()).every((x) => x), 'alle stehen am Zwischenstopp');
  ok((await all(() => window.__game.votes.size)).every((n) => n === 0), 'Abstimmung überall beendet');

  // Ablauf: niemand stimmt zu -> kein Reset
  await place();
  await pages[1].evaluate(() => { const g = window.__game; g.requestReset(g.p1); for (const v of g.votes.values()) v.until = performance.now() + 1500; });
  await pages[0].waitForTimeout(2500);
  ok((await all(() => window.__game.votes.size)).every((n) => n === 0), 'abgelaufene Abstimmung überall weg');
  ok((await atCp()).every((x) => !x), 'nach Ablauf niemand zurückgesetzt');

  // Wer geht, muss nicht zustimmen: Cem verlässt den Raum, Anna fragt, Ben stimmt zu
  await pages[2].context().close();
  pages.pop();
  await pages[0].waitForTimeout(1500);
  await place();
  await all(() => { window.__game.p1.fly = false; });
  await pages[0].evaluate(() => { const g = window.__game; g.lastReset = 0; g.requestReset(g.p1); });
  await pages[0].waitForTimeout(500);
  await pages[1].evaluate(() => window.__game.requestReset(window.__game.p1));
  await pages[0].waitForTimeout(2500);
  ok((await atCp()).every((x) => x), 'zu zweit: nach beiden Stimmen am Zwischenstopp');

  await br.close();
  console.log(fails ? `${fails} Fehler` : 'alles ok');
  process.exit(fails ? 1 : 0);
})();
