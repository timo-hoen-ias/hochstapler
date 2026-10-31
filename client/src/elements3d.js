// Grafik für Feuer und Wasser: Wasserflächen (auch steigend), Notduschen, Flammen
// (Brandherde, Ölbrand, Gasbrenner, Flammenrohre, Sprinkler), Feuerlöscher-Schränke,
// getragene Löscher, Schaum, Dampf, Rauch, Funken, Spritzer und Tropfen.
import * as THREE from 'three';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, ...o });

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Materialien für Becken, Schleusen und Kammern (werden in render.js eingehängt)
export function elementMaterials() {
  const tile = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#d9eef2'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 225 + ((i * 7 + j * 13) % 5) * 5;
      x.fillStyle = `rgb(${v - 30},${v},${v + 5})`;
      x.fillRect(i * 32 + 2, j * 32 + 2, 28, 28);
    }
    x.fillStyle = '#2b7c96'; x.fillRect(0, 60, w, 8); // blaues Zierband
  });
  const lock = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#5b6168'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    // gelb-schwarze Warnstreifen unten (Tauchkante)
    for (let i = -2; i < 10; i++) {
      x.fillStyle = '#f2c014'; x.beginPath();
      x.moveTo(i * 16, h); x.lineTo(i * 16 + 8, h); x.lineTo(i * 16 + 24, h - 22); x.lineTo(i * 16 + 16, h - 22); x.fill();
    }
  });
  const tank = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#9b2a22'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 4; i++) x.fillRect(0, i * 32, w, 2);
    x.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 4; i++) x.fillRect(i * 32 + 4, 0, 2, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = '#5a1712'; x.beginPath(); x.arc(i * 32 + 6, j * 32 + 6, 2, 0, 7); x.fill(); }
  });
  return {
    pooltile: std({ map: tile, roughness: 0.25, metalness: 0.05 }),
    lock: std({ map: lock, roughness: 0.55, metalness: 0.4 }),
    tank: std({ map: tank, roughness: 0.45, metalness: 0.5 }),
  };
}

