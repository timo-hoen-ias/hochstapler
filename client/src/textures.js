// Prozedurale Texturen (Canvas) – keine externen Assets nötig.
import * as THREE from 'three';

let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Texturen werden in "logischen" Pixeln gezeichnet und mit SCALE höher aufgelöst
// gerastert (schärfere Kanten, Schrift und Kratzer aus der Nähe). Niedrige
// Grafikqualität bleibt bei 1, um Grafikspeicher auf Handys zu sparen.
let SCALE = 2;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * SCALE); c.height = Math.round(h * SCALE);
  const x = c.getContext('2d');
  x.scale(SCALE, SCALE);
  return [c, x];
}

function noise(ctx, w, h, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
  }
}

// Feines Korn in voller Auflösung (bei SCALE 2 sonst nur grobe Flecken)
function grain(c, alpha = 0.05) {
  const x = c.getContext('2d');
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  const n = (c.width * c.height) / 28;
  for (let i = 0; i < n; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    x.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    x.fillRect(rnd() * c.width, rnd() * c.height, 1, 1);
  }
  x.restore();
}

// Gebrauchsspuren: dunklere Kanten (wie Verdeckung an Stößen), Schmutzschlieren
// von oben, helle Kratzer. k = Stärke.
function wear(x, w, h, k = 1) {
  const e = Math.min(w, h) * 0.08;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, e, 0, 0, w, e], [0, h, 0, h - e, 0, h - e, w, e],
    [0, 0, e, 0, 0, 0, e, h], [w, 0, w - e, 0, w - e, 0, e, h],
  ]) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(20,16,12,${0.22 * k})`); g.addColorStop(1, 'rgba(20,16,12,0)');
    x.fillStyle = g; x.fillRect(rx, ry, rw, rh);
  }
  for (let i = 0; i < 10 * k; i++) {
    const sx = rnd() * w, sw = 1 + rnd() * 3, sh = h * (0.15 + rnd() * 0.5);
    const g = x.createLinearGradient(0, 0, 0, sh);
    g.addColorStop(0, `rgba(40,32,24,${0.18 * k})`); g.addColorStop(1, 'rgba(40,32,24,0)');
    x.fillStyle = g; x.fillRect(sx, 0, sw, sh);
  }
  x.lineWidth = 0.7;
  for (let i = 0; i < 14 * k; i++) {
    const px = rnd() * w, py = rnd() * h, a = rnd() * Math.PI, l = 4 + rnd() * 14;
    x.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.12})`;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
}

function tex(c, repeat = true) {
  if (SCALE > 1) grain(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function concrete() {
  const [c, x] = canvas(256);
  x.fillStyle = '#9a978f'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 5000, 0.12);
  x.strokeStyle = 'rgba(40,40,40,0.25)'; x.lineWidth = 2;
  x.strokeRect(0, 0, 256, 256);
  wear(x, 256, 256, 1);
  return tex(c);
}

function ground() {
  const [c, x] = canvas(512);
  x.fillStyle = '#6f6d69'; x.fillRect(0, 0, 512, 512);
  noise(x, 512, 512, 14000, 0.1);
  x.strokeStyle = 'rgba(30,30,30,0.35)'; x.lineWidth = 3;
  x.strokeRect(0, 0, 512, 512);
  x.strokeStyle = '#e2b62a'; x.lineWidth = 10;
  x.beginPath(); x.moveTo(0, 470); x.lineTo(512, 470); x.stroke();
  x.setLineDash([30, 20]); x.lineWidth = 6;
  x.beginPath(); x.moveTo(256, 0); x.lineTo(256, 440); x.stroke();
  return tex(c);
}

function goods() {
  // Palette mit eingeschweißten Kartons – wiederholt sich alle 1,2 m
  const [c, x] = canvas(256);
  x.fillStyle = '#3b2c1c'; x.fillRect(0, 0, 256, 256);
  // Kartons
  const rows = 3, cols = 3;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const shade = 150 + rnd() * 40;
    x.fillStyle = `rgb(${shade + 40},${shade + 5},${shade - 45})`;
    const bx = k * 85 + 2, by = r * 68 + 2;
    x.fillRect(bx, by, 81, 64);
    x.fillStyle = 'rgba(210,190,140,0.9)';
    x.fillRect(bx + 36, by, 9, 64);
    if (rnd() > 0.5) {
      x.fillStyle = 'rgba(30,30,30,0.6)';
      x.font = 'bold 14px sans-serif';
      x.fillText('↑↑', bx + 10, by + 22);
    }
  }
  // Holzpalette unten
  x.fillStyle = '#c69a5b'; x.fillRect(0, 206, 256, 50);
  x.fillStyle = '#5a3b1a';
  for (let i = 0; i < 3; i++) x.fillRect(16 + i * 100, 222, 36, 24);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 206, 256, 3);
  // Stretchfolie
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 206);
  noise(x, 256, 256, 1500, 0.08);
  return tex(c);
}

