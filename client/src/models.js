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
        batch.add(M.crane, bx([x - 0.45, 0, z - 0.45], [x + 0.45, y + 1.1, z + 0.45]));
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
export function updateHooks(live, body) {
  for (const o of live) {
    const P = o.h.cur;
    o.trolley.position.set(P[0], P[1] + 0.2, P[2]);
    let gx = P[0], gy = P[1] - o.h.len, gz = P[2];
    if (body && body.hook && body.hook.h === o.h) { gx = body.pos[0]; gy = body.pos[1] + 1.95; gz = body.pos[2]; }
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
      const depth = 1.1, h = p.height;
      const n = Math.max(1, Math.round(len / 2.7));
      const nx = -uz, nz = ux;
      for (let i = 0; i <= n; i++) {
        const cx = x0 + ux * (len * i / n), cz = z0 + uz * (len * i / n);
        for (const s of [0, 1]) {
          const px = cx + nx * depth * s, pz = cz + nz * depth * s;
          batch.add(M.rackUpright, bx([px - 0.05, 0, pz - 0.05], [px + 0.05, h, pz + 0.05]));
        }
      }
      for (let y = 1.8; y < h; y += 1.8) {
        for (const s of [0, 1]) {
          const ox = nx * depth * s, oz = nz * depth * s;
          batch.add(M.rackBeam, bx([Math.min(x0, x1) + ox - 0.05, y - 0.12, Math.min(z0, z1) + oz - 0.05], [Math.max(x0, x1) + ox + 0.05, y, Math.max(z0, z1) + oz + 0.05]));
        }
        for (let i = 0; i < n; i++) {
          if (((i * 7 + Math.round(y * 3)) % 5) === 0) continue; // ein paar Lücken
          const cx = x0 + ux * (len * (i + 0.5) / n) + nx * depth / 2, cz = z0 + uz * (len * (i + 0.5) / n) + nz * depth / 2;
          const w = 1.0, hh = 0.8 + ((i + y) % 3) * 0.2;
          batch.add(M.pallet, bx([cx - w, y, cz - 0.5], [cx + w, y + 0.14, cz + 0.5]));
          batch.add((i % 2) ? M.carton : M.goods, bx([cx - w + 0.08, y + 0.14, cz - 0.45], [cx + w - 0.08, y + 0.14 + hh, cz + 0.45]));
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
    } else if (p.type === 'vent') {
      const [x, y, z] = p.pos;
      batch.add(M.vent, cyl(1, [x, y + 0.4, z], 0.35, 0.8, 14));
      batch.add(M.vent, cyl(1, [x, y + 0.9, z], 0.55, 0.15, 14, 0.4));
    }
  }
  batch.flush(scene);

  // Hof: Palettenstapel und Containerreihen als InstancedMesh (je ein Draw-Call)
  const rnd = mulberry(0xc0ffee);
  const keepOut = (x, z) => Math.abs(x) < 46 && Math.abs(z) < 46;
  const palletGeo = mergeGeometries([bx([-0.6, 0, -0.5], [0.6, 0.14, 0.5]).toNonIndexed()]);
  const loadGeo = bx([-0.55, 0.14, -0.45], [0.55, 1.2, 0.45]);
  const N = 140;
  const pal = new THREE.InstancedMesh(palletGeo, M.pallet, N);
  const load = new THREE.InstancedMesh(loadGeo, M.goods, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  let k = 0;
  while (k < N) {
    const a = rnd() * Math.PI * 2, r = 48 + rnd() * 30;
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
