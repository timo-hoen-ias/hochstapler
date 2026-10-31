// Modelle aus Code für Hochstapler: Schrägen, Rohre, Trommeln, Leitern, Kranhaken,
// Gabelstapler und Kulisse. Wiederholte Teile werden zusammengeführt oder instanziert,
// damit die Zahl der Draw-Calls klein bleibt (wichtig fürs Handy).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { topAt } from './physics.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2, ...o });

export function modelMaterials(tex, mats) {
  return {
    machine: std({ color: 0x5f7686, metalness: 0.5, roughness: 0.45 }),
    pipe: std({ color: 0x7c8b97, metalness: 0.75, roughness: 0.32 }),
    duct: std({ color: 0xb9c2c8, metalness: 0.85, roughness: 0.28 }),
    flange: std({ color: 0x3e4a55, metalness: 0.7, roughness: 0.4 }),
    chute: std({ color: 0xc7ccd1, metalness: 0.9, roughness: 0.18 }),
    chuteRail: std({ color: 0xe0a21a, metalness: 0.3, roughness: 0.5 }),
    beltramp: mats.goods,
    palletramp: mats.timber,
    roofslope: mats.roof,
    drum: mats.drum,
    cableCore: std({ color: 0x2d2d2d, roughness: 0.85 }),
    cableWood: mats.timber,
    ladder: std({ color: 0xf2c014, metalness: 0.4, roughness: 0.45 }),
    chain: std({ color: 0x3a3a3a, metalness: 0.9, roughness: 0.35 }),
    crane: std({ color: 0xe8a317, metalness: 0.35, roughness: 0.45 }),
    craneDark: std({ color: 0x2f3338, metalness: 0.5, roughness: 0.5 }),
    forkBody: std({ color: 0xf0a020, metalness: 0.25, roughness: 0.5 }),
    forkDark: std({ color: 0x24272b, metalness: 0.4, roughness: 0.6 }),
    tire: std({ color: 0x151515, roughness: 0.95, metalness: 0 }),
    glass: std({ color: 0x9fc6e0, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.45 }),
    shuttle: std({ color: 0x2c6fb7, metalness: 0.4, roughness: 0.45 }),
    rackUpright: mats.upright,
    rackBeam: mats.beam,
    goods: mats.goods,
    carton: mats.carton,
    pallet: std({ color: 0xb48a5a, roughness: 0.9 }),
    skylight: std({ color: 0x9ab7cc, metalness: 0.2, roughness: 0.1, emissive: 0x334455, emissiveIntensity: 0.4 }),
    vent: std({ color: 0x9aa4ab, metalness: 0.8, roughness: 0.3 }),
    containerMat: std({ map: tex.container, bumpMap: tex.container, bumpScale: 3, metalness: 0.45, roughness: 0.5 }),
    iceslide: std({ color: 0xcfe9ff, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.85 }),
    cable: std({ color: 0x2d2d2d, roughness: 0.85 }),
    frostGoods: std({ color: 0xe6f2fb, roughness: 0.6 }),
    frostRack: std({ color: 0x9fc3dd, metalness: 0.5, roughness: 0.4 }),
    panel: std({ color: 0xeef1f3, metalness: 0.15, roughness: 0.55 }),
    panelSeam: std({ color: 0xb4bcc4, metalness: 0.3, roughness: 0.5 }),
    coolFan: std({ color: 0x5e6b75, metalness: 0.7, roughness: 0.35 }),
    concrete: std({ color: 0xb9b6ae, roughness: 0.92 }),
    siloBand: std({ color: 0x6b6f73, metalness: 0.5, roughness: 0.5 }),
    tankWhite: std({ color: 0xe9ecee, metalness: 0.35, roughness: 0.35 }),
    tankYellow: std({ color: 0xe2c23a, metalness: 0.3, roughness: 0.45 }),
    tankGreen: std({ color: 0x5f8f4e, metalness: 0.3, roughness: 0.5 }),
    pipeRed: std({ color: 0xb33a2c, metalness: 0.5, roughness: 0.45 }),
    rail: std({ color: 0x5b4f45, metalness: 0.7, roughness: 0.5 }),
    wagonRed: std({ color: 0x8c3b2a, metalness: 0.35, roughness: 0.6 }),
    wagonBlue: std({ color: 0x2f5d8a, metalness: 0.35, roughness: 0.6 }),
    weight: std({ color: 0x8d8c88, roughness: 0.9 }),
    wind: new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
  };
}

// Box als Geometrie (Weltkoordinaten)
function bx(min, max) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
}
// Zylinder entlang einer Weltachse (0 = x, 1 = y, 2 = z)
function cyl(axis, c, r, len, seg = 18, r2 = r) {
  const g = new THREE.CylinderGeometry(r, r2, len, seg);
  if (axis === 0) g.rotateZ(Math.PI / 2);
  if (axis === 2) g.rotateX(Math.PI / 2);
  g.translate(c[0], c[1], c[2]);
  return g;
}
// Stab zwischen zwei Punkten
const _rodUp = new THREE.Vector3(0, 1, 0);
function rod(a, b, r, seg = 6) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_rodUp, d.clone().normalize()));
  const m = va.add(vb).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}
// Box, deren Ober- und Unterseite der Schräge folgen
function slabOnRamp(b, min, max, th, lift = 0) {
  const g = bx(min, max);
  const p = g.attributes.position;
  const midY = (min[1] + max[1]) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const t = topAt(b, x, z) + lift;
    p.setY(i, p.getY(i) > midY ? t : t - th);
  }
  g.computeVertexNormals();
  return g;
}

class Batch {
  constructor() { this.parts = new Map(); }
  add(mat, geo) { if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(geo); }
  flush(scene, shadows = true) {
    for (const [mat, geos] of this.parts) {
      const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      for (const g of nonIndexed) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
      const mesh = new THREE.Mesh(mergeGeometries(nonIndexed, false), mat);
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      scene.add(mesh);
    }
    this.parts.clear();
  }
}

