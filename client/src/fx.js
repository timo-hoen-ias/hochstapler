// Atmosphäre: Distanz- + Höhennebel (eigene Fog-Shader-Chunks) und ein
// Post-Processing-Pass für Godrays und Tiefenunschärfe.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ───────── Nebel ─────────
// Geteilte Uniforms: jedes Material bekommt per onBeforeCompile Referenzen darauf,
// Änderungen wirken also sofort überall.
export const fogUniforms = {
  fxCamWorld: { value: new THREE.Matrix4() },
  fxHeight: { value: new THREE.Vector3(0, 0.08, 0) }, // Dichte, Abfall pro Meter, Basishöhe
  fxHeightColor: { value: new THREE.Color(0xb9bfd8) },
  fxSunDir: { value: new THREE.Vector3(0, 1, 0) },
  fxSunColor: { value: new THREE.Color(0, 0, 0) },
};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform mat4 fxCamWorld;
  uniform vec3 fxHeight;
  uniform vec3 fxHeightColor;
  uniform vec3 fxSunDir;
  uniform vec3 fxSunColor;
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fxDist = length( vFogView );
  #ifdef FOG_EXP2
    float fxDistF = 1.0 - exp( - fogDensity * fogDensity * fxDist * fxDist );
  #else
    // weicher Einstieg statt harter Linearrampe
    float fxDistF = smoothstep( fogNear, fogFar, fxDist );
  #endif
  vec3 fxCam = fxCamWorld[ 3 ].xyz;
  vec3 fxRay = ( fxCamWorld * vec4( vFogView, 1.0 ) ).xyz - fxCam;
  // Höhennebel: Dichte d * exp(-(y - Basis) * k), analytisch entlang des Sichtstrahls integriert
  float fxH = 0.0;
  if ( fxHeight.x > 0.0 ) {
    float k = fxHeight.y;
    float a = fxHeight.x * exp( clamp( - ( fxCam.y - fxHeight.z ) * k, -30.0, 6.0 ) );
    float ry = fxRay.y * k;
    float integ = abs( ry ) > 0.001 ? ( 1.0 - exp( clamp( - ry, -30.0, 30.0 ) ) ) / ry : 1.0;
    fxH = 1.0 - exp( - min( a * fxDist * integ, 30.0 ) );
  }
  float fxTotal = 1.0 - ( 1.0 - fxDistF ) * ( 1.0 - fxH );
  vec3 fxCol = mix( fogColor, fxHeightColor, fxH / max( fxTotal, 1e-4 ) * 0.55 );
  // Sonnen-Streulicht: Nebel leuchtet in Richtung Sonne
  float fxSun = pow( max( dot( normalize( fxRay ), fxSunDir ), 0.0 ), 10.0 );
  fxCol += fxSunColor * fxSun;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fxCol, fxTotal );
#endif`;

const patched = new WeakSet();
function onBeforeCompile(shader) {
  for (const k in fogUniforms) shader.uniforms[k] = fogUniforms[k];
}

// Allen Materialien der Szene die Nebel-Uniforms geben (neue Avatare/Seile inklusive)
export function patchFogMaterials(scene) {
  scene.traverse((o) => {
    const ms = o.material;
    if (!ms) return;
    for (const m of Array.isArray(ms) ? ms : [ms]) {
      if (patched.has(m) || m.isShaderMaterial) continue;
      patched.add(m);
      m.onBeforeCompile = onBeforeCompile;
      m.needsUpdate = true;
    }
  });
}