// ───────── Wasser ─────────
function waterNormals() {
  // Normalen aus überlagerten Wellen (kachelbar)
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  const h = (u, v) => {
    const a = 2 * Math.PI;
    return Math.sin(a * (u * 2 + v)) * 0.5 + Math.sin(a * (u * 3 - v * 2)) * 0.35 + Math.sin(a * (v * 4 + u)) * 0.25 + Math.sin(a * (u * 5 + v * 5)) * 0.15;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, e = 1 / N;
    const dx = (h(u + e, v) - h(u - e, v)) * 6, dy = (h(u, v + e) - h(u, v - e)) * 6;
    const l = Math.hypot(dx, dy, 1);
    const k = (j * N + i) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ───────── Flammen ─────────
const FLAME_VS = `
  attribute float aSeed;
  attribute float aH;
  uniform float uTime, uLevel;
  varying vec2 vUv; varying float vSeed;
  void main() {
    vUv = uv; vSeed = aSeed;
    vec3 p = position;
    float fl = 0.88 + 0.12 * sin(uTime * 9.0 + aSeed * 17.0) + 0.06 * sin(uTime * 23.0 + aSeed * 5.0);
    p.y = aH + (p.y - aH) * uLevel * fl;
    // oben etwas im Wind wedeln
    float k = clamp((p.y - aH) / 2.5, 0.0, 1.0);
    p.x += sin(uTime * 3.1 + aSeed * 11.0) * 0.12 * k * k;
    p.z += cos(uTime * 2.7 + aSeed * 7.0) * 0.12 * k * k;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FLAME_FS = `
  uniform float uTime, uLevel, uBlue;
  varying vec2 vUv; varying float vSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float y = vUv.y;
    float n = noise(vec2(vUv.x * 3.0 + vSeed * 9.0, y * 3.5 - uTime * 2.6)) * 0.65 + noise(vec2(vUv.x * 7.0 - vSeed, y * 8.0 - uTime * 5.0)) * 0.35;
    float w = 0.48 * pow(1.0 - y, 0.7) * (0.55 + 0.75 * n);
    float d = abs(vUv.x - 0.5);
    float a = smoothstep(w, w * 0.35, d) * smoothstep(1.0, 0.55, y + (n - 0.5) * 0.5) * smoothstep(0.0, 0.06, y);
    vec3 hot = mix(vec3(1.0, 0.93, 0.68), vec3(1.0, 0.5, 0.1), smoothstep(0.0, 0.45, y + d * 1.4));
    hot = mix(hot, vec3(0.75, 0.12, 0.03), smoothstep(0.45, 0.95, y));
    vec3 blue = mix(vec3(0.6, 0.85, 1.0), vec3(0.15, 0.3, 1.0), y * 1.5);
    vec3 col = mix(hot, blue, uBlue);
    a *= min(1.0, uLevel * 3.0);
    gl_FragColor = vec4(col * a * 1.35, a);
  }`;

function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uBlue: { value: 0 } },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Flammenbüschel als je drei gekreuzte Flächen. spots: [{ x, y, z, w, h }]
function flameGeometry(spots) {
  const pos = [], uv = [], seed = [], hh = [], idx = [];
  let v = 0;
  for (const [i, s] of spots.entries()) {
    const sd = ((i * 0.6180339) % 1);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + sd;
      const dx = Math.cos(a) * s.w / 2, dz = Math.sin(a) * s.w / 2;
      pos.push(s.x - dx, s.y, s.z - dz, s.x + dx, s.y, s.z + dz, s.x + dx, s.y + s.h, s.z + dz, s.x - dx, s.y + s.h, s.z - dz);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      for (let q = 0; q < 4; q++) { seed.push(sd + k * 0.31); hh.push(s.y); }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ───────── Partikel (Schaum, Dampf, Rauch, Spritzer, Funken) ─────────
const PART_VS = `
  attribute float aSize; attribute vec4 aCol;
  varying vec4 vCol;
  uniform float uScale;
  void main() {
    vCol = aCol;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const PART_FS = `
  varying vec4 vCol;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.15, r) * vCol.a;
    gl_FragColor = vec4(vCol.rgb, a);
  }`;

class Particles {
  constructor(scene, n, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.base = new Float32Array(n * 4);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, vertexShader: PART_VS, fragmentShader: PART_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.g = g;
  }
  // c = [r, g, b, a]; grav: m/s² nach unten (negativ = steigt)
  spawn(p, v, life, size, c, grow = 0, grav = 0) {
    const i = this.next; this.next = (i + 1) % this.n;
    this.pos.set(p, i * 3); this.vel.set(v, i * 3);
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.grav[i] = grav;
    this.base.set(c, i * 4); this.col.set(c, i * 4);
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-1.2 * dt);
      this.vel[k] *= drag; this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const u = Math.max(0, this.life[i] / this.max[i]);
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, u * 2.5);
    }
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.aCol.needsUpdate = true;
    this.g.attributes.aSize.needsUpdate = true;
  }
}

// ───────── Feuerlöscher-Modell ─────────
function extinguisherModel(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.46, 14), M.red);
  body.position.y = 0.23; g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.red);
  dome.position.y = 0.46; g.add(dome);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.14, 14, 1, true), M.label);
  label.position.y = 0.24; g.add(label);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 8), M.black);
  valve.position.y = 0.6; g.add(valve);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.16), M.black);
  lever.position.set(0, 0.65, 0.05); lever.rotation.x = -0.25; g.add(lever);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.6, 0.02), new THREE.Vector3(0.1, 0.55, 0.12), new THREE.Vector3(0.13, 0.3, 0.13), new THREE.Vector3(0.12, 0.12, 0.08),
  ]), 12, 0.015, 5), M.black);
  g.add(hose);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// ───────── Aufbau ─────────