// ───────── Schrägen, Rutschen, Rohre, Trommeln ─────────
export function buildShapes(scene, level, M) {
  const batch = new Batch();
  const spinners = [];
  for (const b of level.statics) {
    if (b.ramp) {
      const th = 0.25;
      const mat = M[b.mat] || M.chute;
      batch.add(mat, slabOnRamp(b, b.min, b.max, th));
      if (b.ramp.slide) {
        // Seitenwangen der Paketrutsche
        const lat = b.ramp.axis === 0 ? 2 : 0;
        for (const side of [b.min[lat], b.max[lat]]) {
          const mn = [...b.min], mx = [...b.max];
          mn[lat] = side - 0.06; mx[lat] = side + 0.06;
          batch.add(M.chuteRail, slabOnRamp(b, mn, mx, 0.55, 0.3));
        }
      }
      continue;
    }
    if (b.round) {
      const o = b.round, ax = o.axis;
      const len = b.max[ax] - b.min[ax];
      const c = ax === 0 ? [(b.min[0] + b.max[0]) / 2, o.cy, o.cl] : [o.cl, o.cy, (b.min[2] + b.max[2]) / 2];
      if (b.model === 'drums') {
        // Reihe liegender Fässer
        const n = Math.max(1, Math.round(len / 0.95));
        const seg = len / n;
        for (let i = 0; i < n; i++) {
          const cc = [...c];
          cc[ax] = b.min[ax] + seg * (i + 0.5);
          batch.add(M.drum, cyl(ax, cc, o.r, seg - 0.06, 20));
          for (const e of [-1, 1]) { const rc = [...cc]; rc[ax] += e * (seg / 2 - 0.12); batch.add(M.flange, cyl(ax, rc, o.r + 0.015, 0.04, 20)); }
        }
      } else if (b.model === 'drum') {
        // Kabeltrommel: dreht sich, deshalb eigenes Objekt
        const g = new THREE.Group();
        const core = new THREE.Mesh(cyl(ax, [0, 0, 0], o.r, len - 0.1, 24), M.cableCore);
        g.add(core);
        for (const e of [-1, 1]) {
          const p = [0, 0, 0]; p[ax] = e * (len / 2 - 0.04);
          g.add(new THREE.Mesh(cyl(ax, p, o.r + 0.1, 0.08, 24), M.cableWood));
        }
        for (let i = 0; i < 6; i++) {
          // Kabelwindungen als Streifen, damit man die Drehung sieht
          const a = (i / 6) * Math.PI * 2;
          const p = [0, Math.cos(a) * o.r, 0];
          if (ax === 0) p[2] = Math.sin(a) * o.r; else p[0] = Math.sin(a) * o.r;
          const s = [0.05, 0.05, 0.05]; s[ax] = len - 0.2;
          const m = new THREE.Mesh(new THREE.BoxGeometry(...s), M.chuteRail);
          m.position.set(...p);
          g.add(m);
        }
        g.position.set(...c);
        g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
        scene.add(g);
        spinners.push({ g, axis: ax, w: (b.spin || 0) / o.r, lat: ax === 0 ? 2 : 0 });
      } else {
        const mat = M[b.mat] || M.pipe;
        batch.add(mat, cyl(ax, c, o.r, len, 16));
        for (let s = 0.4; s < len; s += 1.8) {
          const fc = [...c]; fc[ax] = b.min[ax] + s;
          batch.add(M.flange, cyl(ax, fc, o.r + 0.04, 0.08, 16));
        }
      }
    }
  }
  batch.flush(scene);
  return spinners;
}

// ───────── Leitern ─────────
export function buildLadders(scene, level, M) {
  const batch = new Batch();
  for (const l of level.ladders) {
    const [fx, fz] = l.face;
    // Wandseite der Leiterzone
    const wallX = fx > 0 ? l.min[0] : fx < 0 ? l.max[0] : null;
    const wallZ = fz > 0 ? l.min[2] : fz < 0 ? l.max[2] : null;
    const y0 = l.min[1], y1 = l.max[1] + 0.9;
    const off = 0.14;
    if (wallX !== null) {
      const x = wallX + fx * off;
      for (const z of [l.min[2] + 0.06, l.max[2] - 0.06]) batch.add(M.ladder, bx([x - 0.03, y0, z - 0.03], [x + 0.03, y1, z + 0.03]));
      for (let y = y0 + 0.3; y < l.max[1]; y += 0.3) batch.add(M.ladder, bx([x - 0.02, y - 0.02, l.min[2] + 0.06], [x + 0.02, y + 0.02, l.max[2] - 0.06]));
    } else {
      const z = wallZ + fz * off;
      for (const x of [l.min[0] + 0.06, l.max[0] - 0.06]) batch.add(M.ladder, bx([x - 0.03, y0, z - 0.03], [x + 0.03, y1, z + 0.03]));
      for (let y = y0 + 0.3; y < l.max[1]; y += 0.3) batch.add(M.ladder, bx([l.min[0] + 0.06, y - 0.02, z - 0.02], [l.max[0] - 0.06, y + 0.02, z + 0.02]));
    }
  }
  batch.flush(scene);
}

