// ─── Walk the Forest 3D — the 17 stations: set pieces, people, and their
//     ongoing action. Each activity lives in its own clearing beside the
//     path (wf3dStopCenter, walk-forest-3d.js) and plays a loose loop of
//     20–30 seconds: every cycle picks a new length and new small timings,
//     so it never repeats exactly. Arriving at a station is its own moment:
//     the walker steps off the path to join (stands, sits in the circle,
//     climbs into the hammock), the camera swings round behind them to
//     face the activity, the people there glance up, and a soft pool of
//     light settles on the clearing.
//
//     What each station shows follows the activity's own brief
//     (pocketbook-data.js purpose/intro) and the illustration redraw
//     decisions in admin projects/forest4youth/web-app/activity-
//     illustrations/ILLUSTRATION_RECOMMENDATIONS.md (process v1,
//     illustration-critique): the Waldsofa is a horseshoe of piled deadwood
//     with someone still dragging a branch in; the campfire is a seated ring
//     with the fire clear of every figure; the barefoot trail is one path of
//     five grounds with the shoes left at the start; the check-in carries no
//     card and nothing on anyone's chest.
//
//     Coordinates are local to the station, in metres: x points from the
//     path out into the clearing, z runs forward along the path, y is up
//     from the ground. The viewer arrives from the path side (−x), so far
//     things sit at +x, and figures near the viewer stand to the sides,
//     framing the focal object rather than blocking it.
'use strict';

const WF3DS_LOOP_MIN = 20, WF3DS_LOOP_MAX = 30;   // seconds per loop
const WF3DS_ARRIVE_S = 3.6, WF3DS_LEAVE_S = 2.6, WF3DS_MANUAL_S = 1.2;

// ───────── small timing helpers ─────────
function wf3dsClamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function wf3dsSeg(u, a, b) { return wf3dsClamp((u - a) / (b - a)); }
function wf3dsEase(x) { x = wf3dsClamp(x); return x * x * (3 - 2 * x); }
function wf3dsBell(u, a, b) { return Math.sin(wf3dsSeg(u, a, b) * Math.PI); }
function wf3dsLerp(a, b, t) { return a + (b - a) * t; }
// Frame-rate-independent easing toward a target: k is the fraction covered
// per 1/60s frame, applied for however many 60ths this frame lasted — so a
// pose settles in the same time at 20, 30 or 60 fps.
let WF3DS_DTK = 1;
function wf3dsK(k) { return 1 - Math.pow(1 - k, WF3DS_DTK); }
function wf3dsTo(a, b, k) { return a + (b - a) * wf3dsK(k); }
// Smooth, never-repeating wobble in −1..1 (two incommensurate sines).
function wf3dsWob(t, s) { return 0.6 * Math.sin(t * 0.37 + s) + 0.4 * Math.sin(t * 0.91 + s * 2.3); }
function wf3dsAngLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ───────── station context: local frame + builders ─────────
function wf3dsCtx(i, grp) {
  const T = THREE;
  const ivn = i >= ACTIVITIES.length;
  const C = wf3dStopCenter(i);
  const at = ivn ? wf3dTrail(i) + WF3D_IVN_AHEAD : i + WF3D_SET_AHEAD;
  const P0 = wf3dAt(at, 0, 0);
  const P1 = wf3dAt(at + 0.01, 0, 0);
  const f = new T.Vector3(P1.x - P0.x, 0, P1.z - P0.z).normalize();
  // Out from the path to the clearing; for the IVN room (on the path) the
  // local x axis is simply sideways, z forward into the room.
  const o = ivn ? new T.Vector3(f.z, 0, -f.x) : new T.Vector3(C.x - P0.x, 0, C.z - P0.z).normalize();
  const ctx = {
    i, id: ivn ? 'ivn' : ACTIVITIES[i].id, grp, C, o, f,
    people: [], st: {}, disabled: false, lights: [],
    cyc: { start: null, len: 25, n: 0, r: 1 + i * 7919 },
    join: { x: -2.4, z: -2.1, pose: 'stand' },
    greet: 0, glow: null,
  };
  const V = function () { return new T.Vector3(); };

  ctx.W = function (x, z, y, v) {
    const wx = C.x + o.x * x + f.x * z, wz = C.z + o.z * x + f.z * z;
    return (v || V()).set(wx, wf3dGround(wx, wz) + (y || 0), wz);
  };
  // World yaw for a person (modelled facing +z) to look along local (dx, dz).
  ctx.yaw = function (dx, dz) {
    return Math.atan2(o.x * dx + f.x * dz, o.z * dx + f.z * dz);
  };
  // Deterministic per-station random (new values each cycle).
  ctx.rand = function () {
    ctx.cyc.r = (ctx.cyc.r * 1103515245 + 12345) % 2147483648;
    return ctx.cyc.r / 2147483648;
  };

  const add = function (m, shadow) {
    m.castShadow = shadow !== false; m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  ctx.add = add;
  ctx.mesh = function (geo, hex, x, z, y, opts) {
    const m = add(new T.Mesh(geo, wf3dMat(hex, opts)));
    ctx.W(x, z, y || 0, m.position);
    return m;
  };
  ctx.stone = function (x, z, r, hex) {
    const m = add(new T.Mesh(wf3dStoneGeo(), wf3dMat(hex || 0x9A9382)));
    ctx.W(x, z, r * 0.2, m.position);
    m.scale.set(r, r * 0.55, r * 0.9);
    m.rotation.y = x * 3.1 + z * 1.7;
    return m;
  };
  // A log/stick/pole between two local points (y given per end).
  ctx.log = function (x1, z1, y1, x2, z2, y2, r, hex) {
    const A = ctx.W(x1, z1, y1), B = ctx.W(x2, z2, y2);
    const m = add(new T.Mesh(new T.CylinderGeometry(r * 0.85, r, A.distanceTo(B), 7), wf3dMat(hex || 0x6E5847)));
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    return m;
  };
  ctx.post = function (x, z, h, r, hex) {
    const m = add(new T.Mesh(new T.CylinderGeometry(r * 0.85, r, h, 7), wf3dMat(hex || 0x6E5847)));
    ctx.W(x, z, h / 2, m.position);
    return m;
  };
  ctx.blob = function (x, z, y, sx, sy, sz, hex) {
    const m = add(new T.Mesh(wf3dBushGeo(), wf3dMat(hex)));
    ctx.W(x, z, y, m.position);
    m.scale.set(sx, sy, sz);
    return m;
  };
  ctx.tree = function (x, z, h, hex) {
    const trunk = ctx.post(x, z, h * 0.75, 0.2, 0x7E6654);
    const crown = ctx.blob(x, z, h * 0.78, 1.7, 1.5, 1.7, hex || 0x5B8872);
    return { trunk, crown };
  };
  ctx.pine = function (x, z, h) {
    ctx.post(x, z, h * 0.4, 0.16, 0x7E6654);
    for (let k = 0; k < 3; k++) {
      const m = add(new T.Mesh(new T.ConeGeometry(1.3 - k * 0.32, h * 0.38, 9), wf3dMat(0x4E7A68)));
      ctx.W(x, z, h * (0.36 + k * 0.2), m.position);
    }
  };
  // Flat things lying on the ground: discs, rings, ribbons.
  ctx.disc = function (x, z, r, hex, opacity, y) {
    const m = new T.Mesh(new T.CircleGeometry(r, 20), new T.MeshLambertMaterial({ color: hex, transparent: opacity < 1, opacity: opacity, depthWrite: opacity >= 1, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2;
    ctx.W(x, z, y || 0.04, m.position);
    m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  ctx.ring = function (x, z, r, hex, opacity) {
    const m = new T.Mesh(new T.TorusGeometry(r, 0.022, 6, 48), new T.MeshBasicMaterial({ color: hex || 0x7FA396, transparent: true, opacity: opacity == null ? 0.6 : opacity }));
    m.rotation.x = -Math.PI / 2;
    ctx.W(x, z, 0.05, m.position);
    grp.add(m);
    return m;
  };
  // A ribbon laid on the ground along local points [[x, z], ...].
  ctx.strip = function (pts, width, hex, opacity) {
    const pos = [], idx = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= l; dz /= l;
      const nx = -dz * width / 2, nz = dx * width / 2;
      const L = ctx.W(pts[k][0] + nx, pts[k][1] + nz, 0.05), R = ctx.W(pts[k][0] - nx, pts[k][1] - nz, 0.05);
      pos.push(L.x, L.y, L.z, R.x, R.y, R.z);
      if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ color: hex, side: T.DoubleSide, transparent: opacity != null && opacity < 1, opacity: opacity == null ? 1 : opacity, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: !(opacity < 1) }));
    m.receiveShadow = true; m.renderOrder = 2;
    grp.add(m);
    return m;
  };
  // People: the prototype silhouette (wf3dPerson), standing at local (x, z)
  // and facing local point (tx, tz). ctx.face/walk keep h.yaw as the
  // person's own intended facing; the arrival glance is layered on top.
  ctx.person = function (pose, x, z, tx, tz, h, seat) {
    const p = wf3dPerson(pose, h || 1.7);
    grp.add(p.group);
    const hd = { p, x, z, yaw: 0, seed: ctx.people.length * 1.7 + i, gait: 0, moving: 0, seat: seat || 0 };
    ctx.W(x, z, seat || 0, p.group.position);
    hd.yaw = ctx.yaw(tx - x, tz - z);
    p.group.rotation.y = hd.yaw;
    ctx.people.push(hd);
    return hd;
  };
  ctx.face = function (hd, tx, tz, amt) {
    const y = ctx.yaw(tx - hd.x, tz - hd.z);
    hd.yaw = amt == null ? y : wf3dsAngLerp(hd.yaw, y, wf3dsK(amt));
  };
  ctx.place = function (hd, x, z) {
    hd.x = x; hd.z = z;
    ctx.W(x, z, hd.seat, hd.p.group.position);
  };
  // Move toward (x, z) this frame, turning to face the way it goes and
  // swinging legs/arms by the distance actually covered (so it never
  // skates, whatever the pace).
  ctx.walkTo = function (hd, x, z) {
    const dx = x - hd.x, dz = z - hd.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.002) hd.yaw = wf3dsAngLerp(hd.yaw, ctx.yaw(dx, dz), wf3dsK(0.25));
    hd.gait += d / 1.3;
    hd.moving = Math.min(1, d * 40);
    ctx.place(hd, x, z);
  };
  // Hand-held object: parented to the arm pivot, at the hand.
  ctx.hold = function (hd, mesh, left) {
    const arm = left ? hd.p.armL : hd.p.armR;
    if (mesh.parent) mesh.parent.remove(mesh);
    arm.add(mesh);
    mesh.position.set(0, -40 * hd.p.k - 0.02, 0.04);   // the hand: end of the 40-unit arm
    return mesh;
  };
  // Arm pitch that points from the shoulder at a local point (x, z, y).
  ctx.aim = function (hd, x, z, y) {
    const d = Math.hypot(x - hd.x, z - hd.z) || 0.01;
    const dy = y - (hd.p.hipY + 48 * hd.p.k);
    return -(Math.PI / 2 + Math.atan2(dy, d));
  };
  // Point along the local path (px, pz) from a local point (lx, lz):
  ctx.pathPoint = function (pts, s) {
    // s in 0..1 along a polyline, by length.
    if (!pts._len) {
      let L = 0; pts._cum = [0];
      for (let k = 1; k < pts.length; k++) { L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); pts._cum.push(L); }
      pts._len = L;
    }
    const d = wf3dsClamp(s) * pts._len;
    let k = 1;
    while (k < pts.length - 1 && pts._cum[k] < d) k++;
    const a = pts._cum[k - 1], b = pts._cum[k], t = b > a ? (d - a) / (b - a) : 0;
    return [wf3dsLerp(pts[k - 1][0], pts[k][0], t), wf3dsLerp(pts[k - 1][1], pts[k][1], t)];
  };
  // In-world words (wfWords(): the activity's own illustration labels,
  // translated) — rendered by wf3dBuildLabels, faded by distance; a
  // station raises/lowers each label's emphasis as its action moves.
  ctx.word = function (words, x, z, y) {
    // words: index/indices into wfWords(activity), or {key: i18n key}.
    const key = words && words.key;
    const spec = { stop: i, id: ctx.id, key: key || null, words: key ? [] : [].concat(words), pos: ctx.W(x, z, y), emph: 1, sprite: null };
    WF3D.labelSpecs.push(spec);
    return spec;
  };
  // A fire: flame cones + ground glow (+ a flickering light on tiers that
  // allow it). intensity 0..1 is driven by the station's action; embers
  // and smoke (wf3dStepPhysics) scale with it.
  ctx.fire = function (x, z, size) {
    const q = ctx.W(x, z, 0.04);
    const g = new T.Group();
    const addm = { transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, fog: false };
    const outer = new T.Mesh(new T.ConeGeometry(0.2 * size, 0.62 * size, 9, 1, true), new T.MeshBasicMaterial(Object.assign({ color: 0xC8501E, opacity: 0.85 }, addm)));
    const inner = new T.Mesh(new T.ConeGeometry(0.11 * size, 0.38 * size, 8, 1, true), new T.MeshBasicMaterial(Object.assign({ color: 0xFFC070, opacity: 0.9 }, addm)));
    const glow = new T.Mesh(new T.CircleGeometry(1.6 * size, 24), new T.MeshBasicMaterial(Object.assign({ map: wf3dGlowTex(), color: 0xFF9A5A, opacity: 0.55 }, addm)));
    outer.position.y = 0.31 * size; inner.position.y = 0.2 * size;
    glow.rotation.x = -Math.PI / 2;
    const flame = new T.Group();
    flame.add(outer, inner);
    g.add(flame, glow);
    g.position.copy(q);
    grp.add(g);
    // The flicker is carried by the one shared station light (see
    // wf3dsSharedLight): a point light per fire costs every lit pixel in
    // the scene, near or far, on every frame.
    const light = { isVirtual: true, color: new T.Color(0xFF9A5A), intensity: 0.9, distance: 7, position: new T.Vector3(q.x, q.y + 0.5, q.z) };
    ctx.lights.push(light);
    const fire = { obj: g, flame, glow, light, stop: i, pos: q.clone(), size, acc: 0, intensity: 1 };
    WF3D.fire.push(fire);
    return fire;
  };
  return ctx;
}

