// Aufklatschen beim Absturz: Spritzer, umherfliegende Teile, ein hüpfender Helm
// und eine große Lache. Absichtlich übertrieben und comichaft.
// Stil 'blut' (rot) oder 'farbe' (Farbklecks in Spielerfarbe).
//
// Die Lachen und die liegengebliebenen Spritzer bleiben dauerhaft (bis zu KEEP
// Stück, dann verschwindet die älteste). Damit das auf Handys und im Splitscreen
// billig bleibt, liegen alle Spritzer in EINEM Instanz-Mesh; jede Lache ist ein
// flaches Rechteck, das an den Rändern ihrer Plattform abgeschnitten wird.
import * as THREE from 'three';

const G = 26;
export const KEEP = 50;   // so viele Lachen bleiben liegen
const ND = 90;            // Tropfen je Aufprall (Handy: weniger)
const PARTS_LIFE = 10;    // Teile und Helm verschwinden nach dieser Zeit (s)

const rnd = (a, b) => a + Math.random() * (b - a);

// Lachen-Textur: unregelmäßiger Klecks aus Kreisen mit Ausläufern (einmal je Farbe)
const puddleTex = new Map();
function puddleTexture(base, dark) {
  const key = base + dark;
  if (puddleTex.has(key)) return puddleTex.get(key);
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const blob = (cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  const draw = (col, grow) => {
    blob(S / 2, S / 2, S * 0.26 + grow, col);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3;
      const d = S * (0.18 + 0.12 * Math.abs(Math.sin(i * 3.1)));
      blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.07 + 0.06 * Math.abs(Math.sin(i * 1.7))) + grow, col);
      const d2 = S * (0.36 + 0.08 * Math.abs(Math.sin(i * 5.9)));
      blob(S / 2 + Math.cos(a) * d2, S / 2 + Math.sin(a) * d2, S * 0.022 + grow * 0.3, col);
    }
  };
  draw(dark, 3);
  draw(base, 0);
  const g = x.createRadialGradient(S * 0.42, S * 0.4, 2, S * 0.42, S * 0.4, S * 0.2);
  g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  puddleTex.set(key, t);
  return t;
}

