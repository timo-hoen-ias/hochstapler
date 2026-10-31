// Einheitliche Eingabe: Tastatur + Maus, Gamepad (Gamepad-API) und Touch.
// Liefert pro Frame Bewegungsachsen, Kamera-Deltas und Aktionen.
import { settings } from './settings.js';

const DEAD = 0.18;
const deadzone = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));

export const EMOTES = ['Warte!', 'Los, springen!', 'Festhalten!'];

// Controller, die schon einem Spieler gehören (Index der Gamepad-API).
// Lokaler Koop: jeder Controller steuert genau einen Spieler.
export const padClaims = new Set();

export function listPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return [...pads].filter((p) => p && p.connected);
}

// Hat jemand an diesem Controller gerade etwas gedrückt oder bewegt?
export function padActive(gp) {
  return gp.buttons.some((b) => b.pressed) || gp.axes.some((a) => Math.abs(a) > 0.5);
}

// Gemeinsame Tastenbelegung für alle Controller. prev: Tastenzustand vom letzten Frame.
// Liefert Bewegung, Kamera-Deltas und Aktionen dieses Frames.
export function readPad(gp, prev, dt, enabled) {
  const b = (i) => !!gp.buttons[i]?.pressed;
  const v = (i) => gp.buttons[i]?.value || 0;
  const pressed = (i) => b(i) && !prev[i];
  const out = { fx: 0, rx: 0, lookX: 0, lookY: 0, zoom: 0, jump: false, brace: false, emote: -1, pause: pressed(9), reset: pressed(8), any: false };
  const lx = deadzone(gp.axes[0] || 0), ly = deadzone(gp.axes[1] || 0);
  const rxs = deadzone(gp.axes[2] || 0), rys = deadzone(gp.axes[3] || 0);
  out.any = !!(lx || ly || rxs || rys || gp.buttons.some((x) => x.pressed));
  if (enabled) {
    out.rx = lx; out.fx = -ly;
    const ps = settings.get().padSensitivity;
    // quadratische Kurve: feine Kontrolle in der Mitte
    out.lookX = -Math.sign(rxs) * rxs * rxs * 3.2 * ps * dt;
    out.lookY = Math.sign(rys) * rys * rys * 2.2 * ps * dt * (settings.get().invertY ? -1 : 1);
    out.jump = pressed(0);
    out.brace = b(1) || b(5) || b(7) || v(6) > 0.3 || v(7) > 0.3;
    if (pressed(2)) out.emote = 0;
    if (pressed(3)) out.emote = 1;
    if (pressed(4)) out.emote = 2;
    if (b(12)) out.zoom -= 8 * dt;
    if (b(13)) out.zoom += 8 * dt;
  }
  return out;
}

// Ein weiterer lokaler Spieler, der nur mit seinem eigenen Controller spielt.
export class PadInput {
  constructor(index, handlers = {}) {
    this.index = index;
    this.h = handlers; // { pause, emote }
    this.enabled = true;
    this.prev = [];
    this.jumpQueued = false;
    padClaims.add(index);
  }

  pad() {
    const gp = navigator.getGamepads ? navigator.getGamepads()[this.index] : null;
    return gp && gp.connected ? gp : null;
  }

  setEnabled(on) { this.enabled = on; if (!on) this.jumpQueued = false; }

  poll(dt) {
    const out = { forward: 0, right: 0, brace: false, jump: false, lookX: 0, lookY: 0, zoom: 0 };
    const gp = this.pad();
    if (!gp) return out;
    const r = readPad(gp, this.prev, dt, this.enabled);
    this.prev = gp.buttons.map((x) => x.pressed);
    if (r.pause) this.h.pause?.();
    if (r.reset && this.enabled) this.h.reset?.();
    if (r.emote >= 0) this.h.emote?.(r.emote);
    const len = Math.hypot(r.fx, r.rx);
    out.forward = len > 1 ? r.fx / len : r.fx;
    out.right = len > 1 ? r.rx / len : r.rx;
    out.brace = r.brace; out.jump = r.jump;
    out.lookX = r.lookX; out.lookY = r.lookY; out.zoom = r.zoom;
    return out;
  }

  dispose() { padClaims.delete(this.index); }
}