// ───────── the stations ─────────
// build(ctx) lays out the scene once; act(ctx, u, t, dt) runs every frame
// while the station is near, with u = 0..1 through the current loop.
const WF3DS = {};

// 1 · Introduce yourself — spell your name there in sticks, leaves and
// stones. The name is already nearly done when we arrive; the maker, on
// their knees beside it, sets the last two stones of the O in place, sits
// back to look, and (as the loop turns) lifts them to set them again.
WF3DS.introduce = {
  build(ctx) {
    const stick = function (x1, z1, x2, z2) { ctx.log(x1, z1, 0.05, x2, z2, 0.05, 0.05, 0x7E6654); };
    const leaf = function (x, z, hex) { ctx.disc(x, z, 0.16, hex, 1, 0.04).scale.set(1, 1.6, 1); };
    // L, O (a ring of stones), E, then a flourish of leaves — read from the path side.
    stick(-0.7, -2.2, 0.5, -2.2); stick(0.5, -2.2, 0.5, -1.5);
    ctx.stone(-0.55, -0.9, 0.17, 0xB6AE98); ctx.stone(-0.05, -0.55, 0.17, 0xB6AE98);
    stick(-0.7, 0.1, 0.5, 0.1); stick(-0.7, 0.1, -0.7, 0.75); stick(-0.1, 0.1, -0.1, 0.65); stick(0.5, 0.1, 0.5, 0.75);
    leaf(0.0, 1.3, 0xB8552E); leaf(-0.4, 1.6, 0xC9A04E); leaf(0.35, 1.7, 0x7FA396);
    // The two stones still to place: resting in a little pile by the maker.
    const last = [[0.45, -0.9], [-0.05, -1.25]].map(function (q, k) {
      const m = ctx.stone(q[0], q[1], 0.17, 0xB6AE98);
      return { m, x: q[0], z: q[1], pile: [1.05, -1.45 + k * 0.25] };
    });
    ctx.st.last = last;
    ctx.st.maker = ctx.person('kneel', 0.95, -1.05, 0.2, -1.05);
    ctx.join = { x: -2.3, z: -2.4, pose: 'stand' };
    ctx.camH = 3.6;
    ctx.pin = [0.2, -0.3, 2.2];
  },
  act(ctx, u, t, dt) {
    const S = ctx.st, M = S.maker, m = M.p;
    // Stone 1 goes in over 0.12–0.38, stone 2 over 0.46–0.72; sit back;
    // then both drift back to the pile (0.9–1) so the next loop can place them.
    const spans = [[0.12, 0.38], [0.46, 0.72]];
    let reach = 0, tx = -0.2, tz = -1.05;
    S.last.forEach(function (st, k) {
      const e = wf3dsEase(wf3dsSeg(u, spans[k][0], spans[k][1]));
      const back = wf3dsEase(wf3dsSeg(u, 0.9, 1));
      const f = e * (1 - back);
      const x = wf3dsLerp(st.pile[0], st.x, f), z = wf3dsLerp(st.pile[1], st.z, f);
      ctx.W(x, z, 0.03 + 0.28 * Math.sin(Math.PI * wf3dsSeg(u, spans[k][0], spans[k][1])) * (1 - back), st.m.position);
      const r = wf3dsBell(u, spans[k][0] - 0.03, spans[k][1] + 0.03);
      if (r > reach) { reach = r; tx = x; tz = z; }
    });
    ctx.face(M, tx, tz, 0.08);
    m.armR.rotation.x = wf3dsTo(m.armR.rotation.x, -0.3 - 0.55 * reach, 0.12);
    m.chest.rotation.x = wf3dsTo(m.chest.rotation.x, -0.08 - 0.35 * reach + 0.03 * wf3dsWob(t, 1), 0.1);
  },
};

