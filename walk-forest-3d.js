// ─── Walk the Forest — WebGL backdrop (Three.js r147, vendored). ───
//
// A second painter for the same scene walk-forest.js draws in SVG. It owns
// no app state and no UI: WF (walk-forest.js) stays the single source of
// truth — WF.cam, WF.openId, the stop state machine — and the pins,
// controls, rail, chip and panel are the same DOM as in SVG mode. This file
// only (1) paints the forest into a canvas in #wf-scene's "gl" layer,
// (2) projects trail points to screen for the pins (wf3dProject), and
// (3) turns pointer movement into wind and taps into physics
// (walk-forest-physics.js). See ARCHITECTURE.md "Walk the Forest renderer
// layers" for the contract and the fallback ladder.
//
// World: metres, y up. Trail position `at` (one unit per activity stop)
// runs toward −z; the SVG scene's lateral unit maps to WF3D_LAT metres, so
// every coordinate table in walk-forest.js (WF_TREES, WF_SHRUBS, WF_CAST,
// WF_SPAN, WF_STOP_SIDE) is reused as-is rather than re-authored.
'use strict';

const WF3D_THREE_SRC = 'vendor/three.min.js';
const WF3D_GLTF_SRC = 'vendor/three-GLTFLoader.js';
const WF3D_ALONG = 14;    // metres between consecutive stops
const WF3D_LAT = 3.2;     // metres per SVG-scene lateral unit
// Each stop's activity is staged this far (in stops) ahead of where the
// walker stops, so on arrival it's framed in front of the walker instead
// of half of it sitting behind them, filling the foreground. Pins move
// with it; their d (and so "armed"/the arrival chip) is unchanged.
const WF3D_SET_AHEAD = 0.28;
// Each activity is moved off the path as a whole, to one side, centred this
// many lateral units (~5.6m) from the trail's centre line. The trail stays
// the walker's; every activity gets its own clearing beside it, so its set
// piece and people read clearly instead of overlapping the path and each
// other. The side follows the activity's own layout (WF_SPAN centre), else
// its pin side (WF_STOP_SIDE).
const WF3D_STOP_CLEAR = 1.75;
const WF3D_CLEARING_R = 6;   // metres kept free of trees around each activity

function wf3dStopSide(i) {
  const s = ACTIVITIES[i];
  if (!s) return 1;
  const sp = WF_SPAN[s.id];
  const v = sp && sp[0] ? sp[0] : (WF_STOP_SIDE[s.id] || 1);
  return v < 0 ? -1 : 1;
}
function wf3dStopCenter(i, v) {
  // The 18th stop, the IVN room, stands across the end of the trail itself.
  if (i >= ACTIVITIES.length) return wf3dAt(i + WF3D_IVN_AHEAD, 0, 0, v);
  return wf3dAt(i + WF3D_SET_AHEAD, wf3dStopSide(i) * WF3D_STOP_CLEAR, 0, v);
}
const WF3D_IVN_AHEAD = 0.62;   // room centre, in stops ahead of its stop point
// True when (x, z) is inside some activity's clearing (radius r, metres).
// Inside (or right beside) the IVN room at the end of the trail.
function wf3dInIvn(x, z) {
  const c = wf3dInIvn._c || (wf3dInIvn._c = wf3dStopCenter(ACTIVITIES.length));
  const dx = x - c.x, dz = z - c.z;
  return dx * dx + dz * dz < 5.6 * 5.6;
}
// Where the arrival camera glides to at stop i (wf3dsCameraBlend), for a
// typical phone and desktop framing — trees are kept off the line from
// there to the clearing, so the calm sideways glide never ends behind a
// trunk. Mirrors the camera maths; keep the two in step.
const WF3D_SIGHT_TRUCK = { narrow: 0.9, wide: 0.32 };
function wf3dSightlines() {
  if (wf3dSightlines._s) return wf3dSightlines._s;
  const out = [];
  ACTIVITIES.forEach(function (a, i) {
    const S = wf3dStopCenter(i);
    [[7.5, WF3D_SIGHT_TRUCK.narrow, 2.5], [11, WF3D_SIGHT_TRUCK.wide, 0]].forEach(function (cfg) {
      const E = wf3dAt(i - cfg[0] / WF3D_ALONG, 0, 0), G = wf3dAt(i + 0.9, 0, 0);
      let fx = G.x - E.x, fz = G.z - E.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const rx = -fz, rz = fx, d = (S.x - E.x) * rx + (S.z - E.z) * rz;
      out.push([E.x + rx * d * cfg[1] - fx * cfg[2], E.z + rz * d * cfg[1] - fz * cfg[2], S.x, S.z]);
    });
  });
  return (wf3dSightlines._s = out);
}
function wf3dInSight(x, z, r) {
  const L = wf3dSightlines();
  for (let k = 0; k < L.length; k++) {
    const s = L[k], ax = s[2] - s[0], az = s[3] - s[1];
    const t = Math.max(0, Math.min(1, ((x - s[0]) * ax + (z - s[1]) * az) / (ax * ax + az * az)));
    const dx = x - (s[0] + ax * t), dz = z - (s[1] + az * t);
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

function wf3dInClearing(x, z, r) {
  const c = wf3dInClearing._c || (wf3dInClearing._c = ACTIVITIES.concat([null]).map(function (a, i) { return wf3dStopCenter(i); }));
  for (let k = 0; k < c.length; k++) {
    const dx = x - c[k].x, dz = z - c[k].z;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Blender/glTF drop-in (see assets/wf/README.md). Add an entry here —
// activity id -> path — and that stop's procedural set piece is replaced
// by the model. Empty by default, so GLTFLoader is never even downloaded.
const WF3D_GLTF = {};

// Quality tiers. The starting tier is picked from the device
// (wf3dPickTier) and only ever steps down at runtime (wf3dGovern).
const WF3D_TIERS = {
  high: { name: 'high', dpr: 2, shadow: 2048, grass: 5200, leaves: 220, puffs: 260, motes: 140, light: true },
  med:  { name: 'med',  dpr: 1.5, shadow: 1024, grass: 3000, leaves: 140, puffs: 160, motes: 90, light: true },
  low:  { name: 'low',  dpr: 1, shadow: 0, grass: 1200, leaves: 60, puffs: 80, motes: 40, light: false },
};
// Governor: median frame interval above this (after warm-up) steps the
// tier down; still above it at "low" falls back to the SVG scene.
const WF3D_SLOW_MS = 28;

const WF3D = {
  state: 'off',            // off | loading | ready | failed
  onFail: null,
  tier: null, maxTier: null,
  renderer: null, scene: null, camera: null, canvas: null,
  sun: null, fire: [],
  w: 0, h: 0, dpr: 1, deep: false, frameNo: 0,
  cs: { x: 0, v: 0 },      // camera trail position (spring toward WF.cam)
  look: { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, tyaw: 0, tpitch: 0 },
  refDepth: 8, back: 8,
  t: 0, last: 0, clock: { acc: 0 },
  uni: null,
  trees: null, crowns: null, trunks: null, benders: null, treeAt: null,
  grass: null, leaves: null, leafMesh: null, puffs: null, puffPts: null,
  motes: null, rays: [], labelSpecs: [], labelLang: '',
  cloth: null, rope: null, stations: [], stopGroups: [],
  arrive: 0, arriveAt: -1, leaving: false,            // see wf3dsStepArrival
  walker: null, walkPhase: 0, pose: { shoeless: false },
  gusts: null, ptr: null,
  samples: [], governOn: true, debugEl: null, lost: false,
};

// ───────── boot / capability / lifecycle ─────────

function wf3dCapable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function wf3dReady() { return WF3D.state === 'ready'; }

function wf3dLoadScript(src, ok, fail) {
  const s = document.createElement('script');
  s.src = src; s.async = true;
  s.onload = ok; s.onerror = fail;
  document.head.appendChild(s);
}

// Lazy: Three.js (~600KB, ~150KB gzipped) is only fetched once WebGL is
// known to work, so SVG-fallback visitors never download it.
function wf3dBoot(onReady, onFail) {
  if (WF3D.state === 'ready') { onReady(); return; }
  if (WF3D.state === 'loading' || WF3D.state === 'failed') return;
  WF3D.onFail = onFail;
  if (!wf3dCapable()) { WF3D.state = 'failed'; onFail('no-webgl'); return; }
  WF3D.state = 'loading';
  const start = function () {
    try {
      wf3dInit();
      WF3D.state = 'ready';
      onReady();
    } catch (e) {
      if (window.console) console.warn('Walk the Forest: 3D unavailable, using the painted scene.', e);
      wf3dAbandon('init');
    }
  };
  if (window.THREE) start();
  else wf3dLoadScript(WF3D_THREE_SRC, start, function () { wf3dAbandon('load'); });
}

// Step off the ladder entirely: tear down, and hand back to the SVG scene.
function wf3dAbandon(reason) {
  const cb = WF3D.onFail;
  wf3dUnmount();
  WF3D.state = 'failed';
  WF3D.abandonReason = reason;
  if (cb) cb(reason);
}

function wf3dUnmount() {
  if (WF3D.canvas && WF3D.canvas.parentNode) WF3D.canvas.parentNode.removeChild(WF3D.canvas);
  if (WF3D.debugEl && WF3D.debugEl.parentNode) WF3D.debugEl.parentNode.removeChild(WF3D.debugEl);
  if (WF3D.ptr && WF.el) {
    WF.el.removeEventListener('pointermove', WF3D.ptr.move);
    WF.el.removeEventListener('pointerdown', WF3D.ptr.down);
    WF.el.removeEventListener('pointerup', WF3D.ptr.up);
    WF.el.removeEventListener('pointercancel', WF3D.ptr.cancel);
  }
  if (WF3D.renderer) {
    try { WF3D.renderer.dispose(); WF3D.renderer.forceContextLoss(); } catch (e) { /* already gone */ }
  }
  WF3D.renderer = null; WF3D.canvas = null; WF3D.ptr = null;
  if (WF3D.state === 'ready') WF3D.state = 'off';
}

function wf3dQuery(name) {
  const m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search || '');
  return m ? decodeURIComponent(m[1]) : null;
}

function wf3dPickTier() {
  const forced = wf3dQuery('wftier');
  if (forced && WF3D_TIERS[forced]) return WF3D_TIERS[forced];
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const narrow = (WF.w || window.innerWidth) < 768;
  if (mem <= 2 || (narrow && cores <= 4)) return WF3D_TIERS.low;
  if (!narrow && cores >= 8 && mem >= 8) return WF3D_TIERS.high;
  return WF3D_TIERS.med;
}

// ───────── world helpers ─────────

function wf3dX(at, lat) { return (wfPathLat(at) + lat) * WF3D_LAT; }
function wf3dZ(at) { return -at * WF3D_ALONG; }

function wf3dSmooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Gentle rolling ground, flattened under the trail so the path reads as a
// worn, level track. Every placed object samples this.
function wf3dGround(x, z) {
  const base = 0.5 * Math.sin(x * 0.13 + 1.3) * Math.sin(z * 0.07) + 0.32 * Math.sin(z * 0.031 + x * 0.05);
  const at = -z / WF3D_ALONG;
  const dx = Math.abs(x - wfPathLat(at) * WF3D_LAT);
  return base * (0.2 + 0.8 * wf3dSmooth(2.4, 8, dx));
}

// Trail point (at, lat, up) in world space; lat is in SVG lateral units,
// up in metres.
function wf3dAt(at, lat, up, v) {
  const x = wf3dX(at, lat), z = wf3dZ(at);
  return (v || new THREE.Vector3()).set(x, wf3dGround(x, z) + (up || 0), z);
}

// Deterministic hash noise for procedural shapes/colours.
function wf3dHash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// ───────── shared shader bits ─────────
// The GPU twin of wfpAmbientWind + wfpGustAt (walk-forest-physics.js).
// Keep the constants identical so grass, shrubs and the JS-simulated trees
// and leaves all lean the same way at the same moment.
const WF3D_WIND_GLSL = [
  'uniform float uTime;',
  'uniform vec4 uGust[4];',
  'vec2 wfWind(vec2 p) {',
  '  float base = 0.55 + 0.3 * sin(uTime * 0.23) + 0.22 * sin(uTime * 0.61 + p.x * 0.05 + p.y * 0.03);',
  '  float wv = sin(uTime * 0.4 - (p.x * 0.7 + p.y * 0.7) * 0.08);',
  '  float g = wv > 0.0 ? wv * wv * wv * 0.9 : 0.0;',
  '  vec2 w = vec2(0.86, -0.5) * (base + g);',
  '  for (int i = 0; i < 4; i++) {',
  '    vec2 d = p - uGust[i].xy;',
  '    w += uGust[i].zw * exp(-dot(d, d) / 12.96);',
  '  }',
  '  return w;',
  '}',
].join('\n');

// Patch a built-in material's vertex stage. mode:
//  'bend'  — per-instance crown offset from the JS tree springs (aBend =
//            bendX, bendZ, treeHeight), quadratic up the trunk, plus a
//            small leaf flutter.
//  'field' — evaluate the wind field in the shader (grass, shrubs), bend
//            by local height (aSway = height scale, stiffness).
function wf3dPatch(mat, mode) {
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.uTime = WF3D.uni.uTime;
    shader.uniforms.uGust = WF3D.uni.uGust;
    const decl = mode === 'bend'
      ? 'attribute vec3 aBend;\nuniform float uTime;\n'
      : 'attribute vec2 aSway;\n' + WF3D_WIND_GLSL + '\n';
    const body = mode === 'bend'
      ? [
        'vec4 mvPosition = vec4( transformed, 1.0 );',
        '#ifdef USE_INSTANCING',
        '  mvPosition = instanceMatrix * mvPosition;',
        '#endif',
        'float hf = clamp( mvPosition.y / aBend.z, 0.0, 1.3 ); hf *= hf;',
        'mvPosition.x += aBend.x * hf; mvPosition.z += aBend.y * hf;',
        'mvPosition.y -= ( aBend.x * aBend.x + aBend.y * aBend.y ) * hf * 0.08;',
        'mvPosition.xyz += hf * 0.05 * vec3( sin( uTime * 2.3 + mvPosition.y * 1.7 + mvPosition.x ), 0.0, cos( uTime * 1.9 + mvPosition.z * 1.3 ) );',
        'mvPosition = modelViewMatrix * mvPosition;',
        'gl_Position = projectionMatrix * mvPosition;',
      ].join('\n')
      : [
        'float hl = clamp( transformed.y * aSway.x, 0.0, 1.5 ); hl *= hl;',
        'vec4 mvPosition = vec4( transformed, 1.0 );',
        '#ifdef USE_INSTANCING',
        '  mvPosition = instanceMatrix * mvPosition;',
        '#endif',
        'vec2 wv = wfWind( mvPosition.xz );',
        'wv /= max( 1.0, length( wv ) / 4.0 );',
        'float flick = sin( uTime * 3.1 + mvPosition.x * 2.3 + mvPosition.z * 1.7 ) * 0.25;',
        'mvPosition.xz += ( wv * ( 1.0 + flick ) ) * hl * aSway.y;',
        'mvPosition.y -= dot( wv, wv ) * hl * aSway.y * 0.15;',
        'mvPosition = modelViewMatrix * mvPosition;',
        'gl_Position = projectionMatrix * mvPosition;',
      ].join('\n');
    shader.vertexShader = decl + shader.vertexShader.replace('#include <project_vertex>', body);
  };
  return mat;
}

const WF3D_MATS = {};
function wf3dMat(hex, opts) {
  const key = hex + (opts ? JSON.stringify(opts) : '');
  if (!WF3D_MATS[key]) WF3D_MATS[key] = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, opts || {}));
  return WF3D_MATS[key];
}

