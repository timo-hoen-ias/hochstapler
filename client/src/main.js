import { buildLevel, SECTIONS, sectionAtHeight } from './level.js';
import { Colliders, createBody, stepBody, applyRope, PHYS } from './physics.js';
import { Renderer } from './render.js';
import { Net } from './net.js';
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

// ───────── Lobby ─────────
const params = new URLSearchParams(location.search);
$('name').value = params.get('name') || store.get('hochstapler.name') || '';
$('room').value = (params.get('room') || randomCode()).toUpperCase();
$('newroom').onclick = () => { $('room').value = randomCode(); };
$('join').onclick = start;
for (const id of ['name', 'room']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
if (params.get('autostart')) setTimeout(start, 0);

let game = null;

function start() {
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
  $('lobby').classList.add('hidden');
  $('hud').classList.remove('hidden');
  game = new Game(name, room);
  window.__game = game;
}

// ───────── Spiel ─────────
class Game {
  constructor(name, room) {
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
    this.keys = new Set();
    this.jumpPressed = false;
    this.mouseBrace = false;
    this.best = 0;
    this.startedAt = Date.now();
    this.finished = false;
    this.acc = 0;
    this.sendAcc = 0;
    this.hudAcc = 0;
    this.last = performance.now();
    this.tension = 0;

    this.view.createAvatar('local', name, this.me.color);
    $('hud-room').textContent = `RAUM ${room}`;

    this.net = new Net(room, name, {
      message: (m) => this.onMessage(m),
      offline: (wasOnline) => {
        this.toast(wasOnline ? 'Verbindung verloren – Solo-Modus' : 'Kein Server erreichbar – Solo-Modus');
        for (const id of [...this.remotes.keys()]) this.removeRemote(id);
        $('hud-room').textContent = 'SOLO (offline)';
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
        this.board = m.board;
        for (const p of m.players) this.addRemote(p);
        // Neben einem Mitspieler starten, damit das Seil nicht sofort reißt
        const near = m.players.find((p) => p.s && p.s.p);
        if (near) this.body.pos = [near.s.p[0], near.s.p[1] + 0.5, near.s.p[2]];
        this.toast(m.players.length ? `Raum ${this.room}: ${m.players.length + 1} Lageristen am Seil` : `Raum ${this.room} geöffnet – lade Freunde ein!`);
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
      case 'restart':
        this.startedAt = m.startedAt;
        this.respawn(true);
        $('finish').classList.add('hidden');
        this.finished = false;
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
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { if (!this.keys.has('Space')) this.jumpPressed = true; e.preventDefault(); }
      this.keys.add(e.code);
      const emotes = { Digit1: EMOTES[0], Digit2: EMOTES[1], Digit3: EMOTES[2] };
      if (emotes[e.code]) {
        this.net.send({ t: 'emote', e: emotes[e.code] });
        this.toast(`Du: ${emotes[e.code]}`);
        audio.play('emote', { index: EMOTES.indexOf(emotes[e.code]) });
      }
      if (e.code === 'KeyM' && !e.repeat) {
        const muted = audio.toggleMute();
        if (!muted) audio.play('mute');
        this.toast(muted ? 'Ton aus (M)' : 'Ton an (M)');
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseBrace = false; });
    canvas.addEventListener('click', () => this.lock());
    $('paused').addEventListener('click', (e) => { if (e.target.id !== 'copylink') this.lock(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousedown', (e) => { if (e.button === 2) this.mouseBrace = true; });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.mouseBrace = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.camYaw -= e.movementX * 0.0025;
      this.camPitch = Math.min(1.35, Math.max(-0.5, this.camPitch + e.movementY * 0.0025));
    });
    addEventListener('wheel', (e) => { this.camDist = Math.min(16, Math.max(3, this.camDist + Math.sign(e.deltaY) * 0.8)); });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      $('paused').classList.toggle('hidden', locked || this.finished || !this.wasLocked);
      if (locked) this.wasLocked = true;
    });
    $('copylink').onclick = async (e) => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(location.href); this.toast('Link kopiert'); } catch { this.toast(location.href); }
    };
    $('again').onclick = () => {
      audio.play('ui');
      this.net.send({ t: 'restart' });
      this.startedAt = Date.now();
      this.respawn(true);
      this.finished = false;
      $('finish').classList.add('hidden');
      this.lock();
    };
    $('stay').onclick = () => { audio.play('uiBack'); $('finish').classList.add('hidden'); this.lock(); };
  }

  lock() {
    const c = this.view.renderer.domElement;
    if (c.requestPointerLock) c.requestPointerLock();
  }

  readInput() {
    const k = this.keys;
    let fx = 0, rx = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fx += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) rx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) rx -= 1;
    // Kamera schaut entlang (-sin yaw, -cos yaw)
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    let x = -sy * fx + cy * rx;
    let z = -cy * fx - sy * rx;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    const input = { x, z, jump: this.jumpPressed, brace: k.has('ShiftLeft') || k.has('ShiftRight') || this.mouseBrace };
    this.jumpPressed = false;
    return input;
  }

  // ───── Spielschleife ─────
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    const input = this.readInput();
    const step = 1 / 120;
    this.acc += dt;
    let first = true;
    const tNow = this.net.time();
    const steps = Math.min(12, Math.floor(this.acc / step));
    const ev = { jumped: false, landed: false, landSpeed: 0 };
    for (let i = 0; i < steps; i++) {
      this.world.update(tNow - (steps - 1 - i) * step);
      const vyBefore = this.body.vel[1];
      stepBody(this.body, first ? input : { ...input, jump: false }, this.world, step);
      if (this.body.jumped) ev.jumped = true;
      if (this.body.justLanded) { ev.landed = true; ev.landSpeed = Math.max(ev.landSpeed, -vyBefore); }
      first = false;
      this.ropeStep(step);
    }
    this.acc -= steps * step;
    if (this.acc > step) this.acc = 0;

    // Herunterfallen ins Leere / Rand
    const p = this.body.pos;
    if (p[1] < this.level.killY || Math.abs(p[0]) > 75 || Math.abs(p[2]) > 75) { this.respawn(false); audio.play('respawn'); ev.landed = false; }

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
      else this.showFinish(this.name, Date.now() - this.startedAt);
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

  respawn(toStart) {
    // Neben dem nächsten Seilpartner wieder einsteigen, sonst am Tor
    let pos = [...this.level.spawn];
    if (!toStart) {
      const chain = this.chain();
      const idx = chain.findIndex((c) => c.local);
      const n = chain[idx - 1] || chain[idx + 1];
      const r = n && this.remotes.get(n.id);
      if (r && r.grounded && r.rpos[1] > this.level.killY + 5) pos = [r.rpos[0], r.rpos[1] + 1, r.rpos[2]];
    } else {
      pos[0] += (this.me.slot || 0) * 1.2 - 1.8;
    }
    this.body.pos = pos;
    this.body.vel = [0, 0, 0];
    if (toStart) this.best = 0;
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
    for (const b of this.world.all) {
      if (q[0] > b.min[0] && q[0] < b.max[0] && q[1] > b.min[1] && q[1] < b.max[1] && q[2] > b.min[2] && q[2] < b.max[2]) return true;
    }
    return false;
  }

  updateHud() {
    const y = Math.max(0, this.body.pos[1]);
    this.best = Math.max(this.best, y);
    const s = SECTIONS[sectionAtHeight(this.level, y)];
    $('hud-section').textContent = `${s.hall} · ${s.name}`;
    $('hud-height').textContent = `${y.toFixed(1)} m`;
    const top = this.level.goal.min[1];
    $('hud-best').textContent = `Rekord ${this.best.toFixed(1)} m · Ziel ${top.toFixed(0)} m`;
    const t = Math.max(0, Date.now() + (this.net.online ? this.net.offset : 0) - this.startedAt);
    $('hud-timer').textContent = `Schichtzeit ${fmt(t)}`;
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

  showFinish(name, time) {
    this.finished = true;
    audio.play('finish');
    document.exitPointerLock?.();
    $('paused').classList.add('hidden');
    $('finish-text').textContent = `${name} hat das Versanddach erreicht! Schichtzeit: ${fmt(time)}`;
    const board = this.board || [];
    $('board').innerHTML = board.length ? board.map((b) => `<li><b>${fmt(b.time)}</b> – ${esc(b.team)}</li>`).join('') : '';
    $('finish').classList.remove('hidden');
  }
}

const EMOTES = ['Warte!', 'Los, springen!', 'Festhalten!'];

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