// ───────── Godrays + Tiefenunschärfe ─────────
const AtmosShader = {
  defines: { GR_SAMPLES: 40, DOF_TAPS: 12 },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 600 },
    resolution: { value: new THREE.Vector2(1, 1) },
    sunUV: { value: new THREE.Vector2(0.5, 0.5) },
    sunVis: { value: 0 },
    grOn: { value: 1 },
    grIntensity: { value: 1.1 },
    grTint: { value: new THREE.Color(1.0, 0.82, 0.6) },
    dofOn: { value: 1 },
    dofStart: { value: 35 },
    dofEnd: { value: 140 },
    dofMax: { value: 5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear, cameraFar;
    uniform vec2 resolution, sunUV;
    uniform float sunVis, grOn, grIntensity, dofOn, dofStart, dofEnd, dofMax;
    uniform vec3 grTint;
    varying vec2 vUv;

    float rawDepth( vec2 uv ) { return texture2D( tDepth, uv ).x; }
    float viewDist( vec2 uv ) {
      return - perspectiveDepthToViewZ( rawDepth( uv ), cameraNear, cameraFar );
    }
    float coc( vec2 uv ) {
      float d = rawDepth( uv );
      if ( d >= 0.99999 ) return 1.0; // Himmel
      return smoothstep( dofStart, dofEnd, - perspectiveDepthToViewZ( d, cameraNear, cameraFar ) );
    }

    void main() {
      vec4 base = texture2D( tDiffuse, vUv );
      vec3 col = base.rgb;

      // Tiefenunschärfe: nur ferne Objekte, Gewichtung nach eigener Unschärfe,
      // damit scharfe Vordergrundkanten nicht ausbluten
      if ( dofOn > 0.5 ) {
        float c0 = coc( vUv );
        if ( c0 > 0.02 ) {
          vec2 px = 1.0 / resolution;
          vec3 acc = col;
          float wsum = 1.0;
          for ( int i = 0; i < DOF_TAPS; i ++ ) {
            float a = float( i ) * 2.39996;
            float r = sqrt( ( float( i ) + 0.5 ) / float( DOF_TAPS ) );
            vec2 o = vec2( cos( a ), sin( a ) ) * r * dofMax * c0 * px;
            float cs = coc( vUv + o );
            float w = smoothstep( 0.0, 0.3, cs );
            acc += texture2D( tDiffuse, vUv + o ).rgb * w;
            wsum += w;
          }
          col = mix( col, acc / wsum, smoothstep( 0.02, 0.25, c0 ) );
        }
      }

      // Godrays: radialer Weichzeichner der Himmelspixel in Richtung Sonne
      if ( grOn > 0.5 && sunVis > 0.001 ) {
        vec2 delta = ( vUv - sunUV ) * ( 0.9 / float( GR_SAMPLES ) );
        vec2 p = vUv;
        float illum = 1.0;
        vec3 rays = vec3( 0.0 );
        for ( int i = 0; i < GR_SAMPLES; i ++ ) {
          p -= delta;
          vec2 q = clamp( p, 0.0, 1.0 );
          float sky = step( 0.99999, rawDepth( q ) );
          vec3 s = texture2D( tDiffuse, q ).rgb;
          float lum = max( dot( s, vec3( 0.2126, 0.7152, 0.0722 ) ) - 0.25, 0.0 );
          // nur der helle Himmel rund um die Sonne erzeugt Strahlen -> klare Schattenstreifen hinter Kanten
          float near = exp( - length( ( q - sunUV ) * vec2( resolution.x / resolution.y, 1.0 ) ) * 3.5 );
          rays += sky * lum * near * illum * s;
          illum *= 0.975;
        }
        float fall = 1.0 - smoothstep( 0.0, 1.2, length( ( vUv - sunUV ) * vec2( resolution.x / resolution.y, 1.0 ) ) );
        col += rays / float( GR_SAMPLES ) * grIntensity * sunVis * grTint * ( 0.35 + 0.65 * fall ) * 3.0;
      }
      gl_FragColor = vec4( col, base.a );
    }`,
};

export class AtmosPass extends Pass {
  constructor(camera, sunDir) {
    super();
    this.camera = camera;
    this.sunDir = sunDir;
    this.material = new THREE.ShaderMaterial({
      defines: { ...AtmosShader.defines },
      uniforms: THREE.UniformsUtils.clone(AtmosShader.uniforms),
      vertexShader: AtmosShader.vertexShader,
      fragmentShader: AtmosShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this._v = new THREE.Vector3();
  }

  configure({ godrays, dof, samples = 40 }) {
    const u = this.material.uniforms;
    u.grOn.value = godrays ? 1 : 0;
    u.dofOn.value = dof ? 1 : 0;
    if (this.material.defines.GR_SAMPLES !== samples) {
      this.material.defines.GR_SAMPLES = samples;
      this.material.needsUpdate = true;
    }
  }

  setSize(w, h) { this.material.uniforms.resolution.value.set(w, h); }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    // Sonne auf den Bildschirm projizieren; ausblenden, wenn sie hinter uns oder weit außerhalb liegt
    const cam = this.camera;
    const p = this._v.copy(this.sunDir).multiplyScalar(500).add(cam.position);
    const facing = this._v.clone().sub(cam.position).normalize().dot(cam.getWorldDirection(new THREE.Vector3()));
    p.project(cam);
    u.sunUV.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const off = Math.max(Math.abs(p.x), Math.abs(p.y));
    u.sunVis.value = facing > 0 ? (1 - THREE.MathUtils.smoothstep(off, 1.0, 2.2)) * THREE.MathUtils.smoothstep(facing, 0, 0.3) : 0;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() { this.material.dispose(); this.quad.dispose(); }
}
