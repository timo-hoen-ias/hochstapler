// Hauptmenü, Pausenmenü, Optionen und Steuerungsübersicht.
// Bedienbar mit Maus, Touch, Tastatur (Tab/Enter) und Controller (Steuerkreuz/Stick + A/B).
import { settings, QUALITY } from './settings.js';
import { audio } from './audio/index.js';
import { OnScreenKeyboard } from './osk.js';

const sfx = { click: () => audio.play('ui'), back: () => audio.play('uiBack'), move: () => audio.play('uiHover') };
// Lautstärke-Regler schreiben direkt in die Audio-Engine (eigene Speicherung)
const vol = (bus, label) => ({ key: 'vol_' + bus, label, type: 'range', min: 0, max: 1, step: 0.1, audio: bus, fmt: (v) => (v ? `${Math.round(v * 100)} %` : 'Aus') });

const OPTIONS = [
  { key: 'quality', label: 'Grafikqualität', type: 'choice', choices: Object.entries(QUALITY).map(([v, q]) => [v, q.label]),
    hint: 'Niedrig für ältere Handys, Hoch mit Umgebungsverdeckung (AO) und mehr Schärfe.' },
  { key: 'godrays', label: 'Lichtstrahlen (Godrays)', type: 'choice', choices: [['auto', 'Automatisch'], ['on', 'An'], ['off', 'Aus']] },
  { key: 'dof', label: 'Tiefenunschärfe', type: 'choice', choices: [['auto', 'Automatisch'], ['on', 'An'], ['off', 'Aus']],
    hint: 'Automatisch: an ab Qualität Mittel, aus auf Niedrig. Kostet auf Handys spürbar Leistung.' },
  { key: 'fog', label: 'Distanznebel', type: 'choice', choices: [['light', 'Leicht'], ['normal', 'Normal'], ['dense', 'Dicht']] },
  { key: 'heightFog', label: 'Höhennebel', type: 'toggle' },
  { key: 'fov', label: 'Sichtfeld', type: 'range', min: 50, max: 90, step: 5, fmt: (v) => `${v}°` },
  { key: 'sensitivity', label: 'Maus-/Touch-Empfindlichkeit', type: 'range', min: 0.3, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
  { key: 'padSensitivity', label: 'Controller-Empfindlichkeit', type: 'range', min: 0.3, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
  { key: 'invertY', label: 'Controller: Kamera vertikal invertieren', type: 'toggle' },
  { key: 'touch', label: 'Touch-Steuerung', type: 'choice', choices: [['auto', 'Automatisch'], ['on', 'An'], ['off', 'Aus']] },
  { key: 'hints', label: 'Tastenhinweise einblenden', type: 'toggle' },
  { key: 'shake', label: 'Kamerawackeln', type: 'toggle' },
  { key: 'splat', label: 'Absturz-Effekt', type: 'choice', choices: [['blut', 'Blut'], ['farbe', 'Farbklecks'], ['aus', 'Aus']],
    hint: 'Was passiert, wenn jemand ganz unten aufschlägt. Farbklecks: harmlose Farbe in Spielerfarbe.' },
  { key: 'splitscreen', label: 'Lokaler Koop: geteilter Bildschirm', type: 'toggle',
    hint: 'Aus: eine gemeinsame Kamera, die alle lokalen Spieler im Bild hält.' },
  { key: 'muted', label: 'Ton (Taste M)', type: 'audioMute' },
  vol('master', 'Gesamtlautstärke'),
  vol('music', 'Musik'),
  vol('sfx', 'Effekte'),
  vol('ambience', 'Hallengeräusche'),
];

export class Menu {
  constructor(handlers) {
    this.h = handlers; // { resume, copylink, respawn, quit }
    this.root = document.getElementById('menu');
    this.stack = ['main'];
    this.pad = { prev: [], repeat: 0, axisHeld: 0, skip: false };
    this.returnFocus = [];
    this.osk = new OnScreenKeyboard({ random: () => this.h.randomRoom?.() || '', sfx });
    this.buildOptions();
    // Maus übernimmt wieder: Controller-Fokusrahmen ausblenden
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && document.body.dataset.device === 'pad') document.body.dataset.device = 'kbm';
    }, true);
    this.root.addEventListener('click', (e) => this.onClick(e));
    addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape' && this.stack.length > 1) { e.preventDefault(); this.back(); }
    });
    settings.onChange(() => this.refreshOptions());
    audio.onChange(() => this.refreshOptions());
    requestAnimationFrame(() => this.padLoop());
  }

  isOpen() { return !this.root.classList.contains('hidden'); }
  current() { return this.stack[this.stack.length - 1]; }

  show(screen, push = true) {
    if (push) { this.returnFocus.push(document.activeElement); this.stack.push(screen); } else { this.stack = [screen]; this.returnFocus = []; }
    this.render();
  }

  open(screen) {
    this.stack = [screen];
    this.returnFocus = [];
    this.pad.skip = true; // der Start-Druck, der das Pausenmenü geöffnet hat, zählt nicht gleich wieder
    this.root.classList.remove('hidden');
    this.render();
  }
  close() { this.osk.close(); this.root.classList.add('hidden'); }

  back() {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.render();
      // Fokus zurück auf den Knopf, der den Bildschirm geöffnet hat
      const el = this.returnFocus.pop();
      if (el && this.focusables().includes(el)) el.focus({ preventScroll: true });
      sfx.back();
      return;
    }
    if (this.current() === 'pause') this.h.resume?.();
  }

  render() {
    const cur = this.current();
    for (const s of this.root.querySelectorAll('.screen')) s.classList.toggle('hidden', s.dataset.screen !== cur);
    this.root.classList.toggle('in-game', this.stack[0] === 'pause');
    this.h.screen?.(cur);
    // Fokus für Tastatur/Controller auf das erste sinnvolle Element
    // Im Titelmenü nur mit Controller, sonst würde Maus-/Touch-Spielern ein Rahmen aufpoppen
    const list = this.focusables();
    const first = list.find((el) => el.matches('[data-autofocus], [data-opt]')) || list[0];
    const dev = document.body.dataset.device;
    if (first && dev !== 'touch' && (cur !== 'main' || dev === 'pad')) first.focus({ preventScroll: true });
  }

  onClick(e) {
    const el = e.target.closest('button');
    if (!el || !this.root.contains(el)) return;
    audio.unlock();
    if (el.dataset.act !== 'back') sfx.click();
    if (el.dataset.go) { this.show(el.dataset.go); return; }
    if (el.dataset.focus) {
      // „Schicht starten“ im Titelmenü: zum Lieferschein springen
      const name = document.getElementById('name');
      const t = name.value.trim() ? document.getElementById('join') : name;
      t.focus();
      // Mit Controller ohne Namen: gleich die Bildschirmtastatur öffnen
      if (t === name && document.body.dataset.device === 'pad') this.openKeyboard(name);
      t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      document.querySelector('.ticket')?.classList.remove('pulse');
      void document.querySelector('.ticket')?.offsetWidth;
      document.querySelector('.ticket')?.classList.add('pulse');
      return;
    }
    const act = el.dataset.act;
    if (act === 'back') this.back();
    else if (act === 'reset') { settings.reset(); audio.resetSettings(); }
    else if (act && this.h[act]) this.h[act]();
  }

  // ───────── Optionen ─────────
  buildOptions() {
    const list = document.getElementById('options-list');
    list.innerHTML = '';
    this.optEls = [];
    for (const o of OPTIONS) {
      const row = document.createElement('div');
      row.className = 'opt';
      const label = document.createElement('span');
      label.className = 'opt-label';
      label.textContent = o.label;
      row.appendChild(label);
      let ctl;
      if (o.type === 'range') {
        ctl = document.createElement('div');
        ctl.className = 'opt-range';
        const input = document.createElement('input');
        input.type = 'range'; input.min = o.min; input.max = o.max; input.step = o.step;
        const val = document.createElement('output');
        input.addEventListener('input', () => this.setValue(o, Number(input.value)));
        ctl.append(input, val);
        ctl._input = input; ctl._val = val;
        input.dataset.opt = o.key;
      } else {
        ctl = document.createElement('button');
        ctl.type = 'button';
        ctl.className = 'opt-btn';
        ctl.dataset.opt = o.key;
        ctl.addEventListener('click', () => this.cycle(o, 1));
      }
      row.appendChild(ctl);
      if (o.hint) {
        const h = document.createElement('small');
        h.textContent = o.hint;
        row.appendChild(h);
      }
      list.appendChild(row);
      this.optEls.push({ o, ctl });
    }
    this.refreshOptions();
  }

  value(o) {
    if (o.audio) return audio.getVolume(o.audio);
    if (o.type === 'audioMute') return !audio.muted;
    return settings.get()[o.key];
  }

  setValue(o, v) {
    if (o.audio) { audio.unlock(); audio.setVolume(o.audio, v); } else settings.set({ [o.key]: v });
  }

  cycle(o, dir) {
    const s = settings.get();
    if (o.type === 'audioMute') { audio.unlock(); audio.toggleMute(); return; }
    if (o.type === 'toggle') settings.set({ [o.key]: !s[o.key] });
    else if (o.type === 'choice') {
      const i = o.choices.findIndex(([v]) => v === s[o.key]);
      const n = o.choices[(i + dir + o.choices.length) % o.choices.length][0];
      settings.set({ [o.key]: n });
    } else if (o.type === 'range') {
      const v = Math.min(o.max, Math.max(o.min, Math.round((this.value(o) + dir * o.step) / o.step) * o.step));
      this.setValue(o, Number(v.toFixed(3)));
    }
  }

  refreshOptions() {
    for (const { o, ctl } of this.optEls) {
      const v = this.value(o);
      if (o.type === 'range') {
        ctl._input.value = v;
        ctl._val.textContent = o.fmt(v);
      } else if (o.type === 'toggle' || o.type === 'audioMute') {
        ctl.textContent = v ? 'An' : 'Aus';
        ctl.classList.toggle('on', !!v);
      } else {
        const c = o.choices.find(([x]) => x === v);
        ctl.textContent = `◀ ${c ? c[1] : v} ▶`;
      }
    }
  }

  // ───────── Controller-Navigation in allen sichtbaren Menüs ─────────
  activeOverlay() {
    if (this.osk.isOpen()) return this.osk.el;
    if (this.isOpen()) return this.root.querySelector(`.screen[data-screen="${this.current()}"]`);
    const fin = document.getElementById('finish');
    if (fin && !fin.classList.contains('hidden')) return fin;
    return null;
  }

  focusables() {
    const scope = this.activeOverlay();
    if (!scope) return [];
    return [...scope.querySelectorAll('button, input')].filter((el) => el.offsetParent !== null && !el.disabled);
  }

  focusEl(el) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
    sfx.move();
  }

  // Räumliche Navigation: nächstes Element in Drückrichtung (dx/dy = -1, 0, 1)
  moveFocus(dx, dy) {
    const list = this.focusables();
    if (!list.length) return;
    const cur = document.activeElement;
    if (!list.includes(cur)) { this.focusEl(list[0]); return; }
    if (!dx && !dy) return;
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const qx = q.left + q.width / 2, qy = q.top + q.height / 2;
      if ((dx && (qx - cx) * dx <= 2) || (dy && (qy - cy) * dy <= 2)) continue;
      let main, gap, off;
      if (dx) {
        main = Math.max(0, dx > 0 ? q.left - r.right : r.left - q.right);
        gap = Math.max(0, q.top - r.bottom, r.top - q.bottom);
        off = Math.abs(qy - cy);
        if (gap > 0 && gap > main) continue; // seitlich nur grob in derselben Zeile
      } else {
        main = Math.max(0, dy > 0 ? q.top - r.bottom : r.top - q.bottom);
        gap = Math.max(0, q.left - r.right, r.left - q.right);
        off = Math.abs(qx - cx);
        if (gap > 0 && gap > main) continue; // hoch/runter bleibt grob in derselben Spalte
      }
      const score = main + gap * 3 + off * 0.15;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best && dy) {
      // Am Rand: in derselben Spalte ans andere Ende springen, sonst der Reihe nach
      const col = list.filter((el) => {
        if (el === cur) return false;
        const q = el.getBoundingClientRect();
        return q.left < r.right && q.right > r.left;
      });
      const y = (el) => el.getBoundingClientRect().top;
      if (col.length) best = col.reduce((a, el) => ((dy > 0 ? y(el) < y(a) : y(el) > y(a)) ? el : a));
      else best = list[(list.indexOf(cur) + dy + list.length) % list.length];
    }
    if (best) this.focusEl(best);
  }

  adjust(dir) {
    const el = document.activeElement;
    const key = el?.dataset?.opt;
    if (key) {
      const o = OPTIONS.find((x) => x.key === key);
      this.cycle(o, dir);
      sfx.click();
    } else if (el && 'lr' in el.dataset && this.activeOverlay()?.contains(el)) {
      el.click(); // z. B. Spielmodus im Pausenmenü (◀ … ▶)
    } else {
      this.moveFocus(dir, 0);
    }
  }

  openKeyboard(input) {
    this.osk.open(input, {
      onDone: (el) => {
        // Name fertig: weiter zum Start-Knopf, Raumcode: zurück aufs Feld
        const next = el.id === 'name' ? document.getElementById('join') : el;
        next.focus({ preventScroll: true });
        if (el.id === 'room') document.getElementById('invite')?.classList.add('hidden');
      },
    });
  }

  padLoop() {
    requestAnimationFrame(() => this.padLoop());
    // Raumcode auf dem Lieferschein spiegeln (wird auch per Code gesetzt, daher abfragen)
    const room = document.getElementById('room');
    if (room && room.value !== this._room) {
      this._room = room.value;
      const t = document.getElementById('ticket-room');
      if (t) t.textContent = room.value.toUpperCase() || '----';
    }
    // Alle Controller dürfen die Menüs bedienen (lokaler Koop): Zustände zusammenfassen
    const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);
    if (!pads.length) return;
    const n = Math.max(...pads.map((p) => p.buttons.length));
    const gp = {
      buttons: Array.from({ length: n }, (_, i) => ({ pressed: pads.some((p) => p.buttons[i]?.pressed) })),
      axes: [0, 1].map((i) => pads.reduce((m, p) => (Math.abs(p.axes[i] || 0) > Math.abs(m) ? p.axes[i] : m), 0)),
    };
    const down = gp.buttons.map((b) => b.pressed);
    // Gerade geöffnet: gehaltene Knöpfe erst loslassen lassen
    if (this.pad.skip) { this.pad.skip = false; this.pad.prev = down; return; }
    // Die Lobby für lokalen Koop wertet jeden Controller einzeln aus
    if (this.isOpen() && this.current() === 'local' && !this.osk.isOpen()) { this.pad.prev = down; return; }
    const prev = this.pad.prev;
    const pressed = (i) => down[i] && !prev[i];
    this.pad.prev = down;
    const scope = this.activeOverlay();
    if (!scope) { this.pad.axisHeld = 0; return; }
    if (down.some(Boolean)) { audio.unlock(); document.body.dataset.device = 'pad'; }

    const ay = gp.axes[1] || 0, ax = gp.axes[0] || 0;
    let dy = 0, dx = 0;
    if (down[12] || ay < -0.6) dy = -1;
    if (down[13] || ay > 0.6) dy = 1;
    if (down[14] || ax < -0.6) dx = -1;
    if (down[15] || ax > 0.6) dx = 1;
    if (dx && dy) { if (Math.abs(ax) > Math.abs(ay)) dy = 0; else dx = 0; }
    const now = performance.now();
    const held = dy * 3 + dx;
    if (held && (held !== this.pad.axisHeld || now > this.pad.repeat)) {
      this.pad.repeat = now + (held !== this.pad.axisHeld ? 380 : 110);
      const el = document.activeElement;
      if (!el || !scope.contains(el)) this.moveFocus(0, 0); // erster Druck: Fokus erst sichtbar machen
      else if (dy) this.moveFocus(0, dy);
      else this.adjust(dx);
    }
    this.pad.axisHeld = held;

    const el = document.activeElement;
    const inScope = el && scope.contains(el);
    if (this.osk.isOpen()) {
      if (pressed(0) && inScope && el.tagName === 'BUTTON') el.click();
      else if (pressed(0)) this.moveFocus(0, 0);
      if (pressed(1)) this.osk.press('close');
      if (pressed(2)) this.osk.press('del');
      if (pressed(3)) this.osk.press('space');
      if (pressed(9)) this.osk.press('done');
      return;
    }
    if (pressed(0)) {
      if (!inScope) this.moveFocus(0, 0);
      else if (el.tagName === 'BUTTON') el.click();
      else if (el.id === 'name' || el.id === 'room') { sfx.click(); this.openKeyboard(el); }
    }
    if (pressed(1) && this.isOpen()) this.back();
    if (pressed(9) && this.isOpen()) {
      if (this.current() === 'main') document.getElementById('join').click();
      // erst nach dem Spiel-Frame fortsetzen, sonst sieht das Spiel denselben Start-Druck und pausiert wieder
      else if (this.stack[0] === 'pause') setTimeout(() => this.h.resume?.(), 0);
    }
  }
}