// ───────── scene construction ─────────

function wf3dInit() {
  const T = THREE;
  WF3D.tier = WF3D.maxTier = wf3dPickTier();
  WF3D.governOn = wf3dQuery('wfgov') !== '0';
  WF3D.uni = { uTime: { value: 0 }, uGust: { value: [new T.Vector4(), new T.Vector4(), new T.Vector4(), new T.Vector4()] } };
  WF3D.gusts = wfpGustField();
  WF3D.cs.x = WF.cam; WF3D.cs.v = 0;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new T.WebGLRenderer({ canvas, antialias: WF3D.tier !== WF3D_TIERS.low, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = !!WF3D.tier.shadow;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  WF3D.renderer = renderer; WF3D.canvas = canvas;
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    WF3D.lost = true;
    setTimeout(function () { if (WF3D.lost && WF3D.state === 'ready') wf3dAbandon('context-lost'); }, 3000);
  });
  canvas.addEventListener('webglcontextrestored', function () { WF3D.lost = false; });

  const scene = new T.Scene();
  // Fog colour = the sky band's horizon colour (wfSkyHTML), so the far
  // ground dissolves into the painted sky instead of meeting it at a line.
  scene.fog = new T.FogExp2(0xD6E3D9, 0.0095);
  WF3D.scene = scene;
  WF3D.camera = new T.PerspectiveCamera(50, 1.6, 0.3, 700);

  // Softer look: more sky fill, less direct sun, so shadows stay gentle.
  const hemi = new T.HemisphereLight(0xF4F7EF, 0xB6BA98, 0.8);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xFFF3E0, 0.34);
  sun.castShadow = !!WF3D.tier.shadow;
  if (WF3D.tier.shadow) {
    sun.shadow.mapSize.set(WF3D.tier.shadow, WF3D.tier.shadow);
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
  }
  scene.add(sun); scene.add(sun.target);
  WF3D.sun = sun;

  wf3dBuildGround();
  wf3dBuildTrail();
  wf3dBuildTrees();
  wf3dBuildFarForest();
  wf3dBuildShrubsAndStones();
  wf3dBuildGrass();
  wf3dsBuildAll();
  wf3dBuildWalker();
  wf3dBuildParticles();
  wf3dBuildRays();
  wf3dBuildLabels();
  wf3dLoadGltf();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { WF3D.labelLang = ''; });

  wf3dMount();
  wf3dBindPointer();
  if (wf3dQuery('wf') === 'debug') {
    WF3D.debugEl = document.createElement('div');
    WF3D.debugEl.className = 'wf3d-debug';
  }
}

function wf3dMount() {
  const L = WF.layers || (typeof wfEnsureLayers === 'function' ? wfEnsureLayers() : null);
  if (!L || !WF3D.canvas) return;
  if (WF3D.canvas.parentNode !== L.gl) L.gl.appendChild(WF3D.canvas);
  if (WF3D.debugEl && WF3D.debugEl.parentNode !== L.gl) L.gl.appendChild(WF3D.debugEl);
}

function wf3dBuildGround() {
  const T = THREE;
  const size = 760, seg = 150;
  const g = new T.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const zc = wf3dZ(12);
  g.translate(0, 0, zc);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new T.Color(0xA7AC8E), b = new T.Color(0x979D7E), c = new T.Color(0xB6B89C), moss = new T.Color(0x86A07E), deep = new T.Color(0x6F9474), tmp = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, wf3dGround(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.13 + x * 0.05);
    tmp.copy(a).lerp(b, n);
    const nearTrail = 1 - wf3dSmooth(3, 9, Math.abs(x - wfPathLat(-z / WF3D_ALONG) * WF3D_LAT));
    tmp.lerp(c, nearTrail * 0.5);
    tmp.lerp(moss, wf3dHash(Math.floor(x / 9), 0, Math.floor(z / 9)) * 0.35 * (1 - nearTrail));
    // Greener, mossier forest floor the further from the path.
    tmp.lerp(deep, wf3dSmooth(8, 34, Math.abs(x - wfPathLat(-z / WF3D_ALONG) * WF3D_LAT)) * 0.75);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  WF3D.scene.add(m);
}

