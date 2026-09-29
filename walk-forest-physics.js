// ─── Walk the Forest — physics core for the 3D backdrop (walk-forest-3d.js).
//     Deliberately tiny and dependency-free: the 3D scene needs springs,
//     a wind field, falling particles and a few verlet ropes/cloths, not a
//     rigid-body engine — and the engines that exist (rapier, cannon-es) are
//     ES-module/WASM only, which this no-build, classic-<script> app can't
//     load (see ARCHITECTURE.md "Why not ES modules"). Plain functions over
//     typed arrays, prefixed wfp, no DOM and no THREE — so the same code is
//     unit-testable in node (test/unit.js). World units are metres, y up,
//     the trail runs toward −z. ───
'use strict';

// Fixed simulation step. Frame time is fed through an accumulator
// (wfpAdvance) so behaviour doesn't change with the display's refresh rate
// or when the deep/blurred mode throttles rendering to ~20fps.
const WFP_STEP = 1 / 60;
const WFP_MAX_STEPS = 5;
const WFP_GRAVITY = -9.8;

// ───────── integration helpers ─────────

// Exact critically-damped spring (no overshoot, no stiffness-vs-dt
// instability): moves s.x toward target with angular frequency omega.
// Used for the camera following WF.cam and for the pointer look-around.
function wfpSpring(s, target, omega, dt) {
  const x = s.x - target;
  const e = Math.exp(-omega * dt);
  const tmp = (s.v + omega * x) * dt;
  s.x = target + (x + tmp) * e;
  s.v = (s.v - omega * tmp) * e;
  return s;
}

// Runs fn(WFP_STEP) as many whole steps as the elapsed time covers, capped
// so a long hitch (tab switch, GC pause) can't cause a catch-up spiral.
function wfpAdvance(clock, elapsed, fn) {
  clock.acc = Math.min(clock.acc + Math.max(0, elapsed), WFP_STEP * WFP_MAX_STEPS);
  let n = 0;
  while (clock.acc >= WFP_STEP) { fn(WFP_STEP); clock.acc -= WFP_STEP; n++; }
  return n;
}

// ───────── wind ─────────
// Ambient wind is a smooth function of position and time, so the grass and
// shrub shaders (walk-forest-3d.js WF3D_WIND_GLSL) evaluate exactly the same
// field on the GPU — trees, leaves, cloth and grass all lean together.
// Keep the two in sync if either changes.
const WFP_WIND_DIR_X = 0.86, WFP_WIND_DIR_Z = -0.5;

function wfpAmbientWind(x, z, t, out) {
  const base = 0.55 + 0.3 * Math.sin(t * 0.23) + 0.22 * Math.sin(t * 0.61 + x * 0.05 + z * 0.03);
  const wave = Math.sin(t * 0.4 - (x * 0.7 + z * 0.7) * 0.08);
  const gust = wave > 0 ? wave * wave * wave * 0.9 : 0;
  const m = base + gust;
  out[0] = WFP_WIND_DIR_X * m;
  out[1] = WFP_WIND_DIR_Z * m;
  return out;
}

// Pointer gusts: moving the pointer across the scene pushes air. Each gust
// is a short-lived blob of velocity at a ground point; the field at a
// point is the falloff-weighted sum. The 3D layer feeds the strongest few
// to the shaders as uniforms (wfpTopGusts).
const WFP_GUST_MAX = 10;
const WFP_GUST_LIFE = 1.4;
const WFP_GUST_RADIUS = 3.6;

function wfpGustField() {
  return { list: [] };
}

function wfpAddGust(field, x, z, vx, vz) {
  const sp = Math.sqrt(vx * vx + vz * vz);
  if (sp < 0.4) return;
  const cap = 14;
  const k = sp > cap ? cap / sp : 1;
  field.list.push({ x, z, vx: vx * k, vz: vz * k, life: WFP_GUST_LIFE });
  if (field.list.length > WFP_GUST_MAX) field.list.shift();
}

function wfpStepGusts(field, dt) {
  const L = field.list;
  for (let i = L.length - 1; i >= 0; i--) {
    const g = L[i];
    g.life -= dt;
    // Gusts drift downwind with their own momentum, a little.
    g.x += g.vx * dt * 0.35; g.z += g.vz * dt * 0.35;
    if (g.life <= 0) L.splice(i, 1);
  }
}

function wfpGustAt(field, x, z, out) {
  const L = field.list;
  const r2 = WFP_GUST_RADIUS * WFP_GUST_RADIUS;
  for (let i = 0; i < L.length; i++) {
    const g = L[i];
    const dx = x - g.x, dz = z - g.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2 * 4) continue;
    const w = Math.exp(-d2 / r2) * (g.life / WFP_GUST_LIFE);
    out[0] += g.vx * w; out[1] += g.vz * w;
  }
  return out;
}

