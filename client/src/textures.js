// Prozedurale Texturen (Canvas) – keine externen Assets nötig.
import * as THREE from 'three';

let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function noise(ctx, w, h, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
  }
}

function tex(c, repeat = true) {
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
  return tex(c);
}

function grate() {
  const [c, x] = canvas(128);
  x.fillStyle = '#2b2f33'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#8a9196';
  for (let i = 0; i < 128; i += 16) { x.fillRect(i, 0, 4, 128); x.fillRect(0, i, 128, 3); }
  x.fillStyle = '#e8b511'; x.fillRect(0, 0, 128, 3);
  noise(x, 128, 128, 600, 0.1);
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

export function makeTextures() {
  return {
    concrete: concrete(), ground: ground(), goods: goods(), crate: crate(), carton: carton(),
    beam: steel('#e26a1c', true), upright: steel('#2a5ea8', true), grate: grate(),
    container: container(), belt: belt(), hazard: hazard(), trailer: trailer(), goal: goal(),
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
  return t;
}
