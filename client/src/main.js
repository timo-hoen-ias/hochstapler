import { buildLevel, sectionAtHeight } from './level.js';
import { Colliders, createBody, stepBody, applyRope, PHYS } from './physics.js';
import { FixedStep } from './loop.js';
import { Renderer } from './render.js';
import { Net } from './net.js';
import { Input, EMOTES } from './input.js';
import { Menu } from './menu.js';
import { settings } from './settings.js';
import { audio } from './audio/index.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

function randomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// ───────── Hauptmenü ─────────
const params = new URLSearchParams(location.search);
$('name').value = params.get('name') || store.get('hochstapler.name') || '';
$('room').value = (params.get('room') || randomCode()).toUpperCase();
if (params.get('room')) {
  $('invite').textContent = `Du wurdest in Raum ${params.get('room').toUpperCase()} eingeladen – Namen eingeben und los!`;
  $('invite').classList.remove('hidden');
}
$('newroom').onclick = () => { $('room').value = randomCode(); $('invite').classList.add('hidden'); };
$('join').onclick = () => start(false);
$('solo').onclick = () => start(true);
for (const id of ['name', 'room']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') start(false); });

let game = null;

const menu = new Menu({
  resume: () => game?.resume(),
  copylink: () => game?.copyLink(),
  // Pausemenü: ganzes Team zum letzten Zwischenstopp holen
  respawn: () => { game?.warpTeam(); game?.resume(); },
  quit: () => {
    const url = new URL(location.href);
    url.searchParams.delete('autostart');
    location.href = url.toString();
  },
});
window.__menu = menu;
if (params.get('autostart')) setTimeout(() => start(false), 0);

function start(solo) {
  if (game) return;
  audio.unlock(); // Start ist eine Nutzergeste: jetzt darf Ton laufen
  const name = $('name').value.trim() || 'Lagerist';
  const room = ($('room').value.trim() || randomCode()).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  store.set('hochstapler.name', name);
  const url = new URL(location.href);
  url.searchParams.set('room', room);
  url.searchParams.delete('autostart');
  url.searchParams.delete('name');
  history.replaceState(null, '', url);
  menu.close();
  $('hud').classList.remove('hidden');
  if (settings.touchEnabled()) {
    // Auf Handys: Vollbild + Querformat, soweit der Browser es erlaubt
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  game = new Game(name, room, solo);
  window.__game = game;
  game.lock();
}

// ───────── Spiel ─────────
class Game {
  constructor(name, room, solo = false) {
    this.name = name;
    this.room = room;
    this.level = buildLevel();
    this.world = new Colliders(this.level);
    this.view = new Renderer($('app'), this.level);
    this.body = createBody(this.level.spawn);
    this.me = { id: 'local', name, slot: 0, color: '#ff7a1a' };
    this.remotes = new Map();
    this.camYaw = 0;
    this.camPitch = 0.35;
    this.camDist = 7.5;
    this.paused = false;
    this.best = 0;
    this.played = 0; // Schichtzeit aus früheren Sitzungen (ms)
    this.startedAt = Date.now(); // Beginn der laufenden Sitzung
    this.cp = 0; // erreichter Zwischenstopp des Teams
    this.finished = false;
    this.clock = new FixedStep(1 / 120);
    this.sendAcc = 0;
    this.hudAcc = 0;
    this.last = performance.now();
    this.tension = 0;

    this.view.createAvatar('local', name, this.me.color);
    $('hud-room').textContent = `RAUM ${room}`;
    // Offline-Fortschritt dieses Raums
    const saved = Number(store.get('hochstapler.cp.' + room) || 0);
    if (saved > 0 && saved < this.level.checkpoints.length) { this.cp = saved; this.respawn(false); }
    this.view.setCheckpointReached(this.cp);

    this.net = new Net(solo ? null : room, name, {
      message: (m) => this.onMessage(m),
      offline: (wasOnline) => {
        this.toast(solo ? 'Solo-Training – viel Erfolg!' : wasOnline ? 'Verbindung verloren – Solo-Modus' : 'Kein Server erreichbar – Solo-Modus');
        for (const id of [...this.remotes.keys()]) this.removeRemote(id);
        $('hud-room').textContent = solo ? 'SOLO' : 'SOLO (offline)';
      },
    });

    this.bindInput();
    this.world.update(this.net.time());
    requestAnimationFrame(() => this.frame());
  }

  // ───── Netzwerk ─────
  onMessage(m) {
    switch (m.t) {
      case 'welcome': {
        const old = this.me.id;
        this.me = { ...m.you };
        const av = this.view.avatars.get(old);
        this.view.removeAvatar(old);
        if (av) this.view.createAvatar(this.me.id, this.me.name, this.me.color);
        this.startedAt = m.startedAt;
        this.played = m.played || 0;
        this.board = m.board;
        for (const p of m.players) this.addRemote(p);
        this.setCheckpoint(m.cp || 0, false);
        // Neben einem Mitspieler starten, sonst am Zwischenstopp des Teams
        const near = m.players.find((p) => p.s && p.s.p);
        if (near) this.body.pos = [near.s.p[0], near.s.p[1] + 0.5, near.s.p[2]];
        else this.respawn(false);
        this.toast(m.players.length ? `Raum ${this.room}: ${m.players.length + 1} Lageristen am Seil` : `Raum ${this.room} geöffnet – lade Freunde ein!`);
        if (this.cp > 0) this.toast(`Fortschritt geladen: ${this.cpLabel(this.cp)}`);
        if (this.cp > (m.cp || 0)) this.net.send({ t: 'cp', i: this.cp });
        break;
      }
      case 'join':
        this.addRemote(m.player);
        this.toast(`${m.player.name} hängt sich ans Seil`);
        audio.play('join');
        break;
      case 'leave':
        this.removeRemote(m.id);
        this.toast(`${m.name} hat sich abgeseilt`);
        audio.play('leave');
        break;
      case 's': {
        const r = this.remotes.get(m.id);
        if (!r) return;
        // Sprung/Landung des Mitspielers hörbar machen
        if (r.grounded && !m.g && m.v[1] > 3) audio.remoteJump(m.p);
        if (!m.g) r.airVy = Math.min(r.airVy || 0, m.v[1]);
        else if (!r.grounded) { audio.remoteLand(m.p, -(r.airVy || 0)); r.airVy = 0; }
        r.target = m.p; r.vel = m.v; r.yaw = m.y; r.grounded = m.g; r.braced = m.b;
        r.age = 0;
        if (!r.rpos) r.rpos = [...m.p];
        r.maxY = Math.max(r.maxY || 0, m.p[1]);
        break;
      }
      case 'emote': {
        const r = this.remotes.get(m.id);
        if (r) { this.toast(`${r.name}: ${m.e}`); audio.play('emote', { index: EMOTES.indexOf(m.e), pos: r.rpos }); }
        break;
      }
      case 'finish':
        this.board = m.board;
        this.showFinish(m.name, m.time);
        break;
      case 'cp':
        if (m.i > this.cp) { this.setCheckpoint(m.i, false); this.toast(`${m.name} hat ${this.cpLabel(m.i)} erreicht – gespeichert`); }
        break;
      case 'warp':
        this.toast(`${m.name} holt das Team zum ${this.cpLabel(this.cp)}`);
        this.respawn(false);
        break;
      case 'restart':
        this.startedAt = m.startedAt;
        this.played = 0;
        this.setCheckpoint(0, false, true);
        this.respawn(true);
        $('finish').classList.add('hidden');
        this.finished = false;
        this.input.setEnabled(!this.paused);
        this.toast(`${m.by} startet eine neue Schicht`);
        audio.play('respawn');
        break;
      case 'full':
        this.toast('Raum ist voll (max. 4) – du spielst solo');
        break;
    }
  }

  addRemote(p) {
    if (this.remotes.has(p.id)) return;
    const s = p.s || {};
    const r = {
      id: p.id, name: p.name, slot: p.slot, color: p.color,
      target: s.p || [...this.level.spawn], rpos: s.p ? [...s.p] : [...this.level.spawn],
      vel: s.v || [0, 0, 0], yaw: s.y || 0, grounded: s.g ?? true, braced: !!s.b, age: 0, maxY: 0,
    };
    this.remotes.set(p.id, r);
    this.view.createAvatar(p.id, p.name, p.color);
  }

  removeRemote(id) {
    this.remotes.delete(id);
    this.view.removeAvatar(id);
  }

  // Seilschaft: alle Spieler nach Slot sortiert, Nachbarn sind verbunden
  chain() {
    const all = [{ id: this.me.id, slot: this.me.slot, local: true }, ...[...this.remotes.values()].map((r) => ({ id: r.id, slot: r.slot }))];
    all.sort((a, b) => a.slot - b.slot);
    return all;
  }

  // ───── Eingabe ─────
  bindInput() {
    const canvas = this.view.renderer.domElement;
    this.input = new Input(canvas, {
      pause: () => (this.paused ? this.resume() : this.pause()),
      emote: (i) => this.emote(i),
      toast: (t) => this.toast(t),
      device: () => this.updateClickHint(),
    });
    canvas.addEventListener('click', () => { if (!this.paused) this.lock(); });
    $('click-hint').addEventListener('click', () => this.lock());
    addEventListener('keydown', (e) => {
      // Ohne Pointer-Lock (z. B. Tastatur am Tablet) öffnet Esc die Pause
      if (e.key === 'Escape' && !document.pointerLockElement && !menu.isOpen()) this.pause();
      if (e.code === 'KeyM' && !e.repeat && e.target.tagName !== 'INPUT') {
        const muted = audio.toggleMute();
        if (!muted) audio.play('mute');
        this.toast(muted ? 'Ton aus (M)' : 'Ton an (M)');
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.wasLocked && !this.paused) this.pause();
      if (locked) this.wasLocked = true;
      this.updateClickHint();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    $('again').onclick = () => {
      audio.play('ui');
      this.net.send({ t: 'restart' });
      this.startedAt = Date.now() + (this.net.online ? this.net.offset : 0);
      this.played = 0;
      this.setCheckpoint(0, false, true);
      this.respawn(true);
      this.finished = false;
      $('finish').classList.add('hidden');
      this.input.setEnabled(true);
      this.lock();
    };
    $('stay').onclick = () => { audio.play('uiBack'); $('finish').classList.add('hidden'); this.input.setEnabled(true); this.lock(); };
    settings.onChange((s, patch) => { if ('hints' in patch) this.updateClickHint(); });
    this.updateClickHint();
  }

  emote(i) {
    const e = EMOTES[i];
    if (!e || this.paused) return;
    this.net.send({ t: 'emote', e });
    this.toast(`Du: ${e}`);
    audio.play('emote', { index: i });
  }

  pause() {
    if (this.paused || this.finishOpen()) return;
    this.paused = true;
    this.input.setEnabled(false);
    if (document.pointerLockElement) document.exitPointerLock?.();
    $('pause-room').textContent = this.net.online ? `Raum ${this.room} · ${this.remotes.size + 1} am Seil` : 'Solo';
    menu.open('pause');
    this.updateClickHint();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    menu.close();
    this.input.setEnabled(true);
    this.lock();
    this.updateClickHint();
  }

  async copyLink() {
    const url = new URL(location.href);
    url.searchParams.set('room', this.room);
    try {
      if (navigator.share && settings.touchEnabled()) await navigator.share({ title: 'Hochstapler', text: `Kletter mit mir in Raum ${this.room}!`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); this.toast('Einladungslink kopiert'); }
    } catch { this.toast(url.toString()); }
  }

  finishOpen() { return !$('finish').classList.contains('hidden'); }

  lock() {
    if (settings.touchEnabled() || this.input?.device === 'pad') return;
    const c = this.view.renderer.domElement;
    try { c.requestPointerLock?.()?.catch?.(() => {}); } catch { /* egal */ }
  }

  updateClickHint() {
    const kbm = this.input?.device === 'kbm' && !settings.touchEnabled();
    const need = kbm && !document.pointerLockElement && !this.paused && !this.finishOpen();
    $('click-hint').classList.toggle('hidden', !need);
    $('hints').classList.toggle('hidden', !settings.get().hints || settings.touchEnabled());
    $('crosshair').classList.toggle('hidden', settings.touchEnabled());
  }

  readInput(dt) {
    const i = this.input.poll(dt);
    this.camYaw += i.lookX;
    this.camPitch = Math.min(1.35, Math.max(-0.5, this.camPitch + i.lookY));
    if (i.zoom) this.camDist = Math.min(16, Math.max(3, this.camDist + i.zoom));
    const fx = i.forward, rx = i.right;
    // Kamera schaut entlang (-sin yaw, -cos yaw)
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    let x = -sy * fx + cy * rx;
    let z = -cy * fx - sy * rx;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z, jump: i.jump, brace: i.brace };
  }

  // ───── Spielschleife ─────
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    const input = this.readInput(dt);
    const wasGrounded = this.body.grounded;
    const fallSpeed = -this.body.vel[1];
    const step = this.clock.step;
    const tNow = this.net.time();
    // Sprung bleibt gemerkt, falls dieser Frame keinen Physikschritt hat (>120-Hz-Bildschirme)
    const steps = this.clock.frame(dt, input.jump);
    const ev = { jumped: false, landed: false, landSpeed: 0 };
    for (let i = 0; i < steps; i++) {
      this.world.update(tNow - (steps - 1 - i) * step);
      const vyBefore = this.body.vel[1];
      stepBody(this.body, { ...input, jump: this.clock.takeJump() }, this.world, step);
      if (this.body.jumped) ev.jumped = true;
      if (this.body.justLanded) { ev.landed = true; ev.landSpeed = Math.max(ev.landSpeed, -vyBefore); }
      this.ropeStep(step);
    }

    // Landung: Geräusch + leichtes Kamerawackeln bei harten Aufprallen
    if (!wasGrounded && this.body.grounded && fallSpeed > 6) {
      const k = Math.min(1, (fallSpeed - 6) / 18);
      this.view.shake = Math.max(this.view.shake, k);
    }
    if (this.tension > 1.02 && !(this.lastTension > 1.02)) { this.view.shake = Math.max(this.view.shake, 0.25); }
    this.lastTension = this.tension;

    // Zwischenstopp erreicht?
    const p = this.body.pos;
    const g0 = this.body.ground;
    if (this.body.grounded && g0 && g0.cp !== undefined && g0.cp > this.cp) this.setCheckpoint(g0.cp, true);
    // Abgestürzt: deutlich unter den letzten Zwischenstopp gefallen oder aus der Welt
    const cpY = this.level.checkpoints[this.cp].pos[1];
    if (p[1] < cpY - 8 || p[1] < this.level.killY || Math.abs(p[0]) > 75 || Math.abs(p[2]) > 75) {
      this.respawn(false);
      audio.play('respawn');
      ev.landed = false;
      this.toast(`Abgestürzt – zurück zum ${this.cpLabel(this.cp)}`);
    }

    // Mitspieler glätten
    for (const r of this.remotes.values()) {
      r.age += dt;
      const lead = Math.min(r.age, 0.15);
      for (let i = 0; i < 3; i++) {
        const want = r.target[i] + (r.vel[i] || 0) * lead * (i === 1 && r.grounded ? 0 : 1);
        r.rpos[i] += (want - r.rpos[i]) * Math.min(1, dt * 14);
      }
      this.view.updateAvatar(r.id, r.rpos, r.vel, r.yaw, r.grounded, r.braced, dt, false);
    }
    this.view.updateAvatar(this.me.id, p, this.body.vel, this.body.yaw, this.body.grounded, this.body.braced, dt, true);

    // Seile zeichnen
    const chain = this.chain();
    const pairs = [];
    for (let i = 1; i < chain.length; i++) {
      pairs.push([this.posOf(chain[i - 1].id), this.posOf(chain[i].id), PHYS.rope]);
    }
    this.view.setRopes(pairs);

    // Zustand senden (20 Hz)
    this.sendAcc += dt;
    if (this.sendAcc > 0.05) {
      this.sendAcc = 0;
      const r2 = (v) => Math.round(v * 100) / 100;
      this.net.send({ t: 's', p: p.map(r2), v: this.body.vel.map(r2), y: r2(this.body.yaw), g: this.body.grounded, b: this.body.braced });
    }

    // Ziel
    const g = this.level.goal;
    if (!this.finished && p[0] > g.min[0] && p[0] < g.max[0] && p[2] > g.min[2] && p[2] < g.max[2] && p[1] >= g.min[1] - 0.1 && p[1] < g.max[1]) {
      this.finished = true;
      if (this.net.online) this.net.send({ t: 'goal' });
      else this.showFinish(this.name, this.shiftTime());
    }

    this.updateCamera(dt);
    const cp = this.view.camera.position;
    audio.update({
      dt, time: tNow, world: this.world, body: this.body, tension: this.tension, ...ev,
      camPos: [cp.x, cp.y, cp.z], camYaw: this.camYaw,
      section: sectionAtHeight(this.level, Math.max(0, p[1])),
    });
    this.hudAcc += dt;
    if (this.hudAcc > 0.1) { this.hudAcc = 0; this.updateHud(); }
    this.view.update(dt, this.world, p);
  }

  posOf(id) {
    if (id === this.me.id) return this.body.pos;
    const r = this.remotes.get(id);
    return r ? r.rpos : this.body.pos;
  }

  ropeStep(dt) {
    const chain = this.chain();
    const idx = chain.findIndex((c) => c.local);
    let tension = 0;
    for (const j of [idx - 1, idx + 1]) {
      if (j < 0 || j >= chain.length) continue;
      const r = this.remotes.get(chain[j].id);
      if (!r) continue;
      tension = Math.max(tension, applyRope(this.body, r.rpos, r.grounded, r.braced, this.world, dt));
    }
    this.tension = tension;
  }

  // Zurück zum Zwischenstopp des Teams (oder zum Start). Jeder Spieler bekommt
  // seinen eigenen Platz auf der Plattform, damit niemand ineinander steht.
  respawn(toStart) {
    const cp = this.level.checkpoints[toStart ? 0 : this.cp];
    const pos = [...cp.pos];
    const slot = this.me.slot || 0;
    const spread = cp.box ? Math.min(0.7, (cp.box.max[0] - cp.box.min[0]) / 2 - 0.4) : 1.8;
    pos[0] += ((slot % 2) * 2 - 1) * spread * 0.8;
    pos[2] += (slot < 2 ? -1 : 1) * spread * 0.6;
    pos[1] += 0.2;
    this.body.pos = pos;
    this.body.vel = [0, 0, 0];
    this.body.grounded = false;
    if (toStart) this.best = 0;
  }

  warpTeam() {
    this.net.send({ t: 'warp' });
    this.respawn(false);
    audio.play('respawn');
    this.toast(`Team zum ${this.cpLabel(this.cp)} geholt`);
  }

  setCheckpoint(i, announce, force) {
    if (!force && i <= this.cp) return;
    this.cp = i;
    store.set('hochstapler.cp.' + this.room, String(i));
    this.view.setCheckpointReached(i);
    if (announce) {
      this.net.send({ t: 'cp', i });
      this.toast(`${this.cpLabel(i)} erreicht – Fortschritt gespeichert`);
    }
  }

  cpLabel(i) {
    const c = this.level.checkpoints[i];
    return i === 0 ? 'Start' : `Zwischenstopp ${i} (${c.label})`;
  }

  updateCamera(dt) {
    const p = this.body.pos;
    const target = [p[0], p[1] + 1.5, p[2]];
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dir = [Math.sin(this.camYaw) * cp, sp, Math.cos(this.camYaw) * cp];
    // Kamera nicht in Kisten schieben
    let dist = this.camDist;
    for (let d = 0.6; d < this.camDist; d += 0.25) {
      const q = [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d];
      if (this.pointInSolid(q)) { dist = Math.max(0.6, d - 0.3); break; }
    }
    this.smoothDist = this.smoothDist === undefined ? dist : this.smoothDist + (dist - this.smoothDist) * Math.min(1, dt * (dist < this.smoothDist ? 20 : 4));
    const cam = this.view.camera;
    cam.position.set(target[0] + dir[0] * this.smoothDist, target[1] + dir[1] * this.smoothDist, target[2] + dir[2] * this.smoothDist);
    cam.lookAt(target[0], target[1], target[2]);
  }

  pointInSolid(q) {
    for (const b of this.world.near(q, 1, 1)) {
      if (b.big || b.hidden) continue;
      if (q[0] > b.min[0] && q[0] < b.max[0] && q[1] > b.min[1] && q[1] < b.max[1] && q[2] > b.min[2] && q[2] < b.max[2]) return true;
    }
    return false;
  }

  updateHud() {
    const y = Math.max(0, this.body.pos[1]);
    this.best = Math.max(this.best, y);
    const si = sectionAtHeight(this.level, y);
    const s = this.level.sections[si];
    $('hud-section').textContent = `${s.hall} · ${s.name}`;
    $('hud-height').textContent = `${y.toFixed(1)} m`;
    const top = this.level.goal.min[1];
    $('hud-best').textContent = `Rekord ${this.best.toFixed(1)} m · Ziel ${top.toFixed(0)} m`;
    $('hud-cp').textContent = `Zwischenstopp ${this.cp}/${this.level.checkpoints.length - 1} · Abschnitt ${si + 1}/${this.level.sections.length}`;
    $('hud-timer').textContent = `Schichtzeit ${fmt(this.shiftTime())}`;
    if (this.view.scene.fog) this.view.scene.fog.color.setHex(s.fog);

    const rows = [{ name: this.name + ' (du)', color: this.me.color, y, slot: this.me.slot }];
    for (const r of this.remotes.values()) rows.push({ name: r.name, color: r.color, y: r.rpos[1], slot: r.slot });
    rows.sort((a, b) => a.slot - b.slot);
    $('hud-players').innerHTML = rows.map((r) => `<div class="pl"><i style="background:${r.color}"></i>${esc(r.name)}<b>${Math.max(0, r.y).toFixed(0)} m</b></div>`).join('');
    $('tension').classList.toggle('hidden', this.tension < 1.001);
    $('brace').classList.toggle('hidden', !this.body.braced);
  }

  toast(text) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }

  shiftTime() {
    return this.played + Math.max(0, Date.now() + (this.net.online ? this.net.offset : 0) - this.startedAt);
  }

  showFinish(name, time) {
    this.finished = true;
    audio.play('finish');
    this.input.setEnabled(false);
    if (this.paused) { this.paused = false; menu.close(); }
    document.exitPointerLock?.();
    $('finish-text').textContent = `${name} hat die Spitze des Hochlagers erreicht! Schichtzeit: ${fmt(time)}`;
    const board = this.board || [];
    $('board').innerHTML = board.length ? board.map((b) => `<li><b>${fmt(b.time)}</b> – ${esc(b.team)}</li>`).join('') : '';
    $('finish').classList.remove('hidden');
  }
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