// The path: a ribbon following wfPathLat, soft-edged via vertex alpha so it
// blends into the ground rather than sitting on it like a sticker. Light
// patches along it stand in for the SVG scene's dapple ellipses — the real
// dappling comes from the canopy's shadows.
function wf3dBuildTrail() {
  const T = THREE;
  const across = [-2.9, -2.2, -1.75, -1.2, -0.4, 0.4, 1.2, 1.75, 2.2, 2.9];
  const alpha = [0, 0.55, 1, 1, 1, 1, 1, 1, 0.55, 0];
  const n = ACTIVITIES.length + 12;
  const steps = Math.ceil((n + 3) / 0.04);
  const cols = across.length;
  const pos = new Float32Array(steps * cols * 3);
  const col = new Float32Array(steps * cols * 4);
  const base = new T.Color(0xD8CDAF), light = new T.Color(0xE9E0C8), worn = new T.Color(0xC7BA98), tmp = new T.Color();
  for (let s = 0; s < steps; s++) {
    const at = -3 + s * 0.04;
    const z = wf3dZ(at);
    const cx = wfPathLat(at) * WF3D_LAT;
    const d1 = wfPathLat(at + 0.01) * WF3D_LAT - cx;
    const nx = 1, nz = d1 / (0.01 * WF3D_ALONG);
    const nl = Math.sqrt(nx * nx + nz * nz);
    for (let k = 0; k < cols; k++) {
      const o = (s * cols + k);
      const x = cx + across[k] * nx / nl;
      const zz = z + across[k] * nz / nl;
      pos[o * 3] = x; pos[o * 3 + 1] = wf3dGround(x, zz) + 0.035; pos[o * 3 + 2] = zz;
      const dap = Math.max(0, Math.sin(at * 7.3 + across[k] * 1.9) * Math.sin(at * 3.1 - across[k] * 0.7));
      tmp.copy(base).lerp(light, dap * dap * 0.9).lerp(worn, Math.abs(across[k]) < 0.8 ? 0.18 : 0);
      col[o * 4] = tmp.r; col[o * 4 + 1] = tmp.g; col[o * 4 + 2] = tmp.b; col[o * 4 + 3] = alpha[k];
    }
  }
  const idx = [];
  for (let s = 0; s < steps - 1; s++) for (let k = 0; k < cols - 1; k++) {
    const a = s * cols + k, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  m.renderOrder = 1;
  WF3D.scene.add(m);
}

// A lumpy blob: a sphere pushed in and out by hash noise, smooth-shaded.
// Crowns, shrubs and bushes all share it (different scales/colours).
function wf3dBlobGeometry(seed, rough) {
  const g = new THREE.SphereGeometry(1, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // Smooth (continuous) lumps, so the shading stays soft like the
    // illustrated crowns rather than faceted.
    const n = 0.5 * Math.sin(x * 2.1 + seed) * Math.cos(y * 1.7 + seed * 0.3) +
      0.35 * Math.sin(z * 2.9 - seed * 0.7 + y) + 0.15 * Math.cos(x * 4.3 + z * 3.1 + seed);
    const k = 1 + n * rough;
    p.setXYZ(i, x * k, y * k * (y < 0 ? 0.7 : 0.9), z * k);
  }
  g.computeVertexNormals();
  return g;
}

function wf3dBuildTrees() {
  const T = THREE;
  const trees = WF_TREES;
  const n = trees.length;
  const benders = wfpBenders(n);
  WF3D.treeAt = new Float32Array(n);

  const trunkG = new T.CylinderGeometry(0.42, 1, 1, 7, 3);
  trunkG.translate(0, 0.5, 0);
  const crownG = wf3dBlobGeometry(3, 0.35);
  const perTree = 4;
  const trunkBend = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const crownBend = new T.InstancedBufferAttribute(new Float32Array(n * perTree * 3), 3);
  trunkG.setAttribute('aBend', trunkBend);
  crownG.setAttribute('aBend', crownBend);

  const trunkMat = wf3dPatch(new T.MeshLambertMaterial({ color: 0xffffff }), 'bend');
  const crownMat = wf3dPatch(new T.MeshLambertMaterial({ color: 0xffffff }), 'bend');
  const trunks = new T.InstancedMesh(trunkG, trunkMat, n);
  const crowns = new T.InstancedMesh(crownG, crownMat, n * perTree);
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = wf3dPatch(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), 'bend');
  }

  const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), E = new T.Euler(), C = new T.Color();
  const barkA = new T.Color(0x7E6654), barkB = new T.Color(0x6E5847);
  const crownCols = [0x4E7A68, 0x5B8872, 0x6A957C], crown2Cols = [0x446F5E, 0x507D67, 0x5B8870];
  trees.forEach(function (tr, i) {
    const x = wf3dX(tr.at, tr.lat), z = wf3dZ(tr.at);
    const y = wf3dGround(x, z);
    // Trees standing in an activity's clearing are left out (scaled to 0,
    // kept in the arrays so indices stay aligned with WF_TREES).
    const cleared = wf3dInClearing(x, z, WF3D_CLEARING_R) || wf3dInSight(x, z, 2.6);
    const H = 6 + tr.h * 4;
    const r = 0.2 + 0.13 * tr.w;
    const crownY = H * 0.66;
    WF3D.treeAt[i] = tr.at;
    benders.x[i] = x; benders.z[i] = z; benders.h[i] = H;
    E.set(tr.lean * 0.05, 0, tr.lean * 0.09);
    Q.setFromEuler(E);
    M.compose(P.set(x, y - 0.2, z), Q, cleared ? S.set(0, 0, 0) : S.set(r, crownY + 0.2, r));
    trunks.setMatrixAt(i, M);
    trunks.setColorAt(i, C.copy(tr.crown > 0.5 ? barkA : barkB));
    const R = (1.9 + 1.3 * tr.w) * (0.88 + tr.h * 0.16);
    const ci = tr.crown > 0.62 ? 0 : (tr.crown > 0.3 ? 1 : 2);
    const lx = tr.lean * 0.9;
    // main crown, two lower side lobes (the SVG scene's c1/c2/c3), and a
    // back lobe for depth from the side.
    const lobes = [
      [lx, crownY + R * 0.35, 0, R, R * 0.8, R, crownCols[ci]],
      [lx - R * 0.62, crownY - R * 0.1, R * 0.15, R * 0.66, R * 0.55, R * 0.66, crown2Cols[ci]],
      [lx + R * 0.66, crownY - R * 0.05, -R * 0.1, R * 0.6, R * 0.5, R * 0.6, crown2Cols[ci]],
      [lx + R * 0.1, crownY + R * 0.05, -R * 0.6, R * 0.7, R * 0.6, R * 0.7, crownCols[Math.min(2, ci + 1)]],
    ];
    lobes.forEach(function (lb, k) {
      E.set(0, tr.crown * 6.28 + k, 0); Q.setFromEuler(E);
      M.compose(P.set(x + lb[0], y + lb[1], z + lb[2]), Q, cleared ? S.set(0, 0, 0) : S.set(lb[3], lb[4], lb[5]));
      crowns.setMatrixAt(i * perTree + k, M);
      const shade = 0.94 + wf3dHash(i, k, 7) * 0.12;
      crowns.setColorAt(i * perTree + k, C.setHex(lb[6]).multiplyScalar(shade));
    });
  });
  trunks.instanceColor.needsUpdate = true; crowns.instanceColor.needsUpdate = true;
  for (let i = 0; i < n; i++) {
    trunkBend.setXYZ(i, 0, 0, benders.h[i]);
    for (let k = 0; k < perTree; k++) crownBend.setXYZ(i * perTree + k, 0, 0, benders.h[i]);
  }
  WF3D.scene.add(trunks); WF3D.scene.add(crowns);
  WF3D.trunks = trunks; WF3D.crowns = crowns; WF3D.benders = benders;
  WF3D.bendAttrs = { trunk: trunkBend, crown: crownBend, perTree };
}

// The forest thickens and deepens in colour away from the path: a second,
// cheaper tree set (two lobes, low-poly, no shadow casting, no physics —
// the shader flutter still moves it) from ~13m out to ~45m, denser the
// further out, shading from soft sage near the verge to deep forest green.
const WF3D_FAR_TREES = { high: 700, med: 520, low: 260 };
function wf3dBuildFarForest() {
  const T = THREE;
  const n = WF3D_FAR_TREES[WF3D.tier.name];
  const trunkG = new T.CylinderGeometry(0.42, 1, 1, 5, 1);
  trunkG.translate(0, 0.5, 0);
  const crownG = new T.SphereGeometry(1, 9, 6);
  const p = crownG.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 2.3 + z * 1.7) * Math.cos(y * 2.1);
    p.setXYZ(i, x * k, y * k * (y < 0 ? 0.75 : 1.05), z * k);
  }
  crownG.computeVertexNormals();
  const bend = new T.InstancedBufferAttribute(new Float32Array(n * 2 * 3), 3);
  crownG.setAttribute('aBend', bend);
  trunkG.setAttribute('aBend', new T.InstancedBufferAttribute(new Float32Array(n * 3), 3));
  const trunks = new T.InstancedMesh(trunkG, wf3dPatch(new T.MeshLambertMaterial({ color: 0xffffff }), 'bend'), n);
  const crowns = new T.InstancedMesh(crownG, wf3dPatch(new T.MeshLambertMaterial({ color: 0xffffff }), 'bend'), n * 2);
  trunks.frustumCulled = crowns.frustumCulled = false;
  trunks.receiveShadow = crowns.receiveShadow = true;
  const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), C = new T.Color(), Y = new T.Vector3(0, 1, 0);
  const near = new T.Color(0x5F8C73), far = new T.Color(0x24503F);
  let seed = 211;
  const rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const span = ACTIVITIES.length + 10;
  for (let i = 0; i < n; i++) {
    const at = -2 + rnd() * span;
    // Density rises with distance: more samples land far out.
    const u = Math.pow(rnd(), 0.6);
    const dist = 13 + u * 32;
    const side = rnd() < 0.5 ? -1 : 1;
    const x = wfPathLat(at) * WF3D_LAT + side * dist, z = wf3dZ(at);
    const y = wf3dGround(x, z);
    const H = 8 + rnd() * 6 + u * 3;
    const R = 2.6 + rnd() * 1.8 + u * 0.8;
    Q.setFromAxisAngle(Y, rnd() * 6.28);
    M.compose(P.set(x, y - 0.2, z), Q, S.set(0.28, H * 0.7, 0.28));
    trunks.setMatrixAt(i, M);
    trunks.setColorAt(i, C.setHex(0x6E5847));
    const col = C.copy(near).lerp(far, Math.min(1, u * 1.15)).multiplyScalar(0.94 + rnd() * 0.12);
    // Canopy carried low so the far forest reads as a wall of green, not
    // a colonnade of trunks.
    M.compose(P.set(x, y + H * 0.62, z), Q, S.set(R, R * 1.05, R));
    crowns.setMatrixAt(i * 2, M); crowns.setColorAt(i * 2, col);
    M.compose(P.set(x + (rnd() - 0.5) * R, y + H * 0.34, z + (rnd() - 0.5) * R), Q, S.set(R * 0.95, R * 0.8, R * 0.95));
    crowns.setMatrixAt(i * 2 + 1, M); crowns.setColorAt(i * 2 + 1, col.multiplyScalar(0.9));
    bend.setXYZ(i * 2, 0, 0, H); bend.setXYZ(i * 2 + 1, 0, 0, H);
    trunkG.attributes.aBend.setXYZ(i, 0, 0, H);
  }
  trunks.instanceColor.needsUpdate = true; crowns.instanceColor.needsUpdate = true;
  WF3D.scene.add(trunks); WF3D.scene.add(crowns);
}