// 2 · The soundscape map — sit still, mark where sounds come from. A seated
// listener with a clipboard; each source (bird, wind, stream, far voices)
// sounds in turn with a soft ripple where it is, and the listener turns
// toward it and marks the board. Around them, concentric awareness rings
// widen and fade — no lines from the sounds to the listener.
WF3DS.soundscape = {
  build(ctx) {
    const T = THREE;
    const L = ctx.st.listener = ctx.person('sit', 0, 0, -1, 0);
    const board = new T.Mesh(new T.BoxGeometry(0.26, 0.02, 0.2), wf3dMat(0xE6DCC4));
    ctx.hold(L, board); board.rotation.x = 1.2;
    ctx.ring(0, 0, 1.1, 0xE8F0E6, 0.55); ctx.ring(0, 0, 1.9, 0xE8F0E6, 0.35);
    const src = [
      { k: 0, x: 2.4, z: 2.4, y: 2.2 },    // birdsong
      { k: 1, x: -0.6, z: 3.4, y: 1.4 },   // wind
      { k: 2, x: 2.8, z: -2.2, y: 0.3 },   // stream
      { k: 3, x: 4.6, z: 0.6, y: 1.2 },    // distant voices
    ];
    ctx.tree(2.9, 2.9, 5.5, 0x62907A);
    ctx.log(2.9, 2.9, 2.0, 2.3, 2.3, 2.25, 0.05, 0x7E6654);                 // a branch
    ctx.blob(2.4, 2.4, 2.4, 0.16, 0.14, 0.24, 0x5B4636);                    // the bird on it
    ctx.blob(2.4, 2.25, 2.5, 0.1, 0.1, 0.1, 0x5B4636);
    ctx.blob(-0.6, 3.4, 0.7, 1.0, 0.9, 1.0, 0x62907A);                      // leaves in the wind
    ctx.strip([[2.0, -3.4], [2.6, -2.4], [3.0, -1.4], [3.6, -0.6]], 0.7, 0x9FB6B0, 1);   // the stream
    ctx.stone(2.4, -2.9, 0.14); ctx.stone(3.2, -1.2, 0.12);
    ctx.person('stand', 4.6, 0.3, 4.6, 1.3, 1.3); ctx.person('stand', 4.7, 1.0, 4.6, 0, 1.25);   // far voices
    // No lines between the sounds and the listener (Ivo: the concentric
    // circles are the image of this activity, as in the Pocketbook
    // drawing). Awareness rings widen gently around the listener; a sound
    // shows only as a soft ripple where it comes from.
    src.forEach(function (s) {
      s.A = ctx.W(s.x, s.z, s.y);
      s.pulse = new T.Mesh(new T.TorusGeometry(0.3, 0.02, 6, 32), new T.MeshBasicMaterial({ color: 0xFBF9F4, transparent: true, opacity: 0 }));
      s.pulse.position.copy(s.A);
      ctx.grp.add(s.pulse);
      s.label = ctx.word(s.k, s.x, s.z, s.y + 0.6);
    });
    ctx.st.waves = [0, 1, 2].map(function () {
      const m = new T.Mesh(new T.TorusGeometry(1, 0.05, 6, 64), new T.MeshBasicMaterial({ color: 0xE8F0E6, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      ctx.W(0, 0, 0.06, m.position);
      ctx.grp.add(m);
      return m;
    });
    ctx.st.src = src;
    ctx.join = { x: -1.9, z: -1.5, pose: 'sit', fx: 0, fz: 0.5 };
    ctx.pin = [0, 0.6, 2.0];
  },
  cycle(ctx) {
    // A fresh order and spacing each loop.
    const o = [0, 1, 2, 3];
    for (let k = 3; k > 0; k--) { const j = Math.floor(ctx.rand() * (k + 1)); const tmp = o[k]; o[k] = o[j]; o[j] = tmp; }
    ctx.st.order = o;
    ctx.st.at = o.map(function (_, k) { return 0.06 + k * 0.22 + ctx.rand() * 0.06; });
  },
  act(ctx, u, t) {
    const S = ctx.st, L = S.listener.p;
    let hearing = null;
    S.src.forEach(function (s) { s.label.emph = 0.35; s.pulse.material.opacity = 0; });
    // Awareness rings: widening from the listener, staggered, like the drawing.
    S.waves.forEach(function (m, k) {
      const ph = ((t / 6) + k / 3) % 1;
      const r = 0.6 + ph * 2.8;
      m.scale.set(r, r, 1);   // wider, not thicker
      m.material.opacity = 0.75 * Math.sin(Math.PI * ph);
    });
    S.order.forEach(function (idx, k) {
      const s = S.src[idx], a = S.at[k], e = wf3dsSeg(u, a, a + 0.14);
      if (e <= 0 || e >= 1) return;
      hearing = s;
      const pr = wf3dsSeg(e, 0, 0.5);
      s.pulse.scale.setScalar(0.3 + pr * 2.2);
      s.pulse.material.opacity = 0.7 * (1 - pr);
      s.pulse.lookAt(ctx.W(0, 0, s.y));
      s.label.emph = 1;
    });
    if (hearing) {
      ctx.face(S.listener, hearing.x, hearing.z, 0.03);
      L.armR.rotation.x = -1.0 + 0.08 * Math.sin(t * 9);        // marking the board
    } else {
      ctx.face(S.listener, -1, 0.3, 0.01);
      L.armR.rotation.x = wf3dsTo(L.armR.rotation.x, -0.9, 0.05);
    }
  },
};

// 3 · Getting to know the forest — "I'll point a few things out." A guide,
// a little apart, points in turn at an acorn, a beetle on a fallen log, and
// a broad oak; the two young people turn to what's pointed at. (Acorn drawn
// larger than life — at real size it's invisible from the path — with a
// clear cap: the redraw note found it read as a bucket at thumbnail size.)
WF3DS.naming = {
  build(ctx) {
    const T = THREE;
    // The oak: thick trunk, broad low crown — unlike the trail's trees.
    ctx.post(2.6, 1.9, 2.4, 0.38, 0x7A6452);
    ctx.blob(2.6, 1.9, 3.2, 2.6, 1.3, 2.4, 0x7FA38A);
    ctx.blob(1.9, 1.3, 2.8, 1.4, 0.9, 1.4, 0x72987F);
    ctx.log(0.9, -2.3, 0.2, 0.9, -0.7, 0.18, 0.2, 0x7E6654);            // fallen log, lying lengthwise
    const beetle = ctx.mesh(new T.SphereGeometry(0.1, 10, 7), 0x2A2A24, 0.9, -1.5, 0.42);
    beetle.scale.set(1, 0.6, 1.5);
    const acorn = ctx.mesh(new T.SphereGeometry(0.14, 10, 8), 0x9A6B3E, 0.4, 0.5, 0.16);
    acorn.scale.set(0.85, 1.2, 0.85);
    ctx.mesh(new T.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x6E5847, 0.4, 0.5, 0.28);
    ctx.st.targets = [
      { x: 0.4, z: 0.5, y: 0.16, lab: ctx.word(0, 0.4, 0.5, 0.75) },
      { x: 0.9, z: -1.5, y: 0.42, lab: ctx.word(1, 0.9, -1.5, 0.95) },
      { x: 2.4, z: 1.8, y: 2.6, lab: ctx.word(2, 2.6, 1.9, 4.0) },
    ];
    ctx.st.beetle = beetle;
    // The guide on the far side, facing the two (and us): the pointing arm
    // is seen side-on. The two young people spread apart, nearer the path.
    ctx.st.guide = ctx.person('stand', 1.5, -0.1, -1, 0);
    ctx.st.a = ctx.person('stand', -0.5, 1.3, 1, -0.3, 1.55);
    ctx.st.b = ctx.person('stand', -0.7, -1.2, 1, 0.3, 1.6);
    ctx.join = { x: -2.4, z: -2.0, pose: 'stand' };
    ctx.pin = [0.3, 0.2, 2.2];
  },
  cycle(ctx) { ctx.st.j = [0, 1, 2].map(function () { return (ctx.rand() - 0.5) * 0.05; }); },
  act(ctx, u, t) {
    const S = ctx.st, G = S.guide.p;
    const spans = [[0.04, 0.3], [0.36, 0.62], [0.68, 0.94]];
    let tgt = null;
    S.targets.forEach(function (g, k) {
      const a = spans[k][0] + S.j[k], b = spans[k][1] + S.j[k];
      const on = wf3dsBell(u, a, b);
      g.lab.emph = 0.25 + 0.75 * wf3dsClamp(on * 1.6);
      if (u > a && u < b) tgt = g;
    });
    if (tgt) {
      ctx.face(S.guide, tgt.x, tgt.z, 0.06);
      G.armR.rotation.x = wf3dsTo(G.armR.rotation.x, ctx.aim(S.guide, tgt.x, tgt.z, tgt.y), 0.06);
      ctx.face(S.a, tgt.x, tgt.z, 0.03); ctx.face(S.b, tgt.x, tgt.z, 0.03);
    } else {
      G.armR.rotation.x = wf3dsTo(G.armR.rotation.x, -0.1, 0.05);
      ctx.face(S.guide, -1, 0, 0.03);
      ctx.face(S.a, 1.5, -0.1, 0.02); ctx.face(S.b, 1.5, -0.1, 0.02);
    }
    // The beetle wanders along the top of the log.
    const bz = -1.5 + 0.5 * wf3dsWob(t * 0.4, 3);
    ctx.W(0.9, bz, 0.42, S.beetle.position);
    S.beetle.rotation.y = ctx.yaw(0, 1) + 0.4 * Math.sin(t * 2);
  },
};

// 4 · The hammock — hung between two trees, empty (Ivo kept the
// illustration's hammock empty) until the walker arrives and climbs in.
// Now and then a breath of wind rocks it.
WF3DS.hammock = {
  build(ctx) {
    // Hung across the view (out from the path), so it's seen broadside
    // from the trail instead of end-on through a trunk.
    ctx.tree(-2.0, 0.6, 7, 0x5B8872);
    ctx.tree(2.4, 0.9, 7.5, 0x62907A);
    wf3dBuildHammock(ctx.W(-1.8, 0.6, 1.55), ctx.W(2.2, 0.9, 1.55), ctx.i, ctx.grp);
    ctx.word(0, 1.2, 0.3, 2.1);
    ctx.join = { x: 0.1, z: 0, pose: 'hammock' };
    ctx.pin = [0.6, 0, 2.6];
  },
  cycle(ctx) { ctx.st.push = [0.1 + ctx.rand() * 0.2, 0.55 + ctx.rand() * 0.25]; ctx.st.done = [false, false]; },
  act(ctx, u) {
    const cl = WF3D.cloth;
    if (!cl || cl.stop !== ctx.i) return;
    ctx.st.push.forEach(function (p, k) {
      if (!ctx.st.done[k] && u > p) {
        ctx.st.done[k] = true;
        wfpVerletImpulse(cl.v, ctx.o.x * 0.5, 0, ctx.o.z * 0.5);
      }
    });
  },
};

// 5 · Barefoot trail — one continuous path of five grounds (grass, soil,
// bark, moss, stone), shoes left at the start, two people walking it very
// slowly, bare footprints left behind them. They walk back round the side,
// so the loop has no jump.
WF3DS.barefoot = {
  build(ctx) {
    const T = THREE;
    const route = [[-2.4, -2.8], [-1.2, -1.9], [-0.2, -0.8], [0.6, 0.4], [1.2, 1.6], [2.0, 2.8]];
    const grounds = [[0x8FB08A, 'grass'], [0x7A5E48, 'soil'], [0xA07F5C, 'bark'], [0x5E8C73, 'moss'], [0xB2AB98, 'stone']];
    for (let k = 0; k < 5; k++) {
      const a = route[k], b = route[k + 1];
      ctx.strip([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], 1.1, grounds[k][0], 1);
      ctx.word(k, (a[0] + b[0]) / 2 - 0.7, (a[1] + b[1]) / 2 - 0.3, 0.45);
    }
    for (let k = 0; k < 7; k++) ctx.stone(1.2 + k * 0.12 + Math.sin(k) * 0.2, 1.7 + k * 0.16, 0.08, 0xC2BCA8);
    for (let k = 0; k < 9; k++) { const s = ctx.mesh(new T.BoxGeometry(0.12, 0.02, 0.05), 0x8A6A4C, 0.3 + Math.sin(k * 2) * 0.35, 0.8 + k * 0.1, 0.06); s.rotation.y = k; }
    // The shoes, left side by side at the start.
    // A pair of shoes: sole, rounded toe and an open heel collar — the
    // iconic silhouette (the redraw note: boxes read as bricks or beetles).
    [-0.09, 0.09].forEach(function (dz) {
      const shoe = new T.Group();
      const sole = new T.Mesh(new T.BoxGeometry(0.1, 0.03, 0.3), wf3dMat(0x3A2E22)); sole.position.y = 0.015;
      const toe = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), wf3dMat(0x8A6A4C)); toe.scale.set(0.85, 0.7, 2.0); toe.position.set(0, 0.045, 0.03);
      const heel = new T.Mesh(new T.CylinderGeometry(0.05, 0.052, 0.07, 12, 1, true), wf3dMat(0x8A6A4C, { side: T.DoubleSide })); heel.position.set(0, 0.06, -0.09);
      const hole = new T.Mesh(new T.CircleGeometry(0.046, 12), wf3dMat(0x2A211A)); hole.rotation.x = -Math.PI / 2; hole.position.set(0, 0.092, -0.09);
      shoe.add(sole, toe, heel, hole);
      shoe.traverse(function (o) { o.castShadow = true; });
      // Side-on to the viewer (toes pointing across the view), side by side.
      ctx.W(-1.7 + dz * 1.8, -2.5 - dz * 1.8, 0, shoe.position);
      shoe.rotation.y = ctx.yaw(1, -1);
      shoe.scale.setScalar(1.4);
      ctx.grp.add(shoe);
    });
    const back = [[2.0, 2.8], [2.9, 1.6], [2.8, -0.8], [1.6, -2.8], [-0.4, -3.6], [-2.4, -2.8]];
    ctx.st.fwd = route; ctx.st.back = back;
    ctx.st.a = ctx.person('stand', -2.4, -2.8, 0, 0);
    ctx.st.b = ctx.person('stand', -2.8, -3.4, 0, 0, 1.6);
    [ctx.st.a, ctx.st.b].forEach(function (h) { h.p.footL.material = h.p.footR.material = wf3dMat(0xC9A88A); });
    // Footprints: a small pool of pale prints, recycled.
    ctx.st.prints = [];
    for (let k = 0; k < 24; k++) {
      const m = ctx.disc(0, 0, 0.07, 0xF2EBD8, 0.0, 0.07);
      m.scale.set(1, 1.8, 1);
      ctx.st.prints.push({ m, age: 99 });
    }
    ctx.st.pk = 0;
    ctx.join = { x: -3.0, z: -1.6, pose: 'stand' };
  },
  act(ctx, u, t, dt) {
    const S = ctx.st;
    const step = function (h, s) {
      const onPath = s < 0.62;
      const q = onPath ? ctx.pathPoint(S.fwd, s / 0.62) : ctx.pathPoint(S.back, (s - 0.62) / 0.38);
      const before = Math.floor(h.gait * 2);
      ctx.walkTo(h, q[0], q[1]);
      // Very slowly on the textures: the arms barely swing, the head bows.
      h.p.head.position.z = onPath ? 0.03 : 0;
      if (onPath && Math.floor(h.gait * 2) !== before) {
        const pr = S.prints[S.pk++ % S.prints.length];
        const side = before % 2 ? 0.09 : -0.09;
        ctx.W(q[0] - side * 0.5, q[1] + side, 0.07, pr.m.position);
        pr.m.rotation.z = -h.yaw + Math.PI;
        pr.age = 0;
      }
    };
    step(S.a, u);
    step(S.b, (u + 0.93) % 1);
    S.prints.forEach(function (pr) {
      pr.age += dt;
      pr.m.material.opacity = Math.max(0, 0.75 * (1 - pr.age / 7));
    });
  },
};

// 6 · Colour palette walk — find something that matches each colour,
// without picking it up. A person with a small palette card holds it up
// beside moss, lichen and bark in turn; the palette line of swatches
// hangs nearby and sways when they come back to it.
WF3DS.palette = {
  build(ctx) {
    const T = THREE;
    ctx.post(-1.2, -1.9, 1.2, 0.04, 0x7E6654); ctx.post(-0.6, 1.8, 1.2, 0.04, 0x7E6654);
    wf3dBuildPaletteLine(ctx.W(-1.2, -1.9, 1.15), ctx.W(-0.6, 1.8, 1.15), ctx.i, ctx.grp);
    if (WF3D.rope && WF3D.rope.stop === ctx.i) WF3D.rope.swatches.forEach(function (m) { m.scale.set(1.8, 1.7, 1); m.userData.face = true; });
    ctx.stone(1.0, -1.7, 0.4, 0x9A9382); ctx.blob(1.0, -1.7, 0.3, 0.35, 0.15, 0.3, 0x5E8C73);   // moss on a stone
    ctx.post(2.2, 0.4, 0.55, 0.3, 0x8A7560); ctx.blob(2.2, 0.4, 0.58, 0.28, 0.08, 0.28, 0xC8CFA8); // lichen on a stump
    ctx.tree(1.2, 2.6, 7, 0x5B8872);                                                              // bark
    ctx.st.spots = [
      { x: 0.6, z: -1.4, look: [1.0, -1.7], arm: -0.8, lab: ctx.word(0, 1.0, -1.7, 1.0) },
      { x: 1.8, z: 0.3, look: [2.2, 0.4], arm: -1.0, lab: ctx.word(1, 2.2, 0.4, 1.2) },
      { x: 0.9, z: 2.1, look: [1.2, 2.6], arm: -1.5, lab: ctx.word(2, 1.2, 2.6, 1.9) },
    ];
    // The palette card: pale with four colour chips, big enough to see.
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#F7F3E8'; cx.fillRect(0, 0, 64, 96);
    ['#3F6B54', '#7FA396', '#8A6C52', '#C8CFA8'].forEach(function (c, k) { cx.fillStyle = c; cx.fillRect(8, 8 + k * 21, 48, 17); });
    const card = new T.Mesh(new T.BoxGeometry(0.3, 0.44, 0.012), new T.MeshLambertMaterial({ map: new T.CanvasTexture(cv) }));
    ctx.st.p = ctx.person('stand', -0.6, -0.2, 1, 0);
    ctx.hold(ctx.st.p, card);
    ctx.st.card = card;
    ctx.st.q = ctx.person('stand', -1.4, 0.8, -1.1, 0.2, 1.6);
    ctx.join = { x: -2.6, z: -2.0, pose: 'stand' };
    ctx.st.home = [-0.6, -0.2];
  },
  cycle(ctx) { ctx.st.nudged = false; },
  act(ctx, u) {
    const S = ctx.st, P = S.p;
    // Walk / hold / walk / hold / walk / hold / walk home.
    const legs = [S.home, [S.spots[0].x, S.spots[0].z], [S.spots[1].x, S.spots[1].z], [S.spots[2].x, S.spots[2].z], S.home];
    const bands = [[0, 0.1], [0.28, 0.38], [0.54, 0.64], [0.82, 0.95]];
    let held = -1;
    for (let k = 0; k < 4; k++) {
      const b = bands[k];
      if (u >= b[0] && u < b[1]) {
        const e = wf3dsEase(wf3dsSeg(u, b[0], b[1]));
        ctx.walkTo(P, wf3dsLerp(legs[k][0], legs[k + 1][0], e), wf3dsLerp(legs[k][1], legs[k + 1][1], e));
      }
      if (k < 3 && u >= b[1] && u < bands[k + 1][0]) held = k;
    }
    S.spots.forEach(function (s, k) { s.lab.emph = held === k ? 1 : 0.3; });
    if (held >= 0) {
      const s = S.spots[held];
      ctx.face(P, s.look[0], s.look[1], 0.08);
      P.p.armR.rotation.x = wf3dsTo(P.p.armR.rotation.x, s.arm, 0.08);
      // Held up beside the find, chips turned so we can see the match.
      S.card.lookAt(WF3D.camera.position);
    } else {
      P.p.armR.rotation.x = wf3dsTo(P.p.armR.rotation.x, -0.6, 0.08);
    }
    if (u > 0.95 && !S.nudged && WF3D.rope && WF3D.rope.stop === ctx.i) {
      S.nudged = true;
      wfpVerletImpulse(WF3D.rope.v, ctx.f.x * 0.8, 0, ctx.f.z * 0.8);
    }
  },
};

// 7 · Five senses inventory — stand still, name what is here, in order.
// Five stones in an arc, numbered 5 to 1 with their sense; the person turns
// to each in turn, and it lights softly. (The labels follow the
// illustration's order; its text contradicts the intro's hear/touch order —
// a content decision flagged in ILLUSTRATION_RECOMMENDATIONS.md, not
// settled here.)
WF3DS.senses = {
  build(ctx) {
    // The five stones lie in a shallow arc across the line of sight (so
    // their words don't stack up), the person just behind, facing us.
    ctx.st.p = ctx.person('stand', 1.3, 1.1, -1, -1);
    ctx.st.stones = [];
    for (let k = 0; k < 5; k++) {
      const s0 = (k - 2) * 0.95;
      const x = -0.3 + s0 * 0.7 + Math.abs(s0) * 0.25, z = 0.2 - s0 * 0.7 + Math.abs(s0) * 0.25;
      const s = ctx.stone(x, z, 0.28, 0xA8A08C);
      const glow = ctx.disc(x, z, 0.6, 0xFFF1C8, 0, 0.06);
      glow.material.blending = THREE.AdditiveBlending;
      ctx.st.stones.push({ x, z, s, glow, num: ctx.word(k, x, z, 1.0), sense: ctx.word(5 + k, x, z, 0.62) });
    }
    ctx.join = { x: -2.6, z: -2.4, pose: 'stand' };
    ctx.pin = [1.3, 1.1, 2.3];
  },
  cycle(ctx) {
    let a = 0.04;
    ctx.st.spans = [0, 1, 2, 3, 4].map(function () { const len = 0.13 + ctx.rand() * 0.06; const s = [a, a + len]; a += len + 0.03 + ctx.rand() * 0.02; return s; });
  },
  act(ctx, u) {
    const S = ctx.st;
    let cur = -1;
    S.stones.forEach(function (s, k) {
      const b = wf3dsBell(u, S.spans[k][0], S.spans[k][1]);
      if (u > S.spans[k][0] && u < S.spans[k][1]) cur = k;
      s.glow.material.opacity = 0.35 * b;
      s.num.emph = 0.3 + 0.7 * b; s.sense.emph = 0.3 + 0.7 * b;
    });
    if (cur >= 0) ctx.face(S.p, S.stones[cur].x, S.stones[cur].z, 0.05);
    else ctx.face(S.p, -0.3, 0.2, 0.02);
  },
};

// 8 · Build a tiny world — two children kneel at its edges, leaning in,
// reaching in turn to add a twig fence, pebbles, a moss roof, an arch.
WF3DS.tinyworld = {
  build(ctx) {
    const T = THREE;
    ctx.disc(0, 0, 1.2, 0x6E8A5E, 1, 0.03);
    ctx.stone(0.3, 0.25, 0.3, 0x7E6654);
    const pieces = [];
    // Pieces built a little larger than life so the world reads from the path.
    const put = function (m, x, z) { m.scale.multiplyScalar(1.5); m.userData.base = m.scale.clone(); m.scale.multiplyScalar(0.001); pieces.push({ m, x, z }); };
    for (let k = 0; k < 5; k++) { const x = -0.45 + k * 0.12, z = -0.35; put(ctx.post(x, z, 0.18, 0.018, 0x8A6A4C), x, z); }
    put(ctx.stone(-0.2, 0.3, 0.07, 0xC2BCA8), -0.2, 0.3);
    put(ctx.stone(-0.05, 0.45, 0.06, 0xA8A08C), -0.05, 0.45);
    put(ctx.blob(0.3, 0.25, 0.28, 0.32, 0.1, 0.3, 0x5E8C73), 0.3, 0.25);
    const arch = new T.Mesh(new T.TorusGeometry(0.16, 0.022, 6, 16, Math.PI), wf3dMat(0x8A6A4C));
    ctx.W(-0.35, 0.1, 0.02, arch.position); arch.rotation.y = ctx.yaw(1, 0);
    ctx.add(arch); put(arch, -0.35, 0.1);
    put(ctx.disc(0.05, -0.1, 0.12, 0x9FB6B0, 1, 0.05), 0.05, -0.1);    // a pond
    ctx.st.pieces = pieces;
    ctx.st.a = ctx.person('kneel', 1.0, -0.9, 0, 0, 1.35);
    ctx.st.b = ctx.person('kneel', 0.7, 1.2, 0, 0, 1.3);
    ctx.camH = 3.0;
    ctx.word(0, 0, 0, 1.4);
    ctx.join = { x: -2.2, z: -1.7, pose: 'stand' };
  },
  act(ctx, u, t) {
    const S = ctx.st, P = S.pieces, n = P.length;
    const b = wf3dsSeg(u, 0.05, 0.8) * n, fade = 1 - wf3dsEase(wf3dsSeg(u, 0.93, 1));
    let cur = -1;
    P.forEach(function (p, k) {
      p.m.scale.copy(p.m.userData.base).multiplyScalar(Math.max(0.001, wf3dsEase(wf3dsClamp(b - k)) * fade));
      if (b >= k && b < k + 1) cur = k;
    });
    [S.a, S.b].forEach(function (h, j) {
      const mine = cur >= 0 && cur % 2 === j && u < 0.82;
      const r = mine ? Math.sin((b % 1) * Math.PI) : 0;
      h.p.armR.rotation.x = wf3dsTo(h.p.armR.rotation.x, mine ? -0.5 - 0.4 * r : -0.4, 0.1);
      h.p.chest.rotation.x = wf3dsTo(h.p.chest.rotation.x, mine ? -0.32 : -0.12 + 0.04 * wf3dsWob(t, j), 0.06);
      if (mine) ctx.face(h, P[cur].x, P[cur].z, 0.05);
      else ctx.face(h, 0, 0, 0.02);
    });
  },
};

// 9 · Building the forest sofa (Waldsofa) — a horseshoe of piled deadwood
// the group sits inside, backs against the pile; four seated shoulder to
// shoulder, one more still dragging a branch in along the ground (dragged,
// not carried on the shoulder — the redraw note: shouldered, it read as a
// spear).
WF3DS.sofa = {
  build(ctx) {
    // The opening faces the arrival view (from the path, a little behind),
    // so the four seated against the pile are seen inside the horseshoe.
    const cx = 1.3, cz = 0.5, rot = Math.PI * 0.3;
    const P = function (a, r) { return [cx + Math.cos(a + rot) * r, cz + Math.sin(a + rot) * r]; };
    const bark = [0x7E6654, 0x6E5847, 0x8A7560];
    for (let layer = 0; layer < 3; layer++) {
      for (let k = 0; k < 11; k++) {
        const a0 = -2.45 + k * 0.45 + layer * 0.18, a1 = a0 + 0.5;
        const r = 1.9 - layer * 0.08, y = 0.12 + layer * 0.2;
        const A = P(a0, r), B = P(a1, r);
        ctx.log(A[0], A[1], y, B[0], B[1], y + 0.04, 0.1 + ((k + layer) % 3) * 0.02, bark[(k + layer) % 3]);
      }
    }
    // Four seated inside the horseshoe, backs to the pile, facing the
    // opening — seen side-on from the path, so their laps read as seated.
    const mouth = P(Math.PI, 2.2);
    [-0.9, -0.3, 0.3, 0.9].forEach(function (a) {
      const q = P(a, 1.25);
      ctx.person('sit', q[0], q[1], mouth[0], mouth[1], 1.6);
    });
    // New branches that arrive on the pile, one per loop (reset every 3).
    ctx.st.slots = [0, 1, 2].map(function (k) {
      const a = -2.2 + k * 0.28;
      const A = P(a, 1.95), B = P(a + 0.55, 1.95);
      const m = ctx.log(A[0], A[1], 0.72, B[0], B[1], 0.7, 0.07, 0x8A7560);
      m.visible = false;
      return m;
    });
    const T = THREE;
    const branch = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 1.8, 6), wf3dMat(0x8A7560));
    branch.castShadow = true;
    ctx.st.branch = branch;
    ctx.st.drop = P(-2.0, 2.5);
    ctx.st.d = ctx.person('stand', 4.2, -3.2, 0, 0);
    ctx.grp.add(branch);
    ctx.word(0, cx, cz, 2.0);
    ctx.join = { x: -2.6, z: -2.4, pose: 'stand' };
    ctx.camH = 3.0;
    ctx.pin = [cx, cz, 2.4];
  },
  cycle(ctx) {
    const S = ctx.st, n = ctx.cyc.n % 3;
    if (n === 0) S.slots.forEach(function (m) { m.visible = false; });
    S.slot = n;
    S.from = [3.8 + ctx.rand(), 2.6 + ctx.rand() * 1.2];
    S.branch.visible = true;
  },
  act(ctx, u) {
    const S = ctx.st, D = S.d, drop = S.drop;
    if (u < 0.5) {
      const e = wf3dsSeg(u, 0.02, 0.5);
      ctx.walkTo(D, wf3dsLerp(S.from[0], drop[0], e), wf3dsLerp(S.from[1], drop[1], e));
      // Dragging: arm back and low, the branch running from the hand down
      // to the ground behind (dragged, not carried).
      D.p.armR.rotation.x = 0.45;
      D.p.group.updateMatrixWorld(true);
      const hand = D.p.armR.localToWorld(new THREE.Vector3(0, -40 * D.p.k, 0));
      const back = new THREE.Vector3(Math.sin(D.p.group.rotation.y), 0, Math.cos(D.p.group.rotation.y)).multiplyScalar(-1.6);
      const tail = hand.clone().add(back);
      tail.y = wf3dGround(tail.x, tail.z) + 0.05;
      S.branch.position.copy(hand).add(tail).multiplyScalar(0.5);
      S.branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hand.clone().sub(tail).normalize());
    } else if (u < 0.6) {
      D.p.chest.rotation.x = -0.4 * wf3dsBell(u, 0.5, 0.6);
      if (u > 0.55 && S.branch.visible) { S.branch.visible = false; S.slots[S.slot].visible = true; }
    } else {
      D.p.chest.rotation.x = 0;
      D.p.armR.rotation.x = wf3dsTo(D.p.armR.rotation.x, 0, 0.1);
      const e = wf3dsSeg(u, 0.62, 1);
      ctx.walkTo(D, wf3dsLerp(drop[0], S.from[0], e), wf3dsLerp(drop[1], S.from[1], e));
    }
  },
};

