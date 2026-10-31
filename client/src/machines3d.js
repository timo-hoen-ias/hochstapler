// Grafik der Rätsel-Maschinen (aus Code gebaut): Gabelstapler, Laufkran, Turmkran,
// Kurbel-Aufzug, Draisine, Hebel, Notleitern und Klappleitern. Die Lage kommt jeden
// Frame aus der Maschinen-Logik (machines.js).
import * as THREE from 'three';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3, ...o });

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
// Box aus Weltgrenzen (relativ zu einem Ursprung)
function boxMM(min, max, o = [0, 0, 0]) {
  return box(max[0] - min[0], max[1] - min[1], max[2] - min[2], (min[0] + max[0]) / 2 - o[0], (min[1] + max[1]) / 2 - o[1], (min[2] + max[2]) / 2 - o[2]);
}
function mesh(g, m, parent) {
  const x = new THREE.Mesh(g, m);
  x.castShadow = true; x.receiveShadow = true;
  parent.add(x);
  return x;
}
// Stab zwischen zwei Punkten (für Seile/Streben)
const UP = new THREE.Vector3(0, 1, 0);
function rodBetween(obj, a, b) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const l = Math.max(0.01, d.length());
  obj.position.copy(va.add(vb).multiplyScalar(0.5));
  obj.quaternion.setFromUnitVectors(UP, d.normalize());
  obj.scale.set(1, l, 1);
}