export function buildElements(scene, level, M0) {
  const live = { waters: [], fires: [], showers: [], cabinets: [], carried: new Map(), sprinklers: [], t: 0, sound: [] };
  const M = {
    red: std({ color: 0xc81e1e, roughness: 0.35, metalness: 0.3 }),
    label: std({ color: 0xf2f2f2, roughness: 0.6 }),
    black: std({ color: 0x1a1a1a, roughness: 0.5 }),
    steel: std({ color: 0x8a9096, roughness: 0.35, metalness: 0.8 }),
    dark: std({ color: 0x2a2d31, roughness: 0.45, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25 }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xff3a1a, toneMapped: false }),
    gauge: std({ color: 0xf2f2f2, roughness: 0.5 }),
  };
  live.M = M;
  live.parts = new Particles(scene, 1400, false);
  live.sparks = new Particles(scene, 500, true);

  // Wasserflächen
  const normals = waterNormals();
  for (const w of level.waters || []) {
    if (w.shower) {
      // Notdusche: Mast, Duschkopf, Zugstange, Wasserstrahl
      const cx = (w.min[0] + w.max[0]) / 2, cz = (w.min[2] + w.max[2]) / 2, y0 = w.min[1], top = w.max[1];
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, top - y0 + 0.2, 8), M.steel);
      pole.position.set(cx + 0.42, y0 + (top - y0 + 0.2) / 2, cz); g.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 8), M.steel);
      arm.rotation.z = Math.PI / 2; arm.position.set(cx + 0.2, top + 0.1, cz); g.add(arm);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.06, 0.12, 14), std({ color: 0x2fae4a, roughness: 0.4 }));
      head.position.set(cx, top, cz); g.add(head);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.3), std({ color: 0x1f9a3a, emissive: 0x0f5a1f, emissiveIntensity: 0.6 }));
      sign.position.set(cx + 0.47, y0 + 2.0, cz); g.add(sign);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, top - y0, 12, 1, true).translate(0, (top - y0) / 2, 0),
        new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      stream.position.set(cx, y0, cz); g.add(stream);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 1.0), std({ color: 0x9fb4bc, roughness: 0.3, metalness: 0.5 }));
      tray.position.set(cx, y0 + 0.02, cz); g.add(tray);
      scene.add(g);
      live.showers.push({ w, stream, cx, cz, top, y0 });
      continue;
    }
    const sx = w.max[0] - w.min[0], sz = w.max[2] - w.min[2];
    const nm = normals.clone(); nm.needsUpdate = true;
    nm.repeat.set(sx / 3, sz / 3);
    const pool = w.look === 'pool';
    const mat = new THREE.MeshStandardMaterial({
      color: pool ? 0x33b5cf : 0x2c7f99, roughness: 0.06, metalness: 0.15, transparent: true, opacity: pool ? 0.72 : 0.82,
      normalMap: nm, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide, depthWrite: false,
      emissive: pool ? 0x0a3a48 : 0x08303c, emissiveIntensity: 0.5,
    });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2), mat);
    surf.position.set((w.min[0] + w.max[0]) / 2, w.surf ?? w.max[1], (w.min[2] + w.max[2]) / 2);
    surf.renderOrder = 2;
    scene.add(surf);
    // Wasserkörper: leicht getönt, damit man Tiefe sieht
    const vol = new THREE.Mesh(new THREE.BoxGeometry(sx - 0.02, 1, sz - 0.02).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: pool ? 0x1c6f86 : 0x16495a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.BackSide }));
    vol.position.copy(surf.position);
    scene.add(vol);
    live.waters.push({ w, surf, vol, nm, base: w.min[1] });
  }

  // Flammen
  const flameGeoFor = (z) => {
    const b = z, wx = b.max[0] - b.min[0], wy = b.max[1] - b.min[1], wz = b.max[2] - b.min[2];
    const spots = [];
    if (z.jet) {
      // Flammenvorhang: dünn, entlang der langen Seite
      const lat = wx > wz ? 0 : 2, len = lat === 0 ? wx : wz;
      const n = Math.max(3, Math.round(len / 0.45));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        spots.push({ x: lat === 0 ? t * wx : wx / 2, y: 0, z: lat === 0 ? wz / 2 : t * wz, w: 0.6, h: wy * (0.75 + 0.25 * ((i * 0.37) % 1)) });
      }
      return flameGeometry(spots);
    }
    const step = z.oil ? 0.75 : 0.8;
    const nx = Math.max(1, Math.round(wx / step)), nz = Math.max(1, Math.round(wz / step));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const r = ((i * 7 + j * 13) % 10) / 10;
      const edge = Math.min(i, nx - 1 - i, j, nz - 1 - j) === 0 ? 0.75 : 1;
      const h = (z.oil ? wy * 0.9 : wy) * (0.6 + 0.4 * r) * edge;
      spots.push({ x: (i + 0.5) * wx / nx + (r - 0.5) * 0.2, y: z.oil ? 0.3 : 0, z: (j + 0.5) * wz / nz + (0.5 - r) * 0.2, w: z.oil ? 1.1 : 1.0, h });
    }
    return flameGeometry(spots);
  };
  for (const z of level.hazards) {
    if (z.kind !== 'fire') continue;
    const g = new THREE.Group();
    g.position.set(...z.min);
    const mat = flameMaterial();
    const mesh = new THREE.Mesh(flameGeoFor(z), mat);
    mesh.renderOrder = 6;
    g.add(mesh);
    const w = [z.max[0] - z.min[0], z.max[1] - z.min[1], z.max[2] - z.min[2]];
    if (z.burner) {
      // Brennerrost mit Düsen
      const grate = new THREE.Mesh(new THREE.BoxGeometry(w[0], 0.05, w[2]).translate(w[0] / 2, 0.025, w[2] / 2), M.dark);
      g.add(grate);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const n = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8), M.steel);
        n.position.set((i + 0.5) * w[0] / 3, 0.08, (j + 0.5) * w[2] / 3); g.add(n);
      }
    }
    if (z.jet) {
      // Düsenrohre an beiden Enden
      const lat = w[0] > w[2] ? 0 : 2;
      for (const e of [0, 1]) {
        const p = [w[0] / 2, 0, w[2] / 2]; p[lat] = e * w[lat];
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, w[1] + 0.2, 10), M.dark);
        post.position.set(p[0], (w[1] + 0.2) / 2 - 0.1, p[2]); post.castShadow = true; g.add(post);
        const tip = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12), std({ color: 0x3a1a0a, emissive: 0xff5a10, emissiveIntensity: 0.8 }));
        tip.rotation.x = Math.PI / 2; tip.position.set(p[0], w[1] + 0.1, p[2]); g.add(tip);
      }
    }
    if (z.sprinkler) {
      // Sprinklerleitung über der Brücke
      const lat = w[0] > w[2] ? 0 : 2, len = w[lat];
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), M.red);
      if (lat === 0) pipe.rotation.z = Math.PI / 2; else pipe.rotation.x = Math.PI / 2;
      pipe.position.set(w[0] / 2, w[1] + 0.35, w[2] / 2); g.add(pipe);
      const heads = [];
      for (let t = 0.5; t < len; t += 1.0) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 8), M.steel);
        const p = [w[0] / 2, w[1] + 0.25, w[2] / 2]; p[lat] = t;
        h.position.set(...p); g.add(h); heads.push(p.map((v, i) => v + z.min[i]));
      }
      for (const e of [0, 1]) {
        const p = [w[0] / 2, 0, w[2] / 2]; p[lat] = e * len;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w[1] + 0.45, 6), M.red);
        post.position.set(p[0], (w[1] + 0.45) / 2 - 0.1, p[2]); g.add(post);
      }
      live.sprinklers.push({ z, heads });
    }
    scene.add(g);
    live.fires.push({ z, g, mat, level: 1, center: [(z.min[0] + z.max[0]) / 2, z.min[1] + 0.6, (z.min[2] + z.max[2]) / 2], size: w });
  }

  // Feuerlöscher-Schränke
  for (const e of level.extinguishers || []) {
    const g = new THREE.Group();
    g.position.set(...e.pos);
    g.rotation.y = Math.atan2(e.face[0], e.face[1]);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), M.dark);
    post.position.set(0, 0.8, -0.2); g.add(post);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.3), M.red);
    cab.position.set(0, 0.95, -0.05); cab.castShadow = true; g.add(cab);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.75, 0.02), M.label);
    inner.position.set(0, 0.95, 0.105); g.add(inner);
    const ext = extinguisherModel(M);
    ext.position.set(0, 0.6, 0.13); g.add(ext);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.02), M.glass);
    glass.position.set(0, 0.95, 0.12); g.add(glass);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.02), std({ color: 0xd62020, emissive: 0x6a0a0a, emissiveIntensity: 0.7 }));
    sign.position.set(0, 1.55, -0.05); g.add(sign);
    scene.add(g);
    live.cabinets.push({ e, g, ext });
  }

  // Requisiten: Sprungbrett am Kanal, Pegel und Zulauf an der Flutkammer
  for (const p of level.props) {
    if (p.type === 'diveboard') {
      const b = p.box, f = p.f;
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const half = f[0] ? (b.max[0] - b.min[0]) / 2 : (b.max[2] - b.min[2]) / 2;
      const board = new THREE.Mesh(new THREE.BoxGeometry(f[0] ? 1.6 : 0.5, 0.08, f[0] ? 0.5 : 1.6), std({ color: 0x2f8fc0, roughness: 0.5 }));
      board.position.set(cx + f[0] * (half + 0.5), b.max[1] + 0.04, cz + f[1] * (half + 0.5));
      board.castShadow = true; scene.add(board);
      // Geländer rechts und links
      for (const s of [-1, 1]) {
        const r = [-f[1], f[0]];
        const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(cx - f[0] * half * 0.8 + r[0] * s * 0.35, b.max[1], cz - f[1] * half * 0.8 + r[1] * s * 0.35),
          new THREE.Vector3(cx - f[0] * half * 0.6 + r[0] * s * 0.35, b.max[1] + 0.9, cz - f[1] * half * 0.6 + r[1] * s * 0.35),
          new THREE.Vector3(cx + f[0] * half * 0.7 + r[0] * s * 0.35, b.max[1] + 0.9, cz + f[1] * half * 0.7 + r[1] * s * 0.35),
          new THREE.Vector3(cx + f[0] * half * 0.9 + r[0] * s * 0.35, b.max[1], cz + f[1] * half * 0.9 + r[1] * s * 0.35),
        ]), 16, 0.03, 6), M.steel);
        scene.add(rail);
      }
    } else if (p.type === 'floodtank') {
      const b = p.box, f = p.f;
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const r = [-f[1], f[0]];
      const sw = f[0] ? (b.max[2] - b.min[2]) / 2 : (b.max[0] - b.min[0]) / 2;
      const al = f[0] ? (b.max[0] - b.min[0]) / 2 : (b.max[2] - b.min[2]) / 2;
      // Pegelstreifen außen an beiden Seitenwänden
      for (const s of [-1, 1]) {
        for (let y = b.min[1] + 1; y < b.max[1] - 0.5; y += 1) {
          const mark = new THREE.Mesh(new THREE.BoxGeometry(f[0] ? 0.6 : 0.02, 0.06, f[0] ? 0.02 : 0.6), M.gauge);
          mark.position.set(cx + r[0] * s * (sw + 0.02), y, cz + r[1] * s * (sw + 0.02));
          scene.add(mark);
        }
      }
      // Zulaufrohr oben über der Kammer
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 12), M.red);
      pipe.position.set(cx - f[0] * (al - 1.4), b.max[1] + 0.2, cz - f[1] * (al - 1.4));
      pipe.rotation.set(f[1] ? Math.PI / 2 : 0, 0, f[0] ? Math.PI / 2 : 0);
      scene.add(pipe);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.beacon);
      beacon.position.set(cx - f[0] * (al - 0.2), b.max[1] + 0.25, cz - f[1] * (al - 0.2));
      scene.add(beacon);
      const wo = live.waters.find((o) => o.w.index === p.water);
      if (wo) wo.tank = { pour: [cx - f[0] * (al - 1.4), b.max[1] - 0.1, cz - f[1] * (al - 1.4)], beacon };
    }
  }

  // Lichtschein der nächsten Feuer
  live.lights = [0, 1].map(() => {
    const l = new THREE.PointLight(0xff7a2a, 0, 10, 1.6);
    scene.add(l);
    return l;
  });
  live.extModel = () => extinguisherModel(M);
  return live;
}