// Full wind at a point: ambient + pointer gusts.
function wfpWindAt(field, x, z, t, out) {
  wfpAmbientWind(x, z, t, out);
  return wfpGustAt(field, x, z, out);
}

// The n strongest gusts as flat [x, z, vx*w, vz*w, ...] for shader uniforms.
function wfpTopGusts(field, n, out) {
  const L = field.list.slice().sort((a, b) => b.life - a.life);
  for (let i = 0; i < n; i++) {
    const g = L[i];
    const w = g ? g.life / WFP_GUST_LIFE : 0;
    out[i * 4] = g ? g.x : 0; out[i * 4 + 1] = g ? g.z : 0;
    out[i * 4 + 2] = g ? g.vx * w : 0; out[i * 4 + 3] = g ? g.vz * w : 0;
  }
  return out;
}

// ───────── benders (trees) ─────────
// Each tree's crown is a damped 2D spring: wind pushes it over, stiffness
// pulls it back, low damping lets it overshoot and settle — the recoil is
// what makes a pushed tree read as physical instead of animated.
function wfpBenders(n) {
  return {
    n,
    x: new Float32Array(n), z: new Float32Array(n),      // ground position
    h: new Float32Array(n),                              // height (m)
    bx: new Float32Array(n), bz: new Float32Array(n),    // crown offset (m)
    vx: new Float32Array(n), vz: new Float32Array(n),
  };
}

const WFP_BEND_MAX = 1.6;
const _wfpW = [0, 0];

function wfpStepBenders(b, field, t, dt, from, to) {
  for (let i = from; i < to; i++) {
    const h = b.h[i];
    const k = 26 / h;                 // taller = softer
    const c = 2 * 0.18 * Math.sqrt(k); // underdamped: sway + recoil
    wfpWindAt(field, b.x[i], b.z[i], t, _wfpW);
    // Drag-like push: wind speed squared. Tuned so ambient wind (~1 m/s)
    // leans a 10m crown ~0.4m, and a fast pointer gust tips it to the cap.
    const wx = _wfpW[0], wz = _wfpW[1];
    const sp = Math.sqrt(wx * wx + wz * wz);
    const push = 1.1;
    const fx = wx * sp * push - k * b.bx[i] - c * b.vx[i];
    const fz = wz * sp * push - k * b.bz[i] - c * b.vz[i];
    b.vx[i] += fx * dt; b.vz[i] += fz * dt;
    b.bx[i] += b.vx[i] * dt; b.bz[i] += b.vz[i] * dt;
    const m = Math.sqrt(b.bx[i] * b.bx[i] + b.bz[i] * b.bz[i]);
    if (m > WFP_BEND_MAX) { const s = WFP_BEND_MAX / m; b.bx[i] *= s; b.bz[i] *= s; b.vx[i] *= 0.5; b.vz[i] *= 0.5; }
  }
}

// A direct shove (e.g. a tap on the canopy): velocity impulse.
function wfpKickBender(b, i, ix, iz) {
  b.vx[i] += ix; b.vz[i] += iz;
}

// ───────── particles ─────────
// One pool type for leaves, embers, smoke and dust; `kind` picks the
// forces. state: 0 dead, 1 airborne, 2 resting on the ground.
const WFP_LEAF = 0, WFP_EMBER = 1, WFP_SMOKE = 2, WFP_DUST = 3;

function wfpPool(cap) {
  return {
    cap, live: 0,
    px: new Float32Array(cap), py: new Float32Array(cap), pz: new Float32Array(cap),
    vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap),
    rx: new Float32Array(cap), ry: new Float32Array(cap), rz: new Float32Array(cap),
    sx: new Float32Array(cap), sy: new Float32Array(cap), sz: new Float32Array(cap),
    age: new Float32Array(cap), life: new Float32Array(cap),
    size: new Float32Array(cap), seed: new Float32Array(cap),
    state: new Uint8Array(cap), kind: new Uint8Array(cap), tint: new Uint8Array(cap),
  };
}

// Deterministic per-pool random, so a test (or a screenshot) is repeatable.
function wfpRand(pool) {
  pool._r = ((pool._r || 12345) * 1103515245 + 12345) % 2147483648;
  return pool._r / 2147483648;
}

