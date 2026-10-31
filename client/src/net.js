// WebSocket-Verbindung zum Raum (Durable Object). Fällt bei Fehlern auf Solo zurück.
export class Net {
  constructor(room, name, handlers) {
    this.room = room;
    this.name = name;
    this.h = handlers;
    this.ws = null;
    this.online = false;
    this.offset = 0; // Serverzeit - lokale Zeit (ms)
    this.bestRtt = Infinity;
    this.connect();
  }

  connect() {
    if (!this.room) { setTimeout(() => this.h.offline?.(false), 0); return; }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(this.room)}`;
    let ws;
    try { ws = new WebSocket(url); } catch { this.h.offline?.(); return; }
    this.ws = ws;
    const timeout = setTimeout(() => { if (!this.online) { ws.close(); } }, 5000);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', name: this.name }));
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        clearTimeout(timeout);
        this.online = true;
        this.offset = m.serverTime - Date.now();
        this.pingTimer = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 2000);
        this.send({ t: 'ping', c: Date.now() });
      }
      if (m.t === 'pong') {
        const now = Date.now();
        const rtt = now - m.c;
        this.rtt = rtt;
        if (rtt <= this.bestRtt * 1.2) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = m.s + rtt / 2 - now;
        }
        return;
      }
      this.h.message?.(m);
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      clearInterval(this.pingTimer);
      const was = this.online;
      this.online = false;
      this.h.offline?.(was);
    };
    ws.onerror = () => {};
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  // Gemeinsame Zeit in Sekunden für bewegliche Plattformen
  time() {
    return (Date.now() + this.offset) / 1000;
  }
}
