import { buildLevel, sectionAtHeight } from './level.js';
import { Colliders, createBody, stepBody, applyRope, releaseGrips, PHYS } from './physics.js';
import { FixedStep } from './loop.js';
import { Renderer } from './render.js';
import { Net } from './net.js';
import { Input, PadInput, EMOTES, listPads, padClaims } from './input.js';
import { Menu } from './menu.js';
import { LocalLobby, LOCAL_COLORS, MAX_LOCAL } from './lobby.js';
import { settings } from './settings.js';
import { audio } from './audio/index.js';
import { animCode, decodeAnim } from './anim.js';
import { trackSafe, resetSafe, spreadOn } from './safespot.js';
import { TEAMS, modeLabel, hostOf, modeError, ropeGroups } from './teams.js';

// Blickrichtung für die Figur: an einer Kante zur Wand gedreht
function visYaw(b) {
  return b.hang ? Math.atan2(b.hang.n[0], b.hang.n[1]) : b.yaw;
}

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
// Spielmodus-Wunsch auf dem Lieferschein: gilt, wenn du Gastgeber bist und ihr zu viert seid
const modeWish = { get: () => (store.get('hochstapler.mode') === 'teams' ? 'teams' : 'rope') };
function renderModeWish() {
  const w = modeWish.get();
  $('mode-slot').innerHTML = `<span class="mode-label">Spielmodus</span>
    <div class="mode-pick" role="radiogroup">
      <button type="button" class="ghost${w === 'rope' ? ' on' : ''}" data-wish="rope" role="radio" aria-checked="${w === 'rope'}"><b>Alle an einem Seil</b><small>2–4 Spieler</small></button>
      <button type="button" class="ghost${w === 'teams' ? ' on' : ''}" data-wish="teams" role="radio" aria-checked="${w === 'teams'}"><b>2 gegen 2</b><small>zwei Seilschaften, Wettrennen</small></button>
    </div>`;
}
$('mode-slot').addEventListener('click', (e) => {
  const b = e.target.closest('[data-wish]');
  if (!b) return;
  store.set('hochstapler.mode', b.dataset.wish);
  renderModeWish();
  $('mode-slot').querySelector(`[data-wish="${b.dataset.wish}"]`)?.focus();
});
renderModeWish();
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
  // Spielmodus (nur Gastgeber): Seil für alle ↔ 2 gegen 2, Teams neu auslosen
  mode: () => game?.toggleMode(),
  shuffle: () => game?.requestMode('teams', true),
  screen: (cur) => (cur === 'local' ? lobby.open() : lobby.close()),
  quit: () => {
    const url = new URL(location.href);
    url.searchParams.delete('autostart');
    location.href = url.toString();
  },
});
window.__menu = menu;
const lobby = new LocalLobby({
  start: (online, setup) => start(!online, setup),
  back: () => menu.back(),
  name: () => $('name').value.trim() || 'Lagerist',
  room: () => ($('room').value.trim() || '').toUpperCase() || '—',
});
if (params.get('autostart')) setTimeout(() => start(false), 0);

