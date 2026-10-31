// Audio-Modul für Hochstapler: Musik, Soundeffekte, Ambiente und Maschinen.
// Alles prozedural mit der Web Audio API, ohne externe Dateien.
//
// Öffentliche API (für Spiel und Optionsmenü):
//   audio.unlock()                      – AudioContext anlegen/fortsetzen (aus einer Nutzergeste aufrufen)
//   audio.setVolume(bus, 0..1)          – bus: 'master' | 'music' | 'sfx' | 'ambience'
//   audio.getVolume(bus)
//   audio.setMuted(bool) / toggleMute() / muted
//   audio.settings                      – Kopie aller Einstellungen
//   audio.onChange(fn)                  – fn(settings) bei jeder Änderung; gibt Abmelde-Funktion zurück
//   audio.play(name, opts)              – Einzelklang, z. B. 'ui', 'uiBack', 'emote', 'join', 'finish' …
//   audio.update(state)                 – einmal pro Frame aus der Spielschleife
// Einstellungen werden in localStorage ('hochstapler.audio') gespeichert.

import { makeNoise, makeIR, clamp, gain } from './synth.js';
import { Sfx } from './sfx.js';
import { Music } from './music.js';
import { Ambience } from './ambience.js';
import { Machines } from './machines.js';

const KEY = 'hochstapler.audio';
export const BUSES = ['master', 'music', 'sfx', 'ambience'];
const DEFAULTS = { master: 0.8, music: 0.55, sfx: 0.8, ambience: 0.7, muted: false };
// Wie viel Hall jeder Abschnitt bekommt (große Hallen viel, Dach kaum)
const REVERB = [0.32, 0.45, 0.38, 0.36, 0.16, 0.08];

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...DEFAULTS };
    for (const k of BUSES) if (typeof s[k] === 'number') out[k] = clamp(s[k]);
    if (typeof s.muted === 'boolean') out.muted = s.muted;
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