// 10 · Fire lighting — the practitioner has set the teepee; a young person
// kneels and strikes the fire steel: a few goes that only spark, then it
// catches, grows, burns, and is let die down.
WF3DS.fire = {
  build(ctx) {
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ctx.stone(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.13, 0x9A9382); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; ctx.log(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.02, 0, 0, 0.5, 0.025, 0x8A6A4C); }
    ctx.st.fire = ctx.fire(0, 0, 1.1);
    ctx.st.fire.intensity = 0;
    // Everyone to the sides of the fire as seen from the path, none behind
    // the flame (the campfire redraw note: a flame drawn on a figure reads
    // as the fire touching them).
    ctx.st.y = ctx.person('kneel', 0.45, -1.0, 0, 0, 1.45);         // the one trying
    ctx.st.p = ctx.person('kneel', 0.5, 1.05, 0, 0);                // the practitioner
    ctx.person('sit', -0.6, 1.5, 0, 0, 1.5);
    ctx.word(4, 0, 0, 1.2);
    ctx.join = { x: -2.3, z: -2.0, pose: 'stand' };
  },
  cycle(ctx) {
    const n = 2 + Math.floor(ctx.rand() * 3);                 // 2–4 goes
    const at = [];
    for (let k = 0; k < n; k++) at.push(0.12 + k * (0.36 / n) + ctx.rand() * 0.03);
    ctx.st.strikes = at; ctx.st.hit = at.map(function () { return false; });
    ctx.st.catchAt = at[n - 1];
  },
  act(ctx, u, t) {
    const S = ctx.st, Y = S.y.p, F = S.fire;
    let striking = 0;
    S.strikes.forEach(function (a, k) {
      striking = Math.max(striking, wf3dsBell(u, a - 0.03, a + 0.02));
      if (!S.hit[k] && u > a) {
        S.hit[k] = true;
        const P = WF3D.puffs;
        for (let j = 0; j < 7; j++) wfpSpawn(P, WFP_EMBER, F.pos.x, F.pos.y + 0.15, F.pos.z, (wfpRand(P) - 0.5) * 1.2, 0.6 + wfpRand(P), (wfpRand(P) - 0.5) * 1.2, 0.4 + wfpRand(P) * 0.4, 0.03, 0);
      }
    });
    Y.armR.rotation.x = -0.9 - 0.6 * striking;
    Y.chest.rotation.x = -0.35 - 0.15 * striking;
    const grow = wf3dsEase(wf3dsSeg(u, S.catchAt + 0.01, S.catchAt + 0.16));
    const die = 1 - 0.85 * wf3dsEase(wf3dsSeg(u, 0.86, 0.99));
    F.intensity = grow * die;
    // Once it's going, both sit back a little.
    Y.chest.rotation.x = wf3dsLerp(Y.chest.rotation.x, -0.1, grow * 0.5);
    S.p.p.armR.rotation.x = -0.6 - 0.3 * wf3dsBell(u, 0.02, 0.1) + 0.05 * wf3dsWob(t, 2);
  },
};

// 11 · Bivouac building — a tarp shelter big enough for at least four:
// two already under it, one tightening the ridge line, one bringing and
// knocking in a stake. The tarp's loose edges move in the wind.
WF3DS.bivouac = {
  build(ctx) {
    const T = THREE;
    const A = [-0.8, -1.5], B = [0.9, 1.4], H = 1.35;
    ctx.post(A[0], A[1], H, 0.04, 0x6E5847); ctx.post(B[0], B[1], H, 0.04, 0x6E5847);
    ctx.log(A[0], A[1], H, B[0], B[1], H, 0.03, 0x7E6654);
    // Two tarp sheets as small grids, so their outer edges can flutter.
    const sheets = [];
    [-1, 1].forEach(function (side) {
      const cols = 6, rows = 4, pos = [], idx = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1), v = r / (rows - 1);
        const x = wf3dsLerp(A[0], B[0], u) + side * 1.25 * v * 0.8, z = wf3dsLerp(A[1], B[1], u) - side * 0.9 * v * 0.8;
        const P = ctx.W(x, z, H * (1 - v) + 0.04);
        pos.push(P.x, P.y, P.z);
      }
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c; idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1); }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = ctx.add(new T.Mesh(g, new T.MeshLambertMaterial({ color: side < 0 ? 0x5E8C73 : 0x6E9A80, side: T.DoubleSide })));
      sheets.push({ m, base: pos.slice(), cols, rows });
      const corner = [wf3dsLerp(A[0], B[0], side < 0 ? 0 : 1) + side * 1.0, wf3dsLerp(A[1], B[1], side < 0 ? 0 : 1) - side * 0.72];
      ctx.post(corner[0], corner[1], 0.25, 0.025, 0x8A6A4C);
    });
    ctx.st.sheets = sheets;
    ctx.person('sit', 0.1, -0.4, -1, 0, 1.55);
    ctx.person('sit', 0.5, 0.5, -1, 0.3, 1.5);
    ctx.st.r = ctx.person('reach', -1.3, -1.9, A[0], A[1]);
    ctx.st.c = ctx.person('carry', 3.4, 2.8, 0, 0);
    ctx.st.stake = [1.9, 1.9];
    ctx.word(0, 0, 0, 2.0);
    ctx.word(1, 1.9, 1.9, 0.8);
    ctx.join = { x: -2.6, z: -2.3, pose: 'stand' };
  },
  act(ctx, u, t) {
    const S = ctx.st;
    S.sheets.forEach(function (sh, j) {
      const arr = sh.m.geometry.attributes.position.array;
      for (let r = 1; r < sh.rows; r++) for (let c = 0; c < sh.cols; c++) {
        const o = (r * sh.cols + c) * 3, v = r / (sh.rows - 1);
        arr[o + 1] = sh.base[o + 1] + v * v * 0.06 * Math.sin(t * 3.1 + c * 0.9 + j * 2);
      }
      sh.m.geometry.attributes.position.needsUpdate = true;
    });
    S.r.p.armR.rotation.x = -2.2 + 0.2 * Math.sin(t * 1.7);
    const C = S.c;
    if (u < 0.35) { const e = wf3dsEase(wf3dsSeg(u, 0, 0.35)); ctx.walkTo(C, wf3dsLerp(3.4, S.stake[0] + 0.4, e), wf3dsLerp(2.8, S.stake[1] + 0.3, e)); C.p.hips.position.y = C.p.hipY; }
    else if (u < 0.65) {
      ctx.face(C, S.stake[0], S.stake[1], 0.1);
      C.p.hips.position.y = C.p.hipY * 0.7;               // down on one knee at the stake
      C.p.legL.rotation.x = C.p.legR.rotation.x = 0.45;
      C.p.armR.rotation.x = -1.3 + 0.6 * Math.abs(Math.sin(t * 5));
    } else { C.p.hips.position.y = C.p.hipY; C.p.armR.rotation.x = -1.35; if (u < 0.7) C.p.legL.rotation.x = C.p.legR.rotation.x = 0; const e = wf3dsEase(wf3dsSeg(u, 0.65, 1)); ctx.walkTo(C, wf3dsLerp(S.stake[0] + 0.4, 3.4, e), wf3dsLerp(S.stake[1] + 0.3, 2.8, e)); }
  },
};