function crate() {
  const [c, x] = canvas(256);
  x.fillStyle = '#b98a4e'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = `rgba(80,50,20,${0.1 + rnd() * 0.15})`;
    x.fillRect(0, i * 32, 256, 2);
  }
  x.fillStyle = '#8a6030';
  x.fillRect(0, 0, 256, 26); x.fillRect(0, 230, 256, 26);
  x.fillRect(0, 0, 26, 256); x.fillRect(230, 0, 26, 256);
  x.save(); x.translate(128, 128); x.rotate(Math.PI / 4);
  x.fillRect(-170, -13, 340, 26); x.restore();
  x.fillStyle = 'rgba(30,20,10,0.75)'; x.font = 'bold 22px monospace';
  x.fillText('LGR-' + Math.floor(rnd() * 900 + 100), 40, 60);
  noise(x, 256, 256, 2500, 0.1);
  wear(x, 256, 256, 0.8);
  return tex(c);
}

function carton() {
  const [c, x] = canvas(256);
  x.fillStyle = '#c99c62'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#dcc08c'; x.fillRect(112, 0, 32, 256);
  x.strokeStyle = 'rgba(60,40,20,0.9)'; x.lineWidth = 6;
  // Symbole: Pfeile nach oben + Glas
  x.beginPath();
  for (const ox of [30, 62]) { x.moveTo(ox, 210); x.lineTo(ox, 170); x.moveTo(ox - 12, 182); x.lineTo(ox, 168); x.lineTo(ox + 12, 182); }
  x.stroke();
  x.fillStyle = 'rgba(160,30,20,0.85)'; x.font = 'bold 20px sans-serif';
  x.fillText('VORSICHT', 160, 60);
  x.fillStyle = 'rgba(40,30,20,0.8)'; x.fillRect(166, 160, 70, 40);
  x.fillStyle = '#fff'; x.fillRect(170, 164, 62, 32);
  x.fillStyle = '#000';
  for (let i = 0; i < 18; i++) x.fillRect(173 + i * 3.3, 166, rnd() > 0.5 ? 2 : 1, 22);
  noise(x, 256, 256, 2000, 0.08);
  return tex(c);
}

function steel(base, holes) {
  const [c, x] = canvas(128);
  x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  if (holes) {
    x.fillStyle = 'rgba(20,20,30,0.7)';
    for (let i = 0; i < 4; i++) { x.fillRect(20, i * 32 + 10, 10, 14); x.fillRect(98, i * 32 + 10, 10, 14); }
  }
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, 0, 128, 6);
  noise(x, 128, 128, 800, 0.08);
  wear(x, 128, 128, 0.6);
  return tex(c);
}

function grate() {
  const [c, x] = canvas(128);
  x.fillStyle = '#2b2f33'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#8a9196';
  for (let i = 0; i < 128; i += 16) { x.fillRect(i, 0, 4, 128); x.fillRect(0, i, 128, 3); }
  x.fillStyle = '#e8b511'; x.fillRect(0, 0, 128, 3);
  noise(x, 128, 128, 600, 0.1);
  wear(x, 128, 128, 0.5);
  return tex(c);
}

function container() {
  const [c, x] = canvas(256);
  x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 16) {
    const g = x.createLinearGradient(i, 0, i + 16, 0);
    g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.3, '#f2f2f2'); g.addColorStop(0.7, '#cfcfcf'); g.addColorStop(1, '#8a8a8a');
    x.fillStyle = g; x.fillRect(i, 0, 16, 256);
  }
  x.fillStyle = 'rgba(90,60,40,0.25)';
  for (let i = 0; i < 30; i++) x.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 2 + rnd() * 20);
  x.fillStyle = '#777'; x.fillRect(0, 0, 256, 10); x.fillRect(0, 246, 256, 10);
  wear(x, 256, 256, 1);
  return tex(c);
}

