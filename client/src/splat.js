// Aufklatschen beim Absturz: Spritzer, umherfliegende Teile, ein hüpfender Helm
// und eine große Pfütze, die langsam verblasst. Absichtlich übertrieben und
// comichaft. Stil 'blut' (rot) oder 'farbe' (Farbklecks in Spielerfarbe).
import * as THREE from 'three';

const G = 26;
const LIFE = 14;      // so lange bleibt eine Pfütze (s), die letzten FADE s blendet sie aus
const FADE = 4;
const MAX = 6;        // gleichzeitig sichtbare Pfützen

const rnd = (a, b) => a + Math.random() * (b - a);

// Pfützen-Textur: unregelmäßiger Klecks aus Kreisen mit Ausläufern (einmal je Farbe)
const puddleTex = new Map();
function puddleTexture(key, base, dark) {
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
      // Spritzer-Ausläufer
      const d2 = S * (0.36 + 0.08 * Math.abs(Math.sin(i * 5.9)));
      blob(S / 2 + Math.cos(a) * d2, S / 2 + Math.sin(a) * d2, S * 0.022 + grow * 0.3, col);
    }
  };
  draw(dark, 3);   // dunkler Rand
  draw(base, 0);
  // Glanzlicht (nass)
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
    chunk: new THREE.BoxGeometry(0.16, 0.16, 0.16),
    puddle: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    helmet: (() => {
      const h = new THREE.SphereGeometry(0.23, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      return h;
    })(),
    brim: new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12),
  };
  return GEO;
}

