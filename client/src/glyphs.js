// Xbox-Tastensymbole für Hinweise. Sobald ein Controller benutzt wird (body[data-device=pad]),
// zeigen Hinweise diese Glyphen statt Tastaturtasten.
//
// Im HTML: <i data-xb="A"></i> wird von glyphify() gefüllt.
// Doppelte Hinweise: hk('Shift', 'RT') → je nach Gerät Tastatur-Taste oder Glyphe.

const svg = (body, w = 16) => `<svg viewBox="0 0 16 16" width="${w}" height="${w}" aria-hidden="true">${body}</svg>`;
const ICONS = {
  menu: svg('<path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  view: svg('<rect x="2.5" y="2.5" width="7.5" height="7.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="6" width="7.5" height="7.5" rx="1.2" fill="currentColor"/>'),
  dpad: (dir) => {
    const arm = { up: 'M6 1.5h4v4.5H6z', down: 'M6 10h4v4.5H6z', left: 'M1.5 6H6v4H1.5z', right: 'M10 6h4.5v4H10z' };
    const on = { up: ['up'], down: ['down'], left: ['left'], right: ['right'], ud: ['up', 'down'], lr: ['left', 'right'] }[dir] || [];
    return svg('<path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z" fill="currentColor" opacity="0.4"/>'
      + on.map((k) => `<path d="${arm[k]}" fill="currentColor"/>`).join(''));
  },
};

// name → [Klasse, Inhalt, Beschriftung für Screenreader]
const GLYPHS = {
  A: ['face a', 'A', 'A'],
  B: ['face b', 'B', 'B'],
  X: ['face x', 'X', 'X'],
  Y: ['face y', 'Y', 'Y'],
  LB: ['bumper', 'LB', 'LB'],
  RB: ['bumper', 'RB', 'RB'],
  LT: ['trigger', 'LT', 'LT'],
  RT: ['trigger', 'RT', 'RT'],
  LS: ['stick', 'L', 'linker Stick'],
  RS: ['stick', 'R', 'rechter Stick'],
  Menu: ['round', ICONS.menu, 'Menü-Taste'],
  Start: ['round', ICONS.menu, 'Menü-Taste'],
  View: ['round', ICONS.view, 'Ansicht-Taste'],
  Select: ['round', ICONS.view, 'Ansicht-Taste'],
  Dpad: ['dpad', ICONS.dpad(''), 'Steuerkreuz'],
  DUp: ['dpad', ICONS.dpad('up'), 'Steuerkreuz hoch'],
  DDown: ['dpad', ICONS.dpad('down'), 'Steuerkreuz runter'],
  DLeft: ['dpad', ICONS.dpad('left'), 'Steuerkreuz links'],
  DRight: ['dpad', ICONS.dpad('right'), 'Steuerkreuz rechts'],
  DUpDown: ['dpad', ICONS.dpad('ud'), 'Steuerkreuz hoch/runter'],
  DLeftRight: ['dpad', ICONS.dpad('lr'), 'Steuerkreuz links/rechts'],
};

export function xb(name) {
  const g = GLYPHS[name];
  if (!g) return `<kbd>${name}</kbd>`;
  const cls = g[0].split(' ').map((c) => 'xb-' + c).join(' ');
  return `<span class="xb ${cls}" role="img" aria-label="${g[2]}">${g[1]}</span>`;
}

// Tastatur- und Controller-Hinweis nebeneinander, CSS blendet je nach Gerät eins aus
export function hk(kbm, pad) {
  const k = kbm.split('/').map((s) => `<kbd>${s.trim()}</kbd>`).join(' / ');
  const p = pad.split(' ').map(xb).join(' ');
  return `<span class="hk"><span class="hk-k">${k}</span><span class="hk-p">${p}</span></span>`;
}

export function glyphify(root = document) {
  for (const el of root.querySelectorAll('[data-xb]')) {
    if (el.dataset.xbDone) continue;
    el.dataset.xbDone = '1';
    el.outerHTML = el.dataset.xb.split(' ').map(xb).join(' ');
  }
}

export const padActiveUi = () => document.body.dataset.device === 'pad';

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Spielhinweise mit Tastennamen (z. B. "Leertaste/Shift Gabel") für Controller übersetzen.
// Liefert HTML. Ohne Controller bleibt der Text, nur escaped.
const PAD_WORDS = [
  [/W\/Stick vor/g, '{LS} vor'],
  [/Stick\/WASD/g, '{LS}'],
  [/W\/Leertaste/g, '{A}'],
  [/S\/Shift/g, '{RT}'],
  [/Leertaste\/Shift/g, '{A} / {RT}'],
  [/W\/S/g, '{LS} ↕'],
  [/A\/D/g, '{LS} ↔'],
  [/WASD/g, '{LS}'],
  [/Leertaste/g, '{A}'],
  [/\bShift\b/g, '{RT}'],
  [/\bG\b/g, '{X}'],
  [/\(M\)/g, ''],
];
export function keysHtml(text, pad = padActiveUi()) {
  let s = esc(text);
  if (!pad) return s;
  for (const [re, rep] of PAD_WORDS) s = s.replace(re, rep);
  return s.replace(/\{(\w+)\}/g, (m, n) => xb(n)).replace(/\s+\)/g, ')').replace(/\(\s*\)/g, '');
}
