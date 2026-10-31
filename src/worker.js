// Hochstapler – Cloudflare Worker + Durable Object für Echtzeit-Räume.
// Der Worker liefert den gebauten Client aus (Assets) und leitet /ws?room=CODE
// an genau ein Durable Object pro Raumcode weiter.
import { DurableObject } from 'cloudflare:workers';
import { hostOf, modeError, assignTeams, teamForNewcomer } from '../client/src/teams.js';

const MAX_PLAYERS = 4;
const COLORS = ['#ff7a1a', '#22c8e5', '#9be22a', '#ff4fa3'];

function roomCode(raw) {
  const code = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return code || 'LOBBY';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('WebSocket erwartet', { status: 426 });
      }
      const code = roomCode(url.searchParams.get('room'));
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    return env.ASSETS.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Letzter bekannter Zustand je Spieler-ID (nur im Speicher, wird bei Bedarf neu gefüllt).
    this.lastState = new Map();
    // Rätsel-Maschinen: Besetzer je Platz ("m:st" → Spieler-ID) und letzter Zustand je Maschine
    this.machOcc = new Map();
    this.machState = new Map();
  }

  machSnapshot() {
    const occ = {}, st = {};
    for (const [key, id] of this.machOcc) {
      const [m, s] = key.split(':').map(Number);
      (occ[m] ||= [])[s] = id;
    }
    for (const [m, s] of this.machState) st[m] = s;
    return { occ, st };
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  players() {
    const list = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.id) list.push({ ws, ...a });
    }
    return list;
  }

  send(ws, msg) {
    try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* Socket bereits zu */ }
  }

  // Spielmodus des Raums: 'rope' (alle an einem Seil) oder 'teams' (2 gegen 2)
  async modeState() {
    const [mode, tcp, race] = await Promise.all([
      this.ctx.storage.get('mode'), this.ctx.storage.get('tcp'), this.ctx.storage.get('race'),
    ]);
    return { mode: mode || 'rope', tcp: tcp || [0, 0], race: race || null };
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, slot: p.slot, color: p.color, team: p.team ?? 0 };
  }

  broadcast(msg, exceptWs) {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const p of this.players()) if (p.ws !== exceptWs) this.send(p.ws, data);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment() || {};

    switch (m.t) {
      case 'hello': {
        if (me.id) return;
        const others = this.players();
        if (others.length >= MAX_PLAYERS) {
          this.send(ws, { t: 'full' });
          ws.close(4000, 'Raum voll');
          return;
        }
        const used = new Set(others.map((p) => p.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        const name = String(m.name || 'Lagerist').replace(/[<>]/g, '').trim().slice(0, 16) || 'Lagerist';
        const id = crypto.randomUUID().slice(0, 8);
        const ms = await this.modeState();
        const team = ms.mode === 'teams' ? teamForNewcomer(others) : 0;
        const info = { id, name, slot, color: COLORS[slot % COLORS.length], team };
        // Gerätekennung: lokale Mitspieler am selben Bildschirm kommen ins selbe Team
        const dev = String(m.dev || '').slice(0, 16);
        ws.serializeAttachment({ ...info, dev });

        // Schichtzeit läuft nur, solange jemand im Raum ist, und summiert sich über Sitzungen
        let startedAt = await this.ctx.storage.get('startedAt');
        if (!others.length || !startedAt) {
          startedAt = Date.now();
          await this.ctx.storage.put('startedAt', startedAt);
        }
        const played = (await this.ctx.storage.get('played')) || 0;
        const cp = (await this.ctx.storage.get('cp')) || 0;
        const board = (await this.ctx.storage.get('board')) || [];
        const flags = (await this.ctx.storage.get('flags')) || [];

        this.send(ws, {
          t: 'welcome',
          you: info,
          serverTime: Date.now(),
          startedAt,
          played,
          cp,
          board,
          mode: ms.mode,
          tcp: ms.tcp,
          race: ms.race,
          mach: this.machSnapshot(),
          flags,
          players: others.map((p) => ({ ...this.publicPlayer(p), s: this.lastState.get(p.id) || null })),
        });
        this.broadcast({ t: 'join', player: info }, ws);
        return;
      }
      case 's': {
        if (!me.id) return;
        const s = { p: m.p, v: m.v, y: m.y, g: m.g, b: m.b, a: typeof m.a === 'number' ? m.a & 15 : undefined };
        this.lastState.set(me.id, s);
        this.broadcast({ t: 's', id: me.id, ...s }, ws);
        return;
      }
      // ───── Rätsel-Maschinen ─────
      case 'mc': { // Platz besetzen: nur wenn frei (oder der Besetzer weg ist)
        if (!me.id) return;
        const mi = Math.floor(Number(m.m)), si = Math.floor(Number(m.st));
        if (!(mi >= 0 && mi < 64 && si >= 0 && si < 4)) return;
        const key = mi + ':' + si;
        const cur = this.machOcc.get(key);
        const alive = cur && this.players().some((p) => p.id === cur);
        if (alive && cur !== me.id) return;
        // wer woanders saß, verliert den alten Platz
        for (const [k2, id] of this.machOcc) if (id === me.id && k2 !== key) {
          this.machOcc.delete(k2);
          const [m2, s2] = k2.split(':').map(Number);
          this.broadcast({ t: 'mo', m: m2, st: s2, id: null });
        }
        this.machOcc.set(key, me.id);
        this.broadcast({ t: 'mo', m: mi, st: si, id: me.id });
        return;
      }
      case 'mr': {
        if (!me.id) return;
        const key = Math.floor(Number(m.m)) + ':' + Math.floor(Number(m.st));
        if (this.machOcc.get(key) !== me.id) return;
        this.machOcc.delete(key);
        const [mi, si] = key.split(':').map(Number);
        this.broadcast({ t: 'mo', m: mi, st: si, id: null });
        return;
      }
      case 'ms': { // Zustand von der rechnenden Seite
        if (!me.id || !Array.isArray(m.s) || m.s.length > 8 || !m.s.every((v) => Number.isFinite(v) && Math.abs(v) < 1e5)) return;
        const mi = Math.floor(Number(m.m));
        if (!(mi >= 0 && mi < 64)) return;
        this.machState.set(mi, m.s);
        this.broadcast({ t: 'ms', m: mi, s: m.s }, ws);
        return;
      }
      case 'mi': { // Eingabe eines Bedieners an die rechnende Seite
        if (!me.id || !m.i || typeof m.i !== 'object') return;
        const mi = Math.floor(Number(m.m)), si = Math.floor(Number(m.st));
        if (this.machOcc.get(mi + ':' + si) !== me.id) return;
        const n = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
        const i = { x: n(m.i.x), z: n(m.i.z), fx: n(m.i.fx), rx: n(m.i.rx), up: !!m.i.up, down: !!m.i.down, j: Math.max(0, Math.floor(Number(m.i.j) || 0)) };
        this.broadcast({ t: 'mi', m: mi, st: si, i }, ws);
        return;
      }
      case 'fl': { // Hebel: Notleiter ablassen (bleibt bis zum Neustart)
        if (!me.id) return;
        const f = String(m.f || '').slice(0, 40);
        if (!f) return;
        const flags = (await this.ctx.storage.get('flags')) || [];
        if (!flags.includes(f) && flags.length < 64) { flags.push(f); await this.ctx.storage.put('flags', flags); }
        this.broadcast({ t: 'fl', f, name: me.name }, ws);
        return;
      }
      case 'ping':
        this.send(ws, { t: 'pong', c: m.c, s: Date.now() });
        return;
      case 'splat': {
        // Aufklatschen beim Absturz: nur weiterreichen
        if (!me.id || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
        this.broadcast({ t: 'splat', id: me.id, p: m.p }, ws);
        return;
      }
      case 'emote':
        if (!me.id) return;
        this.broadcast({ t: 'emote', id: me.id, e: String(m.e || '').slice(0, 24) }, ws);
        return;
      case 'cp': {
        // Zwischenstopp: Fortschritt des ganzen Teams, wird dauerhaft gespeichert
        if (!me.id) return;
        const i = Math.floor(Number(m.i));
        if (!Number.isFinite(i) || i < 0 || i > 10000) return;
        const ms = await this.modeState();
        if (ms.mode === 'teams') {
          // 2 gegen 2: jedes Team hat seinen eigenen Fortschritt
          const team = me.team ?? 0;
          if (i <= ms.tcp[team]) return;
          ms.tcp[team] = i;
          await this.ctx.storage.put('tcp', ms.tcp);
          this.broadcast({ t: 'cp', i, name: me.name, team }, ws);
          return;
        }
        const cur = (await this.ctx.storage.get('cp')) || 0;
        if (i <= cur) return;
        await this.ctx.storage.put('cp', i);
        this.broadcast({ t: 'cp', i, name: me.name }, ws);
        return;
      }
      case 'warp':
        if (!me.id) return;
        this.broadcast({ t: 'warp', name: me.name, team: me.team ?? 0 }, ws);
        return;
      case 'goal': {
        if (!me.id) return;
        const ms = await this.modeState();
        if (ms.mode === 'teams') {
          // Rennen: das erste Team oben gewinnt, danach zählt nichts mehr
          if (!ms.race || ms.race.winner !== null) return;
          const team = me.team ?? 0;
          const time = Date.now() - ms.race.startedAt;
          ms.race.winner = team;
          ms.race.time = time;
          await this.ctx.storage.put('race', ms.race);
          const names = this.players().filter((p) => (p.team ?? 0) === team).map((p) => p.name);
          this.broadcast({ t: 'finish', id: me.id, name: me.name, time, team, names });
          return;
        }
        const startedAt = (await this.ctx.storage.get('startedAt')) || Date.now();
        const played = (await this.ctx.storage.get('played')) || 0;
        const time = played + Date.now() - startedAt;
        const team = this.players().map((p) => p.name).join(', ');
        let board = (await this.ctx.storage.get('board')) || [];
        board.push({ team, time, at: Date.now() });
        board.sort((a, b) => a.time - b.time);
        board = board.slice(0, 5);
        await this.ctx.storage.put('board', board);
        this.broadcast({ t: 'finish', id: me.id, name: me.name, time, board });
        return;
      }
      case 'restart': {
        if (!me.id) return;
        const ms = await this.modeState();
        if (ms.mode === 'teams') {
          // Revanche: beide Teams wieder unten, neue Rennuhr
          const race = { startedAt: Date.now(), winner: null };
          await this.ctx.storage.put({ tcp: [0, 0], race, flags: [] });
          this.machOcc.clear(); this.machState.clear();
          this.broadcast({ t: 'restart', by: me.name, startedAt: race.startedAt, race });
          return;
        }
        const startedAt = Date.now();
        await this.ctx.storage.put({ startedAt, played: 0, cp: 0, flags: [] });
        this.machOcc.clear(); this.machState.clear();
        this.broadcast({ t: 'restart', by: me.name, startedAt });
        return;
      }
      case 'mode': {
        // Nur der Gastgeber stellt den Spielmodus ein (oder lost die Teams neu aus)
        if (!me.id) return;
        const all = this.players();
        const host = hostOf(all);
        if (!host || host.id !== me.id) { this.send(ws, { t: 'modeError', reason: 'Nur der Gastgeber kann den Spielmodus ändern' }); return; }
        const mode = m.mode;
        const err = modeError(mode, all.length);
        if (err) { this.send(ws, { t: 'modeError', reason: err }); return; }
        let race = null;
        let teams = {};
        if (mode === 'teams') {
          teams = assignTeams(all, m.shuffle ? Math.random : null);
          race = { startedAt: Date.now(), winner: null };
          await this.ctx.storage.put({ mode, tcp: [0, 0], race });
        } else {
          for (const p of all) teams[p.id] = 0;
          await this.ctx.storage.put('mode', mode);
          await this.ctx.storage.delete(['tcp', 'race']);
        }
        for (const p of all) {
          const { ws: sock, ...a } = p;
          sock.serializeAttachment({ ...a, team: teams[p.id] });
        }
        const cp = (await this.ctx.storage.get('cp')) || 0;
        this.broadcast({ t: 'mode', mode, teams, race, cp, by: me.name, shuffle: !!m.shuffle });
        return;
      }
    }
  }

  async webSocketClose(ws) {
    await this.leave(ws);
  }

  async webSocketError(ws) {
    await this.leave(ws);
  }

  async leave(ws) {
    const a = ws.deserializeAttachment();
    if (!a || !a.id) return;
    ws.serializeAttachment({ id: null });
    this.lastState.delete(a.id);
    for (const [key, id] of this.machOcc) if (id === a.id) this.machOcc.delete(key);
    this.broadcast({ t: 'leave', id: a.id, name: a.name }, ws);
    // Letzter Spieler raus: gespielte Zeit sichern, Uhr anhalten
    if (!this.players().length) {
      const startedAt = await this.ctx.storage.get('startedAt');
      if (startedAt) {
        const played = ((await this.ctx.storage.get('played')) || 0) + (Date.now() - startedAt);
        await this.ctx.storage.put('played', played);
        await this.ctx.storage.delete('startedAt');
      }
    }
  }
}