function wf3dBuildShrubsAndStones() {
  const T = THREE;
  const shrubs = WF_SHRUBS;
  const geo = wf3dBlobGeometry(11, 0.45);
  geo.setAttribute('aSway', new T.InstancedBufferAttribute(new Float32Array(shrubs.length * 2 * 2), 2));
  const mat = wf3dPatch(new T.MeshLambertMaterial({ color: 0xffffff }), 'field');
  const mesh = new T.InstancedMesh(geo, mat, shrubs.length * 2);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), C = new T.Color();
  const sway = geo.attributes.aSway;
  shrubs.forEach(function (sh, i) {
    const x = wf3dX(sh.at, sh.lat), z = wf3dZ(sh.at), y = wf3dGround(x, z);
    const k = wf3dInClearing(x, z, 6.5) || wf3dInSight(x, z, 1.8) || wf3dInIvn(x, z) ? 0 : 0.38 + sh.s * 0.42;
    const fill = sh.tone > 0.6 ? 0x55826C : (sh.tone > 0.3 ? 0x62907A : 0x74A088);
    Q.setFromAxisAngle(P.set(0, 1, 0), sh.tone * 6.28);
    M.compose(P.set(x, y + k * 0.3, z), Q, S.set(k * 1.25, k * 0.8, k * 1.1));
    mesh.setMatrixAt(i * 2, M); mesh.setColorAt(i * 2, C.setHex(fill));
    M.compose(P.set(x + k * 0.8, y + k * 0.18, z - k * 0.3), Q, S.set(k * 0.8, k * 0.55, k * 0.8));
    mesh.setMatrixAt(i * 2 + 1, M); mesh.setColorAt(i * 2 + 1, C.setHex(fill).multiplyScalar(0.9));
    // aSway: 1/height (local blob space is ±1) and bend strength.
    sway.setXY(i * 2, 0.5, 0.35); sway.setXY(i * 2 + 1, 0.5, 0.35);
  });
  mesh.instanceColor.needsUpdate = true;
  WF3D.scene.add(mesh);

  // Scattered stones and fallen logs along the verges.
  const stoneG = new T.DodecahedronGeometry(1, 0);
  const stones = new T.InstancedMesh(stoneG, new T.MeshLambertMaterial({ color: 0xffffff }), 90);
  stones.castShadow = true; stones.receiveShadow = true; stones.frustumCulled = false;
  let seed = 91;
  const rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 90; i++) {
    const at = -1 + i * 0.33 + rnd() * 0.2;
    const lat = (rnd() < 0.5 ? -1 : 1) * (0.62 + rnd() * 2.4);
    const x = wf3dX(at, lat), z = wf3dZ(at);
    const s = wf3dInClearing(x, z, 2.5) || wf3dInIvn(x, z) ? 0 : 0.12 + rnd() * rnd() * 0.5;
    Q.setFromEuler(new T.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    M.compose(P.set(x, wf3dGround(x, z) + s * 0.25, z), Q, S.set(s * 1.3, s * 0.6, s));
    stones.setMatrixAt(i, M);
    stones.setColorAt(i, C.setHex(rnd() < 0.5 ? 0x9A9382 : 0xA8A08C).multiplyScalar(0.9 + rnd() * 0.15));
  }
  stones.instanceColor.needsUpdate = true;
  WF3D.scene.add(stones);
}

// Grass tufts: five thin blades each, bent on the GPU by the same wind
// field (and pointer gusts) as everything else. Normals point up so the
// blades light like the ground they grow from, not like paper cards.
function wf3dBuildGrass() {
  const T = THREE;
  const blades = 5;
  const pos = [], col = [], nor = [];
  const root = new T.Color(0x7F8E66), tip = new T.Color(0xBFC99C);
  for (let b = 0; b < blades; b++) {
    const ang = b / blades * Math.PI + 0.3;
    const lean = 0.08 + (b % 3) * 0.05;
    const hgt = 0.26 + (b % 2) * 0.14;
    const cx = Math.cos(ang) * 0.035, cz = Math.sin(ang) * 0.035;
    const tx = Math.cos(ang + 1.3) * lean, tz = Math.sin(ang + 1.3) * lean;
    pos.push(-cx, 0, -cz, cx, 0, cz, tx, hgt, tz);
    col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  const max = WF3D_TIERS.high.grass;
  const sway = new Float32Array(max * 2);
  g.setAttribute('aSway', new T.InstancedBufferAttribute(sway, 2));
  const mat = wf3dPatch(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), 'field');
  const mesh = new T.InstancedMesh(g, mat, max);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
  let seed = 17;
  const rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const span = ACTIVITIES.length + 6;
  for (let i = 0; i < max; i++) {
    const at = -1 + rnd() * span;
    // Denser along the trail's verges, thinning out into the trees.
    const off = 1.55 + Math.pow(rnd(), 1.8) * 11;
    const side = rnd() < 0.5 ? -1 : 1;
    const x = wfPathLat(at) * WF3D_LAT + side * off, z = wf3dZ(at);
    const s = wf3dInClearing(x, z, 2.2) || wf3dInIvn(x, z) ? 0 : 0.7 + rnd() * 0.9;
    Q.setFromAxisAngle(Y, rnd() * 6.28);
    M.compose(P.set(x, wf3dGround(x, z) - 0.01, z), Q, S.set(s, s * (0.8 + rnd() * 0.6), s));
    mesh.setMatrixAt(i, M);
    sway[i * 2] = 2.2; sway[i * 2 + 1] = 0.16;
  }
  mesh.count = WF3D.tier.grass;
  WF3D.scene.add(mesh);
  WF3D.grass = mesh;
}

// ───────── people ─────────
// The figure from the original Walk the Forest prototype (wfCharacterSVG in
// walk-forest.js), turned into a solid: the same rounded tunic body (its
// outline lathed around the spine), big round head and thin legs, all in
// one forest green — people read as quiet silhouettes, not individuals.
// Proportions are the SVG's own 148-unit figure, scaled to the height.
// Returns the group plus the pivots the animators (breathing, gait) move.
const WF3D_INK = 0x2C5446;
let WF3D_BODY_GEO = null;
function wf3dBodyGeo() {
  if (WF3D_BODY_GEO) return WF3D_BODY_GEO;
  // (radius, height) in prototype units, bottom hem to shoulder top.
  const prof = [[0, 52], [8, 52.4], [12.6, 53.6], [14, 57], [14, 88], [13, 99], [10.4, 106], [6.4, 111.2], [0, 114]];
  WF3D_BODY_GEO = new THREE.LatheGeometry(prof.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), 16);
  return WF3D_BODY_GEO;
}

function wf3dPerson(pose, height) {
  const T = THREE;
  const H = height || 1.7;
  const k = H / 148;                       // metres per prototype unit
  const ink = wf3dMat(WF3D_INK);
  const g = new T.Group();
  const mesh = function (geo) { const m = new T.Mesh(geo, ink); m.castShadow = true; return m; };
  const limb = function (r, len) {
    // Pivot at the top; the limb hangs down from it.
    const pivot = new T.Group();
    const m = mesh(new T.CapsuleGeometry(r, len, 3, 6));
    m.position.y = -len / 2;
    pivot.add(m);
    return pivot;
  };
  const hipY = 56 * k;
  const hips = new T.Group();
  const torso = mesh(wf3dBodyGeo());
  torso.scale.setScalar(k);
  torso.position.y = -hipY;                // lathe is in absolute prototype units
  const head = mesh(new T.SphereGeometry(12.5 * k, 16, 12));
  head.position.y = 127 * k - hipY;
  const legL = limb(3.2 * k, 44 * k), legR = limb(3.2 * k, 44 * k);
  legL.position.set(-5.5 * k, 0, 0); legR.position.set(5.5 * k, 0, 0);
  const footL = mesh(new T.SphereGeometry(5.4 * k, 8, 6)), footR = footL.clone();
  footL.scale.set(1, 0.62, 1.5); footR.scale.copy(footL.scale);
  footL.position.set(0, -50 * k, 1.5 * k); footR.position.copy(footL.position);
  legL.add(footL); legR.add(footR);
  const armL = limb(2.6 * k, 40 * k), armR = limb(2.6 * k, 40 * k);
  armL.position.set(-13.5 * k, 104 * k - hipY, 0); armR.position.set(13.5 * k, 104 * k - hipY, 0);
  armL.rotation.z = -0.06; armR.rotation.z = 0.06;
  // The upper body hangs from its own pivot at the hips, so a person can
  // bend at the waist (reaching down, leaning in) without their legs
  // tipping over with them.
  const chest = new T.Group();
  chest.add(torso, head, armL, armR);
  hips.add(chest, legL, legR);
  g.add(hips);
  hips.position.y = hipY;
  if (pose === 'sit') {
    hips.position.y = 0.1 * H / 1.7;
    legL.rotation.x = legR.rotation.x = -1.4;
    armL.rotation.x = armR.rotation.x = -0.5;
  } else if (pose === 'kneel') {
    // Upright on the knees: thighs down to the ground, shins folded back
    // along it — the L of a kneeling body (without the shins a kneeler
    // just reads as a short person standing).
    hips.position.y = 44 * k + 3 * k;
    legL.rotation.x = legR.rotation.x = 0.1;
    [legL, legR].forEach(function (leg) {
      const shin = mesh(new T.CapsuleGeometry(3.2 * k, 36 * k, 3, 6));
      shin.position.set(0, -44 * k, -18 * k);
      shin.rotation.x = -Math.PI / 2;
      leg.add(shin);
    });
    footL.position.set(0, -44 * k, -38 * k); footR.position.copy(footL.position);
    armL.rotation.x = armR.rotation.x = -0.6;
    chest.rotation.x = -0.1;
  } else if (pose === 'lie') {
    hips.position.y = 0.12 * H / 1.7;
    hips.rotation.x = -Math.PI / 2;
  } else if (pose === 'carry') {
    armR.rotation.x = -1.35;
  } else if (pose === 'reach') {
    armR.rotation.x = -2.3;
  }
  return { group: g, hips, chest, torso, head, legL, legR, armL, armR, footL, footR, pose, hipY: hips.position.y, k };
}

