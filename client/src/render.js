import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeTextures, textCanvas } from './textures.js';
import { settings, QUALITY, effectOn } from './settings.js';
import { fogUniforms, patchFogMaterials, AtmosPass } from './fx.js';
import { modelMaterials, buildShapes, buildLadders, buildHooks, updateHooks, forkliftGroup, buildScenery as buildYard, buildWind } from './models.js';

const CONTAINER_COLORS = [0xc0392b, 0x2c6fb7, 0x2f8f57, 0xd9822b];

// Box mit UVs in Weltmaßstab (Textur wiederholt sich alle `scale` Meter)
function boxGeo(min, max, scale) {
  const w = max[0] - min[0], h = max[1] - min[1], d = max[2] - min[2];
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  if (scale) {
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * dims[f][0] / scale, uv.getY(i) * dims[f][1] / scale);
      }
    }
  }
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
}

const UV_SCALE = {
  ground: 16, concrete: 2, goods: 1.2, crate: 0, carton: 0, beam: 1, upright: 1, grate: 1,
  belt: 1, hazard: 1, trailer: 0, goal: 0, lift: 1,
  ice: 2.4, tires: 1.6, bin: 0.8, drum: 0.9, timber: 1.6, wagon: 2.4, fan: 0, blink: 0, checkpoint: 0, roof: 0,
};

