// Einheitliche Eingabe: Tastatur + Maus, Gamepad (Gamepad-API) und Touch.
// Liefert pro Frame Bewegungsachsen, Kamera-Deltas und Aktionen.
import { settings } from './settings.js';

const DEAD = 0.18;
const deadzone = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));

export const EMOTES = ['Warte!', 'Los, springen!', 'Festhalten!'];

export class Input {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.h = handlers; // { pause, emote }
    this.enabled = true;
    this.keys = new Set();
    this.mouseBrace = false;
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.jumpQueued = false;
    this.device = document.body.dataset.device || 'kbm'; // kbm | pad | touch
    this.pad = { prev: [], index: -1 };
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
      this.pad.index = e.gamepad.index;
      this.h.toast?.(`Controller verbunden: ${shortName(e.gamepad.id)}`);
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (this.pad.index === e.gamepad.index) this.pad.index = -1;
      this.h.toast?.('Controller getrennt');
    });
  }

  gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.pad.index >= 0 && pads[this.pad.index]) return pads[this.pad.index];
    for (const p of pads) if (p && p.connected) { this.pad.index = p.index; return p; }
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
    if (gp) {
      const b = (i) => !!gp.buttons[i]?.pressed;
      const v = (i) => gp.buttons[i]?.value || 0;
      const pressed = (i) => b(i) && !this.pad.prev[i];
      const lx = deadzone(gp.axes[0] || 0), ly = deadzone(gp.axes[1] || 0);
      const rxs = deadzone(gp.axes[2] || 0), rys = deadzone(gp.axes[3] || 0);
      const any = lx || ly || rxs || rys || gp.buttons.some((x) => x.pressed);
      if (any) this.setDevice('pad');
      if (pressed(9)) this.h.pause?.();
      if (this.enabled) {
        rx += lx; fx -= ly;
        const ps = settings.get().padSensitivity;
        // quadratische Kurve: feine Kontrolle in der Mitte
        this.lookX -= Math.sign(rxs) * rxs * rxs * 3.2 * ps * dt;
        this.lookY += Math.sign(rys) * rys * rys * 2.2 * ps * dt * (settings.get().invertY ? -1 : 1);
        if (pressed(0)) this.jumpQueued = true;
        if (b(1) || b(5) || b(7) || v(6) > 0.3 || v(7) > 0.3) brace = true;
        if (pressed(2)) this.h.emote?.(0);
        if (pressed(3)) this.h.emote?.(1);
        if (pressed(4)) this.h.emote?.(2);
        if (b(12)) this.zoom -= 8 * dt;
        if (b(13)) this.zoom += 8 * dt;
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