function belt() {
  const [c, x] = canvas(128);
  x.fillStyle = '#1d1f22'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#34383d';
  for (let i = 0; i < 128; i += 16) x.fillRect(0, i, 128, 6);
  x.fillStyle = '#e8b511'; x.fillRect(0, 0, 6, 128); x.fillRect(122, 0, 6, 128);
  noise(x, 128, 128, 400, 0.1);
  return tex(c);
}

function hazard() {
  const [c, x] = canvas(128);
  x.fillStyle = '#f2c014'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#151515';
  for (let i = -128; i < 256; i += 40) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 20, 0); x.lineTo(i + 20 + 128, 128); x.lineTo(i + 128, 128); x.fill();
  }
  noise(x, 128, 128, 500, 0.12);
  return tex(c);
}

function trailer() {
  const [c, x] = canvas(512, 256);
  x.fillStyle = '#eceae4'; x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 512; i += 32) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(i, 0, 2, 256); }
  x.fillStyle = '#d2461f'; x.fillRect(0, 170, 512, 26);
  x.fillStyle = '#20324d'; x.font = 'bold 54px sans-serif';
  x.fillText('HOCHSTAPLER', 40, 110);
  x.font = '22px sans-serif'; x.fillText('Spedition · Lager · Logistik', 44, 145);
  noise(x, 512, 256, 3000, 0.05);
  return tex(c);
}

function ice() {
  const [c, x] = canvas(256);
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#dff3ff'); g.addColorStop(1, '#9ccbe8');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    x.beginPath(); let px = rnd() * 256, py = rnd() * 256; x.moveTo(px, py);
    for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 80; py += (rnd() - 0.5) * 80; x.lineTo(px, py); }
    x.stroke();
  }
  noise(x, 256, 256, 2500, 0.08);
  return tex(c);
}

function tires() {
  const [c, x] = canvas(256);
  x.fillStyle = '#1b1b1d'; x.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) {
    x.fillStyle = '#2a2a2e'; x.fillRect(0, r * 64 + 4, 256, 56);
    x.fillStyle = '#121214';
    for (let i = 0; i < 256; i += 14) { x.beginPath(); x.moveTo(i, r * 64 + 8); x.lineTo(i + 8, r * 64 + 32); x.lineTo(i, r * 64 + 56); x.lineTo(i + 4, r * 64 + 32); x.fill(); }
  }
  x.fillStyle = '#f2c014'; x.fillRect(0, 0, 256, 4);
  wear(x, 256, 256, 0.3);
  return tex(c);
}

function bin() {
  const [c, x] = canvas(128);
  x.fillStyle = '#2f6fc4'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#255aa3';
  for (let i = 0; i < 128; i += 32) x.fillRect(i, 0, 3, 128);
  x.fillStyle = '#fff'; x.fillRect(42, 50, 44, 22);
  x.fillStyle = '#000'; for (let i = 0; i < 12; i++) x.fillRect(45 + i * 3.4, 53, rnd() > 0.5 ? 2 : 1, 14);
  noise(x, 128, 128, 500, 0.08);
  wear(x, 128, 128, 0.6);
  return tex(c);
}

function drum() {
  const [c, x] = canvas(128);
  x.fillStyle = '#c23b22'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#8e2a18'; x.fillRect(0, 30, 128, 6); x.fillRect(0, 92, 128, 6);
  x.fillStyle = '#f2c014';
  x.save(); x.translate(64, 64); x.rotate(Math.PI / 4); x.fillRect(-16, -16, 32, 32); x.restore();
  x.fillStyle = '#111'; x.font = 'bold 18px sans-serif'; x.textAlign = 'center'; x.fillText('!', 64, 71);
  noise(x, 128, 128, 600, 0.1);
  wear(x, 128, 128, 0.7);
  return tex(c);
}

function timber() {
  const [c, x] = canvas(256);
  x.fillStyle = '#b0844f'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    x.fillStyle = `rgb(${160 + rnd() * 30},${115 + rnd() * 20},${70 + rnd() * 15})`; x.fillRect(0, i + 1, 256, 30);
    x.fillStyle = 'rgba(70,40,15,0.3)';
    for (let k = 0; k < 6; k++) x.fillRect(rnd() * 256, i + 4 + rnd() * 22, 30 + rnd() * 50, 1);
  }
  wear(x, 256, 256, 0.5);
  return tex(c);
}