// ───────── Kranhaken, Laufkatze, Portalkran ─────────
export function buildHooks(scene, level, M) {
  const batch = new Batch();
  const live = [];
  const hookGeo = (() => {
    const t = new THREE.TorusGeometry(0.16, 0.045, 6, 12, Math.PI * 1.35);
    t.rotateZ(Math.PI * 0.85);
    t.translate(0, -0.12, 0);
    return mergeGeometries([t, new THREE.BoxGeometry(0.14, 0.22, 0.1).translate(0, 0.08, 0)]);
  })();
  for (const h of level.hooks) {
    const [ax, az] = h.along;
    const P = h.pivot;
    if (h.motion) {
      // Portalkran: Ausleger über die ganze Fahrt, Beine bis zum Boden
      const d = h.motion.delta;
      const ext = 4;
      const a0 = [P[0] - ax * ext, P[2] - az * ext], a1 = [P[0] + d[0] + ax * ext, P[2] + d[2] + az * ext];
      const lat = [-az, ax];
      const y = P[1] + 0.25;
      const mn = [Math.min(a0[0], a1[0]), y, Math.min(a0[1], a1[1])], mx = [Math.max(a0[0], a1[0]), y + 1.1, Math.max(a0[1], a1[1])];
      for (const s of [-1, 1]) {
        const o = [lat[0] * s * 0.9, lat[1] * s * 0.9];
        batch.add(M.crane, bx([mn[0] + o[0] - (lat[0] ? 0.18 : 0), mn[1], mn[2] + o[1] - (lat[1] ? 0.18 : 0)], [mx[0] + o[0] + (lat[0] ? 0.18 : 0), mx[1], mx[2] + o[1] + (lat[1] ? 0.18 : 0)]));
      }
      // Beine an beiden Enden
      for (const end of [a0, a1]) for (const s of [-1, 1]) {
        const x = end[0] + lat[0] * s * 3.2, z = end[1] + lat[1] * s * 3.2;
        // Unten im Hof stehen Beine auf dem Boden, weiter oben hängt die Bahn an Zugstangen
        if (y < 14) batch.add(M.crane, bx([x - 0.45, 0, z - 0.45], [x + 0.45, y + 1.1, z + 0.45]));
        else batch.add(M.chain, rod([x, y + 1.2, z], [end[0], y + 7, end[1]], 0.06, 5));
      }
      for (const end of [a0, a1]) {
        // Querriegel
        const mnq = [Math.min(end[0] - lat[0] * 3.2, end[0] + lat[0] * 3.2) - 0.3, y - 0.2, Math.min(end[1] - lat[1] * 3.2, end[1] + lat[1] * 3.2) - 0.3];
        const mxq = [Math.max(end[0] - lat[0] * 3.2, end[0] + lat[0] * 3.2) + 0.3, y + 1.3, Math.max(end[1] - lat[1] * 3.2, end[1] + lat[1] * 3.2) + 0.3];
        batch.add(M.crane, bx(mnq, mxq));
      }
    } else {
      // Hallenkran-Träger über dem Haken
      const y = P[1] + 0.1;
      const L = 3.2;
      const mn = [P[0] - (ax ? L : 0.25), y, P[2] - (az ? L : 0.25)], mx = [P[0] + (ax ? L : 0.25), y + 0.5, P[2] + (az ? L : 0.25)];
      batch.add(M.crane, bx(mn, mx));
      const lat = [-az, ax];
      // Querträger, der zur Hallenwand hinausläuft
      batch.add(M.craneDark, bx([P[0] - (lat[0] ? 6 : 0.15), y + 0.5, P[2] - (lat[1] ? 6 : 0.15)], [P[0] + (lat[0] ? 6 : 0.15), y + 0.8, P[2] + (lat[1] ? 6 : 0.15)]));
    }
    // Laufkatze, Kette und Haken bewegen sich
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.0), M.craneDark);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), M.chain);
    const hk = new THREE.Mesh(hookGeo, M.chain);
    for (const m of [trolley, chain, hk]) { m.castShadow = true; scene.add(m); }
    live.push({ h, trolley, chain, hk });
  }
  batch.flush(scene);
  return live;
}

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function updateHooks(live, locals = []) {
  for (const o of live) {
    const P = o.h.cur;
    o.trolley.position.set(P[0], P[1] + 0.2, P[2]);
    let gx = P[0], gy = P[1] - o.h.len, gz = P[2];
    for (const lp of locals) {
      const body = lp.body;
      if (body && body.hook && body.hook.h === o.h) { gx = body.pos[0]; gy = body.pos[1] + 1.95; gz = body.pos[2]; }
    }
    _v.set(gx - P[0], gy - P[1], gz - P[2]);
    const len = _v.length();
    o.chain.position.set((P[0] + gx) / 2, (P[1] + gy) / 2, (P[2] + gz) / 2);
    o.chain.scale.set(1, len, 1);
    o.chain.quaternion.setFromUnitVectors(_up, _v.clone().multiplyScalar(-1 / len));
    o.hk.position.set(gx, gy, gz);
  }
}

// ───────── Gabelstapler, Shuttle ─────────
export function forkliftGroup(M, side, kind) {
  // lokales Koordinatensystem: x = zur Seite (side), Plattform liegt bei x < 0
  const g = new THREE.Group();
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(bx([0.25, 0.3, -0.75], [2.25, 1.15, 0.75]), M.forkBody);           // Chassis
  add(bx([1.75, 0.3, -0.8], [2.4, 1.35, 0.8]), M.forkDark);              // Gegengewicht
  for (const z of [-0.65, 0.65]) for (const x of [0.6, 2.0]) add(cyl(2, [x, 0.3, z], 0.3, 0.25, 14), M.tire);
  for (const [x, z] of [[0.55, -0.7], [0.55, 0.7], [1.75, -0.7], [1.75, 0.7]]) add(bx([x - 0.04, 1.15, z - 0.04], [x + 0.04, 2.35, z + 0.04]), M.forkDark);
  add(bx([0.45, 2.35, -0.78], [1.85, 2.42, 0.78]), M.forkDark);          // Schutzdach
  add(bx([1.0, 1.15, -0.3], [1.5, 1.6, 0.3]), M.forkDark);               // Sitz
  add(bx([0.5, 1.15, -0.05], [0.6, 1.7, 0.05]), M.forkDark);             // Lenksäule
  return g;
}