let WF3D_STONE_GEO = null, WF3D_BUSH_GEO = null, WF3D_GLOW_TEX = null;
function wf3dGlowTex() {
  if (WF3D_GLOW_TEX) return WF3D_GLOW_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (WF3D_GLOW_TEX = new THREE.CanvasTexture(c));
}
function wf3dStoneGeo() { return WF3D_STONE_GEO || (WF3D_STONE_GEO = new THREE.DodecahedronGeometry(1, 1)); }
function wf3dBushGeo() { return WF3D_BUSH_GEO || (WF3D_BUSH_GEO = wf3dBlobGeometry(29, 0.4)); }

// The hammock: a verlet rope between the posts (the physics), weighted in
// the middle by the person lying in it, with a U-shaped fabric surface
// rebuilt around it every frame (the look). A free cloth strip pinned only
// at gathered ends twists to hang edge-down like a curtain — physically
// right for an empty strip, wrong for a hammock someone is lying in — so
// the fabric's cross-section is shaped rather than simulated. Wind and
// pointer gusts swing the rope, and the occupant rides it.
function wf3dBuildHammock(A, B, stop, grp) {
  const T = THREE;
  const cols = 15, across = 5, width = 0.95;
  const v = wfpVerlet(cols);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  for (let c = 0; c < cols; c++) {
    const u = c / (cols - 1);
    const p = A.clone().addScaledVector(dir, u * len);
    p.y -= Math.sin(u * Math.PI) * 0.55;
    if (c === 0 || c === cols - 1) wfpVerletPin(v, c, p.x, p.y, p.z); else wfpVerletSet(v, c, p.x, p.y, p.z);
    if (u > 0.3 && u < 0.7) v.im[c] = 0.3;
  }
  for (let c = 0; c < cols - 1; c++) wfpVerletLink(v, c, c + 1);
  v.area = 0.5; v.drag = 0.012;
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(cols * across * 3), 3));
  const idx = [];
  for (let c = 0; c < cols - 1; c++) for (let r = 0; r < across - 1; r++) {
    const a = c * across + r, b = a + 1, d = a + across, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  geo.setIndex(idx);
  const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ color: 0xD87B4F, side: T.DoubleSide }));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  grp.add(mesh);
  WF3D.cloth = { v, mesh, stop, cols, across, width, dir };
  wf3dShapeHammock(WF3D.cloth);
}

function wf3dShapeHammock(cl) {
  const v = cl.v, pos = cl.mesh.geometry.attributes.position.array;
  const side = WF3D_TMP.side || (WF3D_TMP.side = new THREE.Vector3());
  side.set(-cl.dir.z, 0, cl.dir.x).normalize();
  // With someone lying in it (cl.body, set by wf3dsWalker), the cloth
  // wraps under them: wherever the body lies, the belly deepens to just
  // below its underside and the sides rise round it — the fabric carries
  // the body instead of the body cutting through the fabric.
  const n = cl.cols - 1;
  const len = Math.hypot(v.x[n * 3] - v.x[0], v.x[n * 3 + 2] - v.x[2]);
  const body = cl.body;
  for (let c = 0; c < cl.cols; c++) {
    const u = c / (cl.cols - 1);
    const gather = Math.sin(u * Math.PI);
    const x = v.x[c * 3], y = v.x[c * 3 + 1], z = v.x[c * 3 + 2];
    let belly = 0.22 * gather, wrap = 1;
    if (body) {
      const s = Math.abs(u - 0.5) * len;               // metres from the middle
      const under = s < body.half ? 1 : Math.max(0, 1 - (s - body.half) / 0.25);
      if (under > 0) {
        belly = Math.max(belly, (y - (body.under - 0.02)) * under + belly * (1 - under));
        wrap = 1 + 0.5 * under;                        // sides hug the body
      }
    }
    for (let r = 0; r < cl.across; r++) {
      const w = r / (cl.across - 1) * 2 - 1;          // -1..1 across
      const off = w * cl.width * 0.5 * (0.1 + 0.9 * gather) / wrap;
      const o = (c * cl.across + r) * 3;
      pos[o] = x + side.x * off;
      pos[o + 1] = y - belly * (1 - w * w);           // edges at the rope, belly below
      pos[o + 2] = z + side.z * off;
    }
  }
  cl.mesh.geometry.attributes.position.needsUpdate = true;
  cl.mesh.geometry.computeVertexNormals();
}

// The colour palette line: a rope between two posts with four swatches
// hanging from it on short tethers — each a verlet point, so a gust sets
// them swinging and knocking against each other's rhythm.
function wf3dBuildPaletteLine(A, B, stop, grp) {
  const T = THREE;
  const segs = 14;
  const pegs = 4;
  const v = wfpVerlet(segs + 1 + pegs);
  for (let k = 0; k <= segs; k++) {
    const p = A.clone().lerp(B, k / segs);
    p.y -= Math.sin(k / segs * Math.PI) * 0.06;
    if (k === 0 || k === segs) wfpVerletPin(v, k, p.x, p.y, p.z); else wfpVerletSet(v, k, p.x, p.y, p.z);
  }
  const rest = A.distanceTo(B) / segs * 1.03;
  for (let k = 0; k < segs; k++) wfpVerletLink(v, k, k + 1, rest);
  const hangAt = [3, 6, 9, 12];
  for (let k = 0; k < pegs; k++) {
    const i = segs + 1 + k, a = hangAt[k];
    wfpVerletSet(v, i, v.x[a * 3], v.x[a * 3 + 1] - 0.16, v.x[a * 3 + 2]);
    v.im[i] = 1.6;
    wfpVerletLink(v, a, i, 0.16);
  }
  v.area = 1.4; v.drag = 0.02;
  const lineGeo = new T.BufferGeometry();
  lineGeo.setAttribute('position', new T.BufferAttribute(v.x.subarray(0, (segs + 1) * 3), 3));
  const line = new T.Line(lineGeo, new T.LineBasicMaterial({ color: 0xC8BFA6 }));
  line.frustumCulled = false;
  grp.add(line);
  const cols = [0x3F6B54, 0x7FA396, 0x8A6C52, 0xB8552E];
  const swatches = [];
  for (let k = 0; k < pegs; k++) {
    const m = new T.Mesh(new T.BoxGeometry(0.13, 0.19, 0.015), wf3dMat(cols[k]));
    m.castShadow = true;
    grp.add(m);
    swatches.push(m);
  }
  WF3D.rope = { v, line, swatches, stop, segs, hangAt };
}

// ───────── the walker ─────────
function wf3dBuildWalker() {
  const p = wf3dPerson('stand', 1.74);
  // Seated variant for the sit-down stops (soundscape/sitspot/campfire).
  const seat = wf3dPerson('sit', 1.74);
  seat.group.visible = false;
  // Lying variant for climbing into the hammock.
  const lie = wf3dPerson('lie', 1.74);
  lie.group.visible = false;
  WF3D.scene.add(p.group); WF3D.scene.add(seat.group); WF3D.scene.add(lie.group);
  WF3D.walker = p; WF3D.walkerSeat = seat; WF3D.walkerLie = lie;
  WF3D.bareFoot = wf3dMat(0xC9A88A);
  WF3D.shoe = p.footL.material;
}

// ───────── particles: leaves, embers/smoke/dust, motes ─────────
const WF3D_LEAF_COLS = [0xB8552E, 0xD87B4F, 0x7FA396, 0x9A7B57, 0xC9A04E];
function wf3dBuildParticles() {
  const T = THREE;
  const top = WF3D_TIERS.high;
  // Leaves: instanced little leaf shapes, tumbling in the physics pool.
  WF3D.leaves = wfpPool(top.leaves);
  const lg = new T.BufferGeometry();
  lg.setAttribute('position', new T.Float32BufferAttribute([0, -0.5, 0, 0.32, -0.1, 0, 0, 0.5, 0, -0.32, -0.1, 0], 3));
  lg.setAttribute('normal', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  lg.setIndex([0, 1, 2, 0, 2, 3]);
  const lm = new T.InstancedMesh(lg, new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide }), top.leaves);
  lm.frustumCulled = false; lm.castShadow = false; lm.receiveShadow = true;
  const C = new T.Color();
  for (let i = 0; i < top.leaves; i++) lm.setColorAt(i, C.setHex(WF3D_LEAF_COLS[i % WF3D_LEAF_COLS.length]));
  lm.instanceColor.needsUpdate = true;
  lm.count = 0;
  WF3D.scene.add(lm);
  WF3D.leafMesh = lm;

  // Puffs: embers, smoke and footstep dust share one point cloud with a
  // per-point size/alpha/colour.
  const n = top.puffs;
  WF3D.puffs = wfpPool(n);
  const pg = new T.BufferGeometry();
  pg.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
  pg.setAttribute('aSize', new T.BufferAttribute(new Float32Array(n), 1));
  pg.setAttribute('aAlpha', new T.BufferAttribute(new Float32Array(n), 1));
  pg.setAttribute('aColor', new T.BufferAttribute(new Float32Array(n * 3), 3));
  const pm = new T.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: [
      'attribute float aSize; attribute float aAlpha; attribute vec3 aColor;',
      'uniform float uScale; varying float vAlpha; varying vec3 vColor;',
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = aSize * uScale / max(0.1, -mv.z);',
      '  vAlpha = aAlpha; vColor = aColor;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying float vAlpha; varying vec3 vColor;',
      'void main() {',
      '  vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0;',
      '  if (r > 1.0) discard;',
      '  gl_FragColor = vec4(vColor, vAlpha * (1.0 - r) * (1.0 - r));',
      '}',
    ].join('\n'),
    transparent: true, depthWrite: false,
  });
  const pts = new T.Points(pg, pm);
  pts.frustumCulled = false; pts.renderOrder = 5;
  WF3D.scene.add(pts);
  WF3D.puffPts = pts;

  // Motes: sunlit dust drifting in the air near the camera.
  const mn = top.motes;
  const mg = new T.BufferGeometry();
  const mp = new Float32Array(mn * 3);
  mg.setAttribute('position', new T.BufferAttribute(mp, 3));
  const mm = new T.PointsMaterial({ color: 0xFBF9F4, size: 0.07, transparent: true, opacity: 0.7, depthWrite: false });
  const motes = new T.Points(mg, mm);
  motes.frustumCulled = false;
  WF3D.scene.add(motes);
  WF3D.motes = { pts: motes, p: mp, n: mn, seeded: false };
}