function wfpSpawn(pool, kind, x, y, z, vx, vy, vz, life, size, tint) {
  let i = -1;
  for (let k = 0; k < pool.cap; k++) { if (pool.state[k] === 0) { i = k; break; } }
  if (i < 0) {
    // Full: recycle the oldest resting leaf rather than refusing — fresh
    // motion matters more than an old leaf lying on the path.
    let best = -1, bestAge = -1;
    for (let k = 0; k < pool.cap; k++) if (pool.state[k] === 2 && pool.age[k] > bestAge) { best = k; bestAge = pool.age[k]; }
    if (best < 0) return -1;
    i = best; pool.live--;
  }
  const r = () => wfpRand(pool);
  pool.px[i] = x; pool.py[i] = y; pool.pz[i] = z;
  pool.vx[i] = vx; pool.vy[i] = vy; pool.vz[i] = vz;
  pool.rx[i] = r() * 6.28; pool.ry[i] = r() * 6.28; pool.rz[i] = r() * 6.28;
  pool.sx[i] = (r() - 0.5) * 6; pool.sy[i] = (r() - 0.5) * 6; pool.sz[i] = (r() - 0.5) * 6;
  pool.age[i] = 0; pool.life[i] = life; pool.size[i] = size;
  pool.seed[i] = r() * 100; pool.state[i] = 1; pool.kind[i] = kind; pool.tint[i] = tint || 0;
  pool.live++;
  return i;
}

function wfpKill(pool, i) {
  if (pool.state[i] !== 0) { pool.state[i] = 0; pool.live--; }
}

// groundY(x, z) -> ground height. Leaves: gravity against quadratic air
// drag (terminal velocity ~1 m/s, like a real leaf), carried by the wind,
// with a sideways flutter; they land, lie flat, and can be lifted again by
// a strong enough gust. Embers rise on buoyancy and cool; smoke rises
// slowly and spreads; dust puffs settle fast.
function wfpStepPool(pool, field, t, dt, groundY) {
  if (!pool.live) return;
  const w = _wfpW;
  for (let i = 0; i < pool.cap; i++) {
    const st = pool.state[i];
    if (st === 0) continue;
    pool.age[i] += dt;
    const kind = pool.kind[i];
    if (pool.age[i] > pool.life[i]) { wfpKill(pool, i); continue; }
    if (st === 2) {
      // Resting leaf: only a real gust (not ambient wind) lifts it again.
      w[0] = 0; w[1] = 0;
      wfpGustAt(field, pool.px[i], pool.pz[i], w);
      const g2 = w[0] * w[0] + w[1] * w[1];
      if (g2 > 16) {
        pool.state[i] = 1;
        pool.vx[i] = w[0] * 0.5; pool.vz[i] = w[1] * 0.5; pool.vy[i] = 1.2 + Math.sqrt(g2) * 0.12;
        pool.age[i] = Math.min(pool.age[i], pool.life[i] * 0.4);
      }
      continue;
    }
    wfpWindAt(field, pool.px[i], pool.pz[i], t, w);
    let ax = 0, ay = 0, az = 0;
    if (kind === WFP_LEAF) {
      const rvx = pool.vx[i] - w[0] * 1.3, rvy = pool.vy[i], rvz = pool.vz[i] - w[1] * 1.3;
      const sp = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
      const kd = 9.0;
      ax = -kd * rvx * sp; ay = WFP_GRAVITY - kd * rvy * sp; az = -kd * rvz * sp;
      const ph = pool.age[i] * 3.1 + pool.seed[i];
      ax += Math.sin(ph) * 2.2; az += Math.cos(ph * 0.83) * 1.6;
      pool.rx[i] += pool.sx[i] * dt * (0.4 + sp); pool.ry[i] += pool.sy[i] * dt; pool.rz[i] += pool.sz[i] * dt * (0.4 + sp);
    } else if (kind === WFP_EMBER) {
      ax = (w[0] - pool.vx[i]) * 1.6; az = (w[1] - pool.vz[i]) * 1.6;
      ay = 2.4 - pool.vy[i] * 1.1;
      ax += Math.sin(pool.age[i] * 9 + pool.seed[i]) * 1.5;
    } else if (kind === WFP_SMOKE) {
      ax = (w[0] - pool.vx[i]) * 0.8; az = (w[1] - pool.vz[i]) * 0.8;
      ay = 0.7 - pool.vy[i] * 0.9;
    } else {
      ax = -pool.vx[i] * 3; az = -pool.vz[i] * 3; ay = -3 - pool.vy[i] * 2;
    }
    pool.vx[i] += ax * dt; pool.vy[i] += ay * dt; pool.vz[i] += az * dt;
    pool.px[i] += pool.vx[i] * dt; pool.py[i] += pool.vy[i] * dt; pool.pz[i] += pool.vz[i] * dt;
    const gy = groundY(pool.px[i], pool.pz[i]);
    if (pool.py[i] <= gy + 0.015) {
      if (kind === WFP_LEAF) {
        pool.py[i] = gy + 0.015; pool.state[i] = 2;
        pool.vx[i] = pool.vy[i] = pool.vz[i] = 0;
        pool.rx[i] = -Math.PI / 2 + (pool.seed[i] % 0.3); pool.rz[i] = 0;
      } else if (kind === WFP_DUST) {
        pool.py[i] = gy; pool.vy[i] = 0;
      } else {
        wfpKill(pool, i);
      }
    }
  }
}

