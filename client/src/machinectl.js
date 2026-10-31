// Steuerung der Rätsel-Maschinen im Spiel: Bedienplätze besetzen (Taste G / Pad X /
// Touch-Knopf), Eingaben an die Maschine geben, Netz-Abgleich über den Raum und Hebel
// (Notleitern). Lokale Mitspieler (Splitscreen) und Online-Spieler werden gleich
// behandelt: jeder Spieler hat eine ID, die Bedienplätze gehören IDs.
import { createMachines, NO_INPUT } from './machines.js';
import { xb } from './glyphs.js';
import { checkHazards, releaseGrips } from './physics.js';
import { audio } from './audio/index.js';

const USE_RANGE = 1.5; // so nah muss man an einem Bedienplatz oder Hebel stehen
const r3 = (v) => Math.round(v * 1000) / 1000;

export class MachineControl {
  constructor(game) {
    this.g = game;
    this.list = createMachines(game.level);
    this.levers = game.level.levers || [];
    game.world.dyn = this.list.flatMap((m) => m.boxes);
    this.world = game.world;
    this.sendAcc = 0;
    this.hintEl = null;
    this.boostSeen = 0;
  }

  // Alle Spieler zusammen, die nicht dieses Gerät sind, zählen mit: allein = 1 Spieler insgesamt
  solo() { return this.g.locals.length + this.g.remotes.size <= 1; }

  localById(id) { return this.g.locals.find((l) => l.id === id); }
  isLocalId(id) { return !!this.localById(id); }

  // Rechnet dieses Gerät die Maschine? (Besetzer des ersten besetzten Platzes ist lokal)
  authority(m) {
    const first = m.occ.find((o) => o);
    return first ? this.isLocalId(first) : false;
  }

  // ───── Benutzen ─────
  // Was kann lp gerade benutzen? → { kind: 'station', m, st } | { kind: 'lever', l } | null
  usable(lp) {
    if (lp.station) return { kind: 'leave', m: lp.station.m, st: lp.station.st };
    const p = lp.body.pos;
    const solo = this.solo();
    let best = null, bd = USE_RANGE;
    for (const m of this.list) {
      m.stations.forEach((st, i) => {
        if (m.occ[i] || !m.stationAllowed(i, solo)) return;
        const q = m.stationPose(i).pos;
        if (Math.abs(q[1] - p[1]) > 1.2) return;
        const d = Math.hypot(q[0] - p[0], q[2] - p[2]);
        if (d < bd) { bd = d; best = { kind: 'station', m, st: i }; }
      });
    }
    for (const l of this.levers) {
      if (this.world.flags.has(l.flag)) continue;
      if (Math.abs(l.pos[1] - p[1]) > 1.2) continue;
      const d = Math.hypot(l.pos[0] - p[0], l.pos[2] - p[2]);
      if (d < bd) { bd = d; best = { kind: 'lever', l }; }
    }
    return best;
  }

  use(lp) {
    if (lp.dead > 0) return;
    const u = this.usable(lp);
    if (!u) return;
    const net = lp.net?.online ? lp.net : null;
    if (u.kind === 'leave') { this.leave(lp); return; }
    if (u.kind === 'lever') {
      this.setFlag(u.l.flag, true);
      net?.send({ t: 'fl', f: u.l.flag });
      this.g.toast(`${this.g.locals.length > 1 ? lp.name + ': ' : ''}${u.l.label} – die Leiter ist unten`);
      audio.play('clunk', { pos: u.l.pos });
      return;
    }
    if (net) net.send({ t: 'mc', m: u.m.id, st: u.st });
    else this.occupy(u.m, u.st, lp.id);
  }

  // Platz verlassen (oder durch Stromschlag/Absturz verlieren)
  leave(lp, quiet = false) {
    const s = lp.station;
    if (!s) return;
    lp.station = null;
    if (s.m.occ[s.st] === lp.id) s.m.occ[s.st] = null;
    lp.body.braced = false;
    const net = lp.net?.online ? lp.net : null;
    net?.send({ t: 'mr', m: s.m.id, st: s.st });
    // Autorität abgegeben: letzten Stand an alle
    if (net) net.send({ t: 'ms', m: s.m.id, s: s.m.pack() });
    if (!quiet) audio.play('uiBack');
  }