// God rays: soft additive light shafts slanting down through the canopy
// (the WebGL version of the SVG scene's .wf-glow bands).
function wf3dBuildRays() {
  const T = THREE;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,248,226,0.9)'); g.addColorStop(0.6, 'rgba(255,248,226,0.35)'); g.addColorStop(1, 'rgba(255,248,226,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 128);
  const h = x.createLinearGradient(0, 0, 32, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = h; x.fillRect(0, 0, 32, 128);
  const tex = new T.CanvasTexture(c);
  const specs = [[-9, 26, 0.0], [7, 34, 1.7], [-2, 46, 3.1], [13, 22, 4.4]];
  specs.forEach(function (s) {
    const m = new T.Mesh(new T.PlaneGeometry(3.4, 30), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
    m.renderOrder = 6;
    WF3D.scene.add(m);
    WF3D.rays.push({ mesh: m, lat: s[0], ahead: s[1], phase: s[2] });
  });
}

// ───────── in-world words (wfWords(), same text as the SVG scene) ─────────
// Each station registers where its words go (ctx.word in
// walk-forest-3d-stations.js); this paints them for the current language.
function wf3dBuildLabels() {
  const T = THREE;
  (WF3D.labelSpecs || []).forEach(function (spec) {
    if (spec.sprite) { WF3D.scene.remove(spec.sprite); spec.sprite.material.map.dispose(); spec.sprite.material.dispose(); spec.sprite = null; }
    const words = wfWords(spec.id) || [];
    const txt = spec.key ? t(spec.key) : spec.words.map(function (k) { return words[k] || ''; }).join(' ').trim();
    // The in-world captions were dropped (Ivo, 2026-09-30): the bubbles
    // and their name chip are enough. Only the IVN room's sign stays — it
    // is part of the building.
    if (!txt || !spec.key) return;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const fs = 40;
    ctx.font = '500 ' + fs + 'px "Open Sans", sans-serif';
    const tw = Math.ceil(ctx.measureText(txt).width) + 24;
    c.width = tw; c.height = fs + 22;
    ctx.font = '500 ' + fs + 'px "Open Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.3; ctx.strokeStyle = 'rgba(231,224,206,0.85)';
    ctx.strokeText(txt, tw / 2, c.height / 2);
    ctx.fillStyle = '#2C4F44';
    ctx.fillText(txt, tw / 2, c.height / 2);
    const tex = new T.CanvasTexture(c);
    tex.minFilter = T.LinearFilter;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    const worldH = 0.24;
    sp.scale.set(worldH * tw / c.height, worldH, 1);
    sp.position.copy(spec.pos);
    sp.renderOrder = 10;
    sp.visible = false;
    WF3D.scene.add(sp);
    spec.sprite = sp;
  });
  WF3D.labelLang = currentLang;
}

// glTF drop-in: a model in WF3D_GLTF replaces that stop's procedural set
// piece (cast and physics props included — the model owns the stop).
function wf3dLoadGltf() {
  const ids = Object.keys(WF3D_GLTF);
  if (!ids.length) return;
  const go = function () {
    if (!THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    ids.forEach(function (id) {
      const i = ACTIVITIES.findIndex(function (a) { return a.id === id; });
      if (i < 0) return;
      loader.load(WF3D_GLTF[id], function (gltf) {
        const grp = WF3D.stopGroups[i];
        if (!grp) return;
        while (grp.children.length) grp.remove(grp.children[0]);
        if (WF3D.cloth && WF3D.cloth.stop === i) WF3D.cloth = null;
        if (WF3D.rope && WF3D.rope.stop === i) WF3D.rope = null;
        WF3D.fire = WF3D.fire.filter(function (f) { return f.stop !== i; });
        WF3D.labelSpecs.forEach(function (lb) { if (lb.stop === i && lb.sprite) lb.sprite.visible = false; });
        WF3D.labelSpecs = WF3D.labelSpecs.filter(function (lb) { return lb.stop !== i; });
        if (WF3D.stations[i]) { WF3D.stations[i].disabled = true; WF3D.stations[i].people = []; }
        const root = gltf.scene;
        wf3dStopCenter(i, root.position);
        root.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        grp.add(root);
      }, undefined, function (err) { if (window.console) console.warn('Walk the Forest: could not load', WF3D_GLTF[id], err); });
    });
  };
  if (THREE.GLTFLoader) go(); else wf3dLoadScript(WF3D_GLTF_SRC, go, function () {});
}

// ───────── pointer: wind, look-around, taps ─────────
// Listens on #wf-scene (bubbling), so it sees pointer activity over the
// canvas and the overlay alike; never preventDefault — page scrolling
// and every button keep working. A drag (moved >6px or held >250ms) is a
// physics gesture and is flagged so wfOnSceneClick (walk-forest.js) doesn't
// also treat it as a click on open space.
function wf3dBindPointer() {
  const T = THREE;
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const hit = new T.Vector3();
  const st = { isDown: false, sx: 0, sy: 0, t0: 0, moved: false, lx: null, lz: null, lt: 0 };
  const aim = function (e) {
    const r = WF.el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, WF3D.camera);
    return ray.ray.intersectPlane(plane, hit);
  };
  const move = function (e) {
    if (!WF3D.camera || WF3D.deep) return;
    // When the pointer actually moved, not when we got round to handling
    // it (a busy frame would otherwise read as a slow drag).
    const now = e.timeStamp || performance.now();
    const p = aim(e);
    // Look-around follows the pointer only over open scene. Over a pin,
    // control or link it holds still — otherwise the view turns as you
    // reach for a pin and the pin slides out from under the cursor.
    const overUi = e.target.closest && e.target.closest('button, a, .wf-pin-chip, .wf-rail, .wf-title-chip, .wf-status-pill');
    if (!overUi) {
      WF3D.look.tyaw = -ndc.x * 0.07;
      WF3D.look.tpitch = ndc.y * 0.035;
    }
    if (st.isDown && (Math.abs(e.clientX - st.sx) > 6 || Math.abs(e.clientY - st.sy) > 6)) st.moved = true;
    // Samples further apart than this are a new gesture, not a velocity.
    if (p && st.lx !== null && now - st.lt < 400) {
      const dt = Math.max(0.008, (now - st.lt) / 1000);
      const k = st.isDown ? 1.0 : 0.55;
      wfpAddGust(WF3D.gusts, p.x, p.z, (p.x - st.lx) / dt * k, (p.z - st.lz) / dt * k);
    }
    if (p) { st.lx = p.x; st.lz = p.z; st.lt = now; }
  };
  const down = function (e) {
    if (e.target.closest && e.target.closest('button, a')) return;
    st.isDown = true; st.moved = false; st.sx = e.clientX; st.sy = e.clientY; st.t0 = e.timeStamp || performance.now();
  };
  const up = function (e) {
    if (!st.isDown) return;
    st.isDown = false;
    if (st.moved || (e.timeStamp || performance.now()) - st.t0 > 250) { WF.suppressClick = true; return; }
    if (WF3D.camera) { aim(e); wf3dTap(e, ray); }
  };
  const cancel = function () { st.isDown = false; st.moved = false; };
  WF3D.ptr = { move, down, up, cancel };
  WF.el.addEventListener('pointermove', move);
  WF.el.addEventListener('pointerdown', down);
  WF.el.addEventListener('pointerup', up);
  WF.el.addEventListener('pointercancel', cancel);
}

// A tap on a tree shakes it and drops a flurry of leaves. The click still
// bubbles to wfOnSceneClick as before (open space = appEscapeAction).
function wf3dTap(e, ray) {
  // ray was just aimed at the tap point by the pointerup handler.
  if (!WF3D.crowns || (e.target.closest && e.target.closest('button, a'))) return;
  const hits = ray.intersectObject(WF3D.crowns, false);
  if (!hits.length || hits[0].instanceId == null) return;
  const ti = Math.floor(hits[0].instanceId / WF3D.bendAttrs.perTree);
  const pt = hits[0].point;
  const b = WF3D.benders;
  const dx = b.x[ti] - WF3D.camera.position.x, dz = b.z[ti] - WF3D.camera.position.z;
  const dl = Math.sqrt(dx * dx + dz * dz) || 1;
  wfpKickBender(b, ti, dx / dl * 2.2, dz / dl * 2.2);
  for (let k = 0; k < 14; k++) wf3dSpawnLeaf(pt.x + (Math.random() - 0.5) * 2, pt.y - Math.random(), pt.z + (Math.random() - 0.5) * 2, true);
}

function wf3dSpawnLeaf(x, y, z, burst) {
  const pool = WF3D.leaves;
  if (pool.live >= WF3D.tier.leaves && !burst) return;
  const r = function () { return wfpRand(pool); };
  wfpSpawn(pool, WFP_LEAF, x, y, z, (r() - 0.5) * (burst ? 2.5 : 0.6), burst ? r() * 1.5 : 0, (r() - 0.5) * (burst ? 2.5 : 0.6),
    22 + r() * 14, 0.12 + r() * 0.07, Math.floor(r() * 5));
}

// ───────── per-frame ─────────

function wf3dProject(at, lat) {
  const cam = WF3D.camera;
  if (!cam) return null;
  const v = wf3dProject._v || (wf3dProject._v = new THREE.Vector3());
  // Pins stand over their activity's clearing (the lat passed in is the
  // SVG scene's pin side, which the 3D layout replaces).
  void lat;
  const st = WF3D.stations && WF3D.stations[Math.round(at)];
  if (Math.round(at) >= ACTIVITIES.length && (WF3D.ivnFade || 0) < 0.5) return null;   // room not in sight yet
  if (st && st.pin) st.W(st.pin[0], st.pin[1], st.pin[2], v);
  else { wf3dStopCenter(Math.round(at), v); v.y += 2.0; }   // above heads, not over the focal object
  v.applyMatrix4(cam.matrixWorldInverse);
  const depth = -v.z;
  if (depth < 0.8) return null;
  v.applyMatrix4(cam.projectionMatrix);
  return {
    x: (v.x + 1) / 2 * WF.w,
    y: (1 - v.y) / 2 * WF.h,
    scale: WF3D.refDepth / depth,
    d: at - WF3D.cs.x,
  };
}

// Called from wfRender() after every full overlay render.
function wf3dSync(frame) {
  wf3dMount();
  WF3D.pose.shoeless = !!frame.shoeless;
  if (WF3D.labelLang !== currentLang) wf3dBuildLabels();
  wf3dResize();
  wf3dPlaceCamera(0);
  wfPlacePins();
}

function wf3dResize() {
  const w = WF.w, h = WF.h;
  const deep = document.body.classList.contains('wf-scene-deep');
  let dpr = Math.min(window.devicePixelRatio || 1, WF3D.tier.dpr);
  // Cap total pixels (a 4K display at dpr 2 is 33M pixels per frame).
  const maxPx = 3.2e6;
  if (w * h * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (w * h));
  if (deep) dpr = Math.min(dpr, 0.6);
  if (w === WF3D.w && h === WF3D.h && dpr === WF3D.dpr && deep === WF3D.deep) return;
  WF3D.w = w; WF3D.h = h; WF3D.dpr = dpr; WF3D.deep = deep;
  WF3D.renderer.setPixelRatio(dpr);
  WF3D.renderer.setSize(w, h, false);
  WF3D.camera.aspect = w / h;
  WF3D.baseFov = w / h < 0.8 ? 62 : 50;    // phones: a wider lens, closer in
  WF3D.camera.fov = WF3D.baseFov;
  WF3D.camera.updateProjectionMatrix();
  WF3D.puffPts.material.uniforms.uScale.value = h * dpr / (2 * Math.tan(WF3D.camera.fov * Math.PI / 360));
  WF3D.samples.length = 0;
}

// Third-person framing: far enough back that ±1.5 lateral units around the
// walker fit across the screen at any aspect (phones pull back further).
function wf3dPlaceCamera(dt) {
  const cam = WF3D.camera;
  const aspect = (WF.w || 1200) / (WF.h || 640);
  const hHalf = Math.atan(Math.tan(cam.fov * Math.PI / 360) * aspect);
  // Landscape: ±6.2m fits at the walker, so the clearings beside the path
  // stay in view while walking. Portrait (phones): fitting that width put
  // the camera ~24m back and the walker became a speck — instead stay
  // close behind them (a wider lens, see wf3dResize) and let the arrival
  // swing (wf3dsCameraBlend) bring each clearing into view.
  const narrow = aspect < 0.8;
  const back = narrow ? Math.max(6.5, Math.min(8.5, 2.6 / Math.tan(hHalf))) : Math.max(8, Math.min(24, 6.2 / Math.tan(hHalf)));
  WF3D.back = back;
  const c = WF3D.cs.x;
  const atCam = c - back / WF3D_ALONG;
  const speed = Math.abs(WF3D.cs.v) * WF3D_ALONG;
  const bob = Math.sin(WF3D.walkPhase * Math.PI * 2) * 0.03 * Math.min(1, speed);
  // Low, over-the-shoulder: eye a little above head height.
  const eye = wf3dAt(atCam, 0, 1.9 + back * 0.08 + bob);
  eye.y = Math.max(eye.y, wf3dGround(eye.x, eye.z) + 1.6);
  cam.position.copy(eye);
  const tgt = wf3dAt(c + 0.9, 0, 1.35);
  wf3dsCameraBlend(eye, tgt, narrow);
  cam.position.copy(eye);
  cam.lookAt(tgt);
  // On arrival the lens opens to about 0.8× zoom — a touch of wide angle,
  // so the clearing and the walker both fit without the view turning.
  const fov = 2 * Math.atan(Math.tan((WF3D.baseFov || cam.fov) * Math.PI / 360) * (1 + 0.25 * (WF3D.zoomOut || 0))) * 180 / Math.PI;
  if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  // Look-around (pointer) + a gentle bank into the trail's bends.
  const L = WF3D.look;
  if (dt > 0) {
    wfpSpring(L.yaw, L.tyaw, 2.4, dt);
    wfpSpring(L.pitch, L.tpitch, 2.4, dt);
  }
  const bend = (wfPathLat(c + 0.6) - wfPathLat(c)) * 0.05;
  cam.rotateY(L.yaw.x);
  cam.rotateX(L.pitch.x);
  cam.rotateZ(-bend);
  cam.updateMatrixWorld();
  WF3D.refDepth = eye.distanceTo(WF3D.walker ? WF3D.walker.group.position : wf3dAt(c, 0, 0));
}

function wf3dFrame(now) {
  if (WF3D.state !== 'ready' || WF3D.lost) return;
  const dtReal = WF3D.last ? Math.min(0.1, (now - WF3D.last) / 1000) : 0.016;
  WF3D.last = now;
  // WF.w/h come from wfMeasure() on resize/full render — not re-read here,
  // since reading layout right after wfPlacePins' style writes would force
  // a synchronous layout of the whole page every frame.
  wf3dResize();
  wf3dGovern(dtReal * 1000);
  if (WF3D.state !== 'ready') return;
  // Deep (blurred behind content): paint ~20fps; physics still integrates
  // the full elapsed time through the accumulator.
  WF3D.frameNo++;
  const skip = WF3D.deep && (WF3D.frameNo % 3 !== 0);
  WF3D.pendingDt = (WF3D.pendingDt || 0) + dtReal;
  if (skip) return;
  const dt = WF3D.pendingDt; WF3D.pendingDt = 0;

  // Camera trail position: spring toward WF.cam (the state machine's own
  // eased value) — inertia on top of the easing. A wrap-around (end of the
  // walk back to stop 1) snaps rather than flying back over every stop.
  if (Math.abs(WF.cam - WF3D.cs.x) > 2.5 && WF.mode === 'hold') { WF3D.cs.x = WF.cam; WF3D.cs.v = 0; }
  wfpSpring(WF3D.cs, WF.cam, WF.manual ? 3.2 : 2.0, dt);

  wfpAdvance(WF3D.clock, dt, wf3dStepPhysics);
  WF3D.uni.uTime.value = WF3D.t;
  wfpTopGusts(WF3D.gusts, 4, wf3dFrame._g || (wf3dFrame._g = new Float32Array(16)));
  const g = wf3dFrame._g, U = WF3D.uni.uGust.value;
  for (let k = 0; k < 4; k++) U[k].set(g[k * 4], g[k * 4 + 1], g[k * 4 + 2], g[k * 4 + 3]);

  wf3dsStepArrival(dt);
  wf3dsWalker(dt);
  wf3dPlaceCamera(dt);
  wf3dUpdateSun();
  wf3dUpdateVisuals(dt);
  wfPlacePins();
  WF3D.renderer.render(WF3D.scene, WF3D.camera);
  if (WF3D.debugEl) wf3dDebug(dtReal);
}

function wf3dStepPhysics(dt) {
  WF3D.t += dt;
  const t = WF3D.t, c = WF3D.cs.x;
  wfpStepGusts(WF3D.gusts, dt);
  // Trees: only the stretch near the camera is simulated; the rest keep
  // their last pose until they come back into range.
  const at = WF3D.treeAt;
  let a = 0, b = at.length;
  while (a < b && at[a] < c - 1.5) a++;
  let e = a;
  while (e < b && at[e] < c + 8) e++;
  wfpStepBenders(WF3D.benders, WF3D.gusts, t, dt, a, e);
  wfpStepPool(WF3D.leaves, WF3D.gusts, t, dt, wf3dGround);
  wfpStepPool(WF3D.puffs, WF3D.gusts, t, dt, wf3dGround);
  if (WF3D.cloth && Math.abs(WF3D.cloth.stop - c) < 3) wfpStepVerlet(WF3D.cloth.v, WF3D.gusts, t, dt, 8);
  if (WF3D.rope && Math.abs(WF3D.rope.stop - c) < 3) wfpStepVerlet(WF3D.rope.v, WF3D.gusts, t, dt, 5);

  // Ambient leaf fall from the crowns just ahead, and extra when a gust
  // (pointer) hits a canopy hard.
  const B = WF3D.benders;
  if (wfpRand(WF3D.leaves) < dt * 1.6 && e > a) {
    const i = a + Math.floor(wfpRand(WF3D.leaves) * (e - a));
    wf3dSpawnLeaf(B.x[i] + (wfpRand(WF3D.leaves) - 0.5) * 4, B.h[i] * 0.75 + wf3dGround(B.x[i], B.z[i]), B.z[i] + (wfpRand(WF3D.leaves) - 0.5) * 4, false);
  }
  for (let i = a; i < e; i++) {
    const v2 = B.vx[i] * B.vx[i] + B.vz[i] * B.vz[i];
    if (v2 > 1.2 && wfpRand(WF3D.leaves) < dt * v2 * 1.5) {
      wf3dSpawnLeaf(B.x[i] + B.bx[i] + (wfpRand(WF3D.leaves) - 0.5) * 3, B.h[i] * 0.72 + wf3dGround(B.x[i], B.z[i]), B.z[i] + B.bz[i] + (wfpRand(WF3D.leaves) - 0.5) * 3, true);
    }
  }

  // Fires: embers + smoke, only near the camera.
  const P = WF3D.puffs;
  WF3D.fire.forEach(function (f) {
    if (Math.abs(f.stop - c) > 2.5) return;
    f.acc += dt;
    const I = f.intensity == null ? 1 : f.intensity;
    if (I < 0.15) return;
    if (P.live < WF3D.tier.puffs && wfpRand(P) < dt * 7 * I) {
      wfpSpawn(P, WFP_EMBER, f.pos.x + (wfpRand(P) - 0.5) * 0.2, f.pos.y + 0.3 * f.size, f.pos.z + (wfpRand(P) - 0.5) * 0.2, 0, 1 + wfpRand(P), 0, 1.2 + wfpRand(P) * 1.4, 0.035, 0);
    }
    if (P.live < WF3D.tier.puffs && wfpRand(P) < dt * 1.4 * I) {
      wfpSpawn(P, WFP_SMOKE, f.pos.x, f.pos.y + 0.6 * f.size, f.pos.z, 0, 0.4, 0, 5 + wfpRand(P) * 2, 0.5, 0);
    }
  });
}

const WF3D_TMP = {};
function wf3dUpdateVisuals(dt) {
  const T = THREE;
  const t = WF3D.t, c = WF3D.cs.x;
  const M = WF3D_TMP.M || (WF3D_TMP.M = new T.Matrix4());
  const Q = WF3D_TMP.Q || (WF3D_TMP.Q = new T.Quaternion());
  const E = WF3D_TMP.E || (WF3D_TMP.E = new T.Euler());
  const S = WF3D_TMP.S || (WF3D_TMP.S = new T.Vector3());
  const P = WF3D_TMP.P || (WF3D_TMP.P = new T.Vector3());

  // Tree bends -> instance attributes.
  const B = WF3D.benders, A = WF3D.bendAttrs;
  for (let i = 0; i < B.n; i++) {
    A.trunk.setXYZ(i, B.bx[i], B.bz[i], B.h[i]);
    for (let k = 0; k < A.perTree; k++) A.crown.setXYZ(i * A.perTree + k, B.bx[i], B.bz[i], B.h[i]);
  }
  A.trunk.needsUpdate = true; A.crown.needsUpdate = true;

  // Leaves (live ones packed to the front of the instance buffer).
  const L = WF3D.leaves, lm = WF3D.leafMesh;
  const LC = WF3D_TMP.C || (WF3D_TMP.C = new T.Color());
  let n = 0;
  for (let i = 0; i < L.cap; i++) {
    if (!L.state[i]) continue;
    const fade = Math.min(1, (L.life[i] - L.age[i]) / 1.5);
    const s = L.size[i] * Math.max(0.01, fade);
    E.set(L.rx[i], L.ry[i], L.rz[i]); Q.setFromEuler(E);
    M.compose(P.set(L.px[i], L.py[i], L.pz[i]), Q, S.set(s, s, s));
    lm.setMatrixAt(n, M);
    lm.setColorAt(n, LC.setHex(WF3D_LEAF_COLS[L.tint[i]]));
    n++;
  }
  lm.count = n;
  lm.instanceMatrix.needsUpdate = true;
  if (lm.instanceColor) lm.instanceColor.needsUpdate = true;

  // Puffs.
  const Pf = WF3D.puffs, pg = WF3D.puffPts.geometry;
  const pos = pg.attributes.position.array, sz = pg.attributes.aSize.array, al = pg.attributes.aAlpha.array, co = pg.attributes.aColor.array;
  for (let i = 0; i < Pf.cap; i++) {
    if (!Pf.state[i]) { al[i] = 0; sz[i] = 0; continue; }
    const u = Pf.age[i] / Pf.life[i];
    pos[i * 3] = Pf.px[i]; pos[i * 3 + 1] = Pf.py[i]; pos[i * 3 + 2] = Pf.pz[i];
    const k = Pf.kind[i];
    if (k === WFP_EMBER) {
      sz[i] = Pf.size[i] * (1 - u * 0.6); al[i] = (1 - u) * 0.95;
      co[i * 3] = 1; co[i * 3 + 1] = 0.62 - u * 0.3; co[i * 3 + 2] = 0.3 - u * 0.2;
    } else if (k === WFP_SMOKE) {
      sz[i] = Pf.size[i] * (0.5 + u * 2.2); al[i] = Math.sin(u * Math.PI) * 0.28;
      co[i * 3] = 0.8; co[i * 3 + 1] = 0.85; co[i * 3 + 2] = 0.82;
    } else {
      sz[i] = Pf.size[i] * (0.6 + u * 1.2); al[i] = (1 - u) * 0.4;
      co[i * 3] = 0.85; co[i * 3 + 1] = 0.8; co[i * 3 + 2] = 0.69;
    }
  }
  pg.attributes.position.needsUpdate = true; pg.attributes.aSize.needsUpdate = true;
  pg.attributes.aAlpha.needsUpdate = true; pg.attributes.aColor.needsUpdate = true;

  // Hammock fabric (its occupant, the walker, rides it — wf3dsWalker).
  const cl = WF3D.cloth;
  if (cl && Math.abs(cl.stop - c) < 3) wf3dShapeHammock(cl);

  // Palette line + swatches.
  const rp = WF3D.rope;
  if (rp && Math.abs(rp.stop - c) < 3) {
    rp.line.geometry.attributes.position.needsUpdate = true;
    const v = rp.v, up = WF3D_TMP.up || (WF3D_TMP.up = new T.Vector3(0, 1, 0)), d = WF3D_TMP.d || (WF3D_TMP.d = new T.Vector3());
    rp.swatches.forEach(function (m, k) {
      const a = rp.hangAt[k] * 3, p = (rp.segs + 1 + k) * 3;
      m.position.set(v.x[p], v.x[p + 1], v.x[p + 2]);
      d.set(v.x[a] - v.x[p], v.x[a + 1] - v.x[p + 1], v.x[a + 2] - v.x[p + 2]).normalize();
      m.quaternion.setFromUnitVectors(up, d);
      // Turn the swatch about its hanging line to face the viewer.
      if (m.userData.face) {
        const cp = WF3D.camera.position;
        m.rotateY(Math.atan2(cp.x - m.position.x, cp.z - m.position.z));
      }
    });
  }

  // Stops well behind or far ahead aren't drawn at all (fog hides them
  // anyway) — the set pieces are most of the scene's draw calls.
  WF3D.stopGroups.forEach(function (g, i) {
    if (i >= ACTIVITIES.length) { wf3dsIvnReveal(g, c); return; }
    g.visible = i - c > -1.3 && i - c < 7;
  });

  // Fires flicker at whatever strength their station has them at.
  WF3D.fire.forEach(function (f) {
    const I = Math.max(0, f.intensity == null ? 1 : f.intensity);
    const k = 1 + Math.sin(t * 13 + f.stop) * 0.08 + Math.sin(t * 7.3) * 0.1;
    f.flame.visible = I > 0.03;
    f.flame.scale.set((2 - k) * (0.35 + 0.65 * I), k * (1 + Math.sin(t * 17) * 0.06) * I, (2 - k) * (0.35 + 0.65 * I));
    f.glow.material.opacity = 0.55 * Math.min(1, I);
    if (f.light) f.light.intensity = (0.8 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23 + 1) * 0.08) * Math.min(1.2, I);
  });

  // Stations: their people and ongoing action, labels, arrival light.
  wf3dsUpdate(dt);
  wf3dsSharedLight();

  // Rays breathe; they ride along ahead of the camera.
  WF3D.rays.forEach(function (r) {
    const p = wf3dAt(c + r.ahead / WF3D_ALONG, r.lat / WF3D_LAT, 13);
    r.mesh.position.copy(p);
    r.mesh.rotation.set(0, Math.atan2(WF3D.camera.position.x - p.x, WF3D.camera.position.z - p.z), -0.28);
    r.mesh.material.opacity = 0.07 + 0.09 * (0.5 + 0.5 * Math.sin(t * 0.5 + r.phase));
  });

  // Motes: seeded around the camera, drifting on the wind, recycled.
  const mo = WF3D.motes, mp = mo.p, cp = WF3D.camera.position;
  const cnt = WF3D.tier.motes;
  const w = WF3D_TMP.w || (WF3D_TMP.w = [0, 0]);
  for (let i = 0; i < mo.n; i++) {
    const o = i * 3;
    if (i >= cnt) { mp[o + 1] = -999; continue; }
    const out = !mo.seeded || Math.abs(mp[o] - cp.x) > 14 || mp[o + 2] > cp.z || mp[o + 2] < cp.z - 34 || mp[o + 1] < 0 || mp[o + 1] > 9;
    if (out) {
      mp[o] = cp.x + (Math.random() - 0.5) * 22; mp[o + 1] = 0.5 + Math.random() * 6; mp[o + 2] = cp.z - 4 - Math.random() * 28;
      continue;
    }
    wfpWindAt(WF3D.gusts, mp[o], mp[o + 2], t, w);
    mp[o] += w[0] * 0.3 * dt; mp[o + 2] += w[1] * 0.3 * dt;
    mp[o + 1] += Math.sin(t * 0.7 + i) * 0.08 * dt;
  }
  mo.seeded = true;
  mo.pts.geometry.attributes.position.needsUpdate = true;
}

