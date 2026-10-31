// Spieler-Einstellungen (lokal im Browser gespeichert).
const KEY = 'hochstapler.settings';

export const QUALITY = {
  low: { label: 'Niedrig', pixelRatio: 0.85, shadows: false, shadowMap: 1024, post: false, bloom: false, ao: false, antialias: false },
  medium: { label: 'Mittel', pixelRatio: 1.25, shadows: true, shadowMap: 1024, post: true, bloom: true, ao: false, antialias: true },
  high: { label: 'Hoch', pixelRatio: 2, shadows: true, shadowMap: 2048, post: true, bloom: true, ao: true, antialias: true },
};

const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const DEFAULTS = {
  quality: isTouch() ? 'low' : 'medium',
  fov: 65,
  sensitivity: 1, // Maus / Touch-Kamera
  padSensitivity: 1, // Controller-Kamera
  invertY: false,
  touch: 'auto', // auto | on | off
  hints: true, // Tasten-/Button-Hinweise im HUD
  shake: true, // Kamera-Effekte
  volume: 0.6,
};

let current = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = {
  get: () => current,
  set(patch) {
    current = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* egal */ }
    for (const l of listeners) l(current, patch);
  },
  reset() { this.set({ ...DEFAULTS }); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  touchEnabled() {
    const t = current.touch;
    return t === 'on' || (t === 'auto' && isTouch());
  },
};