// 12 · The sit spot — a place of one's own, returned to. One person on a
// log, facing into the forest, very still; a bird comes down near them now
// and then. The walker takes a spot of their own nearby, within earshot.
WF3DS.sitspot = {
  build(ctx) {
    const T = THREE;
    ctx.log(0.2, 1.6, 0.18, 1.6, -0.2, 0.2, 0.2, 0x7E6654);     // across the view, not end-on
    ctx.pine(2.8, -1.6, 6.5);
    ctx.st.p = ctx.person('sit', 0.9, 0.7, 4, 0.9, 1.7, 0.32);
    ctx.ring(0.9, 0.7, 0.9, 0x8FAEA0, 0.3);
    const bird = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), wf3dMat(0x5B4636)); body.scale.set(1, 0.9, 1.5);
    const w1 = new T.Mesh(new T.BoxGeometry(0.2, 0.01, 0.08), wf3dMat(0x6E5847)), w2 = w1.clone();
    w1.position.x = 0.1; w2.position.x = -0.1;
    bird.add(body, w1, w2);
    ctx.add(bird);
    ctx.st.bird = { g: bird, w1, w2 };
    ctx.word(1, 0.9, 0.9, 1.6);
    ctx.word(3, 2.8, -1.6, 2.4);
    ctx.join = { x: -1.4, z: -2.2, pose: 'sit', fx: 2, fz: -3 };
  },
  cycle(ctx) { ctx.st.flyAt = 0.2 + ctx.rand() * 0.3; ctx.st.side = ctx.rand() < 0.5 ? -1 : 1; },
  act(ctx, u, t) {
    const S = ctx.st, B = S.bird, a = S.flyAt;
    const inn = wf3dsSeg(u, a, a + 0.1), stay = u > a + 0.1 && u < a + 0.35, out = wf3dsSeg(u, a + 0.35, a + 0.45);
    const land = [2.1, 0.9 + S.side * 0.6], sky = [6, S.side * 5];
    let x, z, y;
    if (u < a || u > a + 0.45) { B.g.visible = false; }
    else {
      B.g.visible = true;
      if (!stay && inn < 1) { x = wf3dsLerp(sky[0], land[0], inn); z = wf3dsLerp(sky[1], land[1], inn); y = 4 * (1 - inn) + 0.08; }
      else if (stay) { const hop = Math.abs(Math.sin(t * 3)) * 0.06 * (Math.sin(t * 0.7) > 0.3 ? 1 : 0); x = land[0] + 0.1 * Math.sin(t * 0.8); z = land[1]; y = 0.08 + hop; }
      else { x = wf3dsLerp(land[0], -sky[0] * 0.3, out); z = wf3dsLerp(land[1], -sky[1], out); y = 0.08 + 4 * out; }
      ctx.W(x, z, y, B.g.position);
      const flap = stay ? 0 : Math.sin(t * 22) * 0.7;
      B.w1.rotation.z = flap; B.w2.rotation.z = -flap;
      B.g.rotation.y = ctx.yaw(stay ? -1 : (inn < 1 ? land[0] - sky[0] : -1), stay ? 0.2 : (inn < 1 ? land[1] - sky[1] : -S.side));
    }
    // The sitter turns, very slightly, toward the bird while it's there.
    ctx.face(S.p, stay ? land[0] : 4, stay ? land[1] : 0.9, 0.01);
  },
};

// 13 · Distributed responsibility — each has a role: the water carrier
// brings the water, the fire tender keeps a small stove going for tea, the
// time keeper checks the time and calls the group. Each role's word lights
// while it is being done.
WF3DS.roles = {
  build(ctx) {
    const T = THREE;
    ctx.st.fire = ctx.fire(0.4, 0.2, 0.55);
    ctx.mesh(new T.CylinderGeometry(0.1, 0.12, 0.2, 10), 0x4D6359, 0.4, 0.2, 0.42);        // the kettle
    ctx.strip([[2.4, 3.6], [3.0, 2.6], [3.8, 1.6]], 0.6, 0x9FB6B0, 1);                         // a stream to fetch from
    const can = new T.Mesh(new T.BoxGeometry(0.16, 0.24, 0.12), wf3dMat(0x7FA396));
    ctx.st.w = ctx.person('stand', 3.0, 2.3, 0.4, 0.2);
    ctx.hold(ctx.st.w, can);
    ctx.st.f = ctx.person('kneel', 1.0, -0.3, 0.4, 0.2, 1.6);
    ctx.st.k = ctx.person('stand', -0.6, 1.3, 0.4, 0.2);
    ctx.st.lw = ctx.word([0, 1], 3.0, 2.3, 2.1);
    ctx.st.lf = ctx.word([2, 3], 1.0, -0.3, 1.7);
    ctx.st.lk = ctx.word([4, 5], -0.6, 1.3, 2.1);
    ctx.join = { x: -2.5, z: -2.0, pose: 'stand' };
  },
  cycle(ctx) { ctx.st.check = [0.18 + ctx.rand() * 0.1, 0.62 + ctx.rand() * 0.1]; },
  act(ctx, u, t) {
    const S = ctx.st, W = S.w;
    // Water carrier: stream -> kettle, pour, back.
    const fromS = [3.0, 2.3], toK = [0.9, 0.7];
    let pouring = 0;
    if (u < 0.35) { const e = wf3dsEase(wf3dsSeg(u, 0.02, 0.35)); ctx.walkTo(W, wf3dsLerp(fromS[0], toK[0], e), wf3dsLerp(fromS[1], toK[1], e)); W.p.armR.rotation.x = -0.35; }
    else if (u < 0.47) { pouring = wf3dsBell(u, 0.35, 0.47); ctx.face(W, 0.4, 0.2, 0.1); W.p.armR.rotation.x = -0.35 - 0.9 * pouring; }
    else { const e = wf3dsEase(wf3dsSeg(u, 0.47, 0.82)); ctx.walkTo(W, wf3dsLerp(toK[0], fromS[0], e), wf3dsLerp(toK[1], fromS[1], e)); W.p.armR.rotation.x = -0.35; }
    S.lw.emph = u < 0.5 ? 1 : 0.35;
    // Fire tender: feeds the stove now and then.
    const feed = Math.max(wf3dsBell(u, 0.08, 0.16), wf3dsBell(u, 0.5, 0.58), wf3dsBell(u, 0.84, 0.92));
    S.f.p.armR.rotation.x = -0.7 - 0.6 * feed;
    S.f.p.chest.rotation.x = -0.2 - 0.25 * feed;
    S.lf.emph = feed > 0.2 ? 1 : 0.35;
    // Time keeper: checks the watch twice, then calls the group.
    const look = Math.max(wf3dsBell(u, S.check[0], S.check[0] + 0.08), wf3dsBell(u, S.check[1], S.check[1] + 0.08));
    const call = wf3dsBell(u, 0.9, 0.98);
    S.k.p.armL.rotation.x = -1.3 * look;
    S.k.p.armR.rotation.x = -2.4 * call + 0.2 * call * Math.sin(t * 8);
    S.lk.emph = look > 0.2 || call > 0.2 ? 1 : 0.35;
  },
};

// 14 · The individual project — one young person, one unused patch, a
// piece of work returned to over weeks: sketched on the ground, planned in
// laid sticks, built as a frame, finished as a small den. The loop plays the
// weeks through, the week's words lighting in turn.
WF3DS.project = {
  build(ctx) {
    const T = THREE;
    const out = [[-0.9, -1.1], [1.1, -1.1], [1.1, 1.1], [-0.9, 1.1], [-0.9, -1.1]];
    const sketch = ctx.strip(out, 0.08, 0x5B4636, 1);
    const sticks = [];
    for (let k = 0; k < 4; k++) sticks.push(ctx.log(out[k][0], out[k][1], 0.05, out[k + 1][0], out[k + 1][1], 0.05, 0.05, 0x8A6A4C));
    const frame = [];
    frame.push(ctx.post(-0.9, -1.1, 1.3, 0.05, 0x7E6654), ctx.post(-0.9, 1.1, 1.3, 0.05, 0x7E6654));
    frame.push(ctx.log(-0.9, -1.1, 1.3, -0.9, 1.1, 1.3, 0.05, 0x7E6654));
    for (let k = 0; k < 5; k++) { const z = -1.0 + k * 0.5; frame.push(ctx.log(-0.9, z, 1.28, 1.1, z, 0.05, 0.035, 0x8A6A4C)); }
    const cover = [];
    for (let k = 0; k < 7; k++) { const z = -1.0 + k * 0.33; cover.push(ctx.blob(0.15, z, 0.72, 0.9, 0.12, 0.3, 0x62907A)); cover[k].rotation.z = 0.55; }
    ctx.st.stages = [[sketch], sticks, frame, cover];
    ctx.st.stages.forEach(function (list) { list.forEach(function (m) { m.userData.base = m.scale.clone(); }); });
    ctx.st.p = ctx.person('kneel', -1.4, 0, 1, 0);
    ctx.st.words = [0, 1, 2, 3].map(function (k) { return ctx.word([k * 2, k * 2 + 1], 0.1, 0, 1.9); });
    ctx.join = { x: -2.8, z: -2.2, pose: 'stand' };
    ctx.pin = [-0.4, 1.9, 2.3];
  },
  act(ctx, u, t) {
    const S = ctx.st, P = S.p;
    const stage = Math.min(3, Math.floor(u / 0.22));
    const within = (u % 0.22) / 0.22;
    const fade = 1 - wf3dsEase(wf3dsSeg(u, 0.94, 1));
    S.stages.forEach(function (list, k) {
      const shown = k < stage ? 1 : k === stage ? wf3dsEase(within * 1.2) : 0;
      list.forEach(function (m, j) {
        const e = wf3dsClamp(shown * list.length - j) * fade;
        m.visible = e > 0.01;
        m.scale.copy(m.userData.base).multiplyScalar(Math.max(0.001, e));
      });
    });
    S.words.forEach(function (w, k) { w.emph = k === stage && u < 0.9 ? 1 : 0; });
    // Weeks 1–2 on the knees (scratching the outline, laying sticks), week 3
    // on the feet raising the frame, week 4 standing back beside the den.
    const kneel = stage < 2;
    const done = stage === 3 && within > 0.35;
    P.p.hips.position.y = wf3dsTo(P.p.hips.position.y, kneel ? P.p.hipY * 0.72 : P.p.hipY, 0.1);
    P.p.legL.rotation.x = P.p.legR.rotation.x = wf3dsTo(P.p.legL.rotation.x, kneel ? 0.45 : 0, 0.1);
    const work = Math.abs(Math.sin(t * 2.2));
    const armT = done ? -0.1 : kneel ? -0.35 - 0.3 * work : -2.0 - 0.3 * work;
    P.p.armR.rotation.x = wf3dsTo(P.p.armR.rotation.x, armT, 0.15);
    P.p.chest.rotation.x = wf3dsTo(P.p.chest.rotation.x, kneel ? -0.3 : 0, 0.1);
    ctx.place(P, done ? -1.6 : -1.3 + 0.3 * Math.sin(stage * 1.7), done ? -1.6 : -0.4 + stage * 0.35);
    ctx.face(P, 0.1, 0, 0.1);
  },
};

// 15 · The forest object — find something small that nature has already let
// go of, to take along. Kneeling among small fallen things, the person looks,
// picks one pebble up, turns it over in the hand; one word for what it
// carries lights beside it; it goes into the pocket.
WF3DS.object = {
  build(ctx) {
    const T = THREE;
    ctx.stone(-0.3, 0.5, 0.09, 0xA8A08C);
    ctx.mesh(new T.ConeGeometry(0.06, 0.16, 7), 0x7A5E48, 0.2, 0.7, 0.07).rotation.z = 1.5;   // a cone
    ctx.log(-0.5, -0.4, 0.03, -0.1, -0.2, 0.03, 0.015, 0x8A6A4C);
    ctx.disc(0.3, -0.4, 0.07, 0xC9A04E, 1, 0.03).scale.set(1, 1.7, 1);
    const peb = ctx.mesh(wf3dStoneGeo(), 0x8A6C52, 0, 0.05, 0.05);
    peb.scale.set(0.07, 0.05, 0.06);
    ctx.st.peb = peb; ctx.st.pebHome = peb.position.clone();
    ctx.st.p = ctx.person('kneel', 0.75, 0, -1, 0);
    ctx.st.words = [0, 1, 2, 3].map(function (k) { return ctx.word(k, 0.6, 0.4, 1.5); });
    ctx.join = { x: -2.4, z: -1.8, pose: 'stand' };
  },
  cycle(ctx) { ctx.st.pick = Math.floor(ctx.rand() * 4); },
  act(ctx, u, t) {
    const S = ctx.st, P = S.p.p, peb = S.peb;
    if (u < 0.25) {
      ctx.face(S.p, -1, 0.9 * Math.sin(u * 20), 0.05);           // looking over the ground
      P.chest.rotation.x = -0.35; P.armR.rotation.x = -0.5;
      if (peb.parent !== ctx.grp) { ctx.grp.add(peb); peb.position.copy(S.pebHome); peb.scale.set(0.07, 0.05, 0.06); }
    } else if (u < 0.35) {
      ctx.face(S.p, 0, 0.05, 0.1);
      const r = wf3dsBell(u, 0.25, 0.35);
      P.chest.rotation.x = -0.35 - 0.3 * r; P.armR.rotation.x = -0.5 - 0.5 * r;
      if (u > 0.3 && peb.parent === ctx.grp) { ctx.hold(S.p, peb); peb.scale.set(0.07, 0.05, 0.06); }
    } else if (u < 0.78) {
      // Held up close, turned over slowly.
      P.chest.rotation.x = wf3dsTo(P.chest.rotation.x, -0.1, 0.05);
      P.armR.rotation.x = wf3dsTo(P.armR.rotation.x, -2.0, 0.05);
      peb.rotation.y = t * 0.9; peb.rotation.x = Math.sin(t * 0.7) * 0.6;
    } else if (u < 0.88) {
      P.armR.rotation.x = wf3dsTo(P.armR.rotation.x, -0.1, 0.08);   // into the pocket
      if (u > 0.85) peb.visible = false;
    } else { peb.visible = true; }
    S.words.forEach(function (w, k) { w.emph = k === S.pick ? wf3dsBell(u, 0.4, 0.86) : 0; });
  },
};

