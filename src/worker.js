// Hochstapler – Cloudflare Worker + Durable Object für Echtzeit-Räume.
// Der Worker liefert den gebauten Client aus (Assets) und leitet /ws?room=CODE
// an genau ein Durable Object pro Raumcode weiter.
import { DurableObject } from 'cloudflare:workers';

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
        const info = { id, name, slot, color: COLORS[slot % COLORS.length] };
        ws.serializeAttachment(info);

        // Schichtzeit läuft nur, solange jemand im Raum ist, und summiert sich über Sitzungen
        let startedAt = await this.ctx.storage.get('startedAt');
        if (!others.length || !startedAt) {
          startedAt = Date.now();
          await this.ctx.storage.put('startedAt', startedAt);
        }
        const played = (await this.ctx.storage.get('played')) || 0;
        const cp = (await this.ctx.storage.get('cp')) || 0;
        const board = (await this.ctx.storage.get('board')) || [];

        this.send(ws, {
          t: 'welcome',
          you: info,
          serverTime: Date.now(),
          startedAt,
          played,
          cp,
          board,
          players: others.map((p) => ({
            id: p.id, name: p.name, slot: p.slot, color: p.color,
            s: this.lastState.get(p.id) || null,
          })),
        });
        this.broadcast({ t: 'join', player: info }, ws);
        return;
      }
      case 's': {
        if (!me.id) return;
        const s = { p: m.p, v: m.v, y: m.y, g: m.g, b: m.b };
        this.lastState.set(me.id, s);
        this.broadcast({ t: 's', id: me.id, ...s }, ws);
        return;
      }
      case 'ping':
        this.send(ws, { t: 'pong', c: m.c, s: Date.now() });
        return;
      case 'emote':
        if (!me.id) return;
        this.broadcast({ t: 'emote', id: me.id, e: String(m.e || '').slice(0, 24) }, ws);
        return;
      case 'cp': {
        // Zwischenstopp: Fortschritt des ganzen Teams, wird dauerhaft gespeichert
        if (!me.id) return;
        const i = Math.floor(Number(m.i));
        if (!Number.isFinite(i) || i < 0 || i > 10000) return;
        const cur = (await this.ctx.storage.get('cp')) || 0;
        if (i <= cur) return;
        await this.ctx.storage.put('cp', i);
        this.broadcast({ t: 'cp', i, name: me.name }, ws);
        return;
      }
      case 'warp':
        if (!me.id) return;
        this.broadcast({ t: 'warp', name: me.name }, ws);
        return;
      case 'goal': {
        if (!me.id) return;
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
        const startedAt = Date.now();
        await this.ctx.storage.put({ startedAt, played: 0, cp: 0 });
        this.broadcast({ t: 'restart', by: me.name, startedAt });
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