export class MachineView {
  constructor(scene, mc, M) {
    this.scene = scene;
    this.mc = mc;
    this.M = {
      body: M.forkBody, dark: M.forkDark, tire: M.tire, glass: M.glass, crane: M.crane, craneDark: M.craneDark,
      chain: M.chain, ladder: M.ladder, pallet: M.pallet, machine: M.machine,
      deck: std({ color: 0x8a6a43, roughness: 0.85, metalness: 0.05 }),
      steel: std({ color: 0x6d7780, metalness: 0.75, roughness: 0.35 }),
      rail: std({ color: 0x4d4640, metalness: 0.8, roughness: 0.45 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xffa21a, toneMapped: false }),
      green: new THREE.MeshBasicMaterial({ color: 0x5dff5a, toneMapped: false }),
      red: new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }),
      mark: new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false, transparent: true, opacity: 0.75, depthWrite: false }),
      ice: std({ color: 0xd8f0ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85, emissive: 0x3a6a8a, emissiveIntensity: 0.35 }),
    };
    this.cable = new THREE.CylinderGeometry(0.025, 0.025, 1, 5);
    this.items = [];
    for (const m of mc.list) this.items.push(this.build(m));
    this.buildLevers();
    this.buildLadders();
    this.buildArenaDecor();
    this.markGeo = new THREE.RingGeometry(0.32, 0.45, 20).rotateX(-Math.PI / 2);
    this.marks = [];
  }

  build(m) {
    switch (m.type) {
      case 'forklift': return this.buildForklift(m);
      case 'crane': return m.def.kind === 'tower' ? this.buildTower(m) : this.buildBridge(m);
      case 'lift': return this.buildLift(m);
      case 'trolley': return this.buildTrolley(m);
    }
    return { m, update() {} };
  }

  // ───── Gabelstapler (lokal: +z = vorwärts, Ursprung = Mitte zwischen den Achsen) ─────
  buildForklift(m) {
    const M = this.M;
    const g = new THREE.Group();
    this.scene.add(g);
    mesh(box(1.4, 0.75, 2.2, 0, 0.7, -0.2), M.body, g); // Fahrgestell
    mesh(box(1.45, 0.95, 0.55, 0, 0.85, -1.15), M.dark, g); // Gegengewicht
    for (const x of [-0.62, 0.62]) for (const z of [-0.85, 0.55]) {
      const w = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 16).rotateZ(Math.PI / 2), M.tire, g);
      w.position.set(x, 0.3, z);
    }
    for (const [x, z] of [[-0.62, 0.45], [0.62, 0.45], [-0.62, -0.75], [0.62, -0.75]]) mesh(box(0.08, 1.2, 0.08, x, 1.65, z), M.dark, g); // Schutzdach-Stützen
    mesh(box(1.4, 0.07, 1.35, 0, 2.27, -0.15), M.dark, g); // Schutzdach
    mesh(box(0.6, 0.45, 0.5, 0, 1.3, -0.45), M.dark, g); // Sitz
    mesh(box(0.08, 0.6, 0.08, 0, 1.4, 0.25), M.dark, g); // Lenksäule
    mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 14).rotateX(Math.PI / 2.6), M.dark, g).position.set(0, 1.72, 0.2);
    const beacon = mesh(new THREE.SphereGeometry(0.09, 8, 6), M.lamp, g); beacon.position.set(0.5, 2.38, -0.6);
    // Hubmast: feste Außenschienen, innere wandern mit
    const outer = [-0.5, 0.5].map((x) => mesh(box(0.1, 2.5, 0.12, x, 1.35, 1.0), M.steel, g));
    const inner = new THREE.Group(); g.add(inner);
    for (const x of [-0.38, 0.38]) mesh(box(0.08, 2.5, 0.1, x, 1.25, 1.06), M.steel, inner);
    const carriage = new THREE.Group(); g.add(carriage);
    mesh(box(1.15, 0.5, 0.1, 0, 0.3, 1.1), M.dark, carriage); // Gabelträger
    for (const x of [-0.38, 0.38]) mesh(box(0.16, 0.08, 1.3, x, 0.06, 1.75), M.steel, carriage); // Zinken
    // Palette auf der Gabel: breite Trittfläche
    mesh(box(1.25, 0.06, 1.25, 0, 0.13, 1.75), M.pallet, carriage);
    const btn = mesh(box(0.18, 0.18, 0.1, 0.45, 0.5, 1.14), M.green, carriage); // Hubtaster (allein)
    void outer;
    const it = { m, g, inner, carriage, btn, beacon, t: 0 };
    it.update = (dt) => {
      const s = m.s;
      g.position.set(s.x, m.def.y, s.z);
      g.rotation.y = s.yaw;
      carriage.position.y = s.fork;
      inner.position.y = Math.max(0, s.fork - 1.2);
      btn.visible = this.mc.solo();
      it.t += dt;
      beacon.visible = m.driving || m.lifting ? Math.sin(it.t * 12) > 0 : false;
    };
    return it;
  }

  // ───── Laufkran: Brücke über dem Schacht, Katze, Plattform am Seil ─────
  buildBridge(m) {
    const M = this.M, D = m.def;
    const hs = D.size / 2;
    const yTop = D.range[2][1] + 4.5; // Kranbahn über der höchsten Plattformlage
    const g = new THREE.Group(); this.scene.add(g);
    // Kranbahn (zwei Schienen links und rechts), fest
    const A = D.U, B = D.W;
    const u0 = D.range[0][0] - hs - 0.5, u1 = D.range[0][1] + hs + 0.5;
    const wMax = D.range[1][1] + hs + 0.4;
    const at = (u, w) => [D.origin[0] + A[0] * u + B[0] * w, D.origin[1] + A[1] * u + B[1] * w];
    for (const sw of [-1, 1]) {
      const a = at(u0, sw * wMax), b = at(u1, sw * wMax);
      mesh(boxMM([Math.min(a[0], b[0]) - 0.2, yTop - 0.35, Math.min(a[1], b[1]) - 0.2], [Math.max(a[0], b[0]) + 0.2, yTop, Math.max(a[1], b[1]) + 0.2]), M.craneDark, this.scene);
    }
    // Brücke + Katze + Plattform bewegen sich
    const bridge = new THREE.Group(); this.scene.add(bridge);
    const span = 2 * wMax;
    const bridgeGeo = A[0] ? box(0.7, 0.6, span, 0, 0, 0) : box(span, 0.6, 0.7, 0, 0, 0);
    mesh(bridgeGeo, M.crane, bridge);
    const trolley = mesh(box(1.4, 0.6, 1.4), M.craneDark, this.scene);
    const deck = new THREE.Group(); this.scene.add(deck);
    mesh(box(D.size, 0.25, D.size, 0, -0.125, 0), M.deck, deck);
    // Geländer-Pfosten an den Ecken + gelber Rahmen
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.08, 1.0, 0.08, sx * (hs - 0.05), 0.5, sz * (hs - 0.05)), M.crane, deck);
    mesh(box(D.size, 0.06, 0.06, 0, 1.0, hs - 0.05), M.crane, deck);
    mesh(box(D.size, 0.06, 0.06, 0, 1.0, -hs + 0.05), M.crane, deck);
    // Steuerbirnen an den Bedienplätzen
    const pendants = [0, 1].map(() => mesh(box(0.16, 0.3, 0.12), M.lamp, this.scene));
    const cables = [0, 1, 2, 3].map(() => mesh(this.cable, M.chain, this.scene));
    void g;
    const it = { m };
    it.update = () => {
      const [cx, cz] = m.center();
      const bc = at(m.s.u, 0);
      bridge.position.set(bc[0], yTop + 0.3, bc[1]);
      trolley.position.set(cx, yTop - 0.15, cz);
      deck.position.set(cx, m.s.h, cz);
      let k = 0;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        rodBetween(cables[k++], [cx + sx * 0.5, yTop - 0.4, cz + sz * 0.5], [cx + sx * (hs - 0.1), m.s.h + 1.0, cz + sz * (hs - 0.1)]);
      }
      pendants.forEach((p, i) => { const q = m.stationPose(i).pos; p.position.set(q[0], q[1] + 1.25, q[2]); });
    };
    return it;
  }

  // ───── Turmkran: Ausleger dreht um den Mast, Katze fährt, Plattform hängt am Seil ─────
  buildTower(m) {
    const M = this.M, D = m.def;
    const hs = D.size / 2;
    const yJib = D.range[2][1] + 7;
    const slew = new THREE.Group(); this.scene.add(slew);
    slew.position.set(D.pivot[0], yJib, D.pivot[1]);
    // Ausleger zeigt entlang lokal +z (Winkel u → rotation.y = u)
    const L = D.range[1][1] + 2.5;
    mesh(box(0.9, 0.9, L, 0, 0, L / 2), M.crane, slew);
    mesh(box(0.9, 0.9, 5, 0, 0, -2.5), M.crane, slew); // Gegenausleger
    mesh(box(1.6, 1.2, 1.6, 0, -0.8, -4.2), M.machine, slew); // Gegengewicht
    mesh(box(1.4, 1.3, 1.4, 0.9, -0.9, 0.4), M.glass, slew); // Führerhaus
    mesh(box(0.25, 3.2, 0.25, 0, 1.6, 0), M.crane, slew); // Turmspitze
    const tie = mesh(this.cable, M.chain, slew); rodBetween(tie, [0, 3.2, 0], [0, 0.45, L - 0.5]);
    const tie2 = mesh(this.cable, M.chain, slew); rodBetween(tie2, [0, 3.2, 0], [0, 0.45, -4.6]);
    // Mast-Gitter über dem Kollisionsklotz bis zum Ausleger
    const mastTop = mesh(box(1.4, yJib - D.range[2][1] - 0.5, 1.4), M.crane, this.scene);
    mastTop.position.set(D.pivot[0], (yJib + D.range[2][1] + 0.5) / 2 + 0.25, D.pivot[1]);
    const trolley = mesh(box(1.0, 0.4, 1.2), M.craneDark, this.scene);
    const deck = new THREE.Group(); this.scene.add(deck);
    mesh(box(D.size, 0.25, D.size, 0, -0.125, 0), M.deck, deck);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.08, 1.0, 0.08, sx * (hs - 0.05), 0.5, sz * (hs - 0.05)), M.crane, deck);
    const pendants = [0, 1].map(() => mesh(box(0.16, 0.3, 0.12), M.lamp, this.scene));
    const cables = [0, 1, 2, 3].map(() => mesh(this.cable, M.chain, this.scene));
    const it = { m };
    it.update = () => {
      slew.rotation.y = m.s.u;
      const [cx, cz] = m.center();
      trolley.position.set(cx, yJib - 0.65, cz);
      deck.position.set(cx, m.s.h, cz);
      let k = 0;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) rodBetween(cables[k++], [cx + sx * 0.3, yJib - 0.8, cz + sz * 0.3], [cx + sx * (hs - 0.1), m.s.h + 1.0, cz + sz * (hs - 0.1)]);
      pendants.forEach((p, i) => { const q = m.stationPose(i).pos; p.position.set(q[0], q[1] + 1.25, q[2]); });
    };
    return it;
  }

  // ───── Kurbel-Aufzug: Korb im Schachtgerüst, zwei Handkurbeln ─────
  buildLift(m) {
    const M = this.M, D = m.def;
    const h = D.half;
    const [cx, cz] = D.center;
    // Schachtgerüst (fest): vier Eckpfosten und Kopfträger mit Umlenkrolle
    const y0 = D.yMin - 0.4, y1 = D.yMax + 3.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = mesh(box(0.16, y1 - y0, 0.16), M.steel, this.scene);
      p.position.set(cx + sx * (h + 0.15), (y0 + y1) / 2, cz + sz * (h + 0.15));
    }
    const head = mesh(box(2 * h + 0.5, 0.3, 2 * h + 0.5), M.craneDark, this.scene); head.position.set(cx, y1, cz);
    const wheel = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.15, 16).rotateX(Math.PI / 2), M.steel, this.scene); wheel.position.set(cx, y1 - 0.5, cz);
    const rope = mesh(this.cable, M.chain, this.scene);
    const cage = new THREE.Group(); this.scene.add(cage);
    mesh(box(2 * h, 0.3, 2 * h, 0, -0.15, 0), M.deck, cage);
    for (const r of D.rails) {
      const g = box(r[0] ? 0.1 : 2 * h, 1.05, r[0] ? 2 * h : 0.1, r[0] * (h - 0.06), 0.525, r[1] * (h - 0.06));
      mesh(g, M.crane, cage);
    }
    // Korbbügel oben
    mesh(box(0.12, 2.3, 0.12, 0, 1.15 + 1.0, 0), M.steel, cage);
    // Kurbeln an den Geländern
    const cranks = D.stations.map((st) => {
      const n = st.side;
      const grp = new THREE.Group();
      grp.position.set(n[0] * (h - 0.2), 1.0, n[1] * (h - 0.2));
      grp.rotation.y = Math.atan2(n[0], n[1]);
      cage.add(grp);
      const wheelC = new THREE.Group(); grp.add(wheelC);
      mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14).rotateX(Math.PI / 2), M.dark, wheelC);
      mesh(box(0.05, 0.05, 0.25, 0.22, 0, -0.12), M.lamp, wheelC);
      return wheelC;
    });
    const it = { m, t: 0 };
    it.update = (dt) => {
      cage.position.set(cx, m.s.y, cz);
      rodBetween(rope, [cx, y1 - 0.5, cz], [cx, m.s.y + 2.3, cz]);
      const v = m.s.v;
      for (const c of cranks) c.rotation.z += v * dt * 3;
      wheel.rotation.z -= v * dt * 2;
    };
    return it;
  }

  // ───── Draisine: Gleis mit Steigung, Wagen mit Pumpbalken ─────
  buildTrolley(m) {
    const M = this.M, D = m.def;
    const along = D.dir[0] ? 0 : 2;
    // Gleis: Schienen und Schwellen in Stücken, damit die Steigung sichtbar ist
    const seg = 1;
    for (let s = -1.5; s < D.len + 1.5; s += seg) {
      const ya = m.deckY(s) - 0.95, yb = m.deckY(s + seg) - 0.95;
      const mid = s + seg / 2;
      const cx = D.start[0] + D.dir[0] * mid, cz = D.start[1] + D.dir[1] * mid;
      for (const side of [-0.7, 0.7]) {
        const g = along === 0 ? box(seg + 0.02, 0.12, 0.1) : box(0.1, 0.12, seg + 0.02);
        const rl = mesh(g, M.rail, this.scene);
        rl.position.set(cx + (along === 0 ? 0 : side), (ya + yb) / 2, cz + (along === 0 ? side : 0));
        const ang = Math.atan2(yb - ya, seg);
        if (along === 0) rl.rotation.z = ang * Math.sign(D.dir[0]); else rl.rotation.x = -ang * Math.sign(D.dir[1]);
      }
      const sl = mesh(along === 0 ? box(0.25, 0.1, 1.9) : box(1.9, 0.1, 0.25), M.deck, this.scene);
      sl.position.set(cx, (ya + yb) / 2 - 0.1, cz);
      // Stahlträger der Brücke darunter
      const gb = mesh(along === 0 ? box(seg + 0.02, 0.5, 0.35) : box(0.35, 0.5, seg + 0.02), M.steel, this.scene);
      gb.position.set(cx, (ya + yb) / 2 - 0.45, cz);
    }
    // Oberleitung: Masten an der Lichtbogenstelle
    const car = new THREE.Group(); this.scene.add(car);
    const L = 3.0, Wd = 2.2;
    mesh(along === 0 ? box(L, 0.25, Wd, 0, -0.125, 0) : box(Wd, 0.25, L, 0, -0.125, 0), M.deck, car);
    mesh(along === 0 ? box(L, 0.5, Wd - 0.6, 0, -0.5, 0) : box(Wd - 0.6, 0.5, L, 0, -0.5, 0), M.dark, car);
    for (const a of [-0.9, 0.9]) for (const sd of [-0.7, 0.7]) {
      const w = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14).rotateX(along === 0 ? Math.PI / 2 : 0).rotateZ(along === 0 ? 0 : Math.PI / 2), M.tire, car);
      w.position.set(along === 0 ? a : sd, -0.7, along === 0 ? sd : a);
    }
    mesh(box(0.2, 1.0, 0.2, 0, 0.5, 0), M.crane, car); // Hebelbock
    const beam = new THREE.Group(); beam.position.y = 1.05; car.add(beam);
    mesh(along === 0 ? box(2.2, 0.1, 0.12) : box(0.12, 0.1, 2.2), M.crane, beam);
    for (const sg of [-1, 1]) mesh(along === 0 ? box(0.1, 0.1, 0.9, sg * 1.1, 0, 0) : box(0.9, 0.1, 0.1, 0, 0, sg * 1.1), M.dark, beam); // Griffe
    const it = { m, ang: 0 };
    it.update = (dt) => {
      const s = m.s.s;
      car.position.set(D.start[0] + D.dir[0] * s, m.deckY(s), D.start[1] + D.dir[1] * s);
      // Hebel: Griff A oben (ph = -1) ⇄ Griff B oben (ph = +1)
      const want = m.s.ph * 0.35;
      it.ang += (want - it.ang) * Math.min(1, dt * 10);
      const sgn = along === 0 ? Math.sign(D.dir[0]) : Math.sign(D.dir[1]);
      if (along === 0) beam.rotation.z = it.ang * sgn; else beam.rotation.x = -it.ang * sgn;
    };
    return it;
  }

  // ───── Hebel (Notleiter ablassen) ─────
  buildLevers() {
    const M = this.M;
    this.leverItems = this.mc.levers.map((l) => {
      const g = new THREE.Group();
      g.position.set(l.pos[0], l.pos[1], l.pos[2]);
      g.rotation.y = l.yaw || 0;
      this.scene.add(g);
      mesh(box(0.5, 0.7, 0.3, 0, 0.35, 0), M.craneDark, g);
      const arm = new THREE.Group(); arm.position.set(0, 0.7, 0); g.add(arm);
      mesh(box(0.06, 0.7, 0.06, 0, 0.35, 0), M.steel, arm);
      mesh(new THREE.SphereGeometry(0.08, 8, 6).translate(0, 0.72, 0), M.red, arm);
      return { l, arm };
    });
  }

  // ───── Notleitern (per Hebel) und Klappleitern (nur allein) ─────
  buildLadders() {
    const M = this.M;
    this.ladderItems = [];
    for (const l of this.mc.g.level.ladders) {
      if (!l.flag && !l.solo) continue;
      const g = new THREE.Group();
      this.scene.add(g);
      const [fx, fz] = l.face;
      const wallX = fx > 0 ? l.min[0] : fx < 0 ? l.max[0] : null;
      const wallZ = fz > 0 ? l.min[2] : fz < 0 ? l.max[2] : null;
      const y0 = l.min[1], y1 = l.max[1] + 0.9;
      const mat = l.solo ? M.steel : M.ladder;
      if (wallX !== null) {
        const x = wallX + fx * 0.14;
        for (const z of [l.min[2] + 0.06, l.max[2] - 0.06]) mesh(boxMM([x - 0.03, y0, z - 0.03], [x + 0.03, y1, z + 0.03]), mat, g);
        for (let y = y0 + 0.3; y < l.max[1]; y += 0.3) mesh(boxMM([x - 0.02, y - 0.02, l.min[2] + 0.06], [x + 0.02, y + 0.02, l.max[2] - 0.06]), mat, g);
      } else {
        const z = wallZ + fz * 0.14;
        for (const x of [l.min[0] + 0.06, l.max[0] - 0.06]) mesh(boxMM([x - 0.03, y0, z - 0.03], [x + 0.03, y1, z + 0.03]), mat, g);
        for (let y = y0 + 0.3; y < l.max[1]; y += 0.3) mesh(boxMM([l.min[0] + 0.06, y - 0.02, z - 0.02], [l.max[0] - 0.06, y + 0.02, z + 0.02]), mat, g);
      }
      // Notleiter: eingerollt oben als Rolle sichtbar
      let roll = null;
      if (l.flag) {
        roll = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 10).rotateZ(wallX !== null ? 0 : Math.PI / 2).rotateX(wallX !== null ? Math.PI / 2 : 0), M.ladder, this.scene);
        roll.position.set(wallX !== null ? wallX + fx * 0.25 : (l.min[0] + l.max[0]) / 2, l.max[1] + 0.1, wallZ !== null ? wallZ + fz * 0.25 : (l.min[2] + l.max[2]) / 2);
      }
      this.ladderItems.push({ l, g, roll, drop: 0 });
    }
  }

  // ───── Kleinkram: Eiszapfen unter der Eisdecke, Warnstreifen an Koop-Wänden ─────
  buildArenaDecor() {
    const M = this.M;
    const geo = new THREE.ConeGeometry(0.12, 0.6, 5).rotateX(Math.PI).translate(0, -0.3, 0);
    for (const b of this.mc.g.level.statics) {
      if (!b.icicles) continue;
      const n = Math.floor((b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) * 1.2);
      const inst = new THREE.InstancedMesh(geo, M.ice, n);
      const mtx = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const x = b.min[0] + ((i * 0.618) % 1) * (b.max[0] - b.min[0]);
        const z = b.min[2] + ((i * 0.381 + 0.5 * (i % 3)) % 1) * (b.max[2] - b.min[2]);
        const s = 0.6 + ((i * 0.737) % 1) * 0.9;
        mtx.makeScale(1, s, 1).setPosition(x, b.min[1], z);
        inst.setMatrixAt(i, mtx);
      }
      this.scene.add(inst);
    }
  }

  update(dt) {
    for (const it of this.items) it.update(dt);
    for (const lv of this.leverItems) {
      const on = this.mc.world.flags.has(lv.l.flag);
      const want = on ? -1.1 : 0.5;
      lv.arm.rotation.x += (want - lv.arm.rotation.x) * Math.min(1, dt * 8);
    }
    const solo = this.mc.solo();
    for (const li of this.ladderItems) {
      if (li.l.solo) { li.g.visible = solo; continue; }
      const on = this.mc.world.flags.has(li.l.flag);
      li.drop += ((on ? 1 : 0) - li.drop) * Math.min(1, dt * 3);
      li.g.visible = li.drop > 0.02;
      // Leiter rollt sich von oben ab
      const H = li.l.max[1] - li.l.min[1] + 0.9;
      li.g.scale.y = Math.max(0.02, li.drop);
      li.g.position.y = (li.l.max[1] + 0.9) * (1 - li.g.scale.y);
      if (li.roll) li.roll.visible = li.drop < 0.98;
      void H;
    }
    // Freie Bedienplätze leicht markieren
    let k = 0;
    for (const m of this.mc.list) {
      m.stations.forEach((st, i) => {
        if (m.occ[i] || !m.stationAllowed(i, solo)) return;
        const mk = this.marks[k] || (this.marks[k] = mesh(this.markGeo, this.M.mark, this.scene));
        const q = m.stationPose(i).pos;
        mk.visible = true;
        mk.position.set(q[0], q[1] + 0.03, q[2]);
        k++;
      });
    }
    for (; k < this.marks.length; k++) this.marks[k].visible = false;
  }
}