export class Input {
  // opts.pad: 'auto' (erster benutzter, freier Controller), eine feste Index-Nummer oder 'none'
  constructor(canvas, handlers = {}, opts = {}) {
    this.canvas = canvas;
    this.h = handlers; // { pause, emote }
    this.enabled = true;
    this.keys = new Set();
    this.mouseBrace = false;
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.jumpQueued = false;
    this.device = document.body.dataset.device || 'kbm'; // kbm | pad | touch
    this.padMode = opts.pad ?? 'auto';
    this.pad = { prev: [], index: typeof this.padMode === 'number' ? this.padMode : -1 };
    if (this.pad.index >= 0) padClaims.add(this.pad.index);
    // Knöpfe, die beim Spielstart noch gehalten werden (Start/Ⓐ aus dem Menü), zählen nicht als neuer Druck
    this.pad.startHeld = new Map([...(navigator.getGamepads ? navigator.getGamepads() : [])]
      .filter((p) => p && p.connected).map((p) => [p.index, p.buttons.map((x) => x.pressed)]));
    setTimeout(() => this.pad.startHeld.clear(), 1500);
    this.touch = { move: null, look: null, jump: false, brace: false, braceToggle: false };
    this.bindKeyboardMouse();
    this.bindGamepad();
    this.buildTouch();
    settings.onChange(() => this.updateTouchVisibility());
  }

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    document.body.dataset.device = d;
    this.h.device?.(d);
  }

  // ───────── Tastatur & Maus ─────────
  bindKeyboardMouse() {
    document.body.dataset.device = this.device;
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      this.setDevice('kbm');
      if (!this.enabled) return;
      if (e.code === 'Space') { if (!this.keys.has('Space')) this.jumpQueued = true; e.preventDefault(); }
      if ((e.code === 'Backspace' || e.code === 'KeyT') && !e.repeat && this.enabled && e.target.tagName !== 'INPUT') { e.preventDefault(); this.h.reset?.(); }
      this.keys.add(e.code);
      const em = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
      if (em !== undefined && !e.repeat) this.h.emote?.(em);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseBrace = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousedown', (e) => { if (e.button === 2 && this.enabled) this.mouseBrace = true; });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.mouseBrace = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas || !this.enabled) return;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.setDevice('kbm');
      const s = 0.0025 * settings.get().sensitivity;
      this.lookX -= e.movementX * s;
      this.lookY += e.movementY * s;
    });
    addEventListener('wheel', (e) => { if (this.enabled) this.zoom += Math.sign(e.deltaY) * 0.8; }, { passive: true });
  }

  // ───────── Gamepad ─────────
  bindGamepad() {
    addEventListener('gamepadconnected', (e) => {
      this.h.toast?.(`Controller verbunden: ${shortName(e.gamepad.id)}`);
    });
    addEventListener('gamepaddisconnected', (e) => {
      // Ein fest zugeteilter Controller bekommt beim Wiederverbinden meist denselben Index
      if (this.pad.index === e.gamepad.index && this.padMode === 'auto') { padClaims.delete(this.pad.index); this.pad.index = -1; }
      this.h.toast?.('Controller getrennt');
    });
  }

  gamepad() {
    if (this.padMode === 'none') return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.pad.index >= 0) {
      const gp = pads[this.pad.index];
      return gp && gp.connected ? gp : null;
    }
    // Automatisch: der erste freie Controller, an dem jemand etwas drückt, gehört Spieler 1
    for (const p of pads) {
      if (p && p.connected && !padClaims.has(p.index) && padActive(p)) {
        this.pad.index = p.index;
        padClaims.add(p.index);
        const held = this.pad.startHeld.get(p.index) || [];
        this.pad.prev = p.buttons.map((x, i) => x.pressed && !!held[i]);
        return p;
      }
    }
    return null;
  }

  // ───────── Touch ─────────
  buildTouch() {
    const root = document.getElementById('touch');
    this.touchRoot = root;
    if (!root) return;
    const stick = root.querySelector('.stick');
    const knob = root.querySelector('.knob');
    const moveZone = root.querySelector('.zone-move');
    const lookZone = root.querySelector('.zone-look');
    const R = 56;

    const t = this.touch;
    moveZone.addEventListener('pointerdown', (e) => {
      if (t.move) return;
      this.setDevice('touch');
      moveZone.setPointerCapture(e.pointerId);
      t.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      stick.style.left = `${e.clientX}px`; stick.style.top = `${e.clientY}px`;
      stick.classList.add('active');
      knob.style.transform = 'translate(-50%, -50%)';
    });
    moveZone.addEventListener('pointermove', (e) => {
      if (!t.move || t.move.id !== e.pointerId) return;
      let dx = e.clientX - t.move.ox, dy = e.clientY - t.move.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        // Joystick folgt dem Finger, wenn er weit rausgezogen wird
        t.move.ox += dx * (1 - R / l); t.move.oy += dy * (1 - R / l);
        dx *= R / l; dy *= R / l;
        stick.style.left = `${t.move.ox}px`; stick.style.top = `${t.move.oy}px`;
      }
      t.move.x = dx / R; t.move.y = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const endMove = (e) => {
      if (!t.move || t.move.id !== e.pointerId) return;
      t.move = null;
      stick.classList.remove('active');
    };
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);

    lookZone.addEventListener('pointerdown', (e) => {
      if (t.look) return;
      this.setDevice('touch');
      lookZone.setPointerCapture(e.pointerId);
      t.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (!t.look || t.look.id !== e.pointerId || !this.enabled) return;
      const s = 0.006 * settings.get().sensitivity;
      this.lookX -= (e.clientX - t.look.x) * s;
      this.lookY += (e.clientY - t.look.y) * s;
      t.look.x = e.clientX; t.look.y = e.clientY;
    });
    const endLook = (e) => { if (t.look && t.look.id === e.pointerId) t.look = null; };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.setDevice('touch'); el.classList.add('down'); on(); });
      const up = () => { el.classList.remove('down'); off?.(); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    hold(root.querySelector('[data-act=jump]'), () => { if (this.enabled) this.jumpQueued = true; });
    hold(root.querySelector('[data-act=brace]'), () => { t.brace = true; }, () => { t.brace = false; });
    const emoteBtns = root.querySelectorAll('[data-emote]');
    emoteBtns.forEach((b) => hold(b, () => this.h.emote?.(Number(b.dataset.emote))));
    hold(root.querySelector('[data-act=pause]'), () => this.h.pause?.());
    const rb = root.querySelector('[data-act=reset]');
    if (rb) hold(rb, () => { if (this.enabled) this.h.reset?.(); });
    hold(root.querySelector('[data-act=zoomin]'), () => { this.zoom -= 1.6; });
    hold(root.querySelector('[data-act=zoomout]'), () => { this.zoom += 1.6; });

    // Pinch-Zoom ist bewusst aus; Browser-Gesten blockieren
    root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this.updateTouchVisibility();
  }

  updateTouchVisibility() {
    if (!this.touchRoot) return;
    const on = settings.touchEnabled();
    this.touchRoot.classList.toggle('hidden', !on || !this.enabled);
    document.body.classList.toggle('touch-ui', on);
    if (on && this.device === 'kbm' && matchMedia('(pointer: coarse)').matches) this.setDevice('touch');
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.keys.clear(); this.mouseBrace = false; this.jumpQueued = false;
      this.touch.move = null; this.touch.look = null; this.touch.brace = false;
      this.touchRoot?.querySelector('.stick')?.classList.remove('active');
    }
    this.updateTouchVisibility();
  }

  // ───────── Abfrage pro Frame ─────────
  poll(dt) {
    let fx = 0, rx = 0, brace = false;
    const k = this.keys;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) fx += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) rx += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) rx -= 1;
      if (k.has('KeyQ')) this.lookX += 2.2 * dt;
      if (k.has('KeyE')) this.lookX -= 2.2 * dt;
      if (k.has('KeyR')) this.lookY -= 1.4 * dt;
      if (k.has('KeyF')) this.lookY += 1.4 * dt;
      brace = k.has('ShiftLeft') || k.has('ShiftRight') || this.mouseBrace;
    }

    // Touch
    const t = this.touch;
    if (t.move && this.enabled) { rx += t.move.x; fx -= t.move.y; }
    if (t.brace && this.enabled) brace = true;

    // Gamepad
    const gp = this.gamepad();
    // Fest zugeteilter Controller (lokaler Koop): beim Start gehaltene Knöpfe nicht als neuen Druck werten
    if (gp && !this.pad.prev.length) {
      const held = this.pad.startHeld.get(gp.index) || [];
      this.pad.prev = gp.buttons.map((x, i) => x.pressed && !!held[i]);
    }
    if (gp) {
      const r = readPad(gp, this.pad.prev, dt, this.enabled);
      if (r.any) this.setDevice('pad');
      if (r.pause) this.h.pause?.();
      if (r.reset && this.enabled) this.h.reset?.();
      if (this.enabled) {
        rx += r.rx; fx += r.fx;
        this.lookX += r.lookX; this.lookY += r.lookY; this.zoom += r.zoom;
        if (r.jump) this.jumpQueued = true;
        if (r.brace) brace = true;
        if (r.emote >= 0) this.h.emote?.(r.emote);
      }
      this.pad.prev = gp.buttons.map((x) => x.pressed);
    }

    const len = Math.hypot(fx, rx);
    if (len > 1) { fx /= len; rx /= len; }
    const out = {
      forward: fx, right: rx, brace,
      jump: this.jumpQueued && this.enabled,
      lookX: this.lookX, lookY: this.lookY, zoom: this.zoom,
    };
    this.jumpQueued = false;
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    return out;
  }
}

function shortName(id) {
  return id.replace(/\(.*?\)/g, '').trim().slice(0, 32) || 'Gamepad';
}