// ───────── Kulisse: Regale, Palettenstapel, Containerreihen (instanziert) ─────────
export function buildScenery(scene, level, M) {
  const batch = new Batch();
  for (const p of level.props) {
    if (p.type === 'rack') {
      // Regalwand: Stützen alle 2,7 m, Traversen alle 1,8 m, Paletten mit Ware
      const [x0, z0] = p.from, [x1, z1] = p.to;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const depth = 1.1, h = p.height, y0 = p.base || 0;
      const up = p.frost ? M.frostRack : M.rackUpright, gd = p.frost ? M.frostGoods : M.goods;
      const n = Math.max(1, Math.round(len / 2.7));
      const nx = -uz, nz = ux;
      for (let i = 0; i <= n; i++) {
        const cx = x0 + ux * (len * i / n), cz = z0 + uz * (len * i / n);
        for (const s of [0, 1]) {
          const px = cx + nx * depth * s, pz = cz + nz * depth * s;
          batch.add(up, bx([px - 0.05, y0, pz - 0.05], [px + 0.05, y0 + h, pz + 0.05]));
        }
      }
      for (let y = y0 + 1.8; y < y0 + h; y += 1.8) {
        for (const s of [0, 1]) {
          const ox = nx * depth * s, oz = nz * depth * s;
          batch.add(M.rackBeam, bx([Math.min(x0, x1) + ox - 0.05, y - 0.12, Math.min(z0, z1) + oz - 0.05], [Math.max(x0, x1) + ox + 0.05, y, Math.max(z0, z1) + oz + 0.05]));
        }
        for (let i = 0; i < n; i++) {
          if (((i * 7 + Math.round(y * 3)) % 5) === 0) continue; // ein paar Lücken
          const cx = x0 + ux * (len * (i + 0.5) / n) + nx * depth / 2, cz = z0 + uz * (len * (i + 0.5) / n) + nz * depth / 2;
          const w = 1.0, hh = 0.8 + ((i + y) % 3) * 0.2;
          batch.add(M.pallet, bx([cx - w, y, cz - 0.5], [cx + w, y + 0.14, cz + 0.5]));
          batch.add(p.frost ? gd : (i % 2) ? M.carton : M.goods, bx([cx - w + 0.08, y + 0.14, cz - 0.45], [cx + w - 0.08, y + 0.14 + hh, cz + 0.45]));
        }
      }
    } else if (p.type === 'truckcab') {
      const [x, z] = p.pos, [fx, fz] = p.face;
      const lx = -fz, lz = fx;
      const at = (a, l, y) => [x + fx * a + lx * l, y, z + fz * a + lz * l];
      const box3 = (a0, a1, l0, l1, y0, y1, mat) => {
        const p0 = at(a0, l0, y0), p1 = at(a1, l1, y1);
        batch.add(mat, bx([Math.min(p0[0], p1[0]), y0, Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), y1, Math.max(p0[2], p1[2])]));
      };
      box3(0, 2.3, -1.25, 1.25, 0.9, 3.4, M.shuttle);
      box3(2.0, 2.35, -1.0, 1.0, 2.0, 3.0, M.glass);
      box3(0, 2.3, -1.3, 1.3, 0.5, 0.95, M.forkDark);
      for (const a of [0.6, 1.8]) for (const l of [-1.15, 1.15]) {
        const c = at(a, l, 0.5);
        batch.add(M.tire, cyl(Math.abs(fx) > 0 ? 2 : 0, c, 0.5, 0.35, 16));
      }
    } else if (p.type === 'skylight') {
      const [x, y, z] = p.pos, [sx, sz] = p.size;
      batch.add(M.skylight, bx([x - sx / 2, y, z - sz / 2], [x + sx / 2, y + 0.25, z + sz / 2]));
    } else if (p.type === 'panelwall') {
      // Isolierpaneele (Kühlhaus): helle Wand mit Fugen
      const [x0, z0] = p.a, [x1, z1] = p.b;
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const lo = alongX ? Math.min(x0, x1) : Math.min(z0, z1), hi = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
      const c = alongX ? z0 : x0;
      const wall = (a0, a1, y0, y1, t, mat) => batch.add(mat, alongX ? bx([a0, y0, c - t], [a1, y1, c + t]) : bx([c - t, y0, a0], [c + t, y1, a1]));
      wall(lo, hi, p.y0, p.y1, 0.2, M.panel);
      for (let a = lo; a <= hi; a += 3) wall(a - 0.04, a + 0.04, p.y0, p.y1, 0.24, M.panelSeam);
      for (let y = p.y0; y <= p.y1; y += 6) wall(lo, hi, y - 0.05, y + 0.05, 0.24, M.panelSeam);
    } else if (p.type === 'coolunit') {
      // Verdampfer unter der Decke: Kasten mit drei Lüftern
      const [x, y, z] = p.pos;
      batch.add(M.panel, bx([x - 0.6, y, z - 2.2], [x + 0.6, y + 1.1, z + 2.2]));
      for (const dz of [-1.4, 0, 1.4]) batch.add(M.coolFan, cyl(0, [x - 0.62, y + 0.55, z + dz], 0.45, 0.06, 16));
    } else if (p.type === 'spiral') {
      // Wendelrutsche um einen Mast
      const [x, z] = p.pos, r = p.r;
      batch.add(M.rackUpright, cyl(1, [x, (p.y0 + p.y1) / 2, z], 0.25, p.y1 - p.y0, 10));
      const steps = Math.floor((p.y1 - p.y0) / 0.25);
      for (let i = 0; i < steps; i++) {
        const a = i * 0.2, y = p.y0 + i * 0.25;
        const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
        const g = bx([-0.7, -0.05, -0.45], [0.7, 0.05, 0.45]);
        g.rotateY(-a); g.translate(cx, y, cz);
        batch.add(M.chute, g);
        const e = bx([0.64, 0, -0.46], [0.72, 0.35, 0.46]);
        e.rotateY(-a); e.translate(cx, y, cz);
        batch.add(M.chuteRail, e);
      }
    } else if (p.type === 'silo') {
      // Betonsilo mit Ringen und Kegeldach
      const [x, z] = p.pos, r = p.r;
      const y0 = p.y0, y1 = p.y1 + 4;
      batch.add(M.concrete, cyl(1, [x, (y0 + y1) / 2, z], r, y1 - y0, 32));
      for (let y = y0 + 3; y < y1; y += 4.5) batch.add(M.siloBand, cyl(1, [x, y, z], r + 0.08, 0.35, 32));
      batch.add(M.siloBand, cyl(1, [x, y1 + 1.2, z], 0.4, 2.4, 32, r + 0.2));
      batch.add(M.vent, cyl(1, [x, y1 + 2.8, z], 0.8, 1.2, 12));
    } else if (p.type === 'bridge') {
      // Förderbrücke zwischen zwei Silos (Fachwerk mit Band)
      const [x0, z0] = p.a, [x1, z1] = p.b, y = p.y;
      for (const o of [-0.9, 0.9]) {
        const n = [-(z1 - z0), x1 - x0], l = Math.hypot(...n); const ox = n[0] / l * o, oz = n[1] / l * o;
        batch.add(M.rackBeam, rod([x0 + ox, y, z0 + oz], [x1 + ox, y, z1 + oz], 0.12));
        batch.add(M.rackBeam, rod([x0 + ox, y + 1.6, z0 + oz], [x1 + ox, y + 1.6, z1 + oz], 0.1));
        const len = Math.hypot(x1 - x0, z1 - z0), m = Math.floor(len / 2.5);
        for (let i = 0; i < m; i++) {
          const t0 = i / m, t1 = (i + 1) / m;
          batch.add(M.rackBeam, rod([x0 + (x1 - x0) * t0 + ox, y, z0 + (z1 - z0) * t0 + oz], [x0 + (x1 - x0) * t1 + ox, y + 1.6, z0 + (z1 - z0) * t1 + oz], 0.06));
        }
      }
      batch.add(M.siloBand, rod([x0, y + 0.1, z0], [x1, y + 0.1, z1], 0.5, 4));
    } else if (p.type === 'tank') {
      // Lagertank auf Stahlgestell mit Warnband
      const [x, y, z] = p.pos, r = p.r, h = p.h;
      const mat = [M.tankWhite, M.tankYellow, M.tankGreen][p.color || 0];
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) batch.add(M.flange, bx([x + dx * r * 0.6 - 0.12, y - 2.5, z + dz * r * 0.6 - 0.12], [x + dx * r * 0.6 + 0.12, y, z + dz * r * 0.6 + 0.12]));
      batch.add(mat, cyl(1, [x, y + h / 2, z], r, h, 28));
      batch.add(mat, cyl(1, [x, y + h + 0.5, z], 0.3, 1.0, 28, r));
      batch.add(M.hazardBand || M.chuteRail, cyl(1, [x, y + h * 0.35, z], r + 0.04, 0.5, 28));
      batch.add(M.flange, cyl(1, [x, y + h + 1.1, z], 0.25, 0.4, 10));
    } else if (p.type === 'piperun') {
      // Rohrtrasse an der Wand
      const [x0, z0] = p.a, [x1, z1] = p.b;
      const mats = [M.pipeRed, M.tankYellow, M.pipe, M.tankGreen];
      const n = [-(z1 - z0), x1 - x0], l = Math.hypot(...n);
      for (let i = 0; i < p.n; i++) {
        const o = (i - (p.n - 1) / 2) * 0.7, ox = n[0] / l * o, oz = n[1] / l * o;
        batch.add(mats[(i + Math.round(p.y)) % mats.length], rod([x0 + ox, p.y, z0 + oz], [x1 + ox, p.y, z1 + oz], 0.22, 12));
      }
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let t = 0; t <= len; t += 6) {
        const cx = x0 + (x1 - x0) * t / len, cz = z0 + (z1 - z0) * t / len;
        batch.add(M.flange, bx([cx - 0.15 - Math.abs(n[0] / l) * 1.2, p.y - 0.35, cz - 0.15 - Math.abs(n[1] / l) * 1.2], [cx + 0.15 + Math.abs(n[0] / l) * 1.2, p.y - 0.25, cz + 0.15 + Math.abs(n[1] / l) * 1.2]));
      }
    } else if (p.type === 'gantry') {
      // Portalkran: zwei Stützen, Träger, Laufkatze
      const [x0, z0] = p.a, [x1, z1] = p.b, y = p.y;
      for (const [x, z] of [[x0, z0], [x1, z1]]) {
        batch.add(M.crane, bx([x - 0.5, y - 10, z - 0.5], [x + 0.5, y + 6, z + 0.5]));
        batch.add(M.craneDark, bx([x - 1.4, y - 10.5, z - 1.4], [x + 1.4, y - 10, z + 1.4]));
      }
      batch.add(M.crane, rod([x0, y + 6.6, z0], [x1, y + 6.6, z1], 0.7, 4));
      const mx = (x0 + x1) / 2 + 6, mz = (z0 + z1) / 2;
      batch.add(M.craneDark, bx([mx - 1.2, y + 5.3, mz - 1.2], [mx + 1.2, y + 6.0, mz + 1.2]));
      batch.add(M.chain, bx([mx - 0.04, y + 1.5, mz - 0.04], [mx + 0.04, y + 5.3, mz + 0.04]));
      batch.add(M.containerMat, bx([mx - 3, y - 1.0, mz - 1.2], [mx + 3, y + 1.5, mz + 1.2]));
    } else if (p.type === 'railbridge') {
      // Hochgleis mit Waggons
      const [x0, z0] = p.a, [x1, z1] = p.b, y = p.y;
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const c = alongX ? z0 : x0, lo = alongX ? Math.min(x0, x1) : Math.min(z0, z1), hi = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
      const B = (a0, a1, y0, y1, l0, l1, mat) => batch.add(mat, alongX ? bx([a0, y0, c + l0], [a1, y1, c + l1]) : bx([c + l0, y0, a0], [c + l1, y1, a1]));
      B(lo, hi, y - 0.8, y - 0.2, -2, 2, M.concrete);
      for (const l of [-0.75, 0.75]) B(lo, hi, y - 0.2, y, l - 0.06, l + 0.06, M.rail);
      for (let a = lo; a < hi; a += 0.9) B(a, a + 0.25, y - 0.25, y - 0.15, -1.1, 1.1, M.pallet);
      for (let a = lo + 4; a < hi - 4; a += 14) B(a, a + 0.8, y - 14, y - 0.8, -0.8, 0.8, M.concrete);
      for (let i = 0; i < p.wagons; i++) {
        const a = lo + 6 + i * 11;
        if (a + 10 > hi) break;
        B(a, a + 10, y + 0.6, y + 3.4, -1.4, 1.4, i % 2 ? M.wagonRed : M.wagonBlue);
        B(a + 0.3, a + 9.7, y + 3.4, y + 3.6, -1.2, 1.2, M.craneDark);
        for (const w of [1.5, 8.5]) B(a + w - 0.5, a + w + 0.5, y, y + 0.7, -1.0, 1.0, M.forkDark);
      }
    } else if (p.type === 'mast') {
      // Gittermast des Turmkrans vom Boden bis über das Ziel
      const [x, z] = p.pos, s = 1.3;
      const C = [[-s, -s], [s, -s], [s, s], [-s, s]];
      for (const [dx, dz] of C) batch.add(M.crane, bx([x + dx - 0.12, 0, z + dz - 0.12], [x + dx + 0.12, p.top, z + dz + 0.12]));
      for (let y = 0; y < p.top; y += 2.6) {
        for (let i = 0; i < 4; i++) {
          const [ax, az] = C[i], [bx2, bz] = C[(i + 1) % 4];
          batch.add(M.crane, rod([x + ax, y, z + az], [x + bx2, y, z + bz], 0.06, 5));
          batch.add(M.crane, rod([x + ax, y, z + az], [x + bx2, y + 2.6, z + bz], 0.05, 5));
        }
      }
      batch.add(M.craneDark, bx([x - 2, -0.5, z - 2], [x + 2, 0.6, z + 2]));
      batch.add(M.weight, bx([x - 3.2, 0, z - 3.2], [x + 3.2, 1.6, z + 3.2]));
    } else if (p.type === 'jib') {
      // Ausleger mit Laufkatze, Gegenausleger mit Gewicht, Führerhaus
      const [x, z] = p.pos, [tx, tz] = p.to, y = p.y;
      const d = [tx - x, tz - z], len = Math.hypot(...d), u = [d[0] / len, d[1] / len], n = [-u[1], u[0]];
      const P = (a, l, yy) => [x + u[0] * a + n[0] * l, yy, z + u[1] * a + n[1] * l];
      const w = 0.9;
      for (const l of [-w, w]) batch.add(M.crane, rod(P(-p.back, l, y), P(len, l, y), 0.1, 5));
      batch.add(M.crane, rod(P(-p.back, 0, y + 1.8), P(len, 0, y + 1.2), 0.09, 5));
      for (let a = -p.back; a < len; a += 2.4) {
        batch.add(M.crane, rod(P(a, -w, y), P(a, w, y), 0.05, 4));
        for (const l of [-w, w]) batch.add(M.crane, rod(P(a, l, y), P(a + 1.2, 0, y + 1.8 - 0.6 * Math.max(0, a) / len), 0.05, 4));
      }
      batch.add(M.crane, rod(P(0, 0, y + 1.8), P(0, 0, y + 8), 0.25, 6));
      for (const a of [len * 0.7, -p.back]) batch.add(M.chain, rod(P(0, 0, y + 8), P(a, 0, y + 1.5), 0.04, 4));
      const wc = P(-p.back + 2, 0, y);
      batch.add(M.weight, bx([wc[0] - 1.6, y - 2.8, wc[2] - 1.6], [wc[0] + 1.6, y, wc[2] + 1.6]));
      const cab = P(1.6, 1.8, y);
      batch.add(M.shuttle, bx([cab[0] - 1, y - 2.4, cab[2] - 1], [cab[0] + 1, y - 0.2, cab[2] + 1]));
      batch.add(M.glass, bx([cab[0] - 1.05, y - 1.6, cab[2] - 1.05], [cab[0] + 1.05, y - 0.7, cab[2] + 1.05]));
      const kat = P(len * 0.55, 0, y);
      batch.add(M.craneDark, bx([kat[0] - 0.8, y - 0.6, kat[2] - 0.8], [kat[0] + 0.8, y, kat[2] + 0.8]));
      batch.add(M.chain, bx([kat[0] - 0.03, y - 9, kat[2] - 0.03], [kat[0] + 0.03, y - 0.6, kat[2] + 0.03]));
      batch.add(M.crane, bx([kat[0] - 0.4, y - 9.6, kat[2] - 0.4], [kat[0] + 0.4, y - 9, kat[2] + 0.4]));
      // Warnleuchte ganz oben
      batch.add(M.lampRed || M.chuteRail, cyl(1, [x, y + 8.4, z], 0.2, 0.4, 8));
    } else if (p.type === 'scaffold') {
      // Baugerüst: Stangen, Riegel, Bretter
      const [x0, z0] = p.a, [x1, z1] = p.b, y = p.y;
      const len = Math.hypot(x1 - x0, z1 - z0), u = [(x1 - x0) / len, (z1 - z0) / len];
      for (let t = 0; t <= len; t += 2.5) for (const o of [0, -1.2]) {
        const px = x0 + u[0] * t - u[1] * o, pz = z0 + u[1] * t + u[0] * o;
        batch.add(M.vent, rod([px, y, pz], [px, y + 8, pz], 0.05, 5));
      }
      for (const yy of [y + 2, y + 4, y + 6, y + 8]) for (const o of [0, -1.2]) batch.add(M.vent, rod([x0 - u[1] * o, yy, z0 + u[0] * o], [x1 - u[1] * o, yy, z1 + u[0] * o], 0.04, 5));
      for (const yy of [y + 4, y + 8]) {
        const g = rod([x0 + u[1] * 0.6, yy + 0.03, z0 - u[0] * 0.6], [x1 + u[1] * 0.6, yy + 0.03, z1 - u[0] * 0.6], 0.6, 4);
        batch.add(M.pallet, g);
      }
    } else if (p.type === 'vent') {
      const [x, y, z] = p.pos;
      batch.add(M.vent, cyl(1, [x, y + 0.4, z], 0.35, 0.8, 14));
      batch.add(M.vent, cyl(1, [x, y + 0.9, z], 0.55, 0.15, 14, 0.4));
    }
  }
  batch.flush(scene);

  // Hof: Palettenstapel und Containerreihen als InstancedMesh (je ein Draw-Call)
  const rnd = mulberry(0xc0ffee);
  const keepOut = (x, z) => Math.abs(x) < 62 && Math.abs(z) < 62;
  const palletGeo = mergeGeometries([bx([-0.6, 0, -0.5], [0.6, 0.14, 0.5]).toNonIndexed()]);
  const loadGeo = bx([-0.55, 0.14, -0.45], [0.55, 1.2, 0.45]);
  const N = 140;
  const pal = new THREE.InstancedMesh(palletGeo, M.pallet, N);
  const load = new THREE.InstancedMesh(loadGeo, M.goods, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  let k = 0;
  while (k < N) {
    const a = rnd() * Math.PI * 2, r = 64 + rnd() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (keepOut(x, z)) continue;
    const stack = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < stack && k < N; j++, k++) {
      q.setFromAxisAngle(_up, Math.round(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.1);
      pos.set(x, j * 1.2, z);
      m4.compose(pos, q, s);
      pal.setMatrixAt(k, m4); load.setMatrixAt(k, m4);
    }
  }
  for (const m of [pal, load]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  const colors = [0xc0392b, 0x2c6fb7, 0x2f8f57, 0xd9822b, 0x7f8c8d, 0x8e44ad];
  const contGeo = bx([-3, 0, -1.22], [3, 2.6, 1.22]);
  const NC = 60;
  const cont = new THREE.InstancedMesh(contGeo, M.containerMat, NC);
  const col = new THREE.Color();
  for (let i = 0; i < NC; i++) {
    const row = i % 12, layer = Math.floor(i / 12) % 3, blk = Math.floor(i / 36);
    const x = -70 + row * 2.6 + blk * 40, z = 58 + blk * 6;
    q.setFromAxisAngle(_up, Math.PI / 2);
    pos.set(x, layer * 2.6, z + (layer % 2) * 0.1);
    m4.compose(pos, q, s);
    cont.setMatrixAt(i, m4);
    cont.setColorAt(i, col.setHex(colors[(i * 7) % colors.length]));
  }
  cont.castShadow = true; cont.receiveShadow = true;
  scene.add(cont);
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────── Wind: Schlieren, die mit der Böe stärker werden ─────────
export function buildWind(scene, level) {
  const out = [];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
    x.fillRect(Math.random() * 256, Math.random() * 64, 30 + Math.random() * 60, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  for (const z of level.zones) {
    if (!z.push) continue;
    const mat = new THREE.MeshBasicMaterial({ map: tex.clone(), transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, color: 0xe8f4ff });
    mat.map.needsUpdate = true;
    const along = Math.abs(z.push[0]) > Math.abs(z.push[2]) ? 0 : 2;
    const layers = [];
    for (let i = 0; i < 4; i++) {
      const w = z.max[0] - z.min[0], d = z.max[2] - z.min[2];
      const geo = new THREE.PlaneGeometry(along === 0 ? w : d, 0.9 + i * 0.3);
      const m = new THREE.Mesh(geo, mat);
      const lat = along === 0 ? 2 : 0;
      const p = [(z.min[0] + z.max[0]) / 2, z.min[1] + 1 + i * 0.8, (z.min[2] + z.max[2]) / 2];
      p[lat] = z.min[lat] + (z.max[lat] - z.min[lat]) * (0.2 + i * 0.2);
      m.position.set(...p);
      if (along === 2) m.rotation.y = Math.PI / 2;
      m.renderOrder = 6;
      scene.add(m);
      layers.push(m);
    }
    mat.map.repeat.set(1.5, 1);
    out.push({ z, mat, sign: Math.sign(along === 0 ? z.push[0] : z.push[2]) * (along === 0 ? 1 : -1) });
  }
  return out;
}

// ───────── Laser, Stacheln, Druckplatten, Rolltore ─────────
export function buildPuzzles(scene, level, M, tex) {
  const live = { lasers: [], spikes: [], plates: [], gates: [] };
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff9a40, toneMapped: false, transparent: true, opacity: 0.5 });
  const postMat = std({ color: 0x2a2d31, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false });
  const spikeMat = std({ color: 0xb8bec4, metalness: 0.9, roughness: 0.25 });
  const coneGeo = new THREE.ConeGeometry(0.11, 0.4, 6).translate(0, 0.2, 0);
  const iceGeo = new THREE.ConeGeometry(0.13, 0.5, 5).translate(0, 0.25, 0);
  const iceMat = std({ color: 0xd8f0ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85, emissive: 0x3a6a8a, emissiveIntensity: 0.35 });
  const acidMat = new THREE.MeshStandardMaterial({ color: 0x7dff3a, emissive: 0x4cff1a, emissiveIntensity: 0.9, transparent: true, opacity: 0.75, roughness: 0.2 });
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xc8ff8a, toneMapped: false, transparent: true, opacity: 0.85 });
  const bubbleGeo = new THREE.SphereGeometry(0.07, 6, 4);
  // Laserfarbe je Akt
  const beamMats = new Map();
  const beamOf = (c) => {
    if (c === undefined) return { beam: beamMat, lamp: lampMat };
    if (!beamMats.has(c)) beamMats.set(c, { beam: new THREE.MeshBasicMaterial({ color: c, toneMapped: false }), lamp: new THREE.MeshBasicMaterial({ color: c, toneMapped: false }) });
    return beamMats.get(c);
  };
  for (const z of level.hazards) {
    const g = new THREE.Group();
    const w = [z.max[0] - z.min[0], z.max[1] - z.min[1], z.max[2] - z.min[2]];
    if (z.kind === 'laser') {
      const lat = w[0] > w[2] ? 0 : 2; // lange Seite
      const beams = new THREE.Group(), warn = new THREE.Group();
      const bm = beamOf(z.color);
      if (z.arc) {
        // Lichtbogen der Oberleitung: Zickzack-Blitze zwischen den Masten
        for (let k = 0; k < 3; k++) {
          let prevP = null;
          const n = 9;
          for (let i = 0; i <= n; i++) {
            const p = [w[0] / 2, w[1] - 0.2 - (w[1] - 0.6) * (i / n) * (k === 1 ? 0.6 : 1), w[2] / 2];
            p[lat] = (i / n) * w[lat];
            if (i > 0 && i < n) { p[1] += ((i * 37 + k * 11) % 7 - 3) * 0.08; p[lat === 0 ? 2 : 0] += ((i * 13 + k * 5) % 5 - 2) * 0.04; }
            if (prevP) {
              const g2 = rod(prevP, p, 0.025, 4);
              beams.add(new THREE.Mesh(g2, bm.beam));
              warn.add(new THREE.Mesh(g2, warnMat));
            }
            prevP = p;
          }
        }
      } else for (let y = 0.15; y <= w[1] + 0.01; y += 0.35) {
        const s = [0.03, 0.03, 0.03]; s[lat] = w[lat];
        const geo = new THREE.BoxGeometry(...s);
        const pos = [w[0] / 2, y, w[2] / 2];
        const m = new THREE.Mesh(geo, bm.beam); m.position.set(...pos); beams.add(m);
        const m2 = new THREE.Mesh(geo, warnMat); m2.position.set(...pos); warn.add(m2);
      }
      g.add(beams, warn);
      for (const e of [0, 1]) {
        const p = [w[0] / 2, 0, w[2] / 2]; p[lat] = e * w[lat];
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, w[1] + 0.3, 0.16), postMat);
        post.position.set(p[0], (w[1] + 0.3) / 2, p[2]);
        post.castShadow = true;
        g.add(post);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), bm.lamp);
        lamp.position.set(p[0], w[1] + 0.35, p[2]);
        g.add(lamp);
      }
      live.lasers.push({ z, g, beams, warn });
    } else if (z.skin === 'acid') {
      // Säure: leuchtende Fläche, die im Takt aufsteigt und blubbert
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w[0], Math.max(0.06, w[1]), w[2]).translate(w[0] / 2, Math.max(0.06, w[1]) / 2, w[2] / 2), acidMat);
      g.add(slab);
      const bubbles = new THREE.Group();
      const nb = Math.max(3, Math.round(w[0] * w[2] * 1.2));
      for (let i = 0; i < nb; i++) {
        const m = new THREE.Mesh(bubbleGeo, bubbleMat);
        m.position.set(((i * 0.618) % 1) * w[0], w[1], ((i * 0.381 + 0.17) % 1) * w[2]);
        m.userData.ph = (i * 0.37) % 1;
        bubbles.add(m);
      }
      g.add(bubbles);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w[0] + 0.1, 0.03, w[2] + 0.1), M.hazard || postMat);
      rim.position.set(w[0] / 2, 0.01, w[2] / 2);
      g.add(rim);
      live.spikes.push({ z, g, inst: slab, bubbles, acid: true, h: w[1] });
    } else {
      const ice = z.skin === 'icicle';
      const step = ice ? 0.26 : 0.3;
      const nx = Math.max(1, Math.round(w[0] / step)), nz = Math.max(1, Math.round(w[2] / step));
      const inst = new THREE.InstancedMesh(ice ? iceGeo : coneGeo, ice ? iceMat : spikeMat, nx * nz);
      const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
      let i = 0;
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        if (ice) {
          // Eiszapfen: unregelmäßig hoch und leicht schief
          const r = ((a * 7 + b * 13) % 10) / 10;
          q4.setFromEuler(new THREE.Euler((r - 0.5) * 0.35, 0, (0.5 - ((a * 3 + b * 5) % 10) / 10) * 0.35));
          s4.set(1, 0.7 + r * 0.7, 1);
          p4.set((a + 0.5) * w[0] / nx, 0, (b + 0.5) * w[2] / nz);
          m4.compose(p4, q4, s4);
        } else m4.makeTranslation((a + 0.5) * w[0] / nx, 0, (b + 0.5) * w[2] / nz);
        inst.setMatrixAt(i++, m4);
      }
      inst.castShadow = true;
      g.add(inst);
      // Warnstreifen am Rand (Eis: Reifschicht)
      const base = new THREE.Mesh(new THREE.BoxGeometry(w[0], 0.03, w[2]), ice ? iceMat : (M.hazard || postMat));
      base.position.set(w[0] / 2, 0.015, w[2] / 2);
      g.add(base);
      live.spikes.push({ z, g, inst });
    }
    g.position.set(...z.min);
    scene.add(g);
  }
  for (const pl of level.plates) {
    const w = pl.max[0] - pl.min[0], d = pl.max[2] - pl.min[2];
    const mat = std({ map: tex.hazard, roughness: 0.6, emissive: 0x000000 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
    m.position.set((pl.min[0] + pl.max[0]) / 2, pl.min[1] + 0.04, (pl.min[2] + pl.max[2]) / 2);
    m.receiveShadow = true;
    scene.add(m);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.03, d + 0.12), postMat);
    ring.position.set(m.position.x, pl.min[1] + 0.015, m.position.z);
    scene.add(ring);
    live.plates.push({ pl, m, mat, y: m.position.y });
  }
  const doorMat = std({ map: tex.container, color: 0xa8b0b8, metalness: 0.5, roughness: 0.45 });
  for (const b of level.statics) {
    if (!b.gate) continue;
    const w = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const door = new THREE.Mesh(new THREE.BoxGeometry(w[0], w[1], w[2]).translate(0, -w[1] / 2, 0), doorMat);
    door.position.set((b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2);
    door.castShadow = door.receiveShadow = true;
    scene.add(door);
    const head = new THREE.Mesh(new THREE.BoxGeometry(w[0] + 0.2, 0.35, w[2] + 0.2), postMat);
    head.position.set(door.position.x, b.max[1] + 0.17, door.position.z);
    scene.add(head);
    live.gates.push({ b, door });
  }
  return live;
}

