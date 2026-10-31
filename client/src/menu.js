// Hauptmenü, Pausenmenü, Optionen und Steuerungsübersicht.
// Bedienbar mit Maus, Touch, Tastatur (Tab/Enter) und Controller (Steuerkreuz/Stick + A/B).
import { settings, QUALITY } from './settings.js';
import { audio } from './audio/index.js';

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
  { key: 'invertY', label: 'Kamera vertikal invertieren', type: 'toggle' },
  { key: 'touch', label: 'Touch-Steuerung', type: 'choice', choices: [['auto', 'Automatisch'], ['on', 'An'], ['off', 'Aus']] },
  { key: 'hints', label: 'Tastenhinweise einblenden', type: 'toggle' },
  { key: 'shake', label: 'Kamerawackeln', type: 'toggle' },
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
    this.pad = { prev: [], repeat: 0, axisHeld: 0 };
    this.buildOptions();
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
    if (push) this.stack.push(screen); else this.stack = [screen];
    this.render();
  }

  open(screen) { this.stack = [screen]; this.root.classList.remove('hidden'); this.render(); }
  close() { this.root.classList.add('hidden'); }

  back() {
    if (this.stack.length > 1) { this.stack.pop(); this.render(); sfx.back(); return; }
    if (this.current() === 'pause') this.h.resume?.();
  }

  render() {
    const cur = this.current();
    for (const s of this.root.querySelectorAll('.screen')) s.classList.toggle('hidden', s.dataset.screen !== cur);
    this.root.classList.toggle('in-game', this.stack[0] === 'pause');
    this.h.screen?.(cur);
    // Fokus für Tastatur/Controller auf das erste sinnvolle Element
    const first = this.focusables()[0];
    if (first && document.body.dataset.device !== 'touch' && cur !== 'main') first.focus({ preventScroll: true });
  }

  onClick(e) {
    const el = e.target.closest('button');
    if (!el || !this.root.contains(el)) return;
    audio.unlock();
    if (el.dataset.act !== 'back') sfx.click();
    if (el.dataset.go) { this.show(el.dataset.go); return; }
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

  moveFocus(dir) {
    const list = this.focusables();
    if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    i = i < 0 ? 0 : (i + dir + list.length) % list.length;
    list[i].focus();
    list[i].scrollIntoView({ block: 'nearest' });
    sfx.move();
  }

  adjust(dir) {
    const el = document.activeElement;
    const key = el?.dataset?.opt;
    if (key) {
      const o = OPTIONS.find((x) => x.key === key);
      this.cycle(o, dir);
      sfx.click();
    } else {
      this.moveFocus(dir);
    }
  }

  padLoop() {
    requestAnimationFrame(() => this.padLoop());
    // Alle Controller dürfen die Menüs bedienen (lokaler Koop): Zustände zusammenfassen
    const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);
    if (!pads.length) return;
    const n = Math.max(...pads.map((p) => p.buttons.length));
    const gp = {
      buttons: Array.from({ length: n }, (_, i) => ({ pressed: pads.some((p) => p.buttons[i]?.pressed) })),
      axes: [0, 1].map((i) => pads.reduce((m, p) => (Math.abs(p.axes[i] || 0) > Math.abs(m) ? p.axes[i] : m), 0)),
    };
    // Die Lobby für lokalen Koop wertet jeden Controller einzeln aus
    if (this.isOpen() && this.current() === 'local') { this.pad.prev = gp.buttons.map((b) => b.pressed); return; }
    const pressed = (i) => gp.buttons[i]?.pressed && !this.pad.prev[i];
    const scope = this.activeOverlay();
    if (scope) {
      const ay = gp.axes[1] || 0, ax = gp.axes[0] || 0;
      let dir = 0, hdir = 0;
      if (gp.buttons[12]?.pressed || ay < -0.6) dir = -1;
      if (gp.buttons[13]?.pressed || ay > 0.6) dir = 1;
      if (gp.buttons[14]?.pressed || ax < -0.6) hdir = -1;
      if (gp.buttons[15]?.pressed || ax > 0.6) hdir = 1;
      const now = performance.now();
      const held = dir * 3 + hdir;
      if (held && (held !== this.pad.axisHeld || now > this.pad.repeat)) {
        this.pad.repeat = now + (held !== this.pad.axisHeld ? 380 : 120);
        if (dir) this.moveFocus(dir); else this.adjust(hdir);
      }
      this.pad.axisHeld = held;
      if (gp.buttons.some((b) => b.pressed)) { audio.unlock(); document.body.dataset.device = 'pad'; }
      if (pressed(0)) {
        const el = document.activeElement;
        if (el && scope.contains(el) && el.tagName === 'BUTTON') el.click();
        else if (!el || !scope.contains(el)) this.moveFocus(0);
        else if (el.id === 'name' || el.id === 'room') document.getElementById('join').click();
      }
      if (pressed(1) && this.isOpen()) this.back();
      if (pressed(9) && this.isOpen() && this.current() === 'main') document.getElementById('join').click();
    }
    this.pad.prev = gp.buttons.map((b) => b.pressed);
  }
}