  occupy(m, st, id) {
    // Spieler, der woanders saß, verliert den alten Platz
    for (const o of this.list) o.occ.forEach((x, i) => { if (x === id && (o !== m || i !== st)) o.occ[i] = null; });
    m.occ[st] = id;
    const lp = this.localById(id);
    if (lp) {
      if (lp.station && (lp.station.m !== m || lp.station.st !== st)) lp.station = null;
      lp.station = { m, st };
      releaseGrips(lp.body);
      lp.body.gripCool = 0;
      const S = m.stations[st];
      this.g.toast(`${this.g.locals.length > 1 ? lp.name + ': ' : ''}${S.label}`);
      audio.play('ui');
    }
  }

  setFlag(f, on) {
    if (on) this.world.flags.add(f); else this.world.flags.delete(f);
  }

  // ───── Netz ─────
  onMessage(m) {
    switch (m.t) {
      case 'mo': { // Platz besetzt/frei (vom Raum bestätigt)
        const mc = this.list[m.m];
        if (!mc || !(m.st >= 0 && m.st < mc.occ.length)) return true;
        if (m.id) this.occupy(mc, m.st, m.id);
        else {
          const was = mc.occ[m.st];
          mc.occ[m.st] = null;
          const lp = was && this.localById(was);
          if (lp && lp.station?.m === mc && lp.station.st === m.st) lp.station = null;
        }
        return true;
      }
      case 'ms': {
        const mc = this.list[m.m];
        if (mc && !this.authority(mc)) mc.unpack(m.s);
        return true;
      }
      case 'mi': {
        const mc = this.list[m.m];
        if (!mc) return true;
        (mc.remoteIn ||= [])[m.st] = { i: m.i, age: 0 };
        return true;
      }
      case 'fl':
        this.setFlag(m.f, true);
        this.g.toast(`${m.name || 'Jemand'} hat die Notleiter heruntergelassen`);
        return true;
    }
    return false;
  }

  welcome(m) {
    const st = m.mach || {};
    for (const mc of this.list) {
      mc.occ = mc.occ.map(() => null);
      const occ = st.occ?.[mc.id];
      if (Array.isArray(occ)) occ.forEach((id, i) => { if (id && i < mc.occ.length) mc.occ[i] = id; });
      const s = st.st?.[mc.id];
      if (s) { mc.unpack(s); if (mc.target) mc.packKeys().forEach((k, i) => { mc.s[k] = mc.target[i]; }); }
      mc.apply();
    }
    for (const f of m.flags || []) this.setFlag(f, true);
  }

  // Neustart der Schicht: Maschinen in die Ausgangslage, Notleitern wieder hoch
  reset() {
    for (const lp of this.g.locals) lp.station = null;
    for (const mc of this.list) mc.reset();
    this.world.flags.clear();
  }

  // Ein Spieler hat den Raum verlassen: seine Plätze werden frei
  dropId(id) {
    for (const mc of this.list) mc.occ.forEach((o, i) => { if (o === id) mc.occ[i] = null; });
  }

  // ───── Je Frame / je Physikschritt ─────
  // Eingaben je lokalem Spieler für die Maschine merken (Edge-Ereignisse einmal je Frame)
  frameInput(lp, inp) {
    lp.mIn = {
      x: inp.x, z: inp.z, fx: inp.fx || 0, rx: inp.rx || 0,
      up: !!inp.up, down: !!inp.brace, jump: !!inp.jump || !!lp.mIn?.jump, // bis zum nächsten Physikschritt merken
    };
    if (inp.jump && lp.station) lp.pumps = (lp.pumps || 0) + 1; // fürs Netz als Zähler
    if (inp.use) this.use(lp);
  }

  // Mitspieler für Räuberleiter/Hochziehen (alle außer lp)
  mates(lp) {
    const out = [];
    for (const o of this.g.locals) if (o !== lp && !(o.dead > 0)) out.push({ pos: o.body.pos, braced: o.body.braced, grounded: o.body.grounded || !!o.station });
    for (const r of this.g.remotes.values()) if (!(r.hidden > 0)) out.push({ pos: r.rpos, braced: r.braced, grounded: r.grounded });
    return out;
  }