// 16 · The silent self check-in — a quiet moment to check inside, for
// yourself only. One person apart, facing into the trees, still; the head
// bows a little with each slow breath. Nothing to fill in, nothing handed
// over, nothing drawn on the body (the redraw note: concentric circles on
// a chest read as a target).
WF3DS.checkin = {
  build(ctx) {
    // One person apart on a log, seen side-on, looking out into the trees.
    ctx.log(0.4, -0.9, 0.2, 0.6, 0.9, 0.22, 0.2, 0x7E6654);
    ctx.st.p = ctx.person('sit', 0.5, 0, 0.5, -4, 1.7, 0.3);
    ctx.word(0, 0.5, 0, 1.7);
    ctx.join = { x: -2.6, z: -2.4, pose: 'stand' };
  },
  act(ctx, u, t) {
    const P = ctx.st.p.p;
    const b = 0.5 + 0.5 * Math.sin(t * 0.55);
    P.chest.rotation.x = -0.06 - 0.1 * b;              // a slow bow with each breath
    // Once in a while, a hand rests on the knee then lifts.
    P.armR.rotation.x = -0.5 - 0.25 * wf3dsBell(u, 0.4, 0.6);
  },
};

// 17 · Campfire close — "let's sit with it for a few minutes." A real
// seated ring round the fire, every figure clear of the flame, the near
// ones at the sides framing it; the walker takes the last place in the
// ring. Someone adds a stick now and then; the fire answers.
WF3DS.campfire = {
  build(ctx) {
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; ctx.stone(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.12, 0x8F8877); }
    ctx.st.fire = ctx.fire(0, 0, 1.0);
    const R = 1.5;
    // Far, two sides, one near-left; the walker takes near-right.
    ctx.st.ring = [0, 1.25, -1.25, -2.35].map(function (a) {
      return ctx.person('sit', Math.cos(a) * R, Math.sin(a) * R, 0, 0, 1.6);
    });
    const ja = 2.35;
    ctx.word(0, 0, 0, 1.9);
    ctx.join = { x: Math.cos(ja) * R, z: Math.sin(ja) * R, pose: 'sit', fx: 0, fz: 0 };
  },
  cycle(ctx) { ctx.st.feeder = Math.floor(ctx.rand() * 3); ctx.st.feedAt = 0.3 + ctx.rand() * 0.4; ctx.st.fed = false; },
  act(ctx, u, t) {
    const S = ctx.st, F = S.fire;
    const lean = wf3dsBell(u, S.feedAt, S.feedAt + 0.1);
    const who = S.ring[S.feeder].p;
    who.chest.rotation.x = -0.35 * lean;
    who.armR.rotation.x = -0.5 - 0.7 * lean;
    if (!S.fed && u > S.feedAt + 0.06) {
      S.fed = true;
      const P = WF3D.puffs;
      for (let j = 0; j < 10; j++) wfpSpawn(P, WFP_EMBER, F.pos.x, F.pos.y + 0.3, F.pos.z, (wfpRand(P) - 0.5) * 0.6, 1 + wfpRand(P), (wfpRand(P) - 0.5) * 0.6, 1 + wfpRand(P), 0.035, 0);
    }
    F.intensity = 0.85 + 0.25 * wf3dsBell(u, S.feedAt + 0.05, S.feedAt + 0.3) + 0.05 * wf3dsWob(t, 5);
  },
};

// 18 · The immersive virtual nature room (3D walk only) — after Ivo's
// sketches (IM/2026/09/30, admin): the trail ends at a plain building with
// double doors and a sign; the walker walks up, the doors open onto
// projected nature, they step inside, and the camera follows into a room
// whose three walls — left, back, right, open toward the viewer — carry
// one continuous landscape that changes over the loop: forest, seaside,
// mountain, desert/park. The walker stands in the middle and takes it in.
// A soft transition in and out, as the IVN guidance asks ("when one passes
// from one space to another space, there must be a soft transition").
const WF3DS_IVN = { w: 7.2, d: 6.0, h: 3.2 };
const WF3DS_IVN_SCENES = ['forest', 'seaside', 'mountain', 'desert'];