// The sun (shadow-casting light) rides along with the camera so shadows
// stay sharp where you're looking; its position snaps to shadow-map texels
// so the dappled canopy shadows don't shimmer as the camera moves.
function wf3dUpdateSun() {
  const sun = WF3D.sun;
  const c = wf3dAt(WF3D.cs.x + 1.4, 0, 0);
  if (WF3D.tier.shadow) {
    const texel = 68 / WF3D.tier.shadow;
    c.x = Math.round(c.x / texel) * texel; c.z = Math.round(c.z / texel) * texel;
  }
  sun.target.position.copy(c);
  sun.position.set(c.x - 26, c.y + 42, c.z - 30);
  sun.target.updateMatrixWorld();
}

// ───────── governor + tiers ─────────
function wf3dGovern(ms) {
  if (!WF3D.governOn || WF3D.deep || document.visibilityState === 'hidden') return;
  WF3D.samples.push(ms);
  if (WF3D.samples.length < 150) return;          // ~2.5s at 60fps
  const s = WF3D.samples.slice(60).sort(function (a, b) { return a - b; });
  WF3D.samples.length = 0;
  const median = s[Math.floor(s.length / 2)];
  WF3D.lastMedian = median;
  if (median <= WF3D_SLOW_MS) return;
  if (WF3D.tier === WF3D_TIERS.low) { wf3dAbandon('slow'); return; }
  wf3dApplyTier(WF3D.tier === WF3D_TIERS.high ? WF3D_TIERS.med : WF3D_TIERS.low);
}