export function updatePuzzles(live, dt) {
  const blink = Math.sin(performance.now() / 70) > 0;
  for (const o of live.lasers) {
    const z = o.z;
    o.g.position.set(...z.cur.min);
    o.beams.visible = z.active;
    o.warn.visible = !z.active && z.warn && blink;
  }
  for (const o of live.spikes) {
    const z = o.z;
    o.g.position.set(...z.cur.min);
    const want = z.active ? 1 : z.warn ? 0.3 : 0.05;
    o.inst.scale.y += (want - o.inst.scale.y) * Math.min(1, dt * (o.acid ? 6 : 18));
    if (o.bubbles) {
      const t = performance.now() / 1000;
      o.bubbles.visible = o.inst.scale.y > 0.5;
      for (const b of o.bubbles.children) {
        const u = (t * 0.8 + b.userData.ph) % 1;
        b.position.y = o.h * o.inst.scale.y + u * 0.25;
        b.scale.setScalar(1 - u);
      }
    }
  }
  for (const o of live.plates) {
    o.m.position.y = o.y - (o.pl.down ? 0.04 : 0);
    o.mat.emissive.setHex(o.pl.active ? 0x1f8a3a : 0x000000);
  }
  for (const o of live.gates) {
    const t = o.b.openT || 0;
    o.door.scale.y = Math.max(0.03, 1 - t);
  }
}