// ───────── verlet (ropes + cloth) ─────────
// Position-based: points remember their previous position, constraints are
// solved by repeatedly nudging pairs back to rest length. Stable at any
// stiffness, which is why it's the standard for game cloth.
function wfpVerlet(n) {
  return {
    n,
    x: new Float32Array(n * 3), p: new Float32Array(n * 3),
    im: new Float32Array(n).fill(1),      // inverse mass (0 = pinned)
    pin: new Float32Array(n * 3),         // pin target when im = 0
    ca: [], cb: [], cr: [],               // constraints: a, b, rest length
    drag: 0.02, area: 1,
  };
}

function wfpVerletSet(v, i, x, y, z) {
  v.x[i * 3] = v.p[i * 3] = x; v.x[i * 3 + 1] = v.p[i * 3 + 1] = y; v.x[i * 3 + 2] = v.p[i * 3 + 2] = z;
}

function wfpVerletPin(v, i, x, y, z) {
  v.im[i] = 0; v.pin[i * 3] = x; v.pin[i * 3 + 1] = y; v.pin[i * 3 + 2] = z;
  wfpVerletSet(v, i, x, y, z);
}

function wfpVerletLink(v, a, b, rest) {
  if (rest == null) {
    const dx = v.x[b * 3] - v.x[a * 3], dy = v.x[b * 3 + 1] - v.x[a * 3 + 1], dz = v.x[b * 3 + 2] - v.x[a * 3 + 2];
    rest = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  v.ca.push(a); v.cb.push(b); v.cr.push(rest);
}

function wfpStepVerlet(v, field, t, dt, iterations) {
  const x = v.x, p = v.p, dt2 = dt * dt, keep = 1 - v.drag;
  for (let i = 0; i < v.n; i++) {
    const o = i * 3;
    if (v.im[i] === 0) { x[o] = p[o] = v.pin[o]; x[o + 1] = p[o + 1] = v.pin[o + 1]; x[o + 2] = p[o + 2] = v.pin[o + 2]; continue; }
    wfpWindAt(field, x[o], x[o + 2], t, _wfpW);
    // Wind as a force relative to the point's own velocity (so a moving
    // point feels less push), scaled by exposed area and mass.
    const vxp = (x[o] - p[o]) / dt, vzp = (x[o + 2] - p[o + 2]) / dt;
    const ax = (_wfpW[0] - vxp) * v.area * v.im[i];
    const az = (_wfpW[1] - vzp) * v.area * v.im[i];
    const nx = x[o] + (x[o] - p[o]) * keep + ax * dt2;
    const ny = x[o + 1] + (x[o + 1] - p[o + 1]) * keep + WFP_GRAVITY * dt2;
    const nz = x[o + 2] + (x[o + 2] - p[o + 2]) * keep + az * dt2;
    p[o] = x[o]; p[o + 1] = x[o + 1]; p[o + 2] = x[o + 2];
    x[o] = nx; x[o + 1] = ny; x[o + 2] = nz;
  }
  const ca = v.ca, cb = v.cb, cr = v.cr, im = v.im;
  for (let it = 0; it < iterations; it++) {
    for (let c = 0; c < ca.length; c++) {
      const a = ca[c] * 3, b = cb[c] * 3;
      const wa = im[ca[c]], wb = im[cb[c]], ws = wa + wb;
      if (ws === 0) continue;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const f = (d - cr[c]) / (d * ws);
      x[a] += dx * f * wa; x[a + 1] += dy * f * wa; x[a + 2] += dz * f * wa;
      x[b] -= dx * f * wb; x[b + 1] -= dy * f * wb; x[b + 2] -= dz * f * wb;
    }
  }
}

// Nudge every free point by a velocity impulse (a tap/gust on a rope).
function wfpVerletImpulse(v, ix, iy, iz) {
  for (let i = 0; i < v.n; i++) {
    if (v.im[i] === 0) continue;
    const o = i * 3;
    v.p[o] -= ix * WFP_STEP; v.p[o + 1] -= iy * WFP_STEP; v.p[o + 2] -= iz * WFP_STEP;
  }
}