class AudioEngine {
  constructor() {
    this._s = loadSettings();
    this.ctx = null;
    this._subs = new Set();
    this.listener = { pos: [0, 0, 0], yaw: 0 };
    this.section = 0;
    this._lastStep = 0;
    this._lastLand = 0;
    this._wasBraced = false;
    this._lastTension = 0;
    this._lastTwang = 0;
    this._stepAcc = 0;
    this._pendSec = null;
    this._pendT = 0;
    this._maxSection = 0;
    if (typeof document !== 'undefined') {
      // Browser erlauben Ton erst nach einer Geste: bei jeder Eingabe ggf. fortsetzen
      const resume = () => { if (this.ctx && this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); };
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, resume, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend().catch(() => {});
        else resume();
      });
    }
  }

  // ───── Einstellungen ─────
  get settings() { return { ...this._s }; }
  get muted() { return this._s.muted; }
  get ready() { return !!this.ctx; }
  getVolume(bus) { return this._s[bus]; }

  setVolume(bus, v) {
    if (!BUSES.includes(bus)) throw new Error('Unbekannter Audio-Bus: ' + bus);
    this._s[bus] = clamp(Number(v) || 0);
    this._changed();
  }

  setMuted(m) {
    this._s.muted = !!m;
    this._changed();
  }

  toggleMute() {
    this.setMuted(!this._s.muted);
    return this._s.muted;
  }

  onChange(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  resetSettings() {
    this._s = { ...DEFAULTS };
    this._changed();
  }

  _changed() {
    try { localStorage.setItem(KEY, JSON.stringify(this._s)); } catch { /* egal */ }
    this._applyVolumes();
    for (const fn of this._subs) { try { fn(this.settings); } catch (e) { console.error(e); } }
  }

  _applyVolumes(time = 0.08) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const curve = (v) => v * v; // Schieberegler wirken so gleichmäßiger
    this.master.gain.setTargetAtTime(this._s.muted ? 0 : curve(this._s.master), t, time);
    for (const b of ['music', 'sfx', 'ambience']) this.bus[b].gain.setTargetAtTime(curve(this._s[b]) * 1.4, t, time);
  }

  // ───── Aufbau ─────
  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return false;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
      this._build();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
    return true;
  }

  _build() {
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(c.destination);
    this.outNode = comp; // z. B. für Aufnahmen/Analyse
    this.master = gain(c, 0);
    this.master.connect(comp);
    this.bus = { music: gain(c), sfx: gain(c), ambience: gain(c) };
    for (const b of Object.values(this.bus)) b.connect(this.master);

    // Gemeinsamer Hall für Effekte und Ambiente
    this.reverb = c.createConvolver();
    this.reverb.buffer = makeIR(c, 2.8, 2.6);
    this.verbSend = gain(c, REVERB[0]);
    this.verbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.bus.sfx.connect(this.verbSend);
    this.bus.ambience.connect(this.verbSend);

    this.noise = { white: makeNoise(c, 'white'), pink: makeNoise(c, 'pink', 3), brown: makeNoise(c, 'brown', 4) };
    this._applyVolumes(0.01);

    this.sfx = new Sfx(this);
    this.music = new Music(this);
    this.ambience = new Ambience(this);
    this.machines = null; // braucht die Spielwelt, kommt mit dem ersten update()
    this.music.start(this.section);
    this.ambience.setSection(this.section);
  }

  // ───── Raumklang ─────
  // Lautstärke und Stereo-Position einer Quelle relativ zur Kamera
  spatial(pos, ref = 5, max = 45) {
    const L = this.listener;
    const dx = pos[0] - L.pos[0], dy = pos[1] - L.pos[1], dz = pos[2] - L.pos[2];
    const d = Math.hypot(dx, dy, dz);
    const fade = clamp(1 - d / max) ** 2;
    const g = fade * ref / (ref + d);
    // Rechts-Vektor der Kamera (Blickrichtung ist (-sin yaw, -cos yaw))
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = clamp((dx * rx + dz * rz) / Math.max(d, 1.5), -1, 1) * 0.85;
    return { gain: g, pan, dist: d };
  }

  // Ausgang für einen Klang: optional räumlich, gibt den Eingangsknoten zurück
  out(busName = 'sfx', pos = null, vol = 1) {
    const c = this.ctx;
    const g = gain(c, vol);
    if (pos) {
      const s = this.spatial(pos);
      g.gain.value = vol * s.gain;
      const p = c.createStereoPanner();
      p.pan.value = s.pan;
      g.connect(p);
      p.connect(this.bus[busName]);
      g._extra = p;
    } else g.connect(this.bus[busName]);
    return g;
  }

  // ───── Spielereignisse ─────
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.sfx) return;
    const fn = this.sfx[name];
    if (typeof fn !== 'function') return;
    try { fn.call(this.sfx, opts); } catch (e) { console.warn('Audio', name, e); }
  }

  // Abschnittswechsel mit Verzögerung, damit Musik/Ambiente an Grenzen nicht flattern
  _sectionHint(i, dt) {
    if (i === this.section) { this._pendSec = null; return; }
    if (this._pendSec !== i) { this._pendSec = i; this._pendT = 0; }
    this._pendT += dt || 0;
    if (this._pendT > 1.2 || !this.ctx) this.setSection(i);
  }

  setSection(i) {
    this._pendSec = null;
    if (i === this.section) return;
    const up = i > (this._maxSection ?? 0);
    this._maxSection = Math.max(this._maxSection ?? 0, i);
    this.section = i;
    if (!this.ctx) return;
    this.music.setSection(i);
    this.ambience.setSection(i);
    this.verbSend.gain.setTargetAtTime(REVERB[i] ?? 0.3, this.ctx.currentTime, 1.5);
    if (up) this.play('section', { section: i });
  }

  // state: { dt, time, world, body, tension, camPos, camYaw, section, finished }
  update(s) {
    if (s.camPos) this.listener.pos = s.camPos;
    if (s.camYaw !== undefined) this.listener.yaw = s.camYaw;
    if (s.section !== undefined) this._sectionHint(s.section, s.dt);
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const b = s.body;

    if (s.world && !this.machines) this.machines = new Machines(this, s.world);
    if (this.machines) this.machines.update(s.time, s.dt);

    if (b) {
      // Springen / Landen (von der Spielschleife über alle Teilschritte gesammelt)
      if (s.jumped) this.play('jump');
      if (s.landed && s.landSpeed > 3 && now - this._lastLand > 0.12) {
        this._lastLand = now;
        this.play('land', { speed: s.landSpeed, mat: b.ground && b.ground.mat });
        this._stepAcc = 0;
      }
      // Schritte
      const hs = Math.hypot(b.vel[0], b.vel[2]);
      if (b.grounded && hs > 1.2 && !b.braced) {
        this._stepAcc += s.dt * (0.9 + hs / 6 * 1.6);
        if (this._stepAcc > 0.62) { this._stepAcc = 0; this.play('step', { mat: b.ground && b.ground.mat, speed: hs }); }
      } else this._stepAcc = 0.45;
      // Festhalten
      if (b.braced && !this._wasBraced) this.play('grip');
      this._wasBraced = b.braced;
      this.sfx.setFall(b.grounded ? 0 : Math.hypot(b.vel[0], b.vel[1], b.vel[2]), b.vel[1]);
    }

    // Seil: Knarzen bei Spannung, "Twang" wenn es plötzlich straff wird
    const ten = s.tension || 0;
    this.sfx.setTension(ten);
    if (ten > 1.0 && this._lastTension <= 0.985 && now - this._lastTwang > 0.5) {
      this._lastTwang = now;
      this.play('ropeTwang');
    }
    this._lastTension = ten;
  }

  // Mitspieler-Ereignisse (räumlich)
  remoteLand(pos, speed) { if (speed > 4) this.play('land', { speed, pos, remote: true }); }
  remoteJump(pos) { this.play('jump', { pos, remote: true }); }

  // Musik kurz absenken, z. B. für die Zielfanfare
  duckMusic(seconds = 3, level = 0.25) { if (this.music) this.music.duck(seconds, level); }
}

export const audio = new AudioEngine();
if (typeof window !== 'undefined') window.__audio = audio;
export default audio;