// One panorama per scene, painted once (1536×512: the three walls side by
// side, left wall | back wall | right wall).
function wf3dsPaintPanorama(kind, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  let seed = kind.length * 101 + 7;
  const r = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const sky = function (top, bottom, horizon) {
    const g = x.createLinearGradient(0, 0, 0, H * horizon);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    x.fillStyle = g; x.fillRect(0, 0, W, H * horizon + 2);
  };
  const band = function (y0, amp, freq, color, bottom) {
    x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W; px += 8) {
      const y = y0 * H + amp * H * (Math.sin(px / W * Math.PI * freq + r() * 0.02) * 0.6 + Math.sin(px / W * Math.PI * freq * 2.7 + 1.3) * 0.4);
      x.lineTo(px, y);
    }
    x.lineTo(W, bottom == null ? H : bottom * H); x.lineTo(0, bottom == null ? H : bottom * H); x.closePath();
    x.fillStyle = color; x.fill();
  };
  const sun = function (cx, cy, rad, col) {
    const g = x.createRadialGradient(cx * W, cy * H, 0, cx * W, cy * H, rad * H * 3);
    g.addColorStop(0, col); g.addColorStop(0.3, col.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = col; x.beginPath(); x.arc(cx * W, cy * H, rad * H, 0, Math.PI * 2); x.fill();
  };
  const tree = function (tx, ty, s, crown, trunk) {
    x.fillStyle = trunk; x.fillRect(tx - s * 0.06, ty - s * 0.9, s * 0.12, s * 0.9);
    x.fillStyle = crown;
    [[0, -1.0, 0.42], [-0.28, -0.78, 0.3], [0.3, -0.8, 0.28]].forEach(function (b) { x.beginPath(); x.ellipse(tx + b[0] * s, ty + b[1] * s, b[2] * s, b[2] * s * 0.85, 0, 0, Math.PI * 2); x.fill(); });
  };
  const pine = function (tx, ty, s, col) {
    x.fillStyle = col;
    for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(tx, ty - s * (1.0 - k * 0.25)); x.lineTo(tx - s * (0.22 + k * 0.08), ty - s * (0.45 - k * 0.2)); x.lineTo(tx + s * (0.22 + k * 0.08), ty - s * (0.45 - k * 0.2)); x.closePath(); x.fill(); }
  };
  if (kind === 'forest') {
    sky('#DDE9E1', '#F1F4EA', 0.6);
    band(0.5, 0.03, 3, '#B7CAB9');
    for (let k = 0; k < 26; k++) tree(r() * W, H * (0.62 + r() * 0.04), H * (0.28 + r() * 0.1), '#8FB09A', '#8A7A66');
    band(0.66, 0.015, 5, '#9DB88C');
    for (let k = 0; k < 18; k++) tree(r() * W, H * (0.78 + r() * 0.06), H * (0.45 + r() * 0.15), ['#5B8872', '#4E7A68', '#6A957C'][k % 3], '#6E5847');
    band(0.86, 0.01, 4, '#7F9E6C');
  } else if (kind === 'seaside') {
    sky('#CFE2EA', '#F6F1E4', 0.55);
    sun(0.5, 0.32, 0.07, 'rgba(255,244,214,0.95)');
    x.fillStyle = '#7FAFB9'; x.fillRect(0, H * 0.55, W, H * 0.2);
    x.strokeStyle = 'rgba(240,248,248,0.55)'; x.lineWidth = 2;
    for (let k = 0; k < 40; k++) { const wy = H * (0.57 + r() * 0.16), wx = r() * W; x.beginPath(); x.moveTo(wx, wy); x.quadraticCurveTo(wx + 20, wy - 4, wx + 44, wy); x.stroke(); }
    band(0.74, 0.012, 3, '#E7D8B2');
    band(0.9, 0.01, 2, '#D9C79C');
  } else if (kind === 'mountain') {
    sky('#D3E1EC', '#F2F4EF', 0.62);
    band(0.4, 0.12, 4, '#B4C4D0');
    band(0.5, 0.1, 6, '#94AAB0');
    // snow on the far peaks
    x.globalCompositeOperation = 'source-atop';
    x.globalCompositeOperation = 'source-over';
    band(0.64, 0.05, 3, '#A5BD93');
    for (let k = 0; k < 22; k++) pine(r() * W, H * (0.7 + r() * 0.12), H * (0.2 + r() * 0.12), ['#4E7A68', '#5B8872'][k % 2]);
    band(0.84, 0.01, 4, '#98B386');
  } else {
    sky('#F4E3C8', '#FCF5E6', 0.6);
    sun(0.72, 0.28, 0.06, 'rgba(255,238,200,0.95)');
    band(0.55, 0.05, 2, '#EBCFA2');
    band(0.66, 0.06, 3, '#E0BC88');
    band(0.8, 0.04, 2.5, '#D6AE78');
    for (let k = 0; k < 14; k++) { x.fillStyle = '#9AAB7C'; x.beginPath(); x.ellipse(r() * W, H * (0.75 + r() * 0.15), 10 + r() * 14, 6 + r() * 6, 0, 0, Math.PI * 2); x.fill(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// A door leaf's outer face, after the real SAM+ door: lilac above, a soft
// pink sweep rising from the latch side, and (on the logo leaf) the white
// Sam logo: a heart with a plus, and the word. Canvas left = the hinge side
// of the left leaf as the walker sees it.
function wf3dsPaintSamDoor(withLogo) {
  const W = 256, H = 664;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#A9A5CC'); g.addColorStop(0.55, '#C8BCDC'); g.addColorStop(1, '#E6D9E6');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#F2C8D3';
  x.beginPath();
  x.moveTo(withLogo ? W : 0, H * 0.12);
  x.bezierCurveTo(withLogo ? W * 0.2 : W * 0.8, H * 0.2, withLogo ? -W * 0.1 : W * 1.1, H * 0.62, withLogo ? W * 0.35 : W * 0.65, H);
  x.lineTo(withLogo ? W : 0, H); x.closePath(); x.fill();
  x.fillStyle = 'rgba(250,238,242,0.55)';
  x.beginPath();
  x.moveTo(withLogo ? W : 0, H * 0.5);
  x.bezierCurveTo(withLogo ? W * 0.55 : W * 0.45, H * 0.62, withLogo ? W * 0.5 : W * 0.5, H * 0.85, withLogo ? W * 0.62 : W * 0.38, H);
  x.lineTo(withLogo ? W : 0, H); x.closePath(); x.fill();
  if (withLogo) {
    const cx = W * 0.3, cy = H * 0.12, s = 15;
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 3; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(cx, cy + s * 0.75);
    x.bezierCurveTo(cx - s * 1.2, cy, cx - s * 0.7, cy - s * 0.9, cx, cy - s * 0.3);
    x.bezierCurveTo(cx + s * 0.7, cy - s * 0.9, cx + s * 1.2, cy, cx, cy + s * 0.75);
    x.stroke();
    x.beginPath(); x.moveTo(cx + s * 0.95, cy - s * 0.95); x.lineTo(cx + s * 0.95, cy - s * 0.45);
    x.moveTo(cx + s * 0.7, cy - s * 0.7); x.lineTo(cx + s * 1.2, cy - s * 0.7); x.stroke();
    x.fillStyle = '#FFFFFF'; x.font = '600 23px Montserrat, "Open Sans", sans-serif'; x.textAlign = 'center';
    x.fillText('Sam', cx, cy + s * 2.3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

WF3DS.ivn = {
  build(ctx) {
    const T = THREE, R = WF3DS_IVN;
    const room = new T.Group();
    ctx.W(0, 0, 0, room.position);
    room.rotation.y = Math.atan2(ctx.f.x, ctx.f.z);
    ctx.grp.add(room);
    const hw = R.w / 2, hd = R.d / 2;
    // Outer shell: a plain pale box; its faces point outward, so from inside
    // they vanish and only the projection walls show. No front face — the
    // facade (with the doors) is its own piece so it can step aside.
    const shellMat = new T.MeshLambertMaterial({ color: 0xE6E1D4 });
    const none = new T.MeshBasicMaterial({ visible: false });
    const shell = new T.Mesh(new T.BoxGeometry(R.w + 0.4, R.h + 0.3, R.d + 0.4), [shellMat, shellMat, new T.MeshLambertMaterial({ color: 0xD8D2C2 }), none, shellMat, none]);
    shell.position.y = (R.h + 0.3) / 2;
    shell.castShadow = true; shell.receiveShadow = true;
    room.add(shell);
    // Floor + ceiling inside.
    const floor = new T.Mesh(new T.PlaneGeometry(R.w, R.d), new T.MeshLambertMaterial({ color: 0x46564F }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.09; floor.receiveShadow = true;
    const ceil = new T.Mesh(new T.PlaneGeometry(R.w, R.d), new T.MeshBasicMaterial({ color: 0x28332F }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = R.h;
    room.add(floor, ceil);
    // The projection: one shader, two panoramas crossfading, on three walls.
    const res = WF3D.tier.name === 'low' ? [1024, 342] : [1536, 512];
    ctx.st.tex = WF3DS_IVN_SCENES.map(function (k) { return wf3dsPaintPanorama(k, res[0], res[1]); });
    const uni = {
      uA: { value: ctx.st.tex[0] }, uB: { value: ctx.st.tex[1] }, uMix: { value: 0 },
      uTime: { value: 0 }, uPan: { value: 0 }, uShimmer: { value: 0 }, uGlow: { value: 0.35 },
    };
    ctx.st.uni = uni;
    const mat = new T.ShaderMaterial({
      uniforms: uni,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform sampler2D uA, uB; uniform float uMix, uTime, uPan, uShimmer, uGlow; varying vec2 vUv;',
        'void main(){',
        '  vec2 uv = vUv; uv.x += uPan;',
        '  float low = smoothstep(0.62, 0.2, uv.y);',       // lower part of the image: water/heat shimmer
        '  uv.x += uShimmer * low * 0.0025 * sin(uv.y * 140.0 + uTime * 1.6);',
        '  vec3 c = mix(texture2D(uA, uv).rgb, texture2D(uB, uv).rgb, uMix);',
        '  float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.9, vUv.y);',
        '  gl_FragColor = vec4(c * (0.55 + 0.45 * uGlow) * (0.9 + 0.1 * edge), 1.0);',
        '}',
      ].join('\n'),
    });
    const wall = function (wid, x, z, ry, u0, du) {
      const g = new T.PlaneGeometry(wid, R.h);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, u0 + uv.getX(k) * du);
      const m = new T.Mesh(g, mat);
      m.position.set(x, R.h / 2, z); m.rotation.y = ry;
      room.add(m);
    };
    wall(R.d, -hw, 0, Math.PI / 2, 1 / 3, -1 / 3);      // left: front -> back = pano 0 -> 1/3
    wall(R.w, 0, hd, Math.PI, 2 / 3, -1 / 3);           // back: left -> right = 1/3 -> 2/3
    wall(R.d, hw, 0, -Math.PI / 2, 2 / 3, 1 / 3);       // right: back -> front = 2/3 -> 1
    // Dark trims where the screens meet, so the three walls read as a room
    // of projections rather than one window.
    const trim = wf3dMat(0x26312D);
    [[-hw, hd], [hw, hd]].forEach(function (c) { const m = new T.Mesh(new T.BoxGeometry(0.12, R.h, 0.12), trim); m.position.set(c[0], R.h / 2, c[1]); room.add(m); });
    [[0, hd - 0.03, R.w, 0], [-hw + 0.03, 0, R.d, Math.PI / 2], [hw - 0.03, 0, R.d, Math.PI / 2]].forEach(function (b) {
      [0.04, R.h - 0.04].forEach(function (y) { const m = new T.Mesh(new T.BoxGeometry(b[2], 0.08, 0.06), trim); m.position.set(b[0], y, b[1]); m.rotation.y = b[3]; room.add(m); });
    });
    // Facade with a double door.
    const fac = new T.Group();
    fac.position.z = -hd - 0.2;
    room.add(fac);
    const dw = 1.8, dh = 2.3, side = (R.w + 0.4 - dw) / 2, fm = shellMat;
    const block = function (w, h, x, y) { const b = new T.Mesh(new T.BoxGeometry(w, h, 0.2), fm); b.position.set(x, y, 0); b.castShadow = true; fac.add(b); };
    block(side, R.h + 0.3, -(dw / 2 + side / 2), (R.h + 0.3) / 2);
    block(side, R.h + 0.3, dw / 2 + side / 2, (R.h + 0.3) / 2);
    block(dw, R.h + 0.3 - dh, 0, dh + (R.h + 0.3 - dh) / 2);
    // The leaves are dressed like the real SAM+ door (photo in the SAM
    // presentation, admin projects/sam/communication/presentation): lilac
    // with a pink sweep and the white Sam logo, and the permanent project
    // plaque (assets/wf/sam-plaque.jpg, from Porte_du_SAM_-_Permanent_Plaque)
    // at hand height on the leaf that carries the logo. sgn 1 is the leaf on
    // the left as the walker faces the doors.
    const lw = dw / 2 - 0.02, lh = dh - 0.02;
    const leaves = [-1, 1].map(function (sgn) {
      const piv = new T.Group();
      piv.position.set(sgn * dw / 2, 0, -0.08);
      const edge = wf3dMat(0xB9B2D2);
      const face = new T.MeshLambertMaterial({ map: wf3dsPaintSamDoor(sgn > 0) });
      const leaf = new T.Mesh(new T.BoxGeometry(lw, lh, 0.06), [edge, edge, edge, edge, edge, face]);
      leaf.position.set(-sgn * (dw / 4), dh / 2, 0);
      leaf.castShadow = true;
      piv.add(leaf);
      if (sgn > 0) {
        const pw = 0.6, ph = pw * 766 / 640;
        const frame = new T.Mesh(new T.BoxGeometry(pw + 0.02, ph + 0.02, 0.008), wf3dMat(0xC4C8CB));
        frame.position.set(-0.06, 1.2 - dh / 2, -0.034);
        const plaque = new T.Mesh(new T.PlaneGeometry(pw, ph), new T.MeshLambertMaterial({ map: new T.TextureLoader().load('assets/wf/sam-plaque.jpg') }));
        plaque.position.set(-0.06, 1.2 - dh / 2, -0.039);
        plaque.rotation.y = Math.PI;
        leaf.add(frame, plaque);
      }
      fac.add(piv);
      return { piv, sgn };
    });
    // Light spilling out through the open doors, and rising off the roof.
    const spill = new T.Mesh(new T.PlaneGeometry(dw, dh), new T.MeshBasicMaterial({ color: 0xEAF4EC, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    spill.position.set(0, dh / 2, 0.02);
    fac.add(spill);
    const rays = [-2.2, -0.8, 0.8, 2.2].map(function (rx, k) {
      const m = new T.Mesh(new T.PlaneGeometry(0.35, 3.2), new T.MeshBasicMaterial({ map: wf3dGlowTex(), color: 0xFFF6DE, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      m.position.set(rx, R.h + 1.9, -hd * 0.3);
      m.rotation.z = rx * -0.12;
      m.userData.k = k;
      room.add(m);
      return m;
    });
    const light = { isVirtual: true, color: new T.Color(0xDDEEE4), intensity: 0.4, distance: 9, position: ctx.W(0, 0.5, 2.3) };
    ctx.lights.push(light);
    Object.assign(ctx.st, { room, fac, leaves, spill, rays, light });
    ctx.st.sign = ctx.word({ key: 'pathway.ivn.title' }, 0, -hd - 0.45, R.h + 0.55);
    ctx.join = { x: 0, z: 0.7, pose: 'stand', fx: 0, fz: 3 };
    ctx.cam = { eye: [0, -hd - 0.6, 2.5], look: [0, hd, 1.25] };
    // Phone: from just inside the doorway, so the room's three walls wrap
    // the frame (a portrait view from outside sees only the back wall).
    ctx.camNarrow = { eye: [0, -hd + 0.4, 1.9], look: [0, hd, 1.4] };
    ctx.pin = [2.2, 2.0, 1.9];
  },
  act(ctx, u, t) {
    const S = ctx.st, U = S.uni;
    const here = WF3D.arriveAt === ctx.i ? (WF3D.arrive || 0) : 0;
    // Doors open as the walker reaches them; close again behind them.
    const open = wf3dsEase(wf3dsSeg(here, 0.12, 0.45));
    S.leaves.forEach(function (l) { l.piv.rotation.y = -l.sgn * 1.45 * open; });
    const fade = WF3D.ivnFade == null ? 1 : WF3D.ivnFade;
    S.spill.material.opacity = 0.35 * open * fade;
    S.rays.forEach(function (m) { m.material.opacity = fade * (0.06 + 0.1 * open) * (0.7 + 0.3 * Math.sin(t * 0.6 + m.userData.k * 1.7)); });
    // Once the walker is through the doors the facade steps aside: the
    // room is seen open-fronted, as in the sketch, the camera just outside.
    S.fac.visible = here < 0.62;
    S.sign.emph = 1 - wf3dsSeg(here, 0.5, 0.8);        // the sign is for outside
    // The projection: four landscapes through the loop, each dissolving
    // into the next; the image drifts, and water/heat shimmer.
    const q = u * 4, k = Math.min(3, Math.floor(q)), f = q - k;
    const mix = wf3dsEase(wf3dsSeg(f, 0.78, 1));
    U.uA.value = S.tex[k]; U.uB.value = S.tex[(k + 1) % 4];
    U.uMix.value = mix;
    U.uTime.value = t;
    U.uPan.value = 0.01 * Math.sin(t * 0.12);
    const shim = [0, 1, 0, 0.5];
    U.uShimmer.value = wf3dsLerp(shim[k], shim[(k + 1) % 4], mix);
    U.uGlow.value = 0.45 + 0.55 * wf3dsEase(here);
    if (S.light) {
      const cols = [[0.78, 0.9, 0.8], [0.8, 0.9, 0.95], [0.82, 0.88, 0.95], [1, 0.9, 0.76]];
      const a = cols[k], b = cols[(k + 1) % 4];
      S.light.color.setRGB(wf3dsLerp(a[0], b[0], mix), wf3dsLerp(a[1], b[1], mix), wf3dsLerp(a[2], b[2], mix));
      S.light.intensity = 0.35 + 0.6 * here;
    }
    // Inside, the walker takes the room in: turning slowly toward one wall,
    // then the other, face lifting a little to the mountains.
    if (here >= 0.999 && WF3D.walker.group.visible) {
      const W = WF3D.walker;
      W.group.rotation.y += 0.45 * Math.sin(u * Math.PI * 2 * 1.5 + 0.4) * wf3dsClamp(u * 8);
      W.head.position.z = 0.02 * (k === 2 ? 1 : 0);
    }
  },
};

// The IVN room comes into sight only for the last two activities: from
// the approach to the check-in it fades up out of the forest (~45m off),
// rather than sitting on the horizon for the whole walk.
function wf3dsIvnReveal(g, c) {
  // Out of sight until the walker is over the log, well past the campfire,
  // so it never shares the activities' ambience.
  const T = wf3dTrail(c), L = wf3dLogAt();
  const f = wf3dsEase(wf3dsSeg(T, L + 0.05, L + 0.7));
  WF3D.ivnFade = f;
  g.visible = f > 0.001;
  if (!g.visible) return;
  if (!g.userData.fadeMats) {
    const list = [];
    g.traverse(function (o) {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const own = mats.map(function (m) {
        if (m.isShaderMaterial) { o.userData.hideWhileFading = true; return m; }
        const cm = m.clone();                     // don't fade materials other stations share
        cm.userData.baseOpacity = m.opacity;
        cm.userData.baseTransparent = m.transparent;
        list.push(cm);
        return cm;
      });
      o.material = Array.isArray(o.material) ? own : own[0];
    });
    g.userData.fadeMats = list;
  }
  const fading = f < 0.999;
  g.userData.fadeMats.forEach(function (m) {
    const tr = fading || m.userData.baseTransparent;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = m.userData.baseOpacity * f;
  });
  g.traverse(function (o) { if (o.userData.hideWhileFading) o.visible = !fading; });
}

// The fallen log across the trail between the campfire and the IVN room:
// a quiet threshold the walker steps over before the room comes into view.
function wf3dsBuildLog() {
  const T = THREE, at = wf3dLogAt();
  const P = wf3dAt(at, 0, 0), Q = wf3dAt(at + 0.01, 0, 0);
  const f = new T.Vector3(Q.x - P.x, 0, Q.z - P.z).normalize();
  const side = new T.Vector3(-f.z, 0, f.x);
  const grp = new T.Group();
  const A = P.clone().addScaledVector(side, -3.4), B = P.clone().addScaledVector(side, 3.1);
  A.y = wf3dGround(A.x, A.z) + 0.22; B.y = wf3dGround(B.x, B.z) + 0.2;
  const log = new T.Mesh(new T.CylinderGeometry(0.2, 0.25, A.distanceTo(B), 10), wf3dMat(0x7A6452));
  log.position.copy(A).add(B).multiplyScalar(0.5);
  log.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  log.castShadow = true; log.receiveShadow = true;
  grp.add(log);
  // Its root plate at one end, and a broken branch or two.
  const root = new T.Mesh(new T.CylinderGeometry(0.55, 0.6, 0.18, 9), wf3dMat(0x6E5847));
  root.position.copy(B).addScaledVector(side, 0.1); root.quaternion.copy(log.quaternion);
  root.castShadow = true; grp.add(root);
  [[-1.2, 0.5], [0.9, -0.6]].forEach(function (b) {
    const m = new T.Mesh(new T.CylinderGeometry(0.04, 0.06, 0.9, 6), wf3dMat(0x8A7560));
    m.position.copy(P).addScaledVector(side, b[0]).addScaledVector(f, b[1] * 0.3);
    m.position.y = wf3dGround(m.position.x, m.position.z) + 0.45;
    m.rotation.set(0.5 * b[1], 0, 0.7 * Math.sign(b[0]));
    m.castShadow = true; grp.add(m);
  });
  WF3D.scene.add(grp);
}

// ───────── runtime ─────────

function wf3dsBuildAll() {
  WF3D.stations = [];
  WF3D.stopGroups = [];
  WF3D.labelSpecs = [];
  wf3dsBuildLog();
  WF3D.stationLight = new THREE.PointLight(0xFF9A5A, 0, 8, 1.6);
  WF3D.scene.add(WF3D.stationLight);
  ACTIVITIES.concat([{ id: 'ivn' }]).forEach(function (s, i) {
    const grp = new THREE.Group();
    grp.name = 'stop-' + s.id;
    const ctx = wf3dsCtx(i, grp);
    const def = WF3DS[s.id];
    if (def) def.build(ctx);
    // A pool of soft light that gathers on the clearing as you arrive.
    const glow = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32), new THREE.MeshBasicMaterial({ map: wf3dGlowTex(), color: 0xFFF3D6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    ctx.W(0, 0, 0.06, glow.position);
    grp.add(glow);
    ctx.glow = glow;
    WF3D.scene.add(grp);
    WF3D.stopGroups[i] = grp;
    WF3D.stations[i] = ctx;
  });
}

// Which station the walker is at (or null), and how far into arriving:
// WF3D.arrive rises while the walk holds at a stop and falls when it moves
// on (see wf3dsReadyToLeave: the walk waits for the walker to rejoin the
// path before it sets off).
function wf3dsStepArrival(dt) {
  const i = Math.round(WF3D.cs.x);
  // Only an engaged stop draws the walker in (see wfDwellMs): idling, they
  // just walk on past.
  const atStop = WF.engaged && WF.mode === 'hold' && Math.abs(WF3D.cs.x - i) < 0.03 && Math.abs(WF3D.cs.v) < 0.02 && !WF3D.leaving;
  if (atStop && WF3D.arriveAt !== i) { WF3D.arriveAt = i; }
  const target = atStop && WF3D.arriveAt === i ? 1 : 0;
  const speed = target ? WF3DS_ARRIVE_S : (WF.manual ? WF3DS_MANUAL_S : WF3DS_LEAVE_S);
  const prev = WF3D.arrive || 0;
  WF3D.arrive = target >= prev ? Math.min(target, prev + dt / speed) : Math.max(target, prev - dt / speed);
  if (WF3D.arrive === 0 && !target) WF3D.arriveAt = i;
  const st = WF3D.stations && WF3D.stations[WF3D.arriveAt];
  if (st && prev < 0.5 && WF3D.arrive >= 0.5) st.greetAt = WF3D.t;
  if (WF3D.leaving && WF3D.arrive === 0) WF3D.leaving = false;
}

// Called by wfStep (walk-forest.js) before the walk moves on: start
// walking back to the path, and only say "ready" once back on it.
function wf3dsReadyToLeave() {
  if ((WF3D.arrive || 0) <= 0.001) { WF3D.leaving = false; return true; }
  WF3D.leaving = true;
  return false;
}

// The arrival framing for the camera: a spot a few metres behind the
// walker's joining place, a little to one side (so the walker stands off
// centre in the foreground), looking at the heart of the clearing.
// The arrival framing. No swing, no turn — the view keeps its direction,
// which is calmer on the eye (and on a phone): camera and aim glide
// sideways together toward the station's clearing, slowly, and the lens
// opens a little (wf3dPlaceCamera, WF3D.zoomOut) so the scene fits.
// The IVN room keeps its own framing (st.cam), from Ivo's sketches.
function wf3dsCameraBlend(eye, tgt, narrow) {
  const a = WF3D.arrive || 0;
  const e = a * a * a * (a * (a * 6 - 15) + 10);     // smootherstep: no jolt at either end
  WF3D.zoomOut = 0;
  const st = WF3D.stations && WF3D.stations[WF3D.arriveAt];
  if (!st || e <= 0) return;
  if (st.cam) {
    const c = narrow && st.camNarrow ? st.camNarrow : st.cam;
    eye.lerp(st.W(c.eye[0], c.eye[1], c.eye[2]), e);
    tgt.lerp(st.W(c.look[0], c.look[1], c.look[2]), e);
    return;
  }
  const S = st.W(0, 0, 0);
  let fx = tgt.x - eye.x, fz = tgt.z - eye.z;
  const fl = Math.sqrt(fx * fx + fz * fz) || 1;
  fx /= fl; fz /= fl;
  const rx = -fz, rz = fx;                              // camera's right, on the ground
  const d = (S.x - eye.x) * rx + (S.z - eye.z) * rz;    // how far right the clearing is
  const k = d * (narrow ? WF3D_SIGHT_TRUCK.narrow : WF3D_SIGHT_TRUCK.wide) * e;
  eye.x += rx * k; eye.z += rz * k;
  tgt.x += rx * k; tgt.z += rz * k;
  // Phones also ease back a couple of metres (straight back, no turn).
  if (narrow) { eye.x -= fx * 2.5 * e; eye.z -= fz * 2.5 * e; }
  WF3D.zoomOut = e;
}

// One real point light for all stations, moved each frame to the brightest
// light-giver (fire, stove, IVN room) of the station nearest the camera, and
// faded by distance. The light count never changes, so no shader recompiles.
function wf3dsSharedLight() {
  const L = WF3D.stationLight;
  if (!L) return;
  const c = WF3D.cs.x;
  let best = null, bestW = 0;
  WF3D.stations.forEach(function (ctx, i) {
    const w = 1 - wf3dsSeg(Math.abs(i - c), 0.6, 1.6);
    if (w <= 0) return;
    ctx.lights.forEach(function (l) { const v = w * l.intensity; if (v > bestW) { bestW = v; best = l; } });
  });
  if (!best || !WF3D.tier.light) { L.intensity = 0; return; }
  L.position.copy(best.position);
  L.color.copy(best.color);
  L.distance = best.distance;
  L.intensity = bestW;
}

function wf3dsUpdate(dt) {
  const c = WF3D.cs.x, t = WF3D.t;
  WF3D.stations.forEach(function (ctx, i) {
    const near = Math.abs(i - c);
    // Labels: fade in only while the walk is at this stop, times the
    // station's own emphasis.
    for (let k = 0; k < WF3D.labelSpecs.length; k++) {
      const lb = WF3D.labelSpecs[k];
      if (lb.stop !== i || !lb.sprite) continue;
      const vis = Math.max(0, 1 - near / 0.45) * lb.emph;
      lb.sprite.visible = vis > 0.02;
      lb.sprite.material.opacity = vis;
    }
    const here = WF3D.arriveAt === i ? wf3dsEase(WF3D.arrive || 0) : 0;
    ctx.glow.material.opacity = 0.16 * here * (0.85 + 0.15 * Math.sin(t * 0.6));
    if (near > 2.6 || ctx.disabled) return;
    const def = WF3DS[ctx.id];
    const cy = ctx.cyc;
    if (cy.start == null || t - cy.start > cy.len) {
      cy.start = t; cy.n++;
      cy.len = WF3DS_LOOP_MIN + ctx.rand() * (WF3DS_LOOP_MAX - WF3DS_LOOP_MIN);
      if (def && def.cycle) def.cycle(ctx);
    }
    const u = (t - cy.start) / cy.len;
    WF3DS_DTK = Math.min(10, dt * 60);
    ctx.people.forEach(function (h) { h.moving *= 1 - wf3dsK(0.2); });
    if (def && def.act) def.act(ctx, u, t, dt);
    // Everyone breathes; walkers' legs follow the ground they covered; and
    // on arrival the people here glance toward the newcomer for a moment.
    const gl = ctx.greetAt != null ? wf3dsBell(t - ctx.greetAt, 0, 3.5) : 0;
    const J = here > 0 ? WF3D.walker.group.position : null;
    ctx.people.forEach(function (h) {
      const p = h.p;
      const br = p.k * (1 + Math.sin(t * 1.25 + h.seed) * 0.02);
      p.torso.scale.set(br, p.k, br);
      if (p.pose === 'stand' || p.pose === 'carry' || p.pose === 'reach') {
        const ph = h.gait * Math.PI * 2, amp = h.moving;
        p.legL.rotation.x = Math.sin(ph) * 0.5 * amp;
        p.legR.rotation.x = -Math.sin(ph) * 0.5 * amp;
        if (p.pose === 'stand') p.armL.rotation.x = -Math.sin(ph) * 0.35 * amp;
      }
      let yaw = h.yaw;
      if (J && gl > 0) {
        const w = p.group.position;
        yaw = wf3dsAngLerp(yaw, Math.atan2(J.x - w.x, J.z - w.z), 0.45 * gl);
      }
      p.group.rotation.y = yaw;
    });
  });
}

// The walker: along the trail between stops; at a stop, steps off to the
// station's joining place (stand / sit in the circle / climb into the
// hammock) as WF3D.arrive rises, and back as it falls.
function wf3dsWalker(dt) {
  const W = WF3D.walker, Seat = WF3D.walkerSeat, Lie = WF3D.walkerLie;
  const c = wf3dTrail(WF3D.cs.x);
  const trail = wf3dAt(c, 0, 0);
  const ahead = wf3dAt(c + 0.02, 0, 0);
  // Stepping over the fallen log: a lift of the body as the walker crosses.
  const over = 1 - Math.min(1, Math.abs(c - wf3dLogAt()) * WF3D_ALONG / 0.7);
  trail.y += 0.32 * Math.sin(Math.PI * 0.5 * Math.max(0, over)) * (over > 0 ? 1 : 0);
  let yaw = Math.atan2(ahead.x - trail.x, ahead.z - trail.z) + (WF3D.cs.v < 0 ? Math.PI : 0);
  const st = WF3D.stations[WF3D.arriveAt];
  const a = WF3D.arrive || 0, e = wf3dsEase(a);
  let pos = trail;
  let pose = 'walk';
  if (st && a > 0) {
    const J = st.W(st.join.x, st.join.z, 0);
    pos = trail.clone().lerp(J, e);
    const S = st.W(st.join.fx == null ? 0 : st.join.fx, st.join.fz == null ? 0 : st.join.fz, 0);
    const toJ = Math.atan2(J.x - trail.x, J.z - trail.z);
    const toS = Math.atan2(S.x - J.x, S.z - J.z);
    // Heading out: face the joining place; there: face the activity; on the
    // way back (arrive falling) face the path.
    const rising = !WF3D.leaving;
    yaw = a > 0.92 ? wf3dsAngLerp(toJ, toS, wf3dsSeg(a, 0.92, 1)) : (rising ? toJ : toJ + Math.PI);
    if (a >= 0.999) pose = st.join.pose === 'stand' ? 'still' : st.join.pose;
    else if (st.join.pose !== 'stand' && a > 0.9) pose = 'crouch';
  }
  // Distance actually covered this frame drives the gait.
  const prevPos = WF3D._wpos || pos.clone();
  const moved = prevPos.distanceTo(pos);
  WF3D._wpos = pos.clone();
  const speed = dt > 0 ? moved / dt : 0;
  const before = WF3D.walkPhase;
  WF3D.walkPhase += moved / 1.5;
  const ph = WF3D.walkPhase * Math.PI * 2;
  const amp = Math.min(1, speed / 1.2);
  W.group.visible = pose === 'walk' || pose === 'still' || pose === 'crouch';
  Seat.group.visible = pose === 'sit';
  Lie.group.visible = pose === 'hammock';
  W.group.position.copy(pos); W.group.rotation.y = yaw;
  W.legL.rotation.x = Math.sin(ph) * 0.55 * amp;
  W.legR.rotation.x = -Math.sin(ph) * 0.55 * amp;
  W.armL.rotation.x = -Math.sin(ph) * 0.4 * amp;
  W.armR.rotation.x = Math.sin(ph) * 0.4 * amp;
  const crouch = pose === 'crouch' ? wf3dsSeg(a, 0.9, 1) : 0;
  W.hips.position.y = W.hipY * (1 - 0.35 * crouch) + Math.abs(Math.cos(ph)) * 0.035 * amp;
  const br = W.k * (1 + Math.sin(WF3D.t * 1.2) * 0.015);
  W.torso.scale.set(br, W.k, br);
  Seat.group.position.copy(pos); Seat.group.rotation.y = yaw;
  if (WF3D.cloth && pose !== 'hammock') WF3D.cloth.body = null;
  if (pose === 'hammock' && WF3D.cloth && WF3D.cloth.stop === WF3D.arriveAt) {
    const v = WF3D.cloth.v, mid = Math.floor(WF3D.cloth.cols / 2) * 3;
    Lie.group.position.set(v.x[mid], v.x[mid + 1] - 0.15, v.x[mid + 2]);
    // Tell the cloth where the body is, so it wraps under it.
    WF3D.cloth.body = { under: Lie.group.position.y + Lie.hipY - 14 * Lie.k, half: 0.9 };
    Lie.group.rotation.y = Math.atan2(WF3D.cloth.dir.x, WF3D.cloth.dir.z) + Math.PI;
  }
  const foot = WF3D.pose.shoeless ? WF3D.bareFoot : WF3D.shoe;
  if (W.footL.material !== foot) { W.footL.material = W.footR.material = foot; }
  // Footfalls kick up a little dust off the path.
  if (amp > 0.12 && Math.floor(before * 2) !== Math.floor(WF3D.walkPhase * 2)) {
    const P = WF3D.puffs;
    for (let k = 0; k < 3 && P.live < WF3D.tier.puffs; k++) {
      wfpSpawn(P, WFP_DUST, pos.x + (wfpRand(P) - 0.5) * 0.3, pos.y + 0.05, pos.z + (wfpRand(P) - 0.5) * 0.3,
        (wfpRand(P) - 0.5) * 0.6, 0.4 + wfpRand(P) * 0.3, (wfpRand(P) - 0.5) * 0.6, 0.9 + wfpRand(P) * 0.5, 0.16, 0);
    }
  }
}