  // Maschinen einen Schritt rechnen (vor den Spielern)
  step(dt, first, feet) {
    const solo = this.solo();
    this.world.solo = solo;
    for (const mc of this.list) {
      const auth = this.authority(mc);
      const ins = mc.occ.map((id, i) => {
        if (!id) return null;
        const lp = this.localById(id);
        if (lp) {
          const inp = lp.mIn || NO_INPUT;
          return first ? inp : { ...inp, jump: false };
        }
        const ri = mc.remoteIn?.[i];
        if (!ri || ri.age > 0.5) return NO_INPUT;
        // Pumpen (Draisine) kommt als Zähler: jede Erhöhung ist ein Druck
        const seen = (mc.remoteSeen ||= []);
        const j = Number(ri.i.j) || 0;
        if (seen[i] === undefined || j < seen[i]) seen[i] = j;
        const jump = j > seen[i];
        if (jump) seen[i]++;
        return { ...NO_INPUT, ...ri.i, jump };
      });
      const riders = mc.hasRider(feet);
      mc.step(dt, ins, { solo, auth, riders });
    }
    for (const lp of this.g.locals) if (lp.mIn && first) lp.mIn.jump = false;
  }

  // Lokalen Spieler am Platz festhalten (statt stepBody). Gibt true zurück, wenn er gesteuert wurde.
  pin(lp, dt) {
    const s = lp.station;
    if (!s) return false;
    const b = lp.body;
    const pose = s.m.stationPose(s.st);
    b.pos = [...pose.pos];
    b.vel = [0, 0, 0];
    b.yaw = pose.yaw;
    b.grounded = true;
    b.ground = s.m.boxes[0];
    b.braced = true;
    b.hang = b.hook = b.ladder = null;
    // Laser, Lichtbogen, Säure treffen auch Bediener: Platz verloren, man fliegt herunter
    checkHazards(b, this.world, dt);
    if (b.zapped) { this.leave(lp, true); b.braced = false; b.grounded = false; }
    return true;
  }

  // Nach dem Frame: Zustand/Eingaben senden, Hinweis anzeigen, Ereignisse abspielen
  after(dt) {
    this.sendAcc += dt;
    const send = this.sendAcc > 0.05;
    if (send) this.sendAcc = 0;
    for (const mc of this.list) {
      if (mc.remoteIn) for (const ri of mc.remoteIn) if (ri) ri.age += dt;
      for (const e of mc.events) audio.play(e === 'pump' ? 'clunk' : e === 'bump' ? 'land' : 'clunk', { pos: mc.boxes[0].max, speed: 6, remote: true });
      mc.events.length = 0;
      if (!send) continue;
      // Autorität: Zustand an alle. Andere Bediener: Eingaben an die Autorität
      mc.occ.forEach((id, i) => {
        const lp = id && this.localById(id);
        if (!lp || !lp.net?.online) return;
        if (this.authority(mc) && mc.occ.find((o) => o) === id) lp.net.send({ t: 'ms', m: mc.id, s: mc.pack() });
        else if (!this.authority(mc)) {
          const i0 = lp.mIn || NO_INPUT;
          lp.net.send({ t: 'mi', m: mc.id, st: i, i: { x: r3(i0.x), z: r3(i0.z), fx: r3(i0.fx), rx: r3(i0.rx), up: i0.up, down: i0.down, j: lp.pumps || 0 } });
        }
      });
    }
    this.updateHint();
  }

  // ───── Hinweis "G: Fahrersitz" ─────
  updateHint() {
    if (!this.hintEl) {
      const el = document.createElement('div');
      el.id = 'use-hint';
      el.className = 'use-hint hidden';
      document.getElementById('hud')?.appendChild(el);
      this.hintEl = el;
    }
    const lines = [];
    const multi = this.g.locals.length > 1;
    for (const lp of this.g.locals) {
      const u = this.usable(lp);
      if (!u) continue;
      const pad = lp.input?.device === 'pad' || lp.pad !== undefined;
      const dev = pad ? xb('X') : lp.input?.device === 'touch' ? '✋' : '<kbd>G</kbd>';
      const who = multi ? `${lp.name}: ` : '';
      if (u.kind === 'leave') lines.push(`${who}${u.m.stations[u.st].label} · ${dev} verlassen`);
      else if (u.kind === 'lever') lines.push(`${who}${dev} · ${u.l.label}`);
      else {
        const S = u.m.stations[u.st];
        lines.push(`${who}${dev} · ${S.label}${S.soloOnly ? ' (nur allein)' : ''}`);
      }
    }
    const txt = lines.join('<br>');
    if (txt !== this.lastHint) {
      this.lastHint = txt;
      this.hintEl.innerHTML = txt;
      this.hintEl.classList.toggle('hidden', !txt);
      document.body.classList.toggle('can-use', !!txt);
    }
  }
}