// people: [{ id, pos, yaw, ext, spray, swim, dive, wet, steam, splash }] – lokal und Mitspieler
// view: Renderer (für Figuren), focus: Kamerafokus
export function updateElements(live, dt, people, view, focus, quality) {
  live.t += dt;
  const t = live.t;
  const P = live.parts, S = live.sparks;
  const fx = quality !== 'low';
  // Wasser: Wellen laufen, steigendes Wasser hebt die Fläche
  for (const o of live.waters) {
    o.nm.offset.x = t * 0.03; o.nm.offset.y = t * 0.02;
    const s = o.w.surf ?? o.w.max[1];
    o.surf.position.y = s;
    o.vol.position.y = s;
    o.vol.scale.y = Math.max(0.05, s - o.base);
    if (o.tank) {
      // Zulauf: Wasser strömt, solange der Pegel steigt
      const rising = s > (o.last ?? s) + 1e-4;
      o.last = s;
      o.tank.beacon.visible = rising ? Math.sin(t * 10) > 0 : true;
      if (rising && fx) for (let i = 0; i < 3; i++) P.spawn([o.tank.pour[0] + (Math.random() - 0.5) * 0.3, o.tank.pour[1], o.tank.pour[2] + (Math.random() - 0.5) * 0.3], [0, -2, 0], 0.9, 0.35, [0.75, 0.9, 1, 0.55], 0.2, 14);
    }
  }
  for (const o of live.showers) {
    o.stream.material.opacity = 0.14 + 0.06 * Math.sin(t * 20);
    if (Math.random() < dt * (fx ? 30 : 10)) P.spawn([o.cx + (Math.random() - 0.5) * 0.4, o.top - 0.1, o.cz + (Math.random() - 0.5) * 0.4], [0, -3, 0], 0.7, 0.12, [0.8, 0.93, 1, 0.7], 0, 9);
  }
  // Flammen
  const near = [];
  for (const o of live.fires) {
    const z = o.z;
    let want = z.active ? 1 : z.warn ? 0.22 + 0.12 * Math.sin(t * 25) : z.burner ? 0.12 : 0;
    const blue = z.burner && !z.active && !z.warn ? 1 : 0;
    o.level += (want - o.level) * Math.min(1, dt * (want > o.level ? 10 : 5));
    o.mat.uniforms.uTime.value = t;
    o.mat.uniforms.uLevel.value = Math.max(0.001, o.level);
    o.mat.uniforms.uBlue.value += (blue - o.mat.uniforms.uBlue.value) * Math.min(1, dt * 6);
    o.g.position.set(...z.cur.min);
    o.g.children[0].visible = o.level > 0.01;
    const d = Math.hypot(o.center[0] - focus[0], o.center[1] - focus[1], o.center[2] - focus[2]);
    if (d < 40 && o.level > 0.3) near.push([d, o]);
    if (d > 35 || !fx) continue;
    // Funken und Rauch über aktiven Feuern
    const area = o.size[0] * o.size[2];
    if (o.level > 0.5 && Math.random() < dt * (3 + area * 1.5)) {
      S.spawn([z.cur.min[0] + Math.random() * o.size[0], z.cur.min[1] + o.size[1] * 0.6, z.cur.min[2] + Math.random() * o.size[2]], [(Math.random() - 0.5) * 0.8, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.8], 1.2, 0.07, [1, 0.6, 0.2, 1], -0.02, -0.6);
    }
    if (o.level > 0.5 && !z.burner && !z.jet && Math.random() < dt * 2) {
      P.spawn([z.cur.min[0] + Math.random() * o.size[0], z.cur.max[1], z.cur.min[2] + Math.random() * o.size[2]], [0, 1.2, 0], 2.5, 0.9, [0.16, 0.14, 0.13, 0.35], 0.9, -0.2);
    }
    // gerade gelöscht: Dampfwolke; gelöscht: Restqualm
    if (z.justOut) for (let i = 0; i < 25; i++) P.spawn([z.cur.min[0] + Math.random() * o.size[0], z.cur.min[1] + 0.3 + Math.random() * 1.2, z.cur.min[2] + Math.random() * o.size[2]], [(Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5], 1.6, 0.6, [0.92, 0.92, 0.92, 0.6], 1.2, -0.3);
    if (o.level < 0.3 && z.ext && z.outT > 0 && Math.random() < dt * 3) P.spawn([z.cur.min[0] + Math.random() * o.size[0], z.cur.min[1] + 0.1, z.cur.min[2] + Math.random() * o.size[2]], [0, 0.6, 0], 2, 0.5, [0.4, 0.4, 0.42, 0.3], 0.6, -0.1);
  }
  // Sprinkler: regnet, solange der Auslöser gedrückt ist
  for (const s of live.sprinklers) {
    if (s.z.active) continue;
    for (const h of s.heads) if (Math.random() < dt * (fx ? 25 : 10)) P.spawn([h[0] + (Math.random() - 0.5) * 0.3, h[1] - 0.1, h[2] + (Math.random() - 0.5) * 0.3], [(Math.random() - 0.5) * 2.4, -1, (Math.random() - 0.5) * 2.4], 0.8, 0.1, [0.75, 0.9, 1, 0.75], 0, 9);
  }
  near.sort((a, b) => a[0] - b[0]);
  live.lights.forEach((l, i) => {
    const o = near[i]?.[1];
    if (!o) { l.intensity = 0; return; }
    l.position.set(o.center[0], o.z.cur.min[1] + Math.min(1.6, o.size[1] * 0.6), o.center[2]);
    l.intensity = (6 + 2 * Math.sin(t * 13 + i) + Math.sin(t * 31)) * o.level * (o.z.burner && o.mat.uniforms.uBlue.value > 0.5 ? 0.2 : 1);
  });

  // Spielfiguren: getragener Löscher, Schaum, Schwimmlage, Dampf, Spritzer
  for (const p of people) {
    const av = view.avatars.get(p.id);
    if (!av) continue;
    let c = live.carried.get(p.id);
    if (!c) {
      const m = live.extModel();
      m.position.set(0.34, 0.62, 0.12);
      m.rotation.z = -0.25;
      av.g.add(m);
      av.g.rotation.order = 'YXZ';
      c = { m, pitch: 0, lift: 0 };
      live.carried.set(p.id, c);
    }
    c.m.visible = !!p.ext && av.g.visible;
    // Schwimmen: Figur liegt im Wasser, beim Tauchen schräg nach unten
    const pitch = p.swim ? (p.dive ? 1.25 : 1.15) : 0;
    c.pitch += (pitch - c.pitch) * Math.min(1, dt * 8);
    const lift = p.swim ? 0.75 : 0;
    c.lift += (lift - c.lift) * Math.min(1, dt * 8);
    av.g.rotation.x = c.pitch;
    av.g.position.y += c.lift;
    if (p.swim && !p.dive) {
      c.stroke = (c.stroke || 0) + dt;
      if (fx && c.stroke > 0.25 && Math.hypot(p.vel?.[0] || 0, p.vel?.[2] || 0) > 0.8) {
        c.stroke = 0;
        P.spawn([p.pos[0] + (Math.random() - 0.5) * 0.6, p.surf + 0.05, p.pos[2] + (Math.random() - 0.5) * 0.6], [(Math.random() - 0.5), 1.4, (Math.random() - 0.5)], 0.5, 0.18, [0.85, 0.95, 1, 0.8], 0.3, 6);
      }
    }
    const dist = Math.hypot(p.pos[0] - focus[0], p.pos[1] - focus[1], p.pos[2] - focus[2]);
    if (dist > 45) continue;
    // Schaum aus der Düse
    if (p.spray) {
      const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
      for (let i = 0; i < 4; i++) {
        const sp = 5 + Math.random() * 2;
        P.spawn([p.pos[0] + f[0] * 0.45, p.pos[1] + 0.95, p.pos[2] + f[1] * 0.45],
          [f[0] * sp + (Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.2, f[1] * sp + (Math.random() - 0.5) * 1.2], 0.55, 0.28, [0.97, 0.97, 1, 0.85], 1.4, 3);
      }
    }
    if (p.steam && fx && Math.random() < dt * 40) P.spawn([p.pos[0] + (Math.random() - 0.5) * 0.5, p.pos[1] + 0.3 + Math.random() * 1.4, p.pos[2] + (Math.random() - 0.5) * 0.5], [0, 1.6, 0], 0.9, 0.35, [0.95, 0.95, 0.95, 0.5], 1.0, -0.4);
    else if (p.wet > 0 && !p.swim && fx && Math.random() < dt * 8) P.spawn([p.pos[0] + (Math.random() - 0.5) * 0.4, p.pos[1] + 0.4 + Math.random() * 1.2, p.pos[2] + (Math.random() - 0.5) * 0.4], [0, -0.5, 0], 0.6, 0.07, [0.6, 0.85, 1, 0.8], 0, 8);
    if (p.splash > 0) {
      const n = Math.min(60, 12 + p.splash * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.5;
        P.spawn([p.pos[0], p.surf + 0.05, p.pos[2]], [Math.cos(a) * r, 2 + Math.random() * Math.min(6, p.splash * 0.5), Math.sin(a) * r], 0.9, 0.22, [0.85, 0.95, 1, 0.85], 0.15, 9);
      }
    }
  }
  P.update(dt);
  S.update(dt);
}

// Nächstes aktives Feuer (für Geräusche): [Abstand, Feuer]
export function nearestFire(live, p) {
  let best = null, bd = Infinity;
  for (const o of live.fires) {
    if (o.level < 0.3) continue;
    const b = o.z.cur;
    const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]), dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]), dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
    const d = Math.hypot(dx, dy, dz);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? [bd, best] : null;
}
