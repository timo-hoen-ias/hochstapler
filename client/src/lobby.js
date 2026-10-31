// Lobby für lokalen Koop: Jeder Controller, an dem jemand A drückt, wird ein eigener
// Lagerist am selben Bildschirm. Spieler 1 kann zusätzlich Tastatur & Maus nutzen.
import { listPads } from './input.js';
import { xb } from './glyphs.js';
import { audio } from './audio/index.js';

export const LOCAL_COLORS = ['#ff7a1a', '#22c8e5', '#9be22a', '#ff4fa3'];
export const MAX_LOCAL = 4;

const $ = (id) => document.getElementById(id);

export class LocalLobby {
  constructor(handlers) {
    this.h = handlers; // { start(online, setup), back(), name(), room() }
    this.p1Pad = -1; // Controller von Spieler 1 (-1: nur Tastatur/Maus/Touch)
    this.kbmSeparate = false; // Tastatur & Maus als eigener Spieler 1, alle Controller extra
    this.extra = []; // Controller-Indizes von Spieler 2–4
    this.prev = new Map();
    this.active = false;
    $('local-kbm').onclick = () => this.toggleKbm();
    $('local-offline').onclick = () => this.start(false);
    $('local-online').onclick = () => this.start(true);
  }

  open() {
    if (this.active) return;
    this.active = true;
    // Den Tastendruck, mit dem die Lobby geöffnet wurde, nicht als "Mitmachen" werten
    this.prev = new Map(listPads().map((p) => [p.index, p.buttons.map((b) => b.pressed)]));
    $('local-online').textContent = `Online im Raum ${this.h.room()} (mit Freunden)`;
    this.render();
    requestAnimationFrame(() => this.loop());
  }

  close() { this.active = false; }

  owns(idx) { return idx === this.p1Pad || this.extra.includes(idx); }
  count() { return 1 + this.extra.length; }

  toggleKbm() {
    this.kbmSeparate = !this.kbmSeparate;
    // Der Controller von Spieler 1 wird dann ein eigener Spieler
    if (this.kbmSeparate && this.p1Pad >= 0) {
      if (this.count() < MAX_LOCAL) this.extra.unshift(this.p1Pad);
      this.p1Pad = -1;
    }
    this.render();
  }

  join(idx) {
    if (!this.kbmSeparate && this.p1Pad < 0) this.p1Pad = idx;
    else if (this.count() < MAX_LOCAL) this.extra.push(idx);
    else return;
    audio.play('join');
    this.render();
  }

  leave(idx) {
    if (idx === this.p1Pad) this.p1Pad = -1;
    else this.extra = this.extra.filter((i) => i !== idx);
    audio.play('leave');
    this.render();
  }

  setup() {
    return {
      p1Pad: this.p1Pad,
      kbmSeparate: this.kbmSeparate,
      extra: this.extra.map((pad, i) => ({ pad, name: `Spieler ${i + 2}` })),
    };
  }

  start(online) {
    audio.unlock();
    this.h.start(online, this.setup());
  }

  loop() {
    if (!this.active) return;
    requestAnimationFrame(() => this.loop());
    const pads = listPads();
    const alive = new Set(pads.map((p) => p.index));
    // Abgezogene Controller fliegen raus
    if ((this.p1Pad >= 0 && !alive.has(this.p1Pad)) || this.extra.some((i) => !alive.has(i))) {
      if (!alive.has(this.p1Pad)) this.p1Pad = -1;
      this.extra = this.extra.filter((i) => alive.has(i));
      this.render();
    }
    for (const gp of pads) {
      const prev = this.prev.get(gp.index) || [];
      const pressed = (i) => gp.buttons[i]?.pressed && !prev[i];
      this.prev.set(gp.index, gp.buttons.map((b) => b.pressed));
      if (gp.buttons.some((b) => b.pressed)) { audio.unlock(); document.body.dataset.device = 'pad'; }
      if (pressed(9)) { this.start(false); return; }
      if (pressed(3)) { this.start(true); return; }
      if (pressed(0) && !this.owns(gp.index)) this.join(gp.index);
      else if (pressed(1)) {
        if (this.owns(gp.index)) this.leave(gp.index);
        else { this.h.back(); return; }
      }
    }
  }

  render() {
    const rows = [];
    const p1Dev = this.p1Pad >= 0
      ? (this.kbmSeparate ? `Controller ${this.p1Pad + 1}` : `Controller ${this.p1Pad + 1} + Tastatur/Maus`)
      : 'Tastatur & Maus';
    rows.push({ name: this.h.name(), dev: p1Dev, color: LOCAL_COLORS[0] });
    this.extra.forEach((pad, i) => rows.push({ name: `Spieler ${i + 2}`, dev: `Controller ${pad + 1}`, color: LOCAL_COLORS[(i + 1) % 4] }));
    while (rows.length < MAX_LOCAL) rows.push(null);
    $('local-slots').innerHTML = rows.map((r, i) => r
      ? `<div class="lslot"><i style="background:${r.color}"></i><b>${esc(r.name)}</b><span>${r.dev}</span></div>`
      : `<div class="lslot empty"><i></i><b>Spieler ${i + 1}</b><span>Controller: ${xb('A')} drücken</span></div>`).join('');
    $('local-kbm').textContent = this.kbmSeparate
      ? 'Tastatur & Maus: eigener Spieler 1 ✓'
      : 'Tastatur & Maus als eigenen Spieler nutzen';
    $('local-kbm').classList.toggle('on', this.kbmSeparate);
    $('local-offline').textContent = this.count() > 1 ? `Zu ${['', '', 'zweit', 'dritt', 'viert'][this.count()]} losklettern (nur dieses Gerät)` : 'Losklettern (nur dieses Gerät)';
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