// local: Aufstellung aus der Lobby für lokalen Koop (oder null)
function start(solo, local = null) {
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
  lobby.close();
  menu.close();
  $('hud').classList.remove('hidden');
  if (settings.touchEnabled()) {
    // Auf Handys: Vollbild + Querformat, soweit der Browser es erlaubt
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  game = new Game(name, room, solo, local);
  window.__game = game;
  game.lock();
}

// ───────── Spiel ─────────
// Ein Browser-Tab kann mehrere lokale Spieler haben (lokaler Koop, je ein Controller).
// Jeder lokale Spieler hat seinen eigenen Körper und – online – seine eigene
// Verbindung zum Raum. Für den Server und die Mitspieler sind lokale Spieler ganz
// normale Teilnehmer; der erste lokale Spieler (primary) verarbeitet die Raum-Nachrichten.
class Game {
  constructor(name, room, solo = false, local = null) {
    this.name = name;
    this.room = room;
    this.solo = solo;
    this.level = buildLevel();
    this.world = new Colliders(this.level);
    this.view = new Renderer($('app'), this.level);
    this.locals = [];
    this.view.locals = this.locals; // Kranhaken folgen den Händen lokaler Spieler
    this.remotes = new Map();
    this.camYaw = 0; // gemeinsame Kamera (ein Spieler oder Splitscreen aus)
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
    this.mode = 'rope'; // 'rope' = alle an einem Seil, 'teams' = 2 gegen 2
    this.tcp = [0, 0]; // Zwischenstopps beider Teams (nur 2 gegen 2)
    this.race = null; // { startedAt, winner, time } im Teammodus
    this.modeWish = modeWish.get();
    this.netReady = false; // Verbindung von Spieler 1 steht (oder ist endgültig offline)
    this.padPrev = new Map(); // Tastenzustand freier Controller (Einsteigen mitten im Spiel)

    const p1 = this.newLocal(name, 0);
    $('hud-room').textContent = `RAUM ${room}`;
    // Offline-Fortschritt dieses Raums
    const saved = Number(store.get('hochstapler.cp.' + room) || 0);
    if (saved > 0 && saved < this.level.checkpoints.length) { this.cp = saved; this.respawn(p1, false); }
    this.view.setCheckpointReached(this.cp);

    p1.net = this.net = new Net(solo ? null : room, name, {
      message: (m) => this.onMessage(m),
      offline: (wasOnline) => {
        this.toast(solo ? (this.locals.length > 1 ? `Lokaler Koop zu ${this.locals.length}. – viel Erfolg!` : 'Solo-Training – viel Erfolg!') : wasOnline ? 'Verbindung verloren – lokal weiter' : 'Kein Server erreichbar – lokal weiter');
        for (const id of [...this.remotes.keys()]) this.removeRemote(id);
        $('hud-room').textContent = solo ? (this.locals.length > 1 ? 'LOKAL' : 'SOLO') : 'LOKAL (offline)';
        // Weitere lokale Spieler spielen ohne Server weiter
        for (const lp of this.locals) if (lp !== p1 && lp.net) { lp.net.close(); lp.net = new Net(null, lp.name, {}); }
        this.netReady = true;
        this.connectLocals();
      },
    });

    this.bindInput(local);
    for (const e of local?.extra || []) this.addLocal(e.pad, e.name, false);
    this.world.update(this.net.time());
    requestAnimationFrame(() => this.frame());
  }

  // ───── Lokale Spieler ─────
  get p1() { return this.locals[0]; }
  // Kompatibilität: "der" Spieler dieses Geräts ist Spieler 1
  get body() { return this.p1.body; }
  get me() { return this.p1; }

  newLocal(name, slot) {
    const lp = {
      id: 'local' + slot + '-' + Math.random().toString(36).slice(2, 6), name, slot, color: LOCAL_COLORS[slot % LOCAL_COLORS.length],
      body: createBody(this.level.spawn), input: null, net: null, jump: false, tension: 0, sendAcc: 0, online: false, team: 0,
      // eigene Kamera für den Splitscreen
      cam: { yaw: this.camYaw || 0, pitch: 0.35, dist: 7.5, smooth: undefined },
    };
    this.locals.push(lp);
    this.view.createAvatar(lp.id, name, lp.color);
    return lp;
  }

  isLocal(id) { return this.locals.some((l) => l.id === id); }

  // Neuer lokaler Spieler mit eigenem Controller
  addLocal(pad, name, announce = true) {
    if (this.locals.length >= MAX_LOCAL || this.locals.length + this.remotes.size >= 4) {
      if (announce) this.toast('Seil ist voll (max. 4 Lageristen)');
      return null;
    }
    const used = new Set(this.locals.map((l) => l.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    name = name || `Spieler ${this.locals.length + 1}`;
    const lp = this.newLocal(name, slot);
    lp.input = new PadInput(pad, {
      pause: () => (this.paused ? this.resume() : this.pause()),
      emote: (i) => this.emote(i, lp),
      reset: () => this.resetToSafe(lp),
    });
    lp.pad = pad;
    // Neben Spieler 1 auftauchen
    const p = this.p1.body.pos;
    lp.body.pos = [p[0] + (slot % 2 ? 0.8 : -0.8), p[1] + 0.5, p[2] + (slot > 1 ? 0.8 : -0.8)];
    lp.body.vel = [0, 0, 0];
    lp.body.grounded = false;
    this.connectLocals();
    if (announce) {
      this.toast(`${name} hängt sich ans Seil (Controller ${pad + 1})`);
      audio.play('join');
    }
    this.updateClickHint();
    return lp;
  }

  removeLocal(lp) {
    if (lp === this.p1) return;
    lp.net?.close();
    lp.input?.dispose?.();
    this.view.removeAvatar(lp.id);
    this.locals = this.locals.filter((l) => l !== lp);
    this.toast(`${lp.name} hat sich abgeseilt`);
    audio.play('leave');
  }

  // Weitere lokale Spieler verbinden sich erst, wenn Spieler 1 im Raum ist
  // (dann bekommt Spieler 1 den ersten freien Platz am Seil).
  connectLocals() {
    if (!this.netReady) return;
    for (const lp of this.locals) {
      if (lp === this.p1 || lp.net) continue;
      const online = this.net.online;
      lp.net = new Net(online ? this.room : null, lp.name, {
        message: (m) => this.onLocalMessage(lp, m),
        offline: () => {},
      });
    }
  }

  setLocalId(lp, info) {
    const old = lp.id;
    Object.assign(lp, { id: info.id, name: info.name, slot: info.slot, color: info.color, team: info.team ?? 0, online: true });
    this.view.removeAvatar(old);
    this.view.createAvatar(lp.id, lp.name, lp.color);
    // Falls der Raum den Spieler schon als Mitspieler gemeldet hat: entfernen
    if (this.remotes.has(lp.id)) this.removeRemote(lp.id);
  }

  // Nachrichten an die Verbindung eines weiteren lokalen Spielers. Alles, was den
  // ganzen Raum betrifft, verarbeitet bereits Spieler 1.
  onLocalMessage(lp, m) {
    if (!this.locals.includes(lp)) return;
    if (m.t === 'welcome') {
      this.setLocalId(lp, m.you);
      if (this.mode === 'teams') { this.respawn(lp, false); this.refreshModeUi(); }
      else if (this.cp > (m.cp || 0)) lp.net.send({ t: 'cp', i: this.cp });
    } else if (m.t === 'full') {
      this.toast(`Raum ist voll (max. 4) – ${lp.name} kann nicht mitspielen`);
      this.removeLocal(lp);
    }
  }

  // ───── Netzwerk ─────
  onMessage(m) {
    switch (m.t) {
      case 'welcome': {
        this.setLocalId(this.p1, m.you);
        this.startedAt = m.startedAt;
        this.played = m.played || 0;
        this.board = m.board;
        this.mode = m.mode || 'rope';
        this.tcp = m.tcp || [0, 0];
        this.race = m.race || null;
        const others = m.players.filter((p) => !this.isLocal(p.id));
        for (const p of others) this.addRemote(p);
        if (this.mode === 'teams') this.view.setCheckpointReached(this.cpOf(this.p1));
        else this.setCheckpoint(m.cp || 0, false);
        // Neben einem Mitspieler (aus dem eigenen Team) starten, sonst am Zwischenstopp
        const near = others.find((p) => p.s && p.s.p && (this.mode !== 'teams' || p.team === this.p1.team));
        if (near) this.body.pos = [near.s.p[0], near.s.p[1] + 0.5, near.s.p[2]];
        else this.respawn(this.p1, false);
        for (const lp of this.locals) {
          if (lp === this.p1) continue;
          const b = this.body.pos;
          lp.body.pos = [b[0] + (lp.slot % 2 ? 0.8 : -0.8), b[1] + 0.3, b[2] + (lp.slot > 1 ? 0.8 : -0.8)];
          lp.body.vel = [0, 0, 0];
        }
        const n = others.length + this.locals.length;
        this.toast(others.length ? `Raum ${this.room}: ${n} Lageristen am Seil` : `Raum ${this.room} geöffnet – lade Freunde ein!`);
        if (this.mode === 'teams') this.toast(`2 gegen 2 läuft – du kletterst für ${TEAMS[this.p1.team].name}`);
        else if (this.cp > 0) this.toast(`Fortschritt geladen: ${this.cpLabel(this.cp)}`);
        if (this.mode !== 'teams' && this.cp > (m.cp || 0)) this.net.send({ t: 'cp', i: this.cp });
        this.netReady = true;
        this.maybeAutoMode();
        this.connectLocals();
        break;
      }
      case 'join': {
        if (this.isLocal(m.player.id)) return;
        this.addRemote(m.player);
        // Ein eigener lokaler Spieler, dessen Begrüßung noch unterwegs ist, wird nicht angesagt
        const pending = this.locals.some((l) => !l.online && l !== this.p1 && l.name === m.player.name);
        if (!pending) {
          this.toast(this.mode === 'teams' ? `${m.player.name} klettert für ${TEAMS[m.player.team ?? 0].name}` : `${m.player.name} hängt sich ans Seil`);
          audio.play('join');
        }
        this.refreshModeUi();
        this.maybeAutoMode();
        break;
      }
      case 'leave':
        if (!this.remotes.has(m.id)) return;
        this.removeRemote(m.id);
        this.toast(`${m.name} hat sich abgeseilt`);
        audio.play('leave');
        this.refreshModeUi();
        break;
      case 's': {
        const r = this.remotes.get(m.id);
        if (!r) return;
        // Sprung/Landung des Mitspielers hörbar machen
        if (r.grounded && !m.g && m.v[1] > 3) audio.remoteJump(m.p);
        if (!m.g) r.airVy = Math.min(r.airVy || 0, m.v[1]);
        else if (!r.grounded) { audio.remoteLand(m.p, -(r.airVy || 0)); r.airVy = 0; }
        r.target = m.p; r.vel = m.v; r.yaw = m.y; r.grounded = m.g; r.braced = m.b; r.a = m.a;
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
        if (m.team !== undefined) { this.showRaceFinish(m); break; }
        this.board = m.board;
        this.showFinish(m.name, m.time);
        break;
      case 'cp':
        if (this.mode === 'teams' && m.team !== undefined) {
          if (m.i <= this.tcp[m.team]) break;
          this.tcp[m.team] = m.i;
          // Eigenes Team (auch ein lokaler Mitspieler) oder Gegner?
          if (this.locals.some((l) => l.team === m.team)) {
            if (m.team === this.p1.team) this.view.setCheckpointReached(m.i);
            this.toast(`${m.name} hat ${this.cpLabel(m.i)} erreicht – gespeichert`);
          } else this.toast(`${TEAMS[m.team].short}: ${this.cpLabel(m.i)}`);
          break;
        }
        if (m.i > this.cp) { this.setCheckpoint(m.i, false); this.toast(`${m.name} hat ${this.cpLabel(m.i)} erreicht – gespeichert`); }
        break;
      case 'warp': {
        // Bei 2 gegen 2 holt man nur das eigene Team zurück
        const hit = this.locals.filter((lp) => this.mode !== 'teams' || m.team === undefined || lp.team === m.team);
        if (!hit.length) break;
        this.toast(`${m.name} holt das Team zum ${this.cpLabel(this.cpOf(hit[0]))}`);
        for (const lp of hit) this.respawn(lp, false);
        break;
      }
      case 'reset': {
        // Ein Mitspieler hat die Seilschaft zu seiner sicheren Stelle zurückgesetzt
        const hit = this.locals.filter((lp) => this.mode !== 'teams' || m.team === undefined || lp.team === m.team);
        if (!hit.length || !m.box || !m.pos) break;
        const spot = { box: m.box, pos: m.pos, y: m.box.max[1] };
        this.placeGroup(hit, spot, m.n || hit.length + 1);
        this.toast(`${m.name} setzt die Seilschaft zur letzten sicheren Stelle zurück`);
        audio.play('respawn');
        break;
      }
      case 'restart':
        if (m.race) { this.race = m.race; this.tcp = [0, 0]; } else { this.startedAt = m.startedAt; this.played = 0; }
        this.setCheckpoint(0, false, true);
        for (const lp of this.locals) this.respawn(lp, true);
        $('finish').classList.add('hidden');
        this.finished = false;
        this.setInputEnabled(!this.paused);
        this.toast(m.race ? `${m.by} startet die Revanche – auf die Plätze!` : `${m.by} startet eine neue Schicht`);
        audio.play('respawn');
        break;
      case 'mode':
        this.applyMode(m);
        break;
      case 'modeError':
        this.toast(m.reason);
        break;
      case 'full':
        this.toast('Raum ist voll (max. 4) – ihr spielt lokal');
        break;
    }
  }

  addRemote(p) {
    if (this.remotes.has(p.id) || this.isLocal(p.id)) return;
    const s = p.s || {};
    const r = {
      id: p.id, name: p.name, slot: p.slot, color: p.color, team: p.team ?? 0,
      target: s.p || [...this.level.spawn], rpos: s.p ? [...s.p] : [...this.level.spawn],
      vel: s.v || [0, 0, 0], yaw: s.y || 0, grounded: s.g ?? true, braced: !!s.b, a: s.a, age: 0, maxY: 0,
    };
    this.remotes.set(p.id, r);
    this.view.createAvatar(p.id, p.name, p.color);
  }

  removeRemote(id) {
    this.remotes.delete(id);
    this.view.removeAvatar(id);
  }

  everyone() {
    return [
      ...this.locals.map((l) => ({ id: l.id, slot: l.slot, team: l.team ?? 0, local: l })),
      ...[...this.remotes.values()].map((r) => ({ id: r.id, slot: r.slot, team: r.team ?? 0, remote: r })),
    ];
  }

  // Seilschaften: nach Slot sortiert, Nachbarn sind verbunden.
  // Alle an einem Seil – oder bei 2 gegen 2 ein Seil je Team.
  chains() {
    return ropeGroups(this.everyone(), this.mode);
  }

  // ───── Spielmodus ─────
  // Lokaler Spieler, der Gastgeber des Raums ist (oder null)
  hostLocal() {
    const h = hostOf(this.everyone().filter((p) => p.remote || p.local.online));
    return h && h.local ? h.local : null;
  }

  playerCount() {
    return this.remotes.size + this.locals.filter((l) => l.online).length;
  }

  toggleMode() {
    this.requestMode(this.mode === 'teams' ? 'rope' : 'teams');
  }

  requestMode(mode, shuffle = false, quiet = false) {
    const say = (t) => { if (!quiet) this.toast(t); };
    if (!this.net.online) { say('Spielmodus geht nur online im Raum'); return; }
    const host = this.hostLocal();
    if (!host) { say('Nur der Gastgeber kann den Spielmodus ändern'); return; }
    const err = modeError(mode, this.playerCount());
    if (err) { say(err); return; }
    host.net.send({ t: 'mode', mode, shuffle });
  }

  // Wunsch aus dem Hauptmenü: Sobald der Raum voll ist, startet der Gastgeber 2 gegen 2
  maybeAutoMode() {
    if (this.modeWish !== 'teams' || this.mode === 'teams' || this.autoModeSent) return;
    if (!this.hostLocal() || this.playerCount() !== 4) {
      if (this.hostLocal() && !this.waitHint) { this.waitHint = true; this.toast('2 gegen 2 startet, sobald ihr zu viert seid'); }
      return;
    }
    this.autoModeSent = true;
    this.requestMode('teams', false, true);
  }

  applyMode(m) {
    const was = this.mode;
    this.mode = m.mode;
    this.race = m.race || null;
    this.tcp = [0, 0];
    const t = m.teams || {};
    for (const lp of this.locals) if (t[lp.id] !== undefined) lp.team = t[lp.id];
    for (const r of this.remotes.values()) if (t[r.id] !== undefined) r.team = t[r.id];
    this.finished = false;
    $('finish').classList.add('hidden');
    this.setInputEnabled(!this.paused);
    if (this.mode === 'teams') {
      // Rennstart: alle unten, ein Seil je Team
      this.setCheckpoint(0, false, true);
      for (const lp of this.locals) this.respawn(lp, true);
      this.toast(m.shuffle ? `${m.by} lost die Teams neu aus` : `${m.by} startet 2 gegen 2!`);
      for (const team of new Set(this.locals.map((l) => l.team))) {
        const names = this.everyone().filter((p) => p.team === team).map((p) => (p.local ? p.local.name : p.remote.name));
        this.toast(`${TEAMS[team].name}: ${names.join(' & ')}`);
      }
    } else {
      // Zurück an ein gemeinsames Seil, am gemeinsamen Zwischenstopp
      this.setCheckpoint(m.cp || 0, false, true);
      if (was === 'teams') for (const lp of this.locals) this.respawn(lp, false);
      this.toast(`${m.by}: wieder alle an einem Seil`);
    }
    audio.play('respawn');
    this.refreshModeUi();
  }

  // Pausemenü: aktueller Modus; umstellen darf nur der Gastgeber
  refreshModeUi() {
    const online = this.net?.online;
    const n = this.playerCount();
    const host = online && !!this.hostLocal();
    const here = this.locals.length;
    $('pause-room').textContent = online
      ? `Raum ${this.room} · ${n} ${this.mode === 'teams' ? 'Spieler · 2 gegen 2' : 'am Seil'}${here > 1 ? ` (${here} hier)` : ''}`
      : here > 1 ? `Lokal · ${here} am Seil` : 'Solo';
    $('mode-btn').textContent = `◀ ${modeLabel(this.mode)} ▶`;
    $('mode-btn').disabled = !host || (this.mode !== 'teams' && n !== 4);
    $('shuffle-btn').classList.toggle('hidden', !(host && this.mode === 'teams'));
    let note;
    if (!online) note = 'Spielmodus gibt es nur online im Raum.';
    else if (n < 2) note = 'Allein im Raum. Mit 2 oder 3 Spielern hängen alle an einem Seil, zu viert geht auch 2 gegen 2.';
    else if (n < 4 && this.mode !== 'teams') note = `${n} Spieler: alle an einem Seil. Für 2 gegen 2 braucht ihr genau 4.`;
    else if (this.mode === 'teams') note = `${this.locals.length > 1 ? 'Ihr klettert' : 'Du kletterst'} für ${[...new Set(this.locals.map((l) => TEAMS[l.team].name))].join(' und ')} – erstes Team oben gewinnt.`;
    else note = '4 Spieler: alle an einem Seil oder zwei Seilschaften gegeneinander.';
    if (online && !host) note += ' Umstellen kann nur der Gastgeber.';
    $('mode-note').textContent = note;
  }

  // Erreichter Zwischenstopp für diesen Spieler (bei 2 gegen 2 der seines Teams)
  cpOf(lp) {
    return this.mode === 'teams' ? this.tcp[lp.team ?? 0] || 0 : this.cp;
  }

  // ───── Eingabe ─────
  bindInput(local) {
    const canvas = this.view.renderer.domElement;
    // Spieler 1: Tastatur/Maus/Touch und – je nach Lobby – ein bestimmter Controller
    const pad = local ? (local.p1Pad >= 0 ? local.p1Pad : local.kbmSeparate ? 'none' : 'auto') : 'auto';
    this.input = this.p1.input = new Input(canvas, {
      pause: () => (this.paused ? this.resume() : this.pause()),
      emote: (i) => this.emote(i, this.p1),
      reset: () => this.resetToSafe(this.p1),
      toast: (t) => this.toast(t),
      device: () => this.updateClickHint(),
    }, { pad });
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
    // Controller abgezogen: dieser lokale Spieler steigt aus
    addEventListener('gamepaddisconnected', (e) => {
      const lp = this.locals.find((l) => l !== this.p1 && l.pad === e.gamepad.index);
      if (lp) this.removeLocal(lp);
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
      for (const lp of this.locals) this.respawn(lp, true);
      this.finished = false;
      $('finish').classList.add('hidden');
      this.setInputEnabled(true);
      this.lock();
    };
    $('stay').onclick = () => { audio.play('uiBack'); $('finish').classList.add('hidden'); this.setInputEnabled(true); this.lock(); };
    settings.onChange((s, patch) => { if ('hints' in patch) this.updateClickHint(); });
    this.updateClickHint();
  }

  setInputEnabled(on) {
    for (const lp of this.locals) lp.input?.setEnabled(on);
  }

  // Freier Controller drückt A oder Start: neuer lokaler Spieler
  pollNewPads() {
    for (const gp of listPads()) {
      const prev = this.padPrev.get(gp.index) || [];
      this.padPrev.set(gp.index, gp.buttons.map((b) => b.pressed));
      if (padClaims.has(gp.index)) continue;
      const pressed = (i) => gp.buttons[i]?.pressed && !prev[i];
      if (pressed(0) || pressed(9)) this.addLocal(gp.index);
    }
  }

  emote(i, lp = this.p1) {
    const e = EMOTES[i];
    if (!e || this.paused) return;
    lp.net?.send({ t: 'emote', e });
    this.toast(this.locals.length > 1 ? `${lp.name}: ${e}` : `Du: ${e}`);
    audio.play('emote', { index: i, pos: lp === this.p1 ? undefined : lp.body.pos });
  }

  pause() {
    if (this.paused || this.finishOpen()) return;
    this.paused = true;
    this.setInputEnabled(false);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.refreshModeUi();
    menu.open('pause');
    this.updateClickHint();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    menu.close();
    this.setInputEnabled(true);
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
    $('crosshair').classList.toggle('hidden', settings.touchEnabled() || this.locals.length > 1);
  }

  // Mehrere Spieler an einem Gerät: geteilter Bildschirm (abschaltbar in den Optionen)
  split() { return this.locals.length > 1 && settings.get().splitscreen !== false; }

  // Alle lokalen Spieler abfragen. Splitscreen: jeder dreht seine eigene Kamera.
  // Sonst ist die Kamera gemeinsam und alle dürfen sie drehen. Gelaufen wird relativ
  // zur Kamera, die der Spieler sieht.
  readInputs(dt) {
    const polled = this.locals.map((lp) => lp.input.poll(dt));
    const split = this.split();
    if (split) {
      this.locals.forEach((lp, k) => {
        const i = polled[k], c = lp.cam;
        c.yaw += i.lookX;
        c.pitch = Math.min(1.35, Math.max(-0.5, c.pitch + i.lookY));
        if (i.zoom) c.dist = Math.min(16, Math.max(3, c.dist + i.zoom));
      });
    } else {
      let lookX = 0, lookY = 0, zoom = 0;
      for (const i of polled) { lookX += i.lookX; lookY += i.lookY; zoom += i.zoom; }
      this.camYaw += lookX;
      this.camPitch = Math.min(1.35, Math.max(-0.5, this.camPitch + lookY));
      if (zoom) this.camDist = Math.min(16, Math.max(3, this.camDist + zoom));
      // Beim Wechsel in den Splitscreen startet jeder mit dem gemeinsamen Blick
      for (const lp of this.locals) Object.assign(lp.cam, { yaw: this.camYaw, pitch: this.camPitch, dist: this.camDist });
    }
    return polled.map((i, k) => {
      const yaw = split ? this.locals[k].cam.yaw : this.camYaw;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const fx = i.forward, rx = i.right;
      // Kamera schaut entlang (-sin yaw, -cos yaw)
      let x = -sy * fx + cy * rx;
      let z = -cy * fx - sy * rx;
      const l = Math.hypot(x, z);
      if (l > 1) { x /= l; z /= l; }
      return { x, z, jump: i.jump, brace: i.brace };
    });
  }

  // ───── Spielschleife ─────
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    const locals = this.locals;
    const inputs = this.readInputs(dt);
    const before = locals.map((lp) => ({ grounded: lp.body.grounded, fall: -lp.body.vel[1] }));
    const evs = locals.map(() => ({ jumped: false, landed: false, landSpeed: 0 }));
    const step = this.clock.step;
    const tNow = this.net.time();
    // Sprung bleibt gemerkt, falls dieser Frame keinen Physikschritt hat (>120-Hz-Bildschirme)
    locals.forEach((lp, k) => { if (inputs[k].jump) lp.jump = true; });
    const steps = this.clock.frame(dt, false);
    // Druckplatten: Fußpunkte aller Spieler (lokal und online)
    const feet = [...locals.map((lp) => lp.body.pos), ...[...this.remotes.values()].map((r) => r.rpos)];
    this.world.updatePlates(feet, dt, feet.length > 1 ? 1.2 : 6);
    for (let i = 0; i < steps; i++) {
      this.world.update(tNow - (steps - 1 - i) * step);
      locals.forEach((lp, k) => {
        const b = lp.body;
        const vyBefore = b.vel[1];
        stepBody(b, { ...inputs[k], jump: lp.jump }, this.world, step);
        trackSafe(lp.safe || (lp.safe = {}), b, this.world, step);
        lp.jump = false;
        if (b.jumped) evs[k].jumped = true;
        if (b.zapped) { audio.play('respawn'); if (k === 0) this.view.shake = Math.max(this.view.shake, 0.6); }
        if (b.justLanded) { evs[k].landed = true; evs[k].landSpeed = Math.max(evs[k].landSpeed, -vyBefore); }
      });
      this.ropeStep(step);
    }

    locals.forEach((lp, k) => {
      const b = lp.body;
      // Landung: leichtes Kamerawackeln bei harten Aufprallen
      if (!before[k].grounded && b.grounded && before[k].fall > 6) {
        const kk = Math.min(1, (before[k].fall - 6) / 18);
        this.view.shake = Math.max(this.view.shake, k === 0 ? kk : kk * 0.6);
      }
      // Zwischenstopp erreicht?
      const g0 = b.ground;
      const mine = this.cpOf(lp);
      if (b.grounded && g0 && g0.cp !== undefined && g0.cp > mine) this.setCheckpoint(g0.cp, true, false, lp);
      // Abgestürzt: deutlich unter den letzten Zwischenstopp gefallen oder aus der Welt
      const p = b.pos;
      const cpY = this.level.checkpoints[this.cpOf(lp)].pos[1];
      // Wer fällt, landet weiter unten und klettert von dort wieder hoch. Zurück zum
      // Zwischenstopp geht es erst unten auf dem Hof (oder aus der Welt heraus).
      const onYard = b.grounded && b.ground && b.ground.big && cpY > 2;
      if (onYard || p[1] < this.level.killY || Math.abs(p[0]) > 75 || Math.abs(p[2]) > 75) {
        this.respawn(lp, false);
        audio.play('respawn');
        evs[k].landed = false;
        this.toast(locals.length > 1 ? `${lp.name} abgestürzt – zurück zum ${this.cpLabel(this.cpOf(lp))}` : `Abgestürzt – zurück zum ${this.cpLabel(this.cpOf(lp))}`);
      }
      // Weitere lokale Spieler: Sprünge/Landungen räumlich hörbar
      if (k > 0) {
        if (evs[k].jumped) audio.remoteJump(b.pos);
        if (evs[k].landed) audio.remoteLand(b.pos, evs[k].landSpeed);
      }
    });
    if (this.tension > 1.02 && !(this.lastTension > 1.02)) { this.view.shake = Math.max(this.view.shake, 0.25); }
    this.lastTension = this.tension;

    // Seilzug je Spieler für die Animation (aus den Positionen, für alle gleich)
    const pulls = this.ropePulls();
    // Mitspieler glätten
    for (const r of this.remotes.values()) {
      r.age += dt;
      const lead = Math.min(r.age, 0.15);
      for (let i = 0; i < 3; i++) {
        const want = r.target[i] + (r.vel[i] || 0) * lead * (i === 1 && r.grounded ? 0 : 1);
        r.rpos[i] += (want - r.rpos[i]) * Math.min(1, dt * 14);
      }
      const an = decodeAnim(r.a, r.grounded, r.braced);
      this.view.updateAvatar(r.id, {
        pos: r.rpos, vel: r.vel, yaw: r.yaw, grounded: r.grounded, braced: r.braced, ...an,
        grip: an.mode === 3 ? this.hookGrip(r.rpos) : null, pull: pulls.get(r.id),
      }, dt, false);
    }
    // Namensschilder über lokalen Spielern nur, wenn mehrere am Bildschirm sind
    const single = locals.length === 1;
    for (const lp of locals) {
      const b = lp.body;
      const an = decodeAnim(animCode(b));
      this.view.updateAvatar(lp.id, {
        pos: b.pos, vel: b.vel, yaw: visYaw(b), grounded: b.grounded, braced: b.braced, ...an,
        grip: b.hook ? b.hook.h.cur : null, pull: pulls.get(lp.id),
      }, dt, single);
    }

    // Seile zeichnen (bei 2 gegen 2 eins je Team)
    const pairs = [];
    for (const chain of this.chains()) {
      for (let i = 1; i < chain.length; i++) pairs.push([this.posOf(chain[i - 1]), this.posOf(chain[i]), PHYS.rope]);
    }
    this.view.setRopes(pairs);

    // Zustand senden (20 Hz), jeder lokale Spieler über seine eigene Verbindung
    this.sendAcc += dt;
    if (this.sendAcc > 0.05) {
      this.sendAcc = 0;
      const r2 = (v) => Math.round(v * 100) / 100;
      for (const lp of locals) {
        const b = lp.body;
        lp.net?.send({ t: 's', p: b.pos.map(r2), v: b.vel.map(r2), y: r2(visYaw(b)), g: b.grounded, b: b.braced, a: animCode(b) });
      }
    }

    // Ziel
    const g = this.level.goal;
    for (const lp of locals) {
      const p = lp.body.pos;
      if (!this.finished && p[0] > g.min[0] && p[0] < g.max[0] && p[2] > g.min[2] && p[2] < g.max[2] && p[1] >= g.min[1] - 0.1 && p[1] < g.max[1]) {
        this.finished = true;
        // Über die Verbindung dieses Spielers melden: bei 2 gegen 2 zählt sein Team
        if (this.net.online) (lp.net?.online ? lp.net : this.net).send({ t: 'goal' });
        else this.showFinish(locals.length > 1 ? locals.map((l) => l.name).join(', ') : this.name, this.shiftTime());
      }
    }

    const views = this.updateCamera(dt);
    this.updateSplitLabels(views);
    // Hören wie Spieler 1: mit dessen Kamera
    const cp = views ? views[0].pos : this.view.camera.position.toArray();
    const p1 = this.p1.body;
    audio.update({
      dt, time: tNow, world: this.world, body: p1, tension: this.tension, ...evs[0],
      camPos: cp, camYaw: views ? this.p1.cam.yaw : this.camYaw,
      section: sectionAtHeight(this.level, Math.max(0, this.topY())),
    });
    this.hudAcc += dt;
    if (this.hudAcc > 0.1) { this.hudAcc = 0; this.updateHud(); }
    this.view.update(dt, this.world, views ? this.cameraFocus().target : p1.pos, views);
    // Erst nach Spieler 1 (der sich in readInputs seinen Controller nimmt): freie Controller dürfen einsteigen
    if (!this.paused && !this.finished) this.pollNewPads();
  }

  // Zug des Seils am Gurt (Welt-Vektor, Länge 0..1) für jeden Spieler
  ropePulls() {
    const out = new Map();
    const L = PHYS.rope;
    for (const chain of this.chains()) {
      for (let i = 1; i < chain.length; i++) {
        const a = this.posOf(chain[i - 1]), b = this.posOf(chain[i]);
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const len = Math.hypot(d[0], d[1], d[2]);
        const k = Math.min(1, Math.max(0, (len / L - 0.93) * 9));
        if (k <= 0 || len < 1e-3) continue;
        for (const [c, sg] of [[chain[i - 1], 1], [chain[i], -1]]) {
          const v = out.get(c.id) || [0, 0, 0];
          for (let j = 0; j < 3; j++) v[j] += (d[j] / len) * k * sg;
          out.set(c.id, v);
        }
      }
    }
    for (const v of out.values()) {
      const l = Math.hypot(v[0], v[1], v[2]);
      if (l > 1) for (let j = 0; j < 3; j++) v[j] /= l;
    }
    return out;
  }

  // Aufhängepunkt des Kranhakens, an dem ein Mitspieler hängt (für das Pendeln)
  hookGrip(p) {
    const hand = [p[0], p[1] + PHYS.reach, p[2]];
    let best = null, bd = 0.6;
    for (const h of this.world.hooks) {
      const d = Math.abs(Math.hypot(hand[0] - h.cur[0], hand[1] - h.cur[1], hand[2] - h.cur[2]) - h.len);
      if (d < bd) { bd = d; best = h.cur; }
    }
    return best;
  }

  posOf(c) {
    if (c.local) return c.local.body.pos;
    return c.remote ? c.remote.rpos : this.body.pos;
  }

  // Höchster lokaler Spieler (für HUD, Musik und Rekord)
  topY() {
    let y = -Infinity;
    for (const lp of this.locals) y = Math.max(y, lp.body.pos[1]);
    return y;
  }

  ropeStep(dt) {
    let total = 0;
    for (const chain of this.chains()) chain.forEach((c, idx) => {
      if (!c.local) return;
      const body = c.local.body;
      let tension = 0;
      for (const j of [idx - 1, idx + 1]) {
        if (j < 0 || j >= chain.length) continue;
        const n = chain[j];
        // Nachbar am selben Bildschirm: echter Körper, sonst geglättete Netzposition
        if (n.local) tension = Math.max(tension, applyRope(body, n.local.body.pos, n.local.body.grounded, n.local.body.braced, this.world, dt));
        else tension = Math.max(tension, applyRope(body, n.remote.rpos, n.remote.grounded, n.remote.braced, this.world, dt));
      }
      c.local.tension = tension;
      total = Math.max(total, tension);
    });
    this.tension = total;
  }

  // Zurück zum Zwischenstopp des Teams (oder zum Start). Jeder Spieler bekommt
  // seinen eigenen Platz auf der Plattform, damit niemand ineinander steht.
  respawn(lp, toStart) {
    const cp = this.level.checkpoints[toStart ? 0 : this.cpOf(lp)];
    const pos = [...cp.pos];
    const slot = lp.slot || 0;
    const spread = cp.box ? Math.min(0.7, (cp.box.max[0] - cp.box.min[0]) / 2 - 0.4) : 1.8;
    pos[0] += ((slot % 2) * 2 - 1) * spread * 0.8;
    pos[2] += (slot < 2 ? -1 : 1) * spread * 0.6;
    pos[1] += 0.2;
    lp.body.pos = pos;
    lp.body.vel = [0, 0, 0];
    lp.body.grounded = false;
    releaseGrips(lp.body);
    resetSafe(lp.safe || (lp.safe = {}));
    if (toStart) this.best = 0;
  }

  // Reset-Taste: zurück zur letzten sicheren Stelle (sonst zum Zwischenstopp).
  // Am Seil kommt die ganze Seilschaft mit, sonst würde das Seil sofort wieder ziehen.
  resetToSafe(lp) {
    if (this.paused || this.finished) return;
    const now = performance.now();
    if (now - (this.lastReset || 0) < 800) return;
    this.lastReset = now;
    const chain = this.chains().find((c) => c.some((e) => e.local === lp)) || [{ local: lp }];
    const spot = lp.safe?.spot;
    const group = chain.filter((e) => e.local).map((e) => e.local);
    if (!spot) {
      for (const g of group) this.respawn(g, false);
    } else this.placeGroup(group, spot, chain.length);
    // Online: Mitspieler am selben Seil (bzw. im selben Team) kommen mit
    if (chain.some((e) => e.remote)) {
      const via = lp.net?.online ? lp.net : this.net;
      via.send(spot ? { t: 'reset', box: { min: spot.box.min, max: spot.box.max }, pos: spot.pos, n: chain.length } : { t: 'warp' });
    }
    audio.play('respawn');
    const what = spot ? 'zur letzten sicheren Stelle' : `zum ${this.cpLabel(this.cpOf(lp))}`;
    this.toast(chain.length > 1 ? `${lp.name} setzt die Seilschaft ${what} zurück` : `Zurück ${what}`);
  }

  placeGroup(group, spot, n) {
    group.forEach((g, i) => {
      const b = g.body;
      b.pos = spreadOn(spot.box, spot.pos, n, (g.slot ?? i) % Math.max(1, n));
      b.vel = [0, 0, 0];
      b.grounded = false;
      releaseGrips(b);
      g.safe = { spot: { ...spot }, calm: 0 };
    });
  }

  warpTeam() {
    if (this.mode === 'teams') {
      // Je Team, das hier spielt, eine Meldung über einen Spieler dieses Teams
      for (const team of new Set(this.locals.map((l) => l.team))) {
        const lp = this.locals.find((l) => l.team === team && l.net?.online) || this.p1;
        lp.net?.send({ t: 'warp' });
      }
    } else this.net.send({ t: 'warp' });
    for (const lp of this.locals) this.respawn(lp, false);
    audio.play('respawn');
    this.toast(`Team zum ${this.cpLabel(this.cpOf(this.p1))} geholt`);
  }

  setCheckpoint(i, announce, force, by = this.p1) {
    if (this.mode === 'teams') {
      // 2 gegen 2: Fortschritt des Teams dieses Spielers, nicht offline gemerkt
      const t = by.team ?? 0;
      if (!force && i <= this.tcp[t]) return;
      if (force) this.tcp = [i, i]; else this.tcp[t] = i;
      if (force || t === this.p1.team) this.view.setCheckpointReached(i);
    } else {
      if (!force && i <= this.cp) return;
      this.cp = i;
      store.set('hochstapler.cp.' + this.room, String(i));
      this.view.setCheckpointReached(i);
    }
    if (announce) {
      (by?.net || this.net).send({ t: 'cp', i });
      this.toast(this.locals.length > 1 ? `${by.name}: ${this.cpLabel(i)} erreicht – gespeichert` : `${this.cpLabel(i)} erreicht – Fortschritt gespeichert`);
    }
  }

  cpLabel(i) {
    const c = this.level.checkpoints[i];
    return i === 0 ? 'Start' : `Zwischenstopp ${i} (${c.label})`;
  }

  // Gemeinsame Kamera: zielt auf die Mitte aller lokalen Spieler und geht weiter
  // zurück, je weiter die Seilschaft auseinander ist. Weil das Seil alle auf
  // wenigen Metern hält, reicht ein Bild – kein geteilter Bildschirm nötig.
  cameraFocus() {
    const L = this.locals;
    if (L.length === 1) {
      const p = L[0].body.pos;
      return { target: [p[0], p[1] + 1.5, p[2]], extra: 0 };
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const lp of L) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], lp.body.pos[i]); max[i] = Math.max(max[i], lp.body.pos[i]); }
    const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2 + 1.5, (min[2] + max[2]) / 2];
    const spread = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return { target: c, extra: Math.max(0, spread * 0.9 - 1) };
  }

  // Kamerapose für einen Blickpunkt: Richtung aus yaw/pitch, Abstand per Kamera-Kollision.
  // c hält den geglätteten Abstand (smooth) über die Frames.
  pose(c, target, want, dt) {
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const dir = [Math.sin(c.yaw) * cp, sp, Math.cos(c.yaw) * cp];
    // Kamera-Kollision: Strahl vom Kopf zur Wunschposition gegen alle Boxen (inkl. Boden),
    // jeweils um den Kamera-Radius vergrößert, damit auch die Near-Plane nicht in Wände ragt.
    const dist = this.cameraRay(target, dir, want);
    // Reinziehen sofort (sonst sieht man kurz durch den Boden), rauszoomen weich
    if (c.smooth === undefined || dist < c.smooth) c.smooth = dist;
    else c.smooth += (dist - c.smooth) * Math.min(1, dt * 4);
    return {
      pos: [target[0] + dir[0] * c.smooth, target[1] + dir[1] * c.smooth, target[2] + dir[2] * c.smooth],
      look: [target[0], target[1], target[2]],
    };
  }

  // Gemeinsame Kamera (ein Spieler, oder Splitscreen aus): Pose in view.camera.
  // Splitscreen: liefert eine Ansicht je lokalem Spieler; bei drei Spielern zeigt das
  // vierte Viertel das ganze Team.
  updateCamera(dt) {
    if (this.split()) {
      const views = this.locals.map((lp) => {
        const p = lp.body.pos;
        return { ...this.pose(lp.cam, [p[0], p[1] + 1.5, p[2]], lp.cam.dist, dt), focus: p };
      });
      if (views.length === 3) {
        const f = this.cameraFocus();
        this.overview = this.overview || { yaw: 0, pitch: 0.45, dist: 10, smooth: undefined };
        // Übersicht dreht langsam mit Spieler 1 mit
        let d = this.locals[0].cam.yaw - this.overview.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.overview.yaw += d * Math.min(1, dt * 0.8);
        views.push({ ...this.pose(this.overview, f.target, Math.min(24, 10 + f.extra), dt), focus: this.locals[0].body.pos });
      }
      return views;
    }
    const f = this.cameraFocus();
    let target = f.target;
    if (this.locals.length > 1) {
      // Mehrere Spieler: Mitte weich nachführen, damit Sprünge nicht ruckeln
      if (!this.camFocus) this.camFocus = [...target];
      const k = Math.min(1, dt * 8);
      for (let i = 0; i < 3; i++) this.camFocus[i] += (target[i] - this.camFocus[i]) * k;
      target = this.camFocus;
    } else this.camFocus = null;
    this.camExtra = this.camExtra === undefined ? f.extra : this.camExtra + (f.extra - this.camExtra) * Math.min(1, dt * 3);
    const want = Math.min(24, this.camDist + this.camExtra);
    this.shared = this.shared || { smooth: undefined };
    Object.assign(this.shared, { yaw: this.camYaw, pitch: this.camPitch });
    const pose = this.pose(this.shared, target, want, dt);
    const cam = this.view.camera;
    cam.position.set(...pose.pos);
    cam.lookAt(...pose.look);
    return null;
  }

  // Namen der Spieler in ihren Bildschirmteilen und Trennlinien
  updateSplitLabels(views) {
    const el = $('split');
    const key = views ? this.locals.map((l) => l.name + l.color).join('|') + views.length : '';
    if (key === this.splitLabelKey) return;
    this.splitLabelKey = key;
    el.classList.toggle('hidden', !views);
    if (!views) { el.innerHTML = ''; return; }
    el.className = views.length === 2 ? 'split-2' : 'split-4';
    const tags = this.locals.map((l) => `<span class="split-tag" style="--c:${l.color}">${esc(l.name)}</span>`);
    if (views.length === 4 && this.locals.length === 3) tags.push('<span class="split-tag" style="--c:#fff">Team</span>');
    el.innerHTML = tags.map((t) => `<div class="split-cell">${t}</div>`).join('');
  }

  cameraRay(o, dir, len) {
    const R = 0.3;
    const mid = [o[0] + dir[0] * len / 2, o[1] + dir[1] * len / 2, o[2] + dir[2] * len / 2];
    let hit = len;
    for (const b of this.world.near(mid, len / 2 + 1, len / 2 + 1)) {
      if (b.hidden) continue;
      let tmin = 0, tmax = hit, inside = true;
      for (let i = 0; i < 3; i++) {
        const lo = b.min[i] - R, hi = b.max[i] + R;
        if (o[i] < lo || o[i] > hi) inside = false;
        if (Math.abs(dir[i]) < 1e-6) {
          if (o[i] < lo || o[i] > hi) { tmin = Infinity; break; }
          continue;
        }
        let t1 = (lo - o[i]) / dir[i], t2 = (hi - o[i]) / dir[i];
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) break;
      }
      // Kopf steht dicht an einer Wand (innerhalb des Radius): diese Box ignorieren
      if (inside) continue;
      if (tmin <= tmax && tmin < hit) hit = tmin;
    }
    return Math.max(0.4, hit - 0.05);
  }

  updateHud() {
    const y = Math.max(0, this.topY());
    this.best = Math.max(this.best, y);
    const si = sectionAtHeight(this.level, y);
    const s = this.level.sections[si];
    $('hud-section').textContent = `${s.hall} · ${s.name}`;
    $('hud-height').textContent = `${y.toFixed(1)} m`;
    const top = this.level.goal.min[1];
    $('hud-best').textContent = `Rekord ${this.best.toFixed(1)} m · Ziel ${top.toFixed(0)} m`;
    const nCp = this.level.checkpoints.length - 1;
    $('hud-cp').textContent = `Zwischenstopp ${this.cpOf(this.p1)}/${nCp} · Abschnitt ${si + 1}/${this.level.sections.length}`;
    if (this.mode === 'teams') {
      const other = 1 - this.p1.team;
      $('hud-cp').textContent += ` · ${TEAMS[other].short}: ${this.tcp[other]}/${nCp}`;
    }
    $('hud-timer').textContent = `${this.mode === 'teams' ? 'Rennzeit' : 'Schichtzeit'} ${fmt(this.shiftTime())}`;
    if (this.view.scene.fog) this.view.scene.fog.color.setHex(s.fog);

    const single = this.locals.length === 1;
    const rows = this.locals.map((lp) => ({ name: single ? lp.name + ' (du)' : lp.name + ' 🎮', color: lp.color, y: lp.body.pos[1], slot: lp.slot, team: lp.team ?? 0, local: true }));
    for (const r of this.remotes.values()) rows.push({ name: r.name, color: r.color, y: r.rpos[1], slot: r.slot, team: r.team ?? 0 });
    rows.sort((a, b) => a.slot - b.slot);
    const row = (r) => `<div class="pl"><i style="background:${r.color}"></i>${esc(r.name)}<b>${Math.max(0, r.y).toFixed(0)} m</b></div>`;
    if (this.mode === 'teams') {
      // Beide Teams mit ihrem höchsten Kletterer
      $('hud-players').innerHTML = [0, 1].map((t) => {
        const mine = rows.filter((r) => r.team === t);
        const top = mine.length ? Math.max(0, ...mine.map((r) => r.y)) : 0;
        const own = mine.some((r) => r.local);
        return `<div class="team${own ? ' mine' : ''}" style="--team:${TEAMS[t].color}"><div class="team-head">${TEAMS[t].short}<b>${top.toFixed(0)} m</b></div>${mine.map(row).join('')}</div>`;
      }).join('');
    } else {
      $('hud-players').innerHTML = rows.map(row).join('');
    }
    $('brace').classList.toggle('hidden', !this.locals.some((lp) => lp.body.braced));
  }

  toast(text) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }

  shiftTime() {
    if (this.mode === 'teams' && this.race) {
      if (this.race.winner !== null && this.race.winner !== undefined && this.race.time) return this.race.time;
      return Math.max(0, Date.now() + (this.net.online ? this.net.offset : 0) - this.race.startedAt);
    }
    return this.played + Math.max(0, Date.now() + (this.net.online ? this.net.offset : 0) - this.startedAt);
  }

  // 2 gegen 2: das erste Team oben gewinnt – für alle ist das Rennen vorbei
  showRaceFinish(m) {
    if (this.race) { this.race.winner = m.team; this.race.time = m.time; }
    const won = this.locals.some((l) => l.team === m.team);
    const lost = this.locals.some((l) => l.team !== m.team);
    this.finished = true;
    audio.play(won ? 'finish' : 'leave');
    this.setInputEnabled(false);
    if (this.paused) { this.paused = false; menu.close(); }
    document.exitPointerLock?.();
    // Sofa-Duell (beide Teams an diesem Bildschirm): neutral
    $('finish-logo').innerHTML = won && lost ? 'ZIEL<span>EINLAUF</span>' : won ? 'GE<span>WONNEN</span>' : 'ZWEITER<span> PLATZ</span>';
    $('finish-text').textContent = `${TEAMS[m.team].name} (${(m.names || [m.name]).join(' & ')}) ist zuerst oben! Rennzeit: ${fmt(m.time)}`;
    $('board').innerHTML = '';
    $('again').textContent = 'Revanche (beide Teams zurück zum Start)';
    $('finish').classList.remove('hidden');
  }

  showFinish(name, time) {
    $('finish-logo').innerHTML = 'ZUGE<span>STELLT</span>';
    $('again').textContent = 'Neue Schicht (Fortschritt löschen, alle zum Start)';
    this.finished = true;
    audio.play('finish');
    this.setInputEnabled(false);
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