export class Splats {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.order = 0;
  }

  // pos: Fußpunkt beim Aufprall, color: Westenfarbe (CSS), style: 'blut' | 'farbe', lite: weniger Teilchen
  spawn(pos, color, style, lite = false) {
    if (style !== 'blut' && style !== 'farbe') return;
    const G0 = geometries();
    const blood = style === 'blut';
    const base = blood ? '#8a0b0b' : color;
    const dark = blood ? '#4a0303' : new THREE.Color(color).multiplyScalar(0.55).getStyle();
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);
    this.scene.add(group);

    // Pfütze (wächst schnell auf ~5 m)
    const pm = new THREE.MeshStandardMaterial({
      map: puddleTexture(style + base, base, dark), transparent: true, roughness: 0.12, metalness: 0.1,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 - (this.order % 8),
    });
    const puddle = new THREE.Mesh(G0.puddle, pm);
    puddle.position.y = 0.025 + (this.order % 8) * 0.002;
    puddle.rotation.y = rnd(0, Math.PI * 2);
    puddle.scale.setScalar(0.01);
    puddle.receiveShadow = true;
    puddle.renderOrder = 1;
    group.add(puddle);
    this.order++;

    // Tropfen: Instanzen, fliegen in alle Richtungen und bleiben als Kleckse liegen
    const nd = lite ? 40 : 90;
    const dm = new THREE.MeshStandardMaterial({ color: base, roughness: 0.2, transparent: true });
    const drops = new THREE.InstancedMesh(G0.drop, dm, nd);
    drops.frustumCulled = false;
    const dd = [];
    for (let i = 0; i < nd; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(2, 10), up = rnd(2, 11);
      dd.push({ p: [rnd(-0.2, 0.2), rnd(0.1, 0.6), rnd(-0.2, 0.2)], v: [Math.cos(a) * s, up, Math.sin(a) * s], k: rnd(0.6, 1.8), stuck: false });
    }
    group.add(drops);

    // Teile: Westenfetzen, Hände, Stiefel – kippeln, hüpfen einmal, bleiben liegen
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

    const S = { group, puddle, pm, drops, dm, dd, chunks, cm, cd, helmet, hm, hv, hw: [rnd(-9, 9), rnd(-4, 4), rnd(-9, 9)], hb: 0, t: 0 };
    this.list.push(S);
    while (this.list.length > MAX) this.remove(this.list[0]);
    this.step(S, 0);
    return S;
  }

  remove(S) {
    this.scene.remove(S.group);
    S.drops.dispose(); S.chunks.dispose();
    for (const m of [S.pm, S.dm, S.cm, S.hm]) m.dispose();
    this.list.splice(this.list.indexOf(S), 1);
  }

  update(dt) {
    for (const S of [...this.list]) {
      S.t += dt;
      if (S.t > LIFE) { this.remove(S); continue; }
      this.step(S, Math.min(dt, 0.05));
    }
  }

  step(S, dt) {
    const t = S.t;
    // Pfütze breitet sich aus (schnell, dann langsam weiter), am Ende verblassen
    const grow = 1 - Math.exp(-t * 5);
    S.puddle.scale.setScalar(0.4 + 4.3 * grow + Math.min(t, 6) * 0.08);
    const fade = 1 - Math.max(0, (t - (LIFE - FADE)) / FADE);
    S.pm.opacity = 0.95 * fade;
    S.dm.opacity = fade; S.cm.opacity = fade; S.hm.opacity = fade;

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    // Tropfen
    S.dd.forEach((d, i) => {
      if (!d.stuck) {
        d.v[1] -= G * dt;
        for (let k = 0; k < 3; k++) d.p[k] += d.v[k] * dt;
        if (d.p[1] <= 0.03 && d.v[1] < 0) { d.p[1] = 0.03; d.stuck = true; }
      }
      const s = d.k;
      if (d.stuck) sv.set(s * 1.8, s * 0.15, s * 1.8); else { const sp = Math.min(2.2, 1 + Math.hypot(...d.v) * 0.08); sv.set(s, s * sp, s); }
      m.compose(pv.set(d.p[0], d.p[1], d.p[2]), q.identity(), sv);
      S.drops.setMatrixAt(i, m);
    });
    S.drops.instanceMatrix.needsUpdate = true;
    // Teile
    S.cd.forEach((c, i) => {
      if (!c.rest) {
        c.v[1] -= G * dt;
        for (let k = 0; k < 3; k++) { c.p[k] += c.v[k] * dt; c.r[k] += c.w[k] * dt; }
        const floor = 0.08 * c.sc;
        if (c.p[1] <= floor && c.v[1] < 0) {
          c.p[1] = floor;
          if (!c.bounced) { c.bounced = true; c.v[1] *= -0.35; c.v[0] *= 0.5; c.v[2] *= 0.5; for (let k = 0; k < 3; k++) c.w[k] *= 0.4; }
          else { c.rest = true; c.r[0] = 0; c.r[2] = 0; }
        }
      }
      e.set(c.r[0], c.r[1], c.r[2]);
      m.compose(pv.set(c.p[0], c.p[1], c.p[2]), q.setFromEuler(e), sv.set(c.sc, c.sc, c.sc));
      S.chunks.setMatrixAt(i, m);
    });
    S.chunks.instanceMatrix.needsUpdate = true;
    // Helm: hüpft zweimal, rollt dann aus und kippt auf die Seite
    const H = S.helmet;
    if (S.hb < 3) {
      S.hv[1] -= G * dt;
      H.position.x += S.hv[0] * dt; H.position.y += S.hv[1] * dt; H.position.z += S.hv[2] * dt;
      H.rotation.x += S.hw[0] * dt; H.rotation.y += S.hw[1] * dt; H.rotation.z += S.hw[2] * dt;
      if (H.position.y <= 0.12 && S.hv[1] < 0) {
        H.position.y = 0.12;
        S.hb++;
        S.hv[1] *= -0.45; S.hv[0] *= 0.7; S.hv[2] *= 0.7;
        for (let k = 0; k < 3; k++) S.hw[k] *= 0.5;
        if (S.hb >= 3) { H.rotation.x = 1.3; H.rotation.z = 0; }
      }
    }
  }
}