export class Renderer {
  constructor(container, level) {
    this.level = level;
    const s = settings.get();
    this.renderer = new THREE.WebGLRenderer({ antialias: s.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(s.fov, window.innerWidth / window.innerHeight, 0.1, 600);
    this.tex = makeTextures();
    this.mats = this.makeMaterials();
    this.mm = modelMaterials(this.tex, this.mats);
    for (const k of ['machine', 'pipe', 'duct']) this.mats[k] = this.mm[k];

    this.setupSky();
    this.setupLights();
    this.buildStatics();
    // Modelle aus models.js: Schrägen, Rohre, Leitern, Kräne, Kulisse
    this.spinners = buildShapes(this.scene, level, this.mm);
    buildLadders(this.scene, level, this.mm);
    this.hookLive = buildHooks(this.scene, level, this.mm);
    buildYard(this.scene, level, this.mm);
    this.windFx = buildWind(this.scene, level);
    this.buildMovers();
    this.buildDecor();
    this.buildSigns();
    this.buildScenery();
    this.buildGoal();
    this.buildHelpers();
    this.buildFans();
    this.buildCheckpoints();

    this.avatars = new Map();
    this.ropes = [];
    this.shake = 0;
    this.applyQuality();
    settings.onChange((cur, patch) => {
      if ('quality' in patch || 'godrays' in patch || 'dof' in patch) this.applyQuality();
      if ('fog' in patch) this.applyFog();
      if ('fov' in patch) { this.camera.fov = cur.fov; this.camera.updateProjectionMatrix(); }
    });
    window.addEventListener('resize', () => this.resize());
    // Mobile-Browser melden die neue Größe nach Drehung teils verspätet
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // Grafikqualität (Auflösung, Schatten, Post-Processing) live umschalten
  applyQuality() {
    const q = QUALITY[settings.get().quality] || QUALITY.medium;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    // Materialien müssen bei Schatten-Umschaltung neu kompiliert werden
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    this.blob.visible = !q.shadows;

    this.composer?.dispose();
    this.composer = null;
    this.atmos?.dispose();
    this.atmos = null;
    const godrays = effectOn('godrays'), dof = effectOn('dof');
    if (q.post || godrays || dof) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.antialias ? 4 : 0 });
      // Tiefe wird für Godrays (Himmelsmaske) und Tiefenunschärfe gebraucht
      if (godrays || dof) rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
      const c = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      if (godrays || dof) {
        // direkt nach dem RenderPass, damit readBuffer.depthTexture die Szenentiefe enthält
        this.atmos = new AtmosPass(this.camera, this.sunDir);
        this.atmos.configure({ godrays, dof, samples: q.grSamples });
        c.addPass(this.atmos);
      }
      if (q.ao) {
        const ao = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
        ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1 });
        ao.blendIntensity = 0.85;
        c.addPass(ao);
      }
      if (q.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.5, 0.88));
      c.addPass(new OutputPass());
      this.composer = c;
    }
    this.resize();
  }

  makeMaterials() {
    const t = this.tex;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, ...o });
    // Die Farbtexturen dienen gleichzeitig als Bump-Map: Fugen, Bretter und Gitter bekommen Tiefe
    const bump = (map, scale) => ({ map, bumpMap: map, bumpScale: scale });
    const m = {
      ground: std({ ...bump(t.ground, 1.2), roughness: 0.92 }),
      concrete: std({ ...bump(t.concrete, 1.5) }),
      goods: std({ ...bump(t.goods, 2), roughness: 0.6 }),
      crate: std({ ...bump(t.crate, 3) }),
      carton: std({ ...bump(t.carton, 1.5), roughness: 0.9 }),
      beam: std({ map: t.beam, metalness: 0.55, roughness: 0.42 }),
      upright: std({ map: t.upright, metalness: 0.55, roughness: 0.42 }),
      grate: std({ ...bump(t.grate, 2.5), metalness: 0.7, roughness: 0.45 }),
      hazard: std({ map: t.hazard }),
      lift: std({ map: t.hazard }),
      trailer: std({ map: t.trailer, roughness: 0.5 }),
      goal: std({ map: t.goal }),
      roof: std({ map: t.roof }),
      ice: std({ map: t.ice, roughness: 0.15, metalness: 0.1 }),
      tires: std({ map: t.tires, roughness: 0.95 }),
      bin: std({ map: t.bin, roughness: 0.5 }),
      drum: std({ map: t.drum, roughness: 0.5, metalness: 0.3 }),
      timber: std({ map: t.timber }),
      wagon: std({ map: t.wagon, metalness: 0.3 }),
      fan: std({ map: t.fan, metalness: 0.4, roughness: 0.5 }),
      checkpoint: std({ map: t.checkpoint }),
    };
    CONTAINER_COLORS.forEach((c, i) => {
      m['container' + i] = std({ ...bump(t.container, 3), color: c, metalness: 0.45, roughness: 0.5 });
    });
    return m;
  }

  setupSky() {
    // Abendhimmel als Equirect-Textur (Verlauf + Sonnenglühen). Dient auch als
    // Umgebungsbeleuchtung (IBL), damit Metall und Container Reflexe bekommen.
    const elevation = 16, azimuth = -122;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
    const W = 1024, H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1f2050');
    g.addColorStop(0.22, '#4a3f84');
    g.addColorStop(0.38, '#8c6fa6');
    g.addColorStop(0.47, '#e79a7a');
    g.addColorStop(0.5, '#fbc98c');
    g.addColorStop(0.53, '#c9967c');
    g.addColorStop(1, '#3d3836');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // Sonne + Glühen (mit horizontalem Umlauf)
    const d = this.sunDir;
    const su = (Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5) * W;
    const sv = (1 - (Math.asin(d.y) / Math.PI + 0.5)) * H;
    for (const ox of [-W, 0, W]) {
      const glow = x.createRadialGradient(su + ox, sv, 0, su + ox, sv, 260);
      glow.addColorStop(0, 'rgba(255,236,190,0.95)');
      glow.addColorStop(0.05, 'rgba(255,214,150,0.8)');
      glow.addColorStop(0.25, 'rgba(255,170,110,0.35)');
      glow.addColorStop(1, 'rgba(255,140,100,0)');
      x.fillStyle = glow;
      x.fillRect(su + ox - 260, sv - 260, 520, 520);
      x.fillStyle = '#fff6e0';
      x.beginPath(); x.ellipse(su + ox, sv, 9, 9, 0, 0, Math.PI * 2); x.fill();
    }
    // ein paar zarte Wolkenbänder
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) {
      const cy = H * (0.3 + rnd() * 0.17), cx = rnd() * W, w = 60 + rnd() * 180;
      x.fillStyle = `rgba(255,${180 + rnd() * 50},${150 + rnd() * 40},${0.06 + rnd() * 0.08})`;
      x.beginPath(); x.ellipse(cx, cy, w, 3 + rnd() * 6, 0, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = t;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(t).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();

    this.scene.fog = new THREE.Fog(0xe8b48a, 70, 300);
    this.applyFog();
  }

  // Distanznebel-Stärke aus den Optionen
  applyFog() {
    const f = { light: [110, 420], normal: [70, 340], dense: [25, 170] }[settings.get().fog] || [70, 340];
    this.scene.fog.near = f[0];
    this.scene.fog.far = f[1];
  }

  // Höhennebel folgt dem Spieler: Unter dir verschwindet die Tiefe im Dunst
  updateFog(dt, focus) {
    const u = fogUniforms;
    this.camera.updateMatrixWorld();
    u.fxCamWorld.value.copy(this.camera.matrixWorld);
    const target = focus[1] - 14;
    this.fogBase = this.fogBase === undefined ? target : this.fogBase + (target - this.fogBase) * Math.min(1, dt * 0.8);
    u.fxHeight.value.set(settings.get().heightFog ? 0.012 : 0, 0.06, this.fogBase);
    u.fxHeightColor.value.copy(this.scene.fog.color).lerp(new THREE.Color(0xc4cbe6), 0.45);
    u.fxSunDir.value.copy(this.sunDir);
    u.fxSunColor.value.setRGB(0.4, 0.24, 0.1);
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd2ff, 0x5a4636, 0.75);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffc890, 3.2);
    // etwas steiler als die sichtbare Sonne, damit die Türme nicht komplett im Schatten liegen
    this.sunOffset = new THREE.Vector3(this.sunDir.x, Math.max(this.sunDir.y, 0.55), this.sunDir.z).normalize().multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.near = 1; s.far = 200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    // Warmes Gegenlicht für Konturen
    const rim = new THREE.DirectionalLight(0x8fa8ff, 0.5);
    rim.position.set(30, 20, -40);
    this.scene.add(rim);
  }

  // Landepunkt-Markierung, Blob-Schatten (wenn Schatten aus) und Staub
  buildHelpers() {
    const ringTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      return t;
    })();
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, fog: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 2;
    this.scene.add(blob);
    this.blob = blob;

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.3, 28),
      new THREE.MeshBasicMaterial({ color: 0xf2c014, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.renderOrder = 3;
    this.scene.add(marker);
    this.marker = marker;

    // Schwebender Hallenstaub im Gegenlicht
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // Höchste Oberfläche unter einem Punkt (für Landemarker)
  groundBelow(colliders, p) {
    let best = -Infinity;
    for (const b of colliders.all) {
      if (p[0] > b.min[0] && p[0] < b.max[0] && p[2] > b.min[2] && p[2] < b.max[2] && b.max[1] <= p[1] + 0.05 && b.max[1] > best) best = b.max[1];
    }
    return best;
  }

  buildStatics() {
    const groups = {};
    for (const b of this.level.statics) {
      const key = b.belt || b.blink || b.big || b.ramp || b.round ? null : b.mat;
      if (!key) continue;
      const scale = b.mat.startsWith('container') ? 2.4 : UV_SCALE[b.mat] ?? 1;
      (groups[key] ||= []).push(boxGeo(b.min, b.max, scale));
    }
    for (const b of this.level.statics) if (b.big) (groups.ground ||= []).push(boxGeo(b.min, b.max, UV_SCALE.ground));
    for (const [mat, geos] of Object.entries(groups)) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), this.mats[mat] || this.mats.concrete);
      mesh.castShadow = mat !== 'ground';
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    // Kippschalen: einzeln, weil sie verschwinden
    this.blinkMeshes = [];
    for (const b of this.level.statics) {
      if (!b.blink) continue;
      const mat = new THREE.MeshStandardMaterial({ map: this.tex.blink, roughness: 0.6, emissive: 0xff2a00, emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(boxGeo(b.min, b.max, 0), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.blinkMeshes.push({ b, mesh, mat });
    }
    // Förderbänder einzeln (eigene, laufende Textur)
    this.belts = [];
    for (const b of this.level.statics) {
      if (!b.belt || b.round) continue;
      const t = this.tex.belt.clone();
      t.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
      const mesh = new THREE.Mesh(boxGeo(b.min, b.max, 1), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.belts.push({ tex: t, v: b.belt });
      // Rollenrahmen
      this.addDecorBox([b.min[0] - 0.05, b.min[1] - 0.3, b.min[2] - 0.05], [b.max[0] + 0.05, b.min[1], b.max[2] + 0.05], this.mats.upright);
    }
  }

  addDecorBox(min, max, mat) {
    const mesh = new THREE.Mesh(boxGeo(min, max, 1), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  buildMovers() {
    this.moverMeshes = [];
    for (const m of this.level.movers) {
      const g = new THREE.Group();
      const b = m.base;
      const local = (min, max) => boxGeo(
        [min[0] - b.min[0], min[1] - b.min[1], min[2] - b.min[2]],
        [max[0] - b.min[0], max[1] - b.min[1], max[2] - b.min[2]], 1);
      const mat = m.mat === 'crate' ? this.mats.crate : m.mat === 'wagon' ? this.mats.wagon : this.mats.lift;
      const body = new THREE.Mesh(local(b.min, b.max), mat);
      body.castShadow = body.receiveShadow = true;
      g.add(body);

      if (m.model === 'forklift' || m.model === 'shuttle') {
        const [sx, sz] = m.side;
        const cx = (b.max[0] - b.min[0]) / 2, cz = (b.max[2] - b.min[2]) / 2;
        const hw = Math.abs(sx) ? cx : cz;
        if (m.model === 'forklift') {
          const fl = forkliftGroup(this.mm, m.side, m.kind);
          fl.rotation.y = Math.atan2(-sz, sx);
          // Gabeln unter der Plattform
          for (const o of [-0.45, 0.45]) {
            const tine = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(sx) ? 1.9 : 0.12, 0.06, Math.abs(sx) ? 0.12 : 1.9), this.mm.forkDark);
            tine.position.set(cx + (Math.abs(sz) ? o : 0), -0.04, cz + (Math.abs(sx) ? o : 0));
            g.add(tine);
          }
          if (m.kind === 'lift') {
            fl.position.set(b.min[0] + cx + sx * (hw + 0.35), b.min[1] - (b.min[1] > 0.5 ? 0 : 0), b.min[2] + cz + sz * (hw + 0.35));
            fl.position.y = b.min[1] - 0.3;
            this.scene.add(fl);
          } else {
            fl.position.set(cx + sx * (hw + 0.1), -0.3, cz + sz * (hw + 0.1));
            g.add(fl);
          }
        } else {
          const sh = new THREE.Mesh(new THREE.BoxGeometry(b.max[0] - b.min[0] - 0.2, 0.35, b.max[2] - b.min[2] - 0.2), this.mm.shuttle);
          sh.position.set(cx, -0.17, cz);
          sh.castShadow = true;
          g.add(sh);
        }
      }
      if (m.kind === 'lift') {
        // Gabelstapler-Mast neben der Plattform
        const [sx, sz] = m.side;
        const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
        const hw = Math.abs(sx) ? (b.max[0] - b.min[0]) / 2 : (b.max[2] - b.min[2]) / 2;
        const mx = cx + sx * (hw + 0.25), mz = cz + sz * (hw + 0.25);
        const top = b.max[1] + m.delta[1] + 2.2;
        const offs = [-0.7, 0.7];
        for (const o of offs) {
          const px = mx + (sz ? o : 0), pz = mz + (sx ? o : 0);
          this.addDecorBox([px - 0.09, b.min[1] - 0.2, pz - 0.09], [px + 0.09, top, pz + 0.09], this.mats.hazard);
        }
        const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c014, roughness: 0.5 });
        this.addDecorBox(
          [Math.min(mx - (sz ? 0.8 : 0.1), mx + (sz ? 0.8 : 0.1)), top - 0.15, Math.min(mz - (sx ? 0.8 : 0.1), mz + (sx ? 0.8 : 0.1))],
          [Math.max(mx - (sz ? 0.8 : 0.1), mx + (sz ? 0.8 : 0.1)), top, Math.max(mz - (sx ? 0.8 : 0.1), mz + (sx ? 0.8 : 0.1))], yellow);
      }
      if (m.kind === 'swing') {
        // Kranseil: Linie vom Ausleger zum Haken
        const lg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x222222 }));
        line.frustumCulled = false;
        this.scene.add(line);
        const cx = (b.min[0] + b.max[0]) / 2 + m.delta[0] / 2;
        const cz = (b.min[2] + b.max[2]) / 2 + m.delta[2] / 2;
        const pivotY = b.max[1] + 9;
        m._pivot = [cx, pivotY, cz];
        m._line = line;
        // Kranausleger
        const ex = Math.abs(m.delta[0]) / 2 + 3, ez = Math.abs(m.delta[2]) / 2 + 3;
        const craneMat = new THREE.MeshStandardMaterial({ color: 0xf2c014, roughness: 0.5, metalness: 0.3 });
        this.addDecorBox([cx - (m.delta[0] ? ex : 0.4), pivotY, cz - (m.delta[2] ? ez : 0.4)], [cx + (m.delta[0] ? ex : 0.4), pivotY + 0.8, cz + (m.delta[2] ? ez : 0.4)], craneMat);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 }));
        hook.position.set((b.max[0] - b.min[0]) / 2, b.max[1] - b.min[1] + 0.35, (b.max[2] - b.min[2]) / 2);
        g.add(hook);
      }
      g.position.set(b.min[0], b.min[1], b.min[2]);
      this.scene.add(g);
      this.moverMeshes.push({ m, g });
    }
  }

  buildDecor() {
    const groups = {};
    for (const d of this.level.decor) (groups[d.mat] ||= []).push(boxGeo(d.min, d.max, 1));
    for (const [mat, geos] of Object.entries(groups)) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), this.mats[mat]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  buildSigns() {
    for (const s of this.level.signs) {
      const t = textCanvas([s.text, s.sub]);
      const mat = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.1), mat);
      mesh.position.set(...s.pos);
      mesh.rotation.y = Math.atan2(s.face[0], s.face[1]);
      this.scene.add(mesh);
      const post = this.addDecorBox([s.pos[0] - 0.06, s.pos[1] - 2.6, s.pos[2] - 0.06], [s.pos[0] + 0.06, s.pos[1] - 0.55, s.pos[2] + 0.06], this.mats.upright);
      post.castShadow = false;
    }
  }

  buildScenery() {
    // Umliegende Lagerhallen, LKW und Lichtmasten – nur Kulisse
    const hallMat = new THREE.MeshStandardMaterial({ color: 0x8d98a6, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4e5866, roughness: 0.7 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c3540 });
    const halls = [
      [-110, -40, 70, 18, 40], [-100, 60, 50, 14, 60], [100, -70, 60, 22, 50],
      [110, 40, 40, 16, 70], [0, -130, 120, 20, 30], [20, 120, 80, 15, 30],
    ];
    for (const [x, z, w, h, d] of halls) {
      this.addDecorBox([x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2], hallMat);
      this.addDecorBox([x - w / 2 - 0.5, h, z - d / 2 - 0.5], [x + w / 2 + 0.5, h + 1.2, z + d / 2 + 0.5], roofMat);
      for (let i = -w / 2 + 6; i < w / 2 - 4; i += 9) {
        this.addDecorBox([x + i, 0, z + d / 2], [x + i + 5, 6, z + d / 2 + 0.2], doorMat);
      }
    }
    // Asphalt um den Hof
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 1 }));
    asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = -0.05; asphalt.receiveShadow = true;
    this.scene.add(asphalt);
    // Lichtmasten
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x555b62, metalness: 0.6, roughness: 0.4 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 4 });
    for (let a = 0; a < 8; a++) {
      const r = 62, x = Math.cos(a / 8 * Math.PI * 2) * r, z = Math.sin(a / 8 * Math.PI * 2) * r;
      this.addDecorBox([x - 0.2, 0, z - 0.2], [x + 0.2, 18, z + 0.2], poleMat);
      this.addDecorBox([x - 0.8, 18, z - 0.5], [x + 0.8, 18.5, z + 0.5], lampMat);
    }
  }

  buildGoal() {
    const g = this.level.goal;
    const cx = (g.min[0] + g.max[0]) / 2, cz = (g.min[2] + g.max[2]) / 2;
    const y = g.min[1];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6 }));
    pole.position.set(cx + 2.5, y + 2.5, cz + 2.5);
    this.scene.add(pole);
    const flagT = textCanvas(['ZUGESTELLT ✓'], { w: 256, h: 128, size: 30, bg: '#d2461f' });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: flagT, side: THREE.DoubleSide }));
    flag.position.set(cx + 2.5 + 0.9, y + 4.4, cz + 2.5);
    this.scene.add(flag);
    this.flag = flag;
    // Riesiges Paket als Wahrzeichen
    const pkg = this.addDecorBox([cx - 1.2, y, cz - 2.8], [cx + 1.2, y + 2.4, cz - 0.4], this.mats.carton);
    pkg.castShadow = true;
    // Leuchtfeuer
    const beacon = new THREE.PointLight(0xffb36b, 30, 25);
    beacon.position.set(cx, y + 4, cz);
    this.scene.add(beacon);
  }

  buildFans() {
    // Aufwind als halbtransparente Säule mit nach oben laufenden Streifen
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`;
      x.fillRect(Math.random() * 64, Math.random() * 256, 2, 20 + Math.random() * 40);
    }
    this.windTex = new THREE.CanvasTexture(c);
    this.windTex.wrapS = this.windTex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: this.windTex, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, color: 0xcfe8ff });
    this.fanBlades = [];
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c6, metalness: 0.7, roughness: 0.3 });
    for (const z of this.level.zones) {
      if (z.push) continue;
      const geo = boxGeo(z.min, z.max, 0);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 5;
      this.scene.add(m);
      const r = Math.min(z.max[0] - z.min[0], z.max[2] - z.min[2]) / 2 - 0.15;
      const blades = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.04, 0.3), bladeMat);
        bl.rotation.y = k * Math.PI / 4;
        blades.add(bl);
      }
      blades.position.set((z.min[0] + z.max[0]) / 2, z.min[1] + 0.05, (z.min[2] + z.max[2]) / 2);
      this.scene.add(blades);
      this.fanBlades.push(blades);
    }
  }

  buildCheckpoints() {
    // Lampe an jedem Zwischenstopp: rot = noch nicht erreicht, grün = gespeichert
    this.cpOff = new THREE.MeshStandardMaterial({ color: 0x5a1e14, emissive: 0xc0331c, emissiveIntensity: 0.6 });
    this.cpOn = new THREE.MeshStandardMaterial({ color: 0x1f5a2a, emissive: 0x3dff6a, emissiveIntensity: 1.4 });
    const poleMat = this.mats.upright;
    this.cpLamps = [];
    for (const cp of this.level.checkpoints) {
      if (!cp.box) { this.cpLamps.push(null); continue; }
      const b = cp.box;
      const x = b.max[0] - 0.12, z = b.max[2] - 0.12, y = b.max[1];
      const pole = this.addDecorBox([x - 0.05, y, z - 0.05], [x + 0.05, y + 2.4, z + 0.05], poleMat);
      pole.castShadow = false;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), this.cpOff);
      lamp.position.set(x, y + 2.55, z);
      this.scene.add(lamp);
      this.cpLamps.push(lamp);
    }
    this.cpReached = -1;
  }

  setCheckpointReached(i) {
    if (i === this.cpReached) return;
    this.cpReached = i;
    this.cpLamps.forEach((l, k) => { if (l) l.material = k <= i ? this.cpOn : this.cpOff; });
  }

  // ───────── Spielfiguren ─────────
  createAvatar(id, name, color) {
    const g = new THREE.Group();
    const vestMat = new THREE.MeshStandardMaterial({ map: this.tex.vest(color), roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.7 });
    const hat = new THREE.MeshStandardMaterial({ color: 0xf2c014, roughness: 0.4 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), vestMat);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.position.y = 1.62;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat);
    helmet.position.y = 1.68;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 16), hat);
    brim.position.y = 1.68;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    visor.position.set(0, 1.62, 0.18);

    const limb = (w, h, mat) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      m.position.y = -h / 2;
      m.castShadow = true;
      pivot.add(m);
      return pivot;
    };
    const legL = limb(0.2, 0.75, dark); legL.position.set(-0.14, 0.75, 0);
    const legR = limb(0.2, 0.75, dark); legR.position.set(0.14, 0.75, 0);
    const armL = limb(0.15, 0.6, vestMat); armL.position.set(-0.36, 1.36, 0);
    const armR = limb(0.15, 0.6, vestMat); armR.position.set(0.36, 1.36, 0);
    // Gurt / Karabiner, an dem das Seil hängt
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 16), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.8;

    for (const m of [torso, head, helmet, brim, visor, belt]) { m.castShadow = true; g.add(m); }
    g.add(legL, legR, armL, armR);

    const tag = this.makeTag(name, color);
    tag.position.y = 2.25;
    g.add(tag);

    this.scene.add(g);
    const av = { g, legL, legR, armL, armR, torso, tag, phase: 0, color };
    this.avatars.set(id, av);
    return av;
  }

  makeTag(name, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(15,20,30,0.7)';
    x.beginPath(); x.roundRect(4, 8, 248, 48, 14); x.fill();
    x.fillStyle = color; x.fillRect(16, 22, 18, 18);
    x.fillStyle = '#fff'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center';
    x.fillText(name, 140, 42);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    s.scale.set(1.6, 0.4, 1);
    s.renderOrder = 10;
    return s;
  }

  removeAvatar(id) {
    const av = this.avatars.get(id);
    if (!av) return;
    this.scene.remove(av.g);
    this.avatars.delete(id);
  }

  updateAvatar(id, pos, vel, yaw, grounded, braced, dt, isLocal) {
    const av = this.avatars.get(id);
    if (!av) return;
    av.g.position.set(pos[0], pos[1], pos[2]);
    // weiche Drehung
    let dy = yaw - av.g.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    av.g.rotation.y += dy * Math.min(1, dt * 12);
    const speed = Math.hypot(vel[0], vel[2]);
    if (grounded) {
      av.phase += dt * speed * 2.2;
      const s = Math.sin(av.phase) * Math.min(1, speed / 4) * 0.8;
      av.legL.rotation.x = s; av.legR.rotation.x = -s;
      av.armL.rotation.x = -s; av.armR.rotation.x = s;
      av.armL.rotation.z = 0; av.armR.rotation.z = 0;
    } else if (braced) {
      // hängt an Kante, Haken oder Leiter: Arme nach oben
      av.phase += dt * 6;
      av.armL.rotation.x = -2.9 + Math.sin(av.phase) * 0.15; av.armR.rotation.x = -2.9 - Math.sin(av.phase) * 0.15;
      av.armL.rotation.z = 0; av.armR.rotation.z = 0;
      av.legL.rotation.x = 0.15 + Math.sin(av.phase * 0.5) * 0.2; av.legR.rotation.x = -0.1 - Math.sin(av.phase * 0.5) * 0.2;
    } else {
      av.legL.rotation.x = 0.5; av.legR.rotation.x = -0.3;
      av.armL.rotation.z = -2.4; av.armR.rotation.z = 2.4;
    }
    if (braced && grounded) {
      av.legL.rotation.x = -0.9; av.legR.rotation.x = 0.6;
      av.armL.rotation.x = -1.2; av.armR.rotation.x = -1.2;
      av.armL.rotation.z = 0; av.armR.rotation.z = 0;
      av.torso.rotation.x = -0.25;
    } else av.torso.rotation.x = 0;
    av.tag.visible = !isLocal;
  }

  // ───────── Seile ─────────
  setRopes(pairs) {
    while (this.ropes.length < pairs.length) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8b26a, roughness: 0.9 });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.ropes.push(mesh);
    }
    for (let i = 0; i < this.ropes.length; i++) {
      const mesh = this.ropes[i];
      if (i >= pairs.length) { mesh.visible = false; continue; }
      mesh.visible = true;
      const [a, b, L] = pairs[i];
      const A = new THREE.Vector3(a[0], a[1] + 0.8, a[2]);
      const B = new THREE.Vector3(b[0], b[1] + 0.8, b[2]);
      const d = A.distanceTo(B);
      const sag = d < L ? Math.sqrt(L * L - d * d) * 0.5 : 0;
      const mid = A.clone().add(B).multiplyScalar(0.5);
      mid.y -= sag;
      const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
      mesh.geometry.dispose();
      mesh.geometry = new THREE.TubeGeometry(curve, 20, 0.035, 5, false);
      const tension = Math.min(1, Math.max(0, (d / L - 0.9) * 8));
      mesh.material.color.setRGB(0.85 + 0.1 * tension, 0.7 - 0.45 * tension, 0.42 - 0.25 * tension);
    }
  }

  update(dt, colliders, focus) {
    for (let i = 0; i < this.moverMeshes.length; i++) {
      const { m, g } = this.moverMeshes[i];
      const b = colliders.moverBoxes[i];
      g.position.set(b.min[0], b.min[1], b.min[2]);
      if (m._line) {
        const p = m._line.geometry.attributes.position;
        p.setXYZ(0, ...m._pivot);
        p.setXYZ(1, (b.min[0] + b.max[0]) / 2, b.max[1] + 0.5, (b.min[2] + b.max[2]) / 2);
        p.needsUpdate = true;
      }
    }
    for (const belt of this.belts) {
      belt.tex.offset.x -= belt.v[0] * dt;
      belt.tex.offset.y += belt.v[2] * dt;
    }
    for (const bm of this.blinkMeshes) {
      const st = bm.b.state ?? 2;
      bm.mesh.visible = st !== 0;
      bm.mat.emissiveIntensity = st === 1 ? (Math.sin(performance.now() / 60) > 0 ? 0.9 : 0.1) : 0;
    }
    if (this.windTex) this.windTex.offset.y -= dt * 1.5;
    for (const sp of this.spinners) {
      // Oberfläche läuft mit spin (m/s) in Richtung der Querachse
      if (sp.axis === 0) sp.g.rotation.x -= sp.w * dt; else sp.g.rotation.z += sp.w * dt;
    }
    updateHooks(this.hookLive, this.locals);
    for (const w of this.windFx) {
      const f = colliders.gust(w.z);
      w.mat.opacity = 0.08 + 0.4 * f;
      w.mat.map.offset.x -= w.sign * dt * (0.6 + 1.6 * f);
    }
    for (const f of this.fanBlades) f.rotation.y += dt * 12;
    if (this.flag) this.flag.rotation.y = Math.sin(performance.now() / 600) * 0.3;
    // Schattenkamera folgt dem Spieler, auf Texel gerastet gegen Flimmern
    const texel = 60 / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus[0] / texel) * texel, fy = Math.round(focus[1] / texel) * texel, fz = Math.round(focus[2] / texel) * texel;
    this.sun.position.set(fx + this.sunOffset.x, fy + this.sunOffset.y, fz + this.sunOffset.z);
    this.sun.target.position.set(fx, fy, fz);

    // Landemarker + Blob-Schatten unter dem lokalen Spieler
    const gy = this.groundBelow(colliders, focus);
    const h = focus[1] - gy;
    const show = Number.isFinite(gy);
    this.blob.visible = show && !this.quality.shadows;
    this.blob.position.set(focus[0], gy + 0.02, focus[2]);
    this.blob.scale.setScalar(Math.max(0.4, 1 - h * 0.08));
    this.marker.visible = show && h > 1.2;
    this.marker.position.set(focus[0], gy + 0.03, focus[2]);
    this.marker.material.opacity = Math.min(0.9, 0.3 + h * 0.08);

    // Staub wandert mit und treibt langsam
    const dp = this.dust.geometry.attributes.position;
    const tt = performance.now() / 1000;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * (0.15 + (i % 7) * 0.03);
      let x = dp.getX(i) + Math.sin(tt * 0.3 + i) * dt * 0.1;
      let z = dp.getZ(i);
      // um den Spieler herum halten (Würfel 30×20×30)
      const wrap = (v, c, r) => (v - c > r ? v - 2 * r : v - c < -r ? v + 2 * r : v);
      x = wrap(x, focus[0], 15); y = wrap(y, focus[1] + 2, 10); z = wrap(z, focus[2], 15);
      dp.setXYZ(i, x, y, z);
    }
    dp.needsUpdate = true;

    // Kamera-Wackler (Landungen, Seilruck)
    if (this.shake > 0.001 && settings.get().shake) {
      const a = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
    }
    this.shake *= Math.exp(-dt * 9);

    patchFogMaterials(this.scene);
    this.updateFog(dt, focus);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