let GEO = null;
function geometries() {
  if (GEO) return GEO;
  GEO = {
    drop: new THREE.IcosahedronGeometry(0.07, 0),
    stain: new THREE.CircleGeometry(0.11, 7).rotateX(-Math.PI / 2),
    chunk: new THREE.BoxGeometry(0.16, 0.16, 0.16),
    puddle: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    helmet: new THREE.SphereGeometry(0.23, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    brim: new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12),
  };
  return GEO;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Splats {
  constructor(scene) {
    this.scene = scene;
    this.live = [];                 // fliegende Teile (vorübergehend)
    this.slots = new Array(KEEP).fill(null); // dauerhafte Lachen
    this.next = 0;
    const G0 = geometries();
    // Alle liegengebliebenen Spritzer: ein Draw-Call
    this.stains = new THREE.InstancedMesh(G0.stain, new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.05 }), KEEP * ND);
    this.stains.frustumCulled = false;
    this.stains.receiveShadow = true;
    for (let i = 0; i < KEEP * ND; i++) this.stains.setMatrixAt(i, ZERO);
    this.stains.setColorAt(0, new THREE.Color());
    this.stains.count = KEEP * ND;
    scene.add(this.stains);
  }

  // pos: Fußpunkt beim Aufprall, color: Westenfarbe (CSS), style: 'blut' | 'farbe',
  // area: Plattform [minX, maxX, minZ, maxZ] (null = großer Boden), lite: weniger Teilchen
  spawn(pos, color, style, area = null, lite = false) {
    if (style !== 'blut' && style !== 'farbe') return;
    const G0 = geometries();
    const blood = style === 'blut';
    const base = blood ? '#8a0b0b' : color;
    const dark = blood ? '#4a0303' : new THREE.Color(color).multiplyScalar(0.55).getStyle();

    // Platz für die neue Lache: die älteste fliegt raus
    const slot = this.next;
    this.next = (this.next + 1) % KEEP;
    this.clearSlot(slot);

    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);
    this.scene.add(group);
    // Plattformränder relativ zum Aufprallpunkt
    const box = area ? [area[0] - pos[0], area[1] - pos[0], area[2] - pos[2], area[3] - pos[2]] : null;
    const inside = (x, z) => !box || (x > box[0] && x < box[1] && z > box[2] && z < box[3]);

    // Lache: wächst schnell auf ~5 m, an den Plattformrändern abgeschnitten
    const clip = area ? [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -area[0]), new THREE.Plane(new THREE.Vector3(-1, 0, 0), area[1]),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -area[2]), new THREE.Plane(new THREE.Vector3(0, 0, -1), area[3]),
    ] : null;
    const pm = new THREE.MeshStandardMaterial({
      map: puddleTexture(base, dark), transparent: true, opacity: 0.95, roughness: 0.12, metalness: 0.1,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 - (slot % 8),
      clippingPlanes: clip,
    });
    const puddle = new THREE.Mesh(G0.puddle, pm);
    puddle.position.set(pos[0], pos[1] + 0.025 + (slot % 8) * 0.002, pos[2]);
    puddle.rotation.y = rnd(0, Math.PI * 2);
    puddle.scale.setScalar(0.01);
    puddle.receiveShadow = true;
    puddle.renderOrder = 1;
    this.scene.add(puddle);
    this.slots[slot] = { puddle, pm, t: 0 };

    // Tropfen: fliegen in alle Richtungen; wer auf der Plattform landet, bleibt als Klecks
    const nd = lite ? 40 : ND;
    const dm = new THREE.MeshStandardMaterial({ color: base, roughness: 0.2 });
    const drops = new THREE.InstancedMesh(G0.drop, dm, nd);
    drops.frustumCulled = false;
    const dd = [];
    for (let i = 0; i < nd; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(2, 10), up = rnd(2, 11);
      dd.push({ p: [rnd(-0.2, 0.2), rnd(0.1, 0.6), rnd(-0.2, 0.2)], v: [Math.cos(a) * s, up, Math.sin(a) * s], k: rnd(0.6, 1.8), done: false });
    }
    group.add(drops);

    // Teile: Westenfetzen, Hände, Stiefel – kippeln, hüpfen einmal, bleiben kurz liegen
    const parts = blood ? [[color, 6], ['#e0b48f', 3], ['#2b3442', 3], ['#8a0b0b', 4]] : [[color, 8], ['#f2c014', 4], [base, 4]];
    const nc = parts.reduce((n, p) => n + p[1], 0);
    const cm = new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true });
    const chunks = new THREE.InstancedMesh(G0.chunk, cm, nc);
    chunks.castShadow = true; chunks.frustumCulled = false;
    const cd = [];
    const col = new THREE.Color();
    let ci = 0;
    for (const [c, n] of parts) for (let i = 0; i < n; i++) {
      chunks.setColorAt(ci++, col.set(c));
      const a = rnd(0, Math.PI * 2), s = rnd(1.5, 6);
      cd.push({ p: [0, rnd(0.3, 1.2), 0], v: [Math.cos(a) * s, rnd(4, 10), Math.sin(a) * s], r: [rnd(0, 6), rnd(0, 6), rnd(0, 6)], w: [rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)], sc: rnd(0.6, 1.4), bounced: false, rest: false });
    }
    chunks.instanceColor.needsUpdate = true;
    group.add(chunks);

    // Der Helm fliegt hoch, scheppert und rollt aus
    const hm = new THREE.MeshStandardMaterial({ color: 0xf2c014, roughness: 0.4, transparent: true });
    const helmet = new THREE.Group();
    const h1 = new THREE.Mesh(G0.helmet, hm), h2 = new THREE.Mesh(G0.brim, hm);
    h1.castShadow = h2.castShadow = true;
    helmet.add(h1, h2);
    helmet.position.set(0, 1.6, 0);
    group.add(helmet);
    const ha = rnd(0, Math.PI * 2);
    const hv = [Math.cos(ha) * 2.5, 9, Math.sin(ha) * 2.5];

    const L = { group, slot, inside, color: new THREE.Color(base), drops, dm, dd, stuck: 0, chunks, cm, cd, helmet, hm, hv,
      hw: [rnd(-9, 9), rnd(-4, 4), rnd(-9, 9)], hb: 0, t: 0 };
    this.live.push(L);
    this.step(L, 0);
    return L;
  }

  // Alte Lache samt ihrer Spritzer entfernen
  clearSlot(slot) {
    const s = this.slots[slot];
    if (s) { this.scene.remove(s.puddle); s.pm.dispose(); this.slots[slot] = null; }
    for (let i = slot * ND; i < (slot + 1) * ND; i++) this.stains.setMatrixAt(i, ZERO);
    this.stains.instanceMatrix.needsUpdate = true;
    const L = this.live.find((l) => l.slot === slot);
    if (L) this.removeLive(L);
  }

  removeLive(L) {
    this.scene.remove(L.group);
    L.drops.dispose(); L.chunks.dispose();
    for (const m of [L.dm, L.cm, L.hm]) m.dispose();
    this.live.splice(this.live.indexOf(L), 1);
  }

  // Alle Lachen weg (z. B. neues Level)
  clear() {
    for (let i = 0; i < KEEP; i++) this.clearSlot(i);
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    // Lachen breiten sich aus, dann bleiben sie
    for (const s of this.slots) {
      if (!s || s.t > 8) continue;
      s.t += dt;
      const grow = 1 - Math.exp(-s.t * 5);
      s.puddle.scale.setScalar(0.4 + 4.3 * grow + Math.min(s.t, 6) * 0.08);
    }
    for (const L of [...this.live]) {
      L.t += dt;
      if (L.t > PARTS_LIFE) { this.removeLive(L); continue; }
      this.step(L, dt);
    }
  }

  step(L, dt) {
    const fade = 1 - Math.max(0, (L.t - (PARTS_LIFE - 2)) / 2);
    L.cm.opacity = fade; L.hm.opacity = fade;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    const gp = L.group.position;
    let stainDirty = false;
    // Tropfen
    L.dd.forEach((d, i) => {
      if (d.done) return;
      d.v[1] -= G * dt;
      for (let k = 0; k < 3; k++) d.p[k] += d.v[k] * dt;
      if (d.p[1] <= 0.03 && d.v[1] < 0 && d.p[1] > -0.3 && L.inside(d.p[0], d.p[2])) {
        // gelandet: als dauerhafter Klecks in das gemeinsame Mesh
        d.done = true;
        const s = d.k * rnd(1.2, 2.2);
        const idx = L.slot * ND + (L.stuck++ % ND);
        m.compose(pv.set(gp.x + d.p[0], gp.y + 0.03 + (L.stuck % 5) * 0.002, gp.z + d.p[2]), q.setFromAxisAngle(sv.set(0, 1, 0), rnd(0, 6.3)), sv.set(s, 1, s * rnd(0.6, 1)));
        this.stains.setMatrixAt(idx, m);
        this.stains.setColorAt(idx, L.color);
        stainDirty = true;
        L.drops.setMatrixAt(i, ZERO);
        return;
      }
      if (d.p[1] < -4) { d.done = true; L.drops.setMatrixAt(i, ZERO); return; } // über die Kante gefallen
      const sp = Math.min(2.2, 1 + Math.hypot(d.v[0], d.v[1], d.v[2]) * 0.08);
      m.compose(pv.set(d.p[0], d.p[1], d.p[2]), q.identity(), sv.set(d.k, d.k * sp, d.k));
      L.drops.setMatrixAt(i, m);
    });
    L.drops.instanceMatrix.needsUpdate = true;
    if (stainDirty) {
      this.stains.instanceMatrix.needsUpdate = true;
      if (this.stains.instanceColor) this.stains.instanceColor.needsUpdate = true;
    }
    // Teile
    L.cd.forEach((c, i) => {
      if (!c.rest) {
        c.v[1] -= G * dt;
        for (let k = 0; k < 3; k++) { c.p[k] += c.v[k] * dt; c.r[k] += c.w[k] * dt; }
        const floor = 0.08 * c.sc;
        if (c.p[1] <= floor && c.p[1] > -0.4 && c.v[1] < 0 && L.inside(c.p[0], c.p[2])) {
          c.p[1] = floor;
          if (!c.bounced) { c.bounced = true; c.v[1] *= -0.35; c.v[0] *= 0.5; c.v[2] *= 0.5; for (let k = 0; k < 3; k++) c.w[k] *= 0.4; }
          else { c.rest = true; c.r[0] = 0; c.r[2] = 0; }
        }
      }
      e.set(c.r[0], c.r[1], c.r[2]);
      m.compose(pv.set(c.p[0], c.p[1], c.p[2]), q.setFromEuler(e), sv.set(c.sc, c.sc, c.sc));
      L.chunks.setMatrixAt(i, m);
    });
    L.chunks.instanceMatrix.needsUpdate = true;
    // Helm: hüpft dreimal, rollt dann aus und kippt auf die Seite
    const H = L.helmet;
    if (L.hb < 3) {
      L.hv[1] -= G * dt;
      H.position.x += L.hv[0] * dt; H.position.y += L.hv[1] * dt; H.position.z += L.hv[2] * dt;
      H.rotation.x += L.hw[0] * dt; H.rotation.y += L.hw[1] * dt; H.rotation.z += L.hw[2] * dt;
      if (H.position.y <= 0.12 && H.position.y > -0.4 && L.hv[1] < 0 && L.inside(H.position.x, H.position.z)) {
        H.position.y = 0.12;
        L.hb++;
        L.hv[1] *= -0.45; L.hv[0] *= 0.7; L.hv[2] *= 0.7;
        for (let k = 0; k < 3; k++) L.hw[k] *= 0.5;
        if (L.hb >= 3) { H.rotation.x = 1.3; H.rotation.z = 0; }
      }
    }
  }
}
