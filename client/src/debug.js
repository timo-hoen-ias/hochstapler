// Debug-Konsole zum schnellen Testen der Level.
// Öffnen/Schließen: ^ (Taste links neben der 1) oder F8. Freiflug ein/aus: F9.
// Befehle siehe HELP. Die Konsole ändert nur lokale Spieler dieses Geräts.
import { releaseGrips } from './physics.js';

const HELP = [
  ['hilfe', 'diese Liste'],
  ['tp <n>', 'zu Zwischenstopp n (wird als erreicht gesetzt)'],
  ['tp akt <n>', 'an den Anfang von Akt n (1–8)'],
  ['tp abschnitt <n>', 'an den Anfang von Abschnitt n (wie im HUD, 1–48)'],
  ['tp ziel', 'aufs Ziel-Dach'],
  ['tp <x> <y> <z>', 'zu Koordinaten, ~ = relativ (z. B. tp ~ ~10 ~)'],
  ['hoch <m>', 'm Meter nach oben (negativ = runter)'],
  ['flug', 'Freiflug/Noclip ein/aus (auch F9)'],
  ['tempo <m/s>', 'Fluggeschwindigkeit (Standard 12)'],
  ['gott', 'kein Absturz und kein Aufklatschen'],
  ['cp <n>', 'Zwischenstopp setzen, ohne zu springen'],
  ['pos', 'Position, Halle und Zwischenstopp anzeigen'],
  ['akte', 'alle Akte mit Zwischenstopps'],
  ['zs [akt]', 'Zwischenstopps auflisten (optional nur ein Akt)'],
  ['leeren', 'Ausgabe leeren'],
];

const ALIAS = { help: 'hilfe', '?': 'hilfe', fly: 'flug', noclip: 'flug', speed: 'tempo', god: 'gott', clear: 'leeren', up: 'hoch', acts: 'akte', cps: 'zs', checkpoint: 'cp' };

// Ein Freiflug-Schritt: laufen relativ zur Kamera, Leertaste hoch, Shift runter.
// Keine Kollision, keine Schwerkraft, das Seil hält den Flieger nicht.
export function flyStep(b, inp, dt, speed) {
  const vy = (inp.up ? 1 : 0) - (inp.brace ? 1 : 0);
  b.vel = [inp.x * speed, vy * speed, inp.z * speed];
  for (let i = 0; i < 3; i++) b.pos[i] += b.vel[i] * dt;
  if (Math.hypot(inp.x, inp.z) > 0.1) b.yaw = Math.atan2(-inp.x, -inp.z);
  b.grounded = false;
  b.ground = null;
}

export class DebugConsole {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.speed = 12;
    this.god = false;
    this.history = [];
    this.hIdx = 0;
    this.build();
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get level() { return this.game.level; }

  build() {
    const root = document.createElement('div');
    root.id = 'debug';
    root.className = 'hidden';
    root.innerHTML = '<div class="debug-log"></div><div class="debug-line"><span>&gt;</span><input type="text" spellcheck="false" autocomplete="off" placeholder="Befehl – „hilfe“ für alle Befehle"></div>';
    document.body.appendChild(root);
    this.root = root;
    this.log = root.querySelector('.debug-log');
    this.input = root.querySelector('input');
    this.input.addEventListener('keydown', (e) => this.onInputKey(e));
    const badge = document.createElement('div');
    badge.id = 'debug-badge';
    badge.className = 'hidden';
    document.body.appendChild(badge);
    this.badge = badge;
    this.print('Debug-Konsole. „hilfe“ zeigt alle Befehle. ^ oder F8 schließt.', 'dim');
  }

  onKey(e) {
    if (e.code === 'Backquote' || e.code === 'F8') {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      this.isOpen ? this.close() : this.open();
      return;
    }
    if (e.code === 'F9' && !e.repeat) {
      e.preventDefault();
      this.toggleFly();
    }
  }

  onInputKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const line = this.input.value.trim();
      this.input.value = '';
      if (!line) return;
      this.history.push(line);
      this.hIdx = this.history.length;
      this.print('> ' + line, 'cmd');
      try { this.run(line); } catch (err) { this.print('Fehler: ' + err.message, 'err'); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      this.hIdx = Math.max(0, Math.min(this.history.length, this.hIdx + (e.key === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.hIdx] || '';
    }
  }

  open() {
    const g = this.game;
    if (g.paused || g.finishOpen()) return;
    this.isOpen = true;
    g.setInputEnabled(false);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.classList.remove('hidden');
    this.input.focus();
    setTimeout(() => this.input.focus(), 0);
    g.updateClickHint();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.input.blur();
    this.game.setInputEnabled(true);
    this.game.lock();
    this.game.updateClickHint();
  }

  print(text, cls = '') {
    const d = document.createElement('div');
    d.textContent = text;
    if (cls) d.className = cls;
    this.log.appendChild(d);
    while (this.log.childNodes.length > 200) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  updateBadge() {
    const on = [];
    if (this.game.locals.some((lp) => lp.fly)) on.push(`FREIFLUG ${this.speed} m/s`);
    if (this.god) on.push('GOTT');
    this.badge.textContent = on.join(' · ');
    this.badge.classList.toggle('hidden', !on.length);
  }

  // ───── Befehle ─────
  run(line) {
    const [raw, ...args] = line.split(/\s+/);
    const cmd = ALIAS[raw.toLowerCase()] || raw.toLowerCase();
    const num = (s, what) => {
      const v = Number(String(s).replace(',', '.'));
      if (s === undefined || !Number.isFinite(v)) throw new Error(`${what} fehlt oder ist keine Zahl`);
      return v;
    };
    switch (cmd) {
      case 'hilfe': for (const [c, d] of HELP) this.print(`${c.padEnd(18)} ${d}`); break;
      case 'leeren': this.log.textContent = ''; break;
      case 'tp': this.tp(args, num); break;
      case 'hoch': {
        const p = this.game.p1.body.pos;
        this.place([p[0], p[1] + num(args[0], 'Meter'), p[2]]);
        this.reportPos();
        break;
      }
      case 'flug': this.toggleFly(); break;
      case 'tempo': {
        this.speed = Math.max(1, Math.min(200, num(args[0], 'Tempo')));
        this.print(`Fluggeschwindigkeit ${this.speed} m/s`);
        this.updateBadge();
        break;
      }
      case 'gott': {
        this.god = !this.god;
        this.print(this.god ? 'Gott-Modus an: kein Absturz, kein Aufklatschen' : 'Gott-Modus aus');
        this.updateBadge();
        break;
      }
      case 'cp': {
        const i = this.cpIndex(args[0], num);
        this.game.setCheckpoint(i, false, true);
        this.print(`${this.game.cpLabel(i)} gesetzt`);
        break;
      }
      case 'pos': this.reportPos(); break;
      case 'akte': this.listActs(); break;
      case 'zs': this.listCps(args[0] !== undefined ? num(args[0], 'Akt') : null); break;
      default: this.print(`Unbekannter Befehl „${raw}“ – „hilfe“ zeigt alle Befehle`, 'err');
    }
  }

  tp(args, num) {
    const g = this.game, L = this.level;
    const what = (args[0] || '').toLowerCase();
    if (!what) throw new Error('Ziel fehlt – z. B. „tp 12“, „tp akt 3“, „tp ziel“');
    if (what === 'akt') {
      const a = num(args[1], 'Akt');
      const i = this.actStart(a);
      if (i < 0) throw new Error(`Akt ${a} gibt es nicht`);
      this.toCheckpoint(i);
    } else if (what === 'abschnitt' || what === 'halle' || what === 'ab') {
      const h = Math.round(num(args[1], 'Abschnitt'));
      const s = L.sections[h - 1];
      if (!s) throw new Error(`Abschnitt ${h} gibt es nicht (1–${L.sections.length})`);
      const i = L.checkpoints.findIndex((c) => c.sec >= s.sec);
      this.toCheckpoint(i < 0 ? L.checkpoints.length - 1 : i);
    } else if (what === 'ziel') {
      const b = L.goal;
      this.place([(b.min[0] + b.max[0]) / 2, b.max[1] + 0.2, (b.min[2] + b.max[2]) / 2]);
      this.print('Am Ziel');
    } else if (args.length >= 3) {
      const p = g.p1.body.pos;
      const pos = args.slice(0, 3).map((s, i) => {
        if (s.startsWith('~')) return p[i] + (s.length > 1 ? num(s.slice(1), 'Koordinate') : 0);
        return num(s, 'Koordinate');
      });
      this.place(pos);
      this.reportPos();
    } else {
      this.toCheckpoint(this.cpIndex(args[0], num));
    }
  }

  cpIndex(s, num) {
    const i = Math.round(num(s, 'Zwischenstopp'));
    const n = this.level.checkpoints.length;
    if (i < 0 || i >= n) throw new Error(`Zwischenstopp ${i} gibt es nicht (0–${n - 1})`);
    return i;
  }

  actOf(sec) { return this.level.sections[sec]?.act ?? 1; }

  actStart(a) {
    if (a === 1) return 0;
    return this.level.checkpoints.findIndex((c) => this.actOf(c.sec) === a);
  }

  // Zwischenstopp setzen und alle lokalen Spieler dorthin (wie beim Respawn verteilt)
  toCheckpoint(i) {
    const g = this.game;
    g.setCheckpoint(i, false, true);
    for (const lp of g.locals) g.respawn(lp, false);
    const c = this.level.checkpoints[i];
    const s = this.level.sections[c.sec];
    this.print(`→ ${g.cpLabel(i)} · Akt ${this.actOf(c.sec)} ${s?.theme || 'Lagerhalle'} · ${Math.round(c.pos[1])} m`);
  }

  // Alle lokalen Spieler an eine Stelle setzen (nebeneinander, damit das Seil nicht reißt)
  place(pos) {
    const g = this.game;
    g.locals.forEach((lp, k) => {
      g.mc?.leave(lp, true);
      lp.dead = 0;
      const b = lp.body;
      b.pos = [pos[0] + (k % 2 ? 0.6 : 0) * (k > 1 ? -1 : 1), pos[1], pos[2] + (k > 1 ? 0.6 : 0)];
      b.vel = [0, 0, 0];
      b.grounded = false;
      releaseGrips(b);
      lp.airTop = undefined;
    });
  }

  toggleFly() {
    const g = this.game;
    const on = !g.locals.some((lp) => lp.fly);
    for (const lp of g.locals) {
      lp.fly = on;
      if (on) { g.mc?.leave(lp, true); releaseGrips(lp.body); lp.dead = 0; }
      lp.body.vel = [0, 0, 0];
      lp.airTop = undefined;
    }
    const msg = on ? 'Freiflug an – Leertaste hoch, Shift runter, F9 aus' : 'Freiflug aus';
    this.print(msg);
    if (!this.isOpen) g.toast(msg);
    this.updateBadge();
  }

  reportPos() {
    const g = this.game, L = this.level;
    const p = g.p1.body.pos;
    let sec = 0;
    for (const s of L.sections) if (p[1] >= s.y - 0.5) sec = s.sec;
    const s = L.sections[sec];
    const f = (v) => v.toFixed(2);
    this.print(`Position ${f(p[0])} ${f(p[1])} ${f(p[2])} · ${s.hall} ${s.name} · Akt ${this.actOf(sec)} · ${g.cpLabel(g.cpOf(g.p1))}`);
  }

  listActs() {
    const L = this.level;
    const acts = new Map();
    for (const c of L.checkpoints) {
      const a = this.actOf(c.sec);
      if (!acts.has(a)) acts.set(a, { first: c.index, last: c.index, y: c.pos[1], theme: L.sections[c.sec]?.theme || 'Lagerhalle' });
      acts.get(a).last = c.index;
    }
    for (const [a, v] of acts) this.print(`Akt ${a} ${v.theme.padEnd(17)} Zwischenstopps ${v.first}–${v.last} · ab ${Math.round(v.y)} m`);
  }

  listCps(act) {
    for (const c of this.level.checkpoints) {
      if (act !== null && this.actOf(c.sec) !== act) continue;
      this.print(`${String(c.index).padStart(2)}  ${c.label.padEnd(24)} Akt ${this.actOf(c.sec)} · ${Math.round(c.pos[1])} m`);
    }
  }
}