function wf3dApplyTier(tier) {
  const prev = WF3D.tier;
  WF3D.tier = tier;
  if (!!prev.shadow !== !!tier.shadow) {
    WF3D.renderer.shadowMap.enabled = !!tier.shadow;
    WF3D.sun.castShadow = !!tier.shadow;
    WF3D.scene.traverse(function (o) {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; });
    });
  } else if (tier.shadow && tier.shadow !== prev.shadow && WF3D.sun.shadow.map) {
    WF3D.sun.shadow.mapSize.set(tier.shadow, tier.shadow);
    WF3D.sun.shadow.map.dispose(); WF3D.sun.shadow.map = null;
  }
  WF3D.grass.count = Math.min(WF3D.grass.count, tier.grass);
  WF3D.w = 0;   // force wf3dResize to re-apply the DPR cap
}

function wf3dDebug(dt) {
  const el = WF3D.debugEl;
  WF3D._fps = (WF3D._fps || 60) * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
  if (WF3D.frameNo % 15) return;
  const info = WF3D.renderer.info.render;
  el.textContent = Math.round(WF3D._fps) + ' fps · tier ' + WF3D.tier.name + ' · dpr ' + WF3D.dpr.toFixed(2) +
    ' · ' + info.calls + ' draws · ' + Math.round(info.triangles / 1000) + 'k tris · leaves ' + WF3D.leaves.live +
    ' · puffs ' + WF3D.puffs.live + ' · gusts ' + WF3D.gusts.list.length +
    (WF3D.lastMedian ? ' · median ' + WF3D.lastMedian.toFixed(1) + 'ms' : '');
}