function wagon() {
  const [c, x] = canvas(256);
  x.fillStyle = '#7b3524'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) { x.fillStyle = '#5e2719'; x.fillRect(i, 0, 5, 256); }
  x.fillStyle = 'rgba(200,120,60,0.25)';
  for (let i = 0; i < 40; i++) x.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 10, 2 + rnd() * 10);
  x.fillStyle = '#eee'; x.font = 'bold 22px monospace'; x.fillText('DB 31 80 ' + Math.floor(rnd() * 9000 + 1000), 20, 230);
  wear(x, 256, 256, 1);
  return tex(c);
}

function fan() {
  const [c, x] = canvas(256);
  x.fillStyle = '#3a4046'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#9aa3a8'; x.lineWidth = 6;
  x.beginPath(); x.arc(128, 128, 110, 0, Math.PI * 2); x.stroke();
  for (let r = 30; r < 110; r += 16) { x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.lineWidth = 2; x.stroke(); }
  x.fillStyle = '#f2c014'; x.fillRect(0, 0, 256, 8); x.fillRect(0, 248, 256, 8);
  wear(x, 256, 256, 0.6);
  return tex(c);
}

function blink() {
  const [c, x] = canvas(128);
  x.fillStyle = '#e46b1d'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#b8510f'; x.fillRect(0, 60, 128, 8);
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 4; x.strokeRect(4, 4, 120, 120);
  noise(x, 128, 128, 500, 0.08);
  wear(x, 128, 128, 0.6);
  return tex(c);
}

function checkpoint() {
  const [c, x] = canvas(256);
  x.fillStyle = '#2d6b45'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#f4f1e6'; x.lineWidth = 10; x.strokeRect(12, 12, 232, 232);
  x.fillStyle = '#f4f1e6'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
  x.fillText('ZWISCHEN-', 128, 118); x.fillText('STOPP', 128, 156);
  noise(x, 256, 256, 1500, 0.08);
  return tex(c, false);
}

function roof() {
  const [c, x] = canvas(512);
  x.fillStyle = '#3d4f6b'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#f4f1e6'; x.lineWidth = 14;
  x.strokeRect(40, 40, 432, 432);
  x.fillStyle = '#f4f1e6'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center';
  x.fillText('AKT 1', 256, 240); x.font = '40px sans-serif'; x.fillText('geschafft', 256, 300);
  noise(x, 512, 512, 4000, 0.08);
  return tex(c, false);
}

function goal() {
  const [c, x] = canvas(512);
  x.fillStyle = '#2f7d4a'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#f4f1e6'; x.lineWidth = 18;
  x.beginPath(); x.arc(256, 256, 200, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#f4f1e6'; x.font = 'bold 120px sans-serif'; x.textAlign = 'center';
  x.fillText('ZIEL', 256, 300);
  noise(x, 512, 512, 4000, 0.08);
  return tex(c, false);
}

function vest(color) {
  const [c, x] = canvas(64);
  x.fillStyle = color; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#e8e8e0'; x.fillRect(0, 22, 64, 7); x.fillRect(0, 40, 64, 7);
  x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(30, 0, 4, 64);
  return tex(c, false);
}

export function makeTextures(opts = {}) {
  SCALE = opts.scale ?? 2;
  return {
    concrete: concrete(), ground: ground(), goods: goods(), crate: crate(), carton: carton(),
    beam: steel('#e26a1c', true), upright: steel('#2a5ea8', true), grate: grate(),
    container: container(), belt: belt(), hazard: hazard(), trailer: trailer(), goal: goal(),
    ice: ice(), tires: tires(), bin: bin(), drum: drum(), timber: timber(), wagon: wagon(),
    fan: fan(), blink: blink(), checkpoint: checkpoint(), roof: roof(),
    vest,
  };
}

export function textCanvas(lines, opts = {}) {
  const w = opts.w || 512, h = opts.h || 160;
  const [c, x] = canvas(w, h);
  x.fillStyle = opts.bg || '#20324d'; x.fillRect(0, 0, w, h);
  if (opts.stripe !== false) { x.fillStyle = '#f2c014'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10); }
  x.fillStyle = opts.fg || '#fff'; x.textAlign = 'center';
  let size = opts.size || 44;
  x.font = `bold ${size}px sans-serif`;
  while (x.measureText(lines[0]).width > w - 40 && size > 12) { size -= 2; x.font = `bold ${size}px sans-serif`; }
  x.fillText(lines[0], w / 2, lines[1] ? h * 0.48 : h * 0.62);
  if (lines[1]) { x.font = `${Math.round((opts.size || 44) * 0.55)}px sans-serif`; x.fillStyle = '#f2c014'; x.fillText(lines[1], w / 2, h * 0.8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
