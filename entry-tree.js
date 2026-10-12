// entry-tree.js — the practitioner entry screen as one split tree
// (Ivo's sketches, 2026-10-12; admin/projects/forest4youth/web-app/sketches/,
// prototype in admin/.../web-app/prototypes/iframed-1.1_split-tree.html).
// A: one tree, split down the middle: left half IVN, rebuilt from pixels of
// light; right half FI, crowns and bark. Touch a side: the other half slides
// to a strip at the edge, that side's menu opens (C: FI, D: IVN) and the
// whole tree grows or assembles. The strip, the Back button and Escape
// return to A. Menu items are ordinary app routes.
// 3D: vendor/three.min.js (r147) and the Walk the Forest's own rig (branch
// REVAMP, walk-forest-3d.js): FogExp2 #D6E3D9, hemisphere #F4F7EF/#B6BA98,
// sun #FFF3E0, soft PCF shadows, blob crowns, the shared wind GLSL for grass,
// motes, light shafts; pointer movement = a soft gust. The camera frames the
// tree in whatever part of the screen is free, so one rule serves phone,
// laptop and desktop. Without WebGL the buttons and menus still work.
(function () {
'use strict';
var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var ROOT = document.getElementById('tree-entry');
if (!ROOT) return;
var $ = function (id) { return document.getElementById('tr-' + id); };

/* ───────── UI state machine (works with or without WebGL) ───────── */
var S = { mode: 'A', last: null, pane: null };
var gl = null; // 3D hooks, set below if WebGL starts

function tr(k) { return typeof t === 'function' ? t(k) : k; }
function say(t) { $('say').textContent = t; }

function open(side) {
  if (S.mode !== 'A') return;
  S.mode = side === 'fi' ? 'C' : 'D'; S.last = side;
  $('doors').hidden = true; $('hint').style.opacity = 0;
  var room = $(side === 'fi' ? 'room-fi' : 'room-ivn');
  room.hidden = false; void room.offsetWidth; room.classList.add('in');
  $('esc').hidden = false; ROOT.classList.add(side === 'fi' ? 'open-c' : 'open-d');
  if (gl) gl.open(side);
  say(tr(side === 'fi' ? 'guide.tab.fi' : 'guide.tab.ivn'));
  setTimeout(function () { var b = room.querySelector('.menu button'); if (b) b.focus({ preventScroll: true }); }, still ? 0 : 450);
}
function back() {
  if (S.pane) { closePane(back); return; }
  if (S.mode === 'A') return;
  var side = S.last;
  ['room-fi', 'room-ivn'].forEach(function (id) { var r = $(id); r.classList.remove('in'); });
  setTimeout(function () { $('room-fi').hidden = true; $('room-ivn').hidden = true; }, still ? 0 : 600);
  $('doors').hidden = false; $('hint').style.opacity = 1; $('esc').hidden = true; ROOT.classList.remove('open-c', 'open-d');
  S.mode = 'A';
  $('doors').classList.remove('hover-ivn', 'hover-fi'); if (gl) gl.hover(null);
  if (gl) gl.back(side);
  say(tr('tree.back'));
  $(side === 'fi' ? 'pick-fi' : 'pick-ivn').focus({ preventScroll: true });
}
$('pick-fi').addEventListener('click', function () { open('fi'); });
$('pick-ivn').addEventListener('click', function () { open('ivn'); });
$('strip-ivn').addEventListener('click', back);
$('strip-fi').addEventListener('click', back);
$('esc').addEventListener('click', back);
function appModalOpen() {
  var so = document.getElementById('search-overlay');
  if (so && so.classList.contains('active')) return true;
  return ['.pb-run-mode', '.pb-timer-modal'].some(function (sel) { var el = document.querySelector(sel); return el && getComputedStyle(el).display !== 'none'; });
}
document.addEventListener('keydown', function (e) {
  if (!visible()) return;
  // Escape steps back one level at a time, as in Walk the Forest:
  // open page -> menu -> tree. Search, Run Mode and the timer keep their own.
  if (e.key === 'Escape') { if (appModalOpen() || ROOT.classList.contains('walking')) return; if (S.pane) closePane(); else back(); return; }
  if (S.mode === 'A' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { $(e.key === 'ArrowLeft' ? 'pick-ivn' : 'pick-fi').focus(); }
});
// ───── Walk the Forest (iframed-2.0) ─────
// The trail on the tree screen. The walker from Walk the Forest comes in
// from the right and steps onto the path behind the tree; the tree stands in
// Walk the Forest's own world, so the walk carries on there, from this very
// view, to activity 1 (wf-bridge.js). "Back to the tree" brings you here.
function walkIn() {
  if (S.mode !== 'A' || ROOT.classList.contains('walking')) return;
  ROOT.classList.add('walking');
  var enter = function () { if (typeof window.wfBridgeEnter === 'function') window.wfBridgeEnter(); };
  if (!gl || still || typeof wf3dPerson !== 'function') { enter(); return; }
  gl.follow(enter);
}
if ($('walk')) $('walk').addEventListener('click', walkIn);
window.F4Y_TREE = {
  reset: function () { ROOT.classList.remove('walking'); if (gl) gl.unfollow(); },
  // For wf-bridge.js: the tree as it stands (to place the same tree in Walk
  // the Forest's world), the camera looking at it, where the walker joins
  // the path behind it and how far past that point he has walked.
  world: function () { return gl && gl.world ? gl.world() : null; }
};
ROOT.querySelectorAll('.menu [data-go]').forEach(function (b) { b.addEventListener('click', function () { openPane(b.dataset.go, b); }); });
ROOT.querySelectorAll('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { if (typeof setLang === 'function') setLang(b.dataset.lang); syncLang(); if (gl) gl.frame(); }); });
var sb = $('search'); if (sb) sb.addEventListener('click', function () { if (typeof openSearchDialog === 'function') openSearchDialog(sb); });
ROOT.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { if (typeof setRole === 'function') setRole(b.dataset.mode); }); });
// the top bar can wrap on narrow screens: labels sit below it, whatever its height
function syncTop() { var tb = ROOT.querySelector('.top'); if (tb) ROOT.style.setProperty('--topH', Math.round(tb.getBoundingClientRect().bottom) + 'px'); }
addEventListener('resize', syncTop);
function syncLang() { syncTop(); var l = (typeof currentLang !== 'undefined' && currentLang) || 'en'; ROOT.querySelectorAll('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === l)); }); }
syncLang();
// keep the tree's language pills right whichever control changed the language
if (typeof window.setLang === 'function') { var appSetLang = window.setLang; window.setLang = function (l) { appSetLang(l); syncLang(); }; }
// Menu items are ordinary app routes; Implement starts Run Mode (navGoRun).
function go(route) {
  // Run Mode opens over the Implement screen, so show that first
  if (route === 'run') { window.location.hash = 'implement/mod-pocket'; setTimeout(function () { if (typeof navGoRun === 'function') navGoRun(); }, 60); return; }
  window.location.hash = route;
}

/* ───────── the pane: a menu item opens inside the menu card, which grows
   into a large reading pane; the tree stays behind it, softly blurred.
   Learned from Walk the Forest (REVAMP): the 3D scene is a persistent
   backdrop and the app is the foreground; the scene blurs once you are
   inside real content and stays crisp on the landing; Escape steps back
   one level at a time; a side panel on wide screens, a sheet on phones. */
var container = document.querySelector('.container');
var head = $('panehead'), ghost = $('ghost'), tabs = $('panetabs');
function routeFor(btn) { return btn.dataset.go === 'run' ? 'implement/mod-pocket' : btn.dataset.go; }
function paneRect() {
  var W = innerWidth, Hh = innerHeight, tb = ROOT.querySelector('.top').getBoundingClientRect().bottom;
  var narrow = W <= 720, strip = narrow ? 48 : 64, c = S.last === 'fi';
  // phones: the pane takes the whole width (the strip steps aside), so the Session Builder has room
  if (narrow) return { l: 0, r: 0, t: tb + 4, b: 0 };
  var room = W >= 1280 ? 320 : 140, w = Math.max(520, Math.min(1080, W - strip - 40 - room));
  var near = strip + 20;
  return c ? { l: near, r: Math.max(20, W - near - w), t: tb + 8, b: 20 } : { l: Math.max(20, W - near - w), r: near, t: tb + 8, b: 20 };
}
function setPaneVars(r) {
  var s = document.documentElement.style;
  s.setProperty('--pane-l', r.l + 'px'); s.setProperty('--pane-r', r.r + 'px'); s.setProperty('--pane-t', r.t + 'px'); s.setProperty('--pane-b', r.b + 'px');
}
function ghostTo(rect, instant) {
  ghost.style.transition = instant || still ? 'none' : '';
  ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px'; ghost.style.width = rect.width + 'px'; ghost.style.height = rect.height + 'px';
  void ghost.offsetWidth;
}
function paneBox(r) { return { left: r.l, top: r.t, width: innerWidth - r.l - r.r, height: innerHeight - r.t - r.b }; }
function menuEl() { return ROOT.querySelector((S.last === 'fi' ? '#tr-room-fi' : '#tr-room-ivn') + ' .menu'); }
function markTab() {
  var h = (location.hash || '').replace(/^#/, ''), btns = [].slice.call(tabs.querySelectorAll('button'));
  // exact route first; otherwise the guide tab stays lit while you read any of its chapters
  var hit = btns.filter(function (b) { var r = routeFor(b); return b.dataset.go !== 'run' && (h === r || h.indexOf(r + '/') === 0); })[0];
  if (!hit) hit = btns.filter(function (b) { var m = /^guide\/g-(fi|ivn)-/.exec(b.dataset.go); return m && (h === 'guide' || h.indexOf('guide/g-' + m[1] + '-') === 0); })[0];
  btns.forEach(function (b) { b.setAttribute('aria-current', b === hit ? 'page' : 'false'); });
}
function buildTabs() {
  tabs.innerHTML = '';
  menuEl().querySelectorAll('[data-go]').forEach(function (src) {
    var b = document.createElement('button'); b.type = 'button';
    b.dataset.go = src.dataset.go; b.setAttribute('data-i18n', src.getAttribute('data-i18n')); b.textContent = src.textContent;
    b.addEventListener('click', function () { go(b.dataset.go); if (container) container.scrollTop = 0; });
    tabs.appendChild(b);
  });
  $('panekick').textContent = S.last === 'fi' ? 'FI' : 'IVN';
}
function openPane(route, fromBtn) {
  if (!S.last) return;
  S.pane = S.last;
  var r = paneRect(); setPaneVars(r);
  buildTabs();
  // the card grows from where the menu is to the pane
  ghost.hidden = false; ghostTo(menuEl().getBoundingClientRect(), true);
  ROOT.classList.add('deep', 'paning');
  ghostTo(paneBox(r));
  document.body.classList.add('tree-pane');
  if (container) container.removeAttribute('inert');
  go(route);
  setTimeout(function () {
    document.body.classList.add('tree-pane-in'); head.hidden = false;
    setTimeout(function () { ghost.hidden = true; }, still ? 0 : 260);
    markTab(); if (container) container.scrollTop = 0;
    var h = head.querySelector('[aria-current="page"]') || head.querySelector('button'); if (h) h.focus({ preventScroll: true });
  }, still ? 0 : 520);
  if (gl) gl.frame();
}
function closePane(then) {
  if (!S.pane) { if (then) then(); return; }
  var r = paneRect();
  ghost.hidden = false; ghostTo(paneBox(r), true);
  document.body.classList.remove('tree-pane-in'); head.hidden = true;
  setTimeout(function () {
    document.body.classList.remove('tree-pane');
    if (container) container.setAttribute('inert', '');
    S.pane = null; closing = true;
    if ((location.hash || '').replace('#', '')) location.hash = '';
    closing = false;
    ghostTo(menuEl().getBoundingClientRect());
    ROOT.classList.remove('deep');
    setTimeout(function () {
      ghost.hidden = true; ROOT.classList.remove('paning');
      var b = menuEl().querySelector('button'); if (b && !then) b.focus({ preventScroll: true });
      if (gl) gl.frame();
      if (then) then();
    }, still ? 0 : 480);
  }, still ? 0 : 180);
}
var closing = false;
$('paneclose').addEventListener('click', function () { closePane(); });
addEventListener('hashchange', function () {
  if (!S.pane || closing) return;
  if (document.body.getAttribute('data-role') === 'participant') { document.body.classList.remove('tree-pane', 'tree-pane-in'); head.hidden = true; ghost.hidden = true; ROOT.classList.remove('deep', 'paning'); S.pane = null; return; }
  if (entry.classList.contains('active')) { closePane(); return; }   // browser Back to the start
  markTab();
});
addEventListener('resize', function () { if (S.pane) setPaneVars(paneRect()); });
// the app scrolls "to the top of the view" on navigation: inside the pane that is the pane
if (typeof window.scrollToViewTop === 'function') { var appScrollTop = window.scrollToViewTop; window.scrollToViewTop = function () { if (S.pane && container) container.scrollTop = 0; else appScrollTop(); }; }
// Visible only while the entry screen is showing for a practitioner.
var entry = document.getElementById('entry-screen');
function visible() { return !!entry && (entry.classList.contains('active') || !!S.pane || ROOT.classList.contains('walking')) && document.body.getAttribute('data-role') !== 'participant' && !document.body.classList.contains('walking'); }
var shown = null;
function syncShown() {
  var v = visible();
  if (v !== shown) { shown = v; ROOT.classList.toggle('on', v); document.documentElement.style.overflow = v ? 'hidden' : '';
    // the app underneath is out of reach (keyboard, screen readers) while the tree is up
    var c = document.querySelector('.container'); if (c) { if (v && !S.pane) c.setAttribute('inert', ''); else c.removeAttribute('inert'); } if (v) { syncLang(); if (gl) gl.frame(); }
    // embedded in the Odoo page: the iframe sizes itself to the document, so give the tree room
    if (window.self !== window.top) document.documentElement.style.minHeight = v ? '760px' : ''; }
  return v;
}
syncShown();
['ivn', 'fi'].forEach(function (s) {
  var b = $('pick-' + s), d = $('doors');
  function on() { d.classList.add('hover-' + s); if (gl) gl.hover(s); }
  function off() { d.classList.remove('hover-' + s); if (gl) gl.hover(null); }
  b.addEventListener('pointerenter', on); b.addEventListener('pointerleave', off);
  b.addEventListener('focus', on); b.addEventListener('blur', off);
});

/* ───────── 3D ───────── */
if (!window.THREE) { ROOT.classList.add('nogl'); return; }
var T = THREE, renderer;
try {
  renderer = new T.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) { ROOT.classList.add('nogl'); return; }
renderer.setClearColor(0x000000, 0);
var light = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(innerWidth, innerHeight) < 600;
renderer.setPixelRatio(Math.min(light ? 1.5 : 2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

var scene = new T.Scene();
scene.fog = new T.FogExp2(0xD6E3D9, 0.028);
var camera = new T.PerspectiveCamera(40, 1, 0.3, 260);
var hemi = new T.HemisphereLight(0xF4F7EF, 0xB6BA98, 0.82); scene.add(hemi);
var sun = new T.DirectionalLight(0xFFF3E0, 0.5);
sun.position.set(-7, 14, 9); sun.castShadow = true;
sun.shadow.mapSize.set(light ? 1024 : 2048, light ? 1024 : 2048);
var sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
scene.add(sun); scene.add(sun.target);

var U = { uTime: { value: 0 }, uBend: { value: new T.Vector2() }, uGust: { value: [new T.Vector4(), new T.Vector4(), new T.Vector4(), new T.Vector4()] } };

/* The Walk the Forest wind field, verbatim (WF3D_WIND_GLSL). */
var WIND = [
  'uniform float uTime;', 'uniform vec4 uGust[4];',
  'vec2 wfWind(vec2 p) {',
  '  float base = 0.55 + 0.3 * sin(uTime * 0.23) + 0.22 * sin(uTime * 0.61 + p.x * 0.05 + p.y * 0.03);',
  '  float wv = sin(uTime * 0.4 - (p.x * 0.7 + p.y * 0.7) * 0.08);',
  '  float g = wv > 0.0 ? wv * wv * wv * 0.9 : 0.0;',
  '  vec2 w = vec2(0.86, -0.5) * (base + g);',
  '  for (int i = 0; i < 4; i++) { vec2 d = p - uGust[i].xy; w += uGust[i].zw * exp(-dot(d, d) / 12.96); }',
  '  return w;', '}'].join('\n');

/* Tree bend: same shape as the WtF 'bend' patch (quadratic up the trunk +
   leaf flutter), driven by one spring (uBend) instead of per-instance. */
function bendPatch(mat, H) {
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uBend = U.uBend;
    sh.vertexShader = 'uniform float uTime;\nuniform vec2 uBend;\n' + sh.vertexShader.replace('#include <project_vertex>', [
      'vec4 mvPosition = vec4( transformed, 1.0 );',
      '#ifdef USE_INSTANCING', '  mvPosition = instanceMatrix * mvPosition;', '#endif',
      'vec4 wp = modelMatrix * mvPosition;',
      'float hf = clamp( (wp.y) / ' + H.toFixed(1) + ', 0.0, 1.0 ); hf *= hf;',
      'wp.xz += uBend * hf; wp.y -= dot( uBend, uBend ) * hf * 0.02;',
      'wp.xyz += hf * 0.05 * vec3( sin( uTime * 2.3 + wp.y * 1.7 + wp.x ), 0.0, cos( uTime * 1.9 + wp.z * 1.3 ) );',
      'mvPosition = viewMatrix * wp;',
      'gl_Position = projectionMatrix * mvPosition;'].join('\n'));
  };
  return mat;
}
/* Grass: the WtF 'field' patch, verbatim. */
function fieldPatch(mat) {
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uGust = U.uGust;
    sh.vertexShader = 'attribute vec2 aSway;\n' + WIND + '\n' + sh.vertexShader.replace('#include <project_vertex>', [
      'float hl = clamp( transformed.y * aSway.x, 0.0, 1.5 ); hl *= hl;',
      'vec4 mvPosition = vec4( transformed, 1.0 );',
      '#ifdef USE_INSTANCING', '  mvPosition = instanceMatrix * mvPosition;', '#endif',
      'vec2 wv = wfWind( mvPosition.xz ); wv /= max( 1.0, length( wv ) / 4.0 );',
      'float flick = sin( uTime * 3.1 + mvPosition.x * 2.3 + mvPosition.z * 1.7 ) * 0.25;',
      'mvPosition.xz += ( wv * ( 1.0 + flick ) ) * hl * aSway.y;',
      'mvPosition.y -= dot( wv, wv ) * hl * aSway.y * 0.15;',
      'mvPosition = modelViewMatrix * mvPosition;',
      'gl_Position = projectionMatrix * mvPosition;'].join('\n'));
  };
  return mat;
}
/* wf3dBlobGeometry, verbatim (finer mesh for a hero tree). */
function blobGeometry(seed, rough) {
  var g = new T.SphereGeometry(1, 28, 20), p = g.attributes.position;
  for (var i = 0; i < p.count; i++) {
    var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    var n = 0.5 * Math.sin(x * 2.1 + seed) * Math.cos(y * 1.7 + seed * 0.3) + 0.35 * Math.sin(z * 2.9 - seed * 0.7 + y) + 0.15 * Math.cos(x * 4.3 + z * 3.1 + seed);
    var k = 1 + n * rough;
    p.setXYZ(i, x * k, y * k * (y < 0 ? 0.7 : 0.9), z * k);
  }
  g.computeVertexNormals();
  return g;
}
// the clearing's gentle ground swell (shared by the ground and the footpath)
/* The trail into the forest (V2). It comes in from the right, passes just
   behind the tree, then turns away into the depth: the start of Walk the
   Forest's own path, which the tree stands beside (wf-bridge.js). It fades
   in when you choose Walk the Forest. */
var TRAIL_PTS = [[14, -2.2], [9, -2.6], [5.6, -3.2], [4.0, -4.6], [3.6, -7], [3.6, -14], [3.6, -28], [3.6, -50], [3.6, -80]];
var trailCurve = new T.CatmullRomCurve3(TRAIL_PTS.map(function (p) { return new T.Vector3(p[0], 0, p[1]); }), false, 'centripetal');
var TRAIL_N = 420, trailPts = trailCurve.getSpacedPoints(TRAIL_N), TRAIL_LEN = trailCurve.getLength();
// where he has turned onto the straight, past the tree's side
var TRAIL_CROSS = (function () { for (var i = 0; i < trailPts.length; i++) if (trailPts[i].z <= -5.2) return i / TRAIL_N; return 0.3; })();
function distToTrail(x, z) { var m = 1e9; for (var i = 0; i < trailPts.length; i += 2) { var dx = trailPts[i].x - x, dz = trailPts[i].z - z, d = dx * dx + dz * dz; if (d < m) m = d; } return Math.sqrt(m); }
function groundY(x, z) { return 0.25 * Math.sin(x * 0.18) * Math.cos(z * 0.21) * smooth(4, 14, Math.hypot(x, z)) + 0.04 * Math.sin(x * 1.3 + z); }
function hash(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function ease3(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
function easeBack(t) { t = Math.max(0, Math.min(1, t)); var c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

/* ───────── the tree, one shape for both halves ─────────
   Trunk with root flare, two limbs, eight crown lobes (the sketch's
   two-lobed crown, front/back lobes for depth). Heights in metres. */
var H = 8.2;
var LOBES = [
  // x, y, z, radius, colour
  [0.2, 6.3, 0.0, 1.85, 0x5B8872], [1.75, 5.55, 0.25, 1.45, 0x4E7A68], [-1.7, 5.6, 0.2, 1.45, 0x507D67],
  [0.9, 7.35, -0.3, 1.25, 0x6A957C], [-0.85, 7.25, -0.2, 1.25, 0x5F8C73], [2.55, 4.75, -0.5, 1.0, 0x446F5E],
  [-2.5, 4.8, -0.4, 1.0, 0x446F5E], [0.1, 5.1, 1.2, 1.2, 0x6A957C]
];
var LIMBS = [[0, 3.1, 0, 1.6, 5.0, 0.2, 0.16], [0, 3.4, 0, -1.55, 5.05, 0.1, 0.15], [0, 4.2, 0, 0.5, 6.4, -0.3, 0.12]];
function trunkR(y) { return 0.36 - 0.035 * y + 0.32 * Math.exp(-y * 3.2); }

function buildOrganic(clip) {
  var grp = new T.Group(), parts = [];
  var mats = [];
  // bark: vertex-coloured streaks in the WtF bark tones
  var tg = new T.CylinderGeometry(1, 1, 1, 18, 16, true); tg.translate(0, 0.5, 0);
  var tp = tg.attributes.position, tcol = new Float32Array(tp.count * 3);
  var bA = new T.Color(0x7E6654), bB = new T.Color(0x5F4A3B), tmp = new T.Color();
  for (var i = 0; i < tp.count; i++) {
    var x = tp.getX(i), y = tp.getY(i) * 4.6, z = tp.getZ(i), a = Math.atan2(z, x);
    var r = trunkR(y) * (1 + 0.05 * Math.sin(a * 7 + y * 2));
    tp.setXYZ(i, x * r + Math.sin(y * 0.9) * 0.06, y, z * r);
    tmp.copy(bA).lerp(bB, 0.5 + 0.5 * Math.sin(a * 11 + Math.sin(y * 3) * 1.4));
    tcol[i * 3] = tmp.r; tcol[i * 3 + 1] = tmp.g; tcol[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new T.BufferAttribute(tcol, 3)); tg.computeVertexNormals();
  function M(opts) { var m = bendPatch(new T.MeshLambertMaterial(opts), H); if (clip) m.clippingPlanes = [clip]; m.clipShadows = true; mats.push(m); return m; }
  var trunk = new T.Mesh(tg, M({ vertexColors: true, side: T.DoubleSide }));
  trunk.castShadow = trunk.receiveShadow = true; grp.add(trunk);
  parts.push({ o: trunk, from: 0.0, to: 0.38, kind: 'up' });
  LIMBS.forEach(function (L, k) {
    var a = new T.Vector3(L[0], L[1], L[2]), b = new T.Vector3(L[3], L[4], L[5]);
    var len = a.distanceTo(b), g = new T.CylinderGeometry(L[6] * 0.55, L[6], len, 9, 1); g.translate(0, len / 2, 0);
    var m = new T.Mesh(g, M({ color: 0x6E5847 }));
    m.position.copy(a); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true; grp.add(m);
    parts.push({ o: m, from: 0.26 + k * 0.05, to: 0.5 + k * 0.05, kind: 'up' });
  });
  LOBES.forEach(function (L, k) {
    var m = new T.Mesh(blobGeometry(3 + k * 1.7, 0.33), M({ color: L[4] }));
    m.position.set(L[0], L[1], L[2]); m.rotation.y = k * 1.3;
    m.userData.s = new T.Vector3(L[3], L[3] * 0.82, L[3]);
    m.castShadow = true; m.receiveShadow = true; grp.add(m);
    var d = 0.42 + (L[1] - 4.6) / 3 * 0.32 + hash(k, 2, 9) * 0.08;
    parts.push({ o: m, from: d, to: d + 0.3, kind: 'pop' });
  });
  scene.add(grp);
  function setGrow(g) {
    parts.forEach(function (p) {
      var t = (g - p.from) / (p.to - p.from);
      if (p.kind === 'up') { var e = ease3(t), w = 0.35 + 0.65 * e; p.o.scale.set(w, Math.max(0.001, e), w); }
      else { var s = easeBack(t); p.o.scale.copy(p.o.userData.s).multiplyScalar(Math.max(0.001, s)); }
      p.o.visible = t > 0;
    });
  }
  setGrow(1);
  return { grp: grp, setGrow: setGrow, mats: mats };
}

/* Inside-test for the same tree, used to voxelise it for IVN. */
function inside(x, y, z) {
  if (y >= 0 && y < 4.7 && Math.hypot(x - Math.sin(y * 0.9) * 0.06, z) < trunkR(y) + 0.04) return true;
  for (var i = 0; i < LIMBS.length; i++) {
    var L = LIMBS[i], ax = L[0], ay = L[1], az = L[2], bx = L[3] - ax, by = L[4] - ay, bz = L[5] - az;
    var t = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / (bx * bx + by * by + bz * bz);
    t = Math.max(0, Math.min(1, t));
    var dx = x - (ax + bx * t), dy = y - (ay + by * t), dz = z - (az + bz * t);
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < L[6] * (1 - 0.45 * t) + 0.08) return true;
  }
  for (var j = 0; j < LOBES.length; j++) {
    var B = LOBES[j], qx = (x - B[0]) / B[3], qy = (y - B[1]) / (B[3] * 0.82), qz = (z - B[2]) / B[3];
    var n = 0.5 * Math.sin(qx * 2.1 + 3 + j * 1.7) * Math.cos(qy * 1.7) + 0.35 * Math.sin(qz * 2.9 + qy);
    if (qx * qx + qy * qy + qz * qz < Math.pow(1 + n * 0.28, 2)) return true;
  }
  return false;
}

/* Holographic pixels: the same tree, rebuilt from light. Each cell is a
   lit, shadow-casting cube (Lambert, like the WtF crowns) in the tree's own
   colours — crown greens by lobe, bark by trunk — darker deeper inside the
   crown (occlusion), small gaps so the eye reads depth through it, a warm
   rim and a slow band of light travelling up. Cells fly in and settle,
   bottom-up. */
var CELL = 0.25;
function lobeOf(x, y, z) {
  var best = -1, bd = 9;
  for (var j = 0; j < LOBES.length; j++) { var B = LOBES[j], d = Math.hypot(x - B[0], (y - B[1]) / 0.82, z - B[2]) / B[3]; if (d < bd) { bd = d; best = j; } }
  return bd < 1.35 ? best : -1;
}
function buildPixels(onlyLeft) {
  var cells = [];
  for (var x = -4.0; x < 4.0; x += CELL) for (var y = 0.0; y <= 9.0; y += CELL) for (var z = -2.125; z <= 2.2; z += CELL) {
    var cx = x + CELL / 2, cy = y + CELL / 2, cz = z + CELL / 2;
    if (onlyLeft && cx > -CELL * 0.5) continue;
    if (!inside(cx, cy, cz)) continue;
    var shell = !inside(cx + CELL, cy, cz) || !inside(cx - CELL, cy, cz) || !inside(cx, cy + CELL, cz) || !inside(cx, cy - CELL, cz) || !inside(cx, cy, cz + CELL) || !inside(cx, cy, cz - CELL);
    if (!shell && hash(x, y, z) > 0.35) continue;
    // occlusion: how buried the cell is (samples two cells out)
    var occ = 0, k = 0;
    for (var dx = -2; dx <= 2; dx += 2) for (var dy = -2; dy <= 2; dy += 2) for (var dz = -2; dz <= 2; dz += 2) { if (dx || dy || dz) { k++; if (inside(cx + dx * CELL, cy + dy * CELL, cz + dz * CELL)) occ++; } }
    cells.push([cx, cy, cz, occ / k]);
  }
  var n = cells.length;
  var g = new T.BoxGeometry(1, 1, 1);
  var tgt = new Float32Array(n * 3), from = new Float32Array(n * 3), del = new Float32Array(n), seed = new Float32Array(n);
  var mesh;
  var u = { uBuild: { value: 1 }, uSlide: { value: 0 }, uFade: { value: 1 }, uHover: { value: 0 } };
  function patch(mat, depth) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uBend = U.uBend;
      for (var key in u) sh.uniforms[key] = u[key];
      sh.vertexShader = [
        'attribute vec3 aTarget; attribute vec3 aFrom; attribute float aDelay; attribute float aSeed;',
        'uniform float uTime; uniform float uBuild; uniform float uSlide; uniform vec2 uBend;',
        'varying float vT; varying float vH; varying vec2 vBox; varying float vSeed;',
        'vec3 hp;'].join('\n') + '\n' + sh.vertexShader
        .replace('#include <project_vertex>', [
          'float t = clamp((uBuild - aDelay) / 0.3, 0.0, 1.0); float e = 1.0 - pow(1.0 - t, 3.0);',
          'vec3 c = mix(aFrom, aTarget, e);',
          'float hf = clamp(aTarget.y / ' + H.toFixed(1) + ', 0.0, 1.0); hf *= hf;',
          'c.xz += uBend * hf; c.x += uSlide;',
          'c.xyz += hf * 0.04 * vec3(sin(uTime * 2.3 + c.y * 1.7 + c.x), 0.0, cos(uTime * 1.9 + c.z * 1.3));',
          'hp = c + transformed * ' + CELL.toFixed(3) + ' * mix(0.3, 0.84, e);',
          'vT = t; vH = aTarget.y; vBox = uv; vSeed = aSeed;',
          'vec4 mvPosition = modelViewMatrix * vec4(hp, 1.0);',
          'gl_Position = projectionMatrix * mvPosition;'].join('\n'))
        .replace('#include <worldpos_vertex>', 'vec4 worldPosition = modelMatrix * vec4(hp, 1.0);');
      if (depth) return;
      sh.fragmentShader = [
        'uniform float uTime; uniform float uFade; uniform float uHover;',
        'varying float vT; varying float vH; varying vec2 vBox; varying float vSeed;'].join('\n') + '\n' + sh.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vT * uFade );')
        .replace('#include <output_fragment>', [
          'vec2 bd = abs(vBox - 0.5); float rim = smoothstep(0.38, 0.5, max(bd.x, bd.y));',
          'float band = smoothstep(0.9, 1.0, 0.5 + 0.5 * sin(vH * 0.9 - uTime * 1.2));',
          'vec3 warm = vec3(1.0, 0.95, 0.86);',
          'outgoingLight = mix(outgoingLight, warm, rim * 0.28 + band * 0.22 + uHover * 0.08);',
          'outgoingLight += warm * 0.06 * sin(uTime * 1.5 + vSeed * 30.0) * rim;',
          '#include <output_fragment>'].join('\n'));
    };
    return mat;
  }
  var mat = patch(new T.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.94 }), false);
  mesh = new T.InstancedMesh(g, mat, n);
  mesh.customDepthMaterial = patch(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), true);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  var C = new T.Color(), lift = new T.Color(0xF4F7EF), barkA = new T.Color(0x8A7160), barkB = new T.Color(0x6E5847), I = new T.Matrix4();
  cells.forEach(function (c, i) {
    tgt.set([c[0], c[1], c[2]], i * 3);
    var r1 = hash(c[0], c[1], 1), r2 = hash(c[1], c[2], 2), r3 = hash(c[2], c[0], 3);
    var ang = r1 * 6.283, rad = 3 + r2 * 5;
    from.set([c[0] + Math.cos(ang) * rad, c[1] + 2 + r3 * 6, c[2] + Math.sin(ang) * rad * 0.6], i * 3);
    del[i] = Math.min(0.7, c[1] / H * 0.62) + r3 * 0.12; seed[i] = r1;
    var lo = lobeOf(c[0], c[1], c[2]);
    if (lo < 0 || c[1] < 3.6) C.copy(barkA).lerp(barkB, r2);
    else C.setHex(LOBES[lo][4]).lerp(lift, 0.12 + 0.1 * r2).multiplyScalar(0.9 + 0.2 * r3);
    C.multiplyScalar(1.12 - c[3] * 0.55);          // buried cells sit in shade
    mesh.setColorAt(i, C); mesh.setMatrixAt(i, I);
  });
  mesh.instanceColor.needsUpdate = true;
  g.setAttribute('aTarget', new T.InstancedBufferAttribute(tgt, 3));
  g.setAttribute('aFrom', new T.InstancedBufferAttribute(from, 3));
  g.setAttribute('aDelay', new T.InstancedBufferAttribute(del, 1));
  g.setAttribute('aSeed', new T.InstancedBufferAttribute(seed, 1));
  mesh.renderOrder = 2;
  scene.add(mesh);
  return { mesh: mesh, u: u };
}

/* Rising pixel motes for IVN (square points, the hologram's 'dust'). */
function buildPixelMotes() {
  var n = 90, p = new Float32Array(n * 3), s = new Float32Array(n);
  for (var i = 0; i < n; i++) { p[i * 3] = (hash(i, 1, 1) - 0.5) * 7; p[i * 3 + 1] = hash(i, 2, 2) * 9; p[i * 3 + 2] = (hash(i, 3, 3) - 0.5) * 3; s[i] = hash(i, 4, 4); }
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('aSeed', new T.BufferAttribute(s, 1));
  var u = { uTime: U.uTime, uX: { value: 0 }, uFade: { value: 0 } };
  var m = new T.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false,
    vertexShader: 'attribute float aSeed; uniform float uTime; uniform float uX; varying float vA;\nvoid main(){ vec3 q = position; float k = fract(aSeed + uTime * (0.04 + aSeed * 0.05)); q.y = k * 10.0; q.x += uX + sin(uTime * 0.7 + aSeed * 9.0) * 0.3; vA = sin(k * 3.1416); vec4 mv = modelViewMatrix * vec4(q, 1.0); gl_PointSize = (6.0 + aSeed * 6.0) * 30.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uFade; varying float vA;\nvoid main(){ gl_FragColor = vec4(0.93, 0.95, 0.82, vA * 0.8 * uFade); }' });
  var pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 3; scene.add(pts);
  return u;
}

/* Ground, grass, far forest, motes, light shafts: the WtF set, at clearing scale. */
(function ground() {
  var g = new T.PlaneGeometry(140, 140, 120, 120); g.rotateX(-Math.PI / 2);
  var p = g.attributes.position, col = new Float32Array(p.count * 3);
  var a = new T.Color(0xA7AC8E), b = new T.Color(0x979D7E), moss = new T.Color(0x86A07E), deep = new T.Color(0x6F9474), tmp = new T.Color();
  for (var i = 0; i < p.count; i++) {
    var x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z);
    p.setY(i, groundY(x, z));
    var n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.13 + x * 0.05);
    tmp.copy(a).lerp(b, n).lerp(moss, hash(Math.floor(x / 3), 0, Math.floor(z / 3)) * 0.35).lerp(deep, smooth(6, 30, d) * 0.7);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3)); g.computeVertexNormals();
  var m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true })); m.receiveShadow = true; scene.add(m);
})();
(function grass() {
  var pos = [], col = [], nor = [], root = new T.Color(0x7F8E66), tip = new T.Color(0xBFC99C);
  for (var b = 0; b < 5; b++) {
    var ang = b / 5 * Math.PI + 0.3, lean = 0.08 + (b % 3) * 0.05, hgt = 0.26 + (b % 2) * 0.14;
    var cx = Math.cos(ang) * 0.035, cz = Math.sin(ang) * 0.035, tx = Math.cos(ang + 1.3) * lean, tz = Math.sin(ang + 1.3) * lean;
    pos.push(-cx, 0, -cz, cx, 0, cz, tx, hgt, tz); col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  var n = light ? 2800 : 5200, sway = new Float32Array(n * 2); g.setAttribute('aSway', new T.InstancedBufferAttribute(sway, 2));
  var mesh = new T.InstancedMesh(g, fieldPatch(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })), n);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  var Mx = new T.Matrix4(), Q = new T.Quaternion(), Sv = new T.Vector3(), P = new T.Vector3(), Y = new T.Vector3(0, 1, 0), seed = 17;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  for (var i = 0; i < n; i++) {
    var r = 0.9 + Math.pow(rnd(), 0.9) * 13, a = rnd() * 6.283, x = Math.cos(a) * r * 1.4, z = Math.sin(a) * r * 0.7 - 2.5;
    if (z > 5) z = 5 - rnd() * 3;
    if (distToTrail(x, z) < 0.95) { s = 0; }
    var s = 0.55 + rnd() * 0.6; Q.setFromAxisAngle(Y, rnd() * 6.28);
    Mx.compose(P.set(x, -0.01, z), Q, Sv.set(s, s * (0.8 + rnd() * 0.7), s)); mesh.setMatrixAt(i, Mx);
    sway[i * 2] = 2.2; sway[i * 2 + 1] = 0.16;
  }
  scene.add(mesh);
})();
(function farForest() {
  var n = 120, tg = new T.CylinderGeometry(0.42, 1, 1, 6, 1); tg.translate(0, 0.5, 0);
  var cg = blobGeometry(5, 0.25);
  var trunks = new T.InstancedMesh(tg, bendPatch(new T.MeshLambertMaterial({ color: 0x6E5847 }), 12), n);
  var crowns = new T.InstancedMesh(cg, bendPatch(new T.MeshLambertMaterial({ color: 0xffffff }), 12), n * 2);
  var Mx = new T.Matrix4(), Q = new T.Quaternion(), Sv = new T.Vector3(), P = new T.Vector3(), C = new T.Color();
  var cols = [0x5F8C73, 0x507D67, 0x3F6E5A, 0x2F5E4B, 0x24503F];
  for (var i = 0; i < n; i++) {
    var a = Math.PI * (1.05 + hash(i, 0, 1) * 0.9), r = 22 + hash(i, 1, 0) * 30;
    var x = Math.cos(a) * r * 1.5, z = Math.sin(a) * r - 6,
      h = 6 + hash(i, 2, 2) * 6, w = 0.18 + hash(i, 3, 3) * 0.14;
    if (distToTrail(x, z) < 3) x += x < 0 ? -3.4 : 3.4;
    Mx.compose(P.set(x, -0.2, z), Q, Sv.set(w, h * 0.7, w)); trunks.setMatrixAt(i, Mx);
    var R = 1.6 + hash(i, 4, 4) * 1.4, ci = Math.min(4, Math.floor((r - 18) / 8));
    for (var k = 0; k < 2; k++) {
      Mx.compose(P.set(x + (k ? R * 0.5 : -R * 0.3), h * (0.72 + k * 0.12), z + (k ? -0.4 : 0.3)), Q, Sv.set(R * (1 - k * 0.25), R * 0.85, R)); crowns.setMatrixAt(i * 2 + k, Mx);
      crowns.setColorAt(i * 2 + k, C.setHex(cols[ci]).multiplyScalar(0.94 + hash(i, k, 7) * 0.12));
    }
  }
  crowns.instanceColor.needsUpdate = true; scene.add(trunks); scene.add(crowns);
})();
var motes = (function () {
  var n = 120, p = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) { p[i * 3] = (hash(i, 9, 1) - 0.5) * 22; p[i * 3 + 1] = hash(i, 9, 2) * 9; p[i * 3 + 2] = (hash(i, 9, 3) - 0.5) * 10 + 2; }
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
  var pts = new T.Points(g, new T.PointsMaterial({ color: 0xFBF9F4, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts); return { g: g, p: p, n: n };
})();
(function rays() {
  var c = document.createElement('canvas'); c.width = 32; c.height = 128; var x = c.getContext('2d');
  var g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,248,226,0.9)'); g.addColorStop(0.6, 'rgba(255,248,226,0.35)'); g.addColorStop(1, 'rgba(255,248,226,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 128);
  var h = x.createLinearGradient(0, 0, 32, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 32, 128);
  var tex = new T.CanvasTexture(c);
  [[-5, -3, 0.35], [3, -5, -0.25], [8, -8, 0.3], [-10, -9, -0.2]].forEach(function (s) {
    var m = new T.Mesh(new T.PlaneGeometry(2.6, 22), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
    m.position.set(s[0], 9, s[1]); m.rotation.z = s[2]; scene.add(m);
  });
})();
/* Soft contact shadow under the tree (the sketch's dark ellipse). */
function contactShadow() {
  var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d');
  var g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(36,58,44,0.5)'); g.addColorStop(1, 'rgba(36,58,44,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  var m = new T.Mesh(new T.PlaneGeometry(6.5, 3.2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; scene.add(m); return m;
}

/* Falling leaves for FI (the WtF leaf quad and palette). */
var LEAF_COLS = [0xB8552E, 0xD87B4F, 0x7FA396, 0x9A7B57, 0xC9A04E];
var leaves = (function () {
  var n = 26, g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute([0, -0.5, 0, 0.32, -0.1, 0, 0, 0.5, 0, -0.32, -0.1, 0], 3));
  g.setAttribute('normal', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  var m = new T.InstancedMesh(g, new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide }), n);
  m.frustumCulled = false; var C = new T.Color(), L = [];
  for (var i = 0; i < n; i++) { m.setColorAt(i, C.setHex(LEAF_COLS[i % 5])); L.push({ x: 0, y: -5, z: 0, vy: 0, r: 0, life: -hash(i, 5, 5) * 8 }); }
  m.instanceColor.needsUpdate = true; scene.add(m);
  return { m: m, L: L, n: n, x0: 0, minX: 0, on: 1 };
})();

/* ───────── assemble ───────── */
var clipFI = new T.Plane(new T.Vector3(1, 0, 0), 0);
var fiHalf = buildOrganic(clipFI);
var fiFull = buildOrganic(null); fiFull.grp.visible = false;
var pxHalf = buildPixels(true);
var pxFull = buildPixels(false); pxFull.mesh.visible = false;
var pxMotes = buildPixelMotes();
var shadowA = contactShadow();

/* The footpath: from the front of the clearing, past the tree, into the
   forest — where "Walk the forest" leads. Walk the Forest's trail colours
   (#D8CDAF, worn #C7BA98, light #E9E0C8), soft edges via vertex alpha. */
// clear of the crown (it reaches ~3.6 m): beside the tree, then bending into the trees
var trail = (function () {
  function ribbon(u0, u1) {
    var pos = [], col = [], idx = [], wid = 1.5, n = 0;
    var mid = new T.Color(0xD8CDAF), edge = new T.Color(0xC7BA98), light = new T.Color(0xE9E0C8);
    for (var i = Math.floor(u0 * TRAIL_N); i <= Math.ceil(u1 * TRAIL_N); i++) {
      var p = trailPts[Math.min(TRAIL_N, i)], q = trailPts[Math.min(TRAIL_N, i + 1)] || p, r = trailPts[Math.max(0, i - 1)];
      var tx = q.x - r.x, tz = q.z - r.z, L = Math.hypot(tx, tz) || 1, nx = -tz / L, nz = tx / L;
      var w = wid * (1 + 0.12 * Math.sin(i * 0.31));
      [[-1.35, 0], [-1, 1], [0, 1], [1, 1], [1.35, 0]].forEach(function (s, k) {
        var x = p.x + nx * s[0] * w * 0.5, z = p.z + nz * s[0] * w * 0.5;
        pos.push(x, groundY(x, z) + 0.035 + (k === 2 ? 0.004 : 0), z);
        var c = k === 2 ? light : (k === 0 || k === 4 ? edge : mid);
        col.push(c.r, c.g, c.b, s[1] * (0.9 + 0.1 * Math.sin(i * 1.7 + k)));
      });
      if (n) for (var k = 0; k < 4; k++) { var A = (n - 1) * 5 + k, B = n * 5 + k; idx.push(A, B, A + 1, A + 1, B, B + 1); }
      n++;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 4));
    g.setIndex(idx); g.computeVertexNormals();
    var m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0 }));
    m.receiveShadow = true; m.renderOrder = 1; m.visible = false; scene.add(m);
    return m;
  }
  // the whole path, as it carries on in Walk the Forest's world
  var near = ribbon(0, 1);
  function fade(objs, mats, f) { objs.forEach(function (o) { o.visible = f > 0.001; }); mats.forEach(function (m) { m.opacity = f; m.transparent = true; m.depthWrite = false; }); }
  return {
    near: function (f) { fade([near], [near.material], f); }
  };
})();

/* Framing: the tree never moves. The camera frames it inside whatever part
   of the screen is free in each state (all of it in A; beside the menu on
   laptop/desktop; above the menu sheet on a phone), by choosing its distance
   to fit and shifting the view (setViewOffset). One rule for every size. */
var view = { w: 1, h: 1, narrow: false, short: false };
var cam = { w: 0, tw: 0, d: 20, td: 20, ox: 0, tox: 0, oy: 0, toy: 0, px: 0, py: 0 };
var FOV = 40, TAN = Math.tan(FOV * Math.PI / 360), TREE = { w: 7.8, h: 9.8, cy: 4.6 };
camera.fov = FOV;
function freeRect() {
  var W = view.w, Hh = view.h, top = 56;
  if (S.mode === 'A') {
    var labs = ROOT.querySelectorAll('.half .lab'), lb = 0;
    labs.forEach(function (l) { lb = Math.max(lb, l.getBoundingClientRect().bottom); });
    var hint = $('hint').getBoundingClientRect().top;
    // on wide screens the labels sit in the corners, beside the tree
    var y0 = (view.narrow || W / Hh < 1.25) ? lb + 8 : top;
    return { x: 0, y: y0, w: W, h: Math.max(160, hint - 8 - y0) };
  }
  if (S.pane) {
    var pr = paneRect(), gap = S.last === 'fi' ? pr.r : pr.l;
    if (!view.narrow && gap >= 240) return S.last === 'fi' ? { x: W - gap + 8, y: top, w: gap - 24, h: Hh - top - 16 } : { x: 16, y: top, w: gap - 24, h: Hh - top - 16 };
  }
  var menu = ROOT.querySelector((S.mode === 'C' ? '#tr-room-fi' : '#tr-room-ivn') + ' .menu').getBoundingClientRect();
  var strip = view.narrow ? 48 : 64;
  if (view.narrow || W / Hh < 0.9) {
    var x0 = S.mode === 'C' ? strip : 0;
    return { x: x0, y: top, w: W - strip, h: Math.max(140, menu.top - 10 - top) };
  }
  if (S.mode === 'C') return { x: menu.right + 16, y: top, w: Math.max(160, W - menu.right - 32), h: Hh - top - 16 };
  return { x: 16, y: top, w: Math.max(160, menu.left - 32), h: Hh - top - 16 };
}
function reframe() {
  var r = freeRect(), W = view.w, Hh = view.h;
  // distance so the tree fits the free rect (height and width), with air
  var dH = TREE.h * Hh / (r.h * 0.9 * 2 * TAN);
  var dW = TREE.w * Hh / (r.w * 0.86 * 2 * TAN);
  cam.td = Math.max(13, Math.min(46, Math.max(dH, dW)));
  cam.tox = W / 2 - (r.x + r.w / 2);
  cam.toy = Hh / 2 - (r.y + r.h / 2);
  if (still) { cam.d = cam.td; cam.ox = cam.tox; cam.oy = cam.toy; }
}
function layout() {
  view.w = innerWidth; view.h = innerHeight; view.narrow = view.w <= 720; view.short = view.h < 560;
  renderer.setSize(view.w, view.h, false); camera.aspect = view.w / view.h; camera.updateProjectionMatrix();
  reframe();
}
function slideW() { return TAN * cam.d * camera.aspect * 2 + 8; }

/* tweens */
var tweens = [];
function tween(dur, fn, done) { if (still) { fn(1); if (done) done(); return; } tweens.push({ t0: performance.now(), dur: dur, fn: fn, done: done }); }

var st = { hover: null, hoverK: { ivn: 0, fi: 0 } };
function setFIHalfX(x) { fiHalf.grp.position.x = x; clipFI.constant = -x; }

gl = {
  hover: function (s) { st.hover = s; },
  // The walker (Walk the Forest's own figure, wf3dPerson) walks the footpath
  // and the camera follows him in the third person.
  follow: function (done) {
    if (!cam.walker) { cam.walker = wf3dPerson('stand', 1.74); scene.add(cam.walker.group); }
    cam.walker.group.visible = true;
    // start just outside the right edge of what the camera sees
    var edge = TAN * cam.d * camera.aspect + 1.2, u0 = 0;
    for (var i = 0; i < trailPts.length; i++) if (trailPts[i].x <= edge) { u0 = i / TRAIL_N; break; }
    cam.follow = { t0: performance.now(), u0: u0, cross: 0, done: done, fired: false, last: null, phase: 0 };
  },
  unfollow: function () { cam.follow = null; cam.tw = 0; cam.w = 0; if (cam.walker) cam.walker.group.visible = false; trail.near(0); },
  frame: reframe,
  world: function () {
    var J = trailCurve.getPointAt(TRAIL_CROSS);
    return {
      camera: camera, view: view,
      objects: [fiHalf.grp, pxHalf.mesh, shadowA],
      join: { x: J.x, y: groundY(J.x, J.z), z: J.z },
      past: cam.follow && cam.follow.u != null ? Math.max(0, cam.follow.u - TRAIL_CROSS) * TRAIL_LEN : 0
    };
  },
  open: function (side) {
    var sw = slideW();
    requestAnimationFrame(reframe);
    if (side === 'fi') {
      // the IVN half slides off to its strip; the camera reframes; a whole FI tree grows
      tween(900, function (k) { var e = ease3(k); pxHalf.u.uSlide.value = -e * sw; pxHalf.u.uFade.value = 1 - e * 0.6; });
      setTimeout(function () {
        fiHalf.grp.visible = false; fiFull.grp.visible = true; fiFull.setGrow(0);
        tween(3600, function (k) { fiFull.setGrow(k); }); leaves.minX = -99;
      }, still ? 0 : 820);
    } else {
      tween(900, function (k) { setFIHalfX(ease3(k) * sw); });
      setTimeout(function () {
        pxHalf.mesh.visible = false; pxFull.mesh.visible = true; pxFull.u.uFade.value = 1; pxFull.u.uBuild.value = 0;
        tween(3600, function (k) { pxFull.u.uBuild.value = k * 1.02; pxMotes.uFade.value = k; });
        leaves.on = 0;
      }, still ? 0 : 820);
    }
  },
  back: function (side) {
    var sw = slideW();
    requestAnimationFrame(reframe);
    if (side === 'fi') {
      tween(600, function (k) { fiFull.setGrow(1 - k); }, function () { fiFull.grp.visible = false; });
      setTimeout(function () {
        fiHalf.grp.visible = true; fiHalf.setGrow(1); leaves.minX = 0;
        tween(900, function (k) { var e = ease3(k); pxHalf.u.uSlide.value = -(1 - e) * sw; pxHalf.u.uFade.value = 0.4 + 0.6 * e; });
      }, still ? 0 : 450);
    } else {
      tween(600, function (k) { pxFull.u.uFade.value = 1 - k; pxMotes.uFade.value = 1 - k; }, function () { pxFull.mesh.visible = false; });
      setTimeout(function () {
        pxHalf.mesh.visible = true; leaves.on = 1;
        tween(900, function (k) { setFIHalfX((1 - ease3(k)) * sw); });
      }, still ? 0 : 450);
    }
  }
};

/* Intro: the half-tree grows on the right while its pixels gather on the left. */
fiHalf.setGrow(0); pxHalf.u.uBuild.value = 0;
tween(3200, function (k) { fiHalf.setGrow(k); pxHalf.u.uBuild.value = k * 1.02; }, function () { $('cue-ivn').classList.add('on'); $('cue-fi').classList.add('on'); });

/* Wind: ambient + pointer gusts, a spring on the crown (as wfp benders). */
var wind = { bx: 0, bz: 0, vx: 0, vz: 0, gx: 0, gz: 0, lastX: null, lastY: null, lastT: 0 };
var ray = new T.Raycaster(), ndc = new T.Vector2(), groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
addEventListener('pointermove', function (e) {
  if (!shown) return;
  var now = performance.now();
  cam.px = (e.clientX / view.w - 0.5); cam.py = (e.clientY / view.h - 0.5);
  if (wind.lastX !== null && !still) {
    var dt = Math.max(8, now - wind.lastT), vx = (e.clientX - wind.lastX) / dt, vy = (e.clientY - wind.lastY) / dt;
    // gentle: a low-passed share of the pointer's speed, capped
    wind.gx = Math.max(-1.2, Math.min(1.2, wind.gx + vx * 0.22)); wind.gz = Math.max(-0.8, Math.min(0.8, wind.gz + vy * 0.12));
    ndc.set(e.clientX / view.w * 2 - 1, -(e.clientY / view.h) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(groundPlane, hit)) U.uGust.value[0].set(hit.x, hit.z, vx * 2.2, vy * 1.5);
  }
  wind.lastX = e.clientX; wind.lastY = e.clientY; wind.lastT = now;
}, { passive: true });

/* project the two touch cues onto the crown halves */
var v3 = new T.Vector3();
function placeCue(id, x) { v3.set(x, 6.0, 0.5).project(camera); var el = $(id); el.style.left = ((v3.x + 1) / 2 * view.w) + 'px'; el.style.top = ((1 - v3.y) / 2 * view.h) + 'px'; }

layout(); addEventListener('resize', layout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(reframe);
var t0 = performance.now(), last = t0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!syncShown()) { last = now; return; }
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  var t = (now - t0) / 1000; U.uTime.value = still ? 0 : t;
  for (var i = tweens.length - 1; i >= 0; i--) { var tw = tweens[i], k = Math.min(1, (now - tw.t0) / tw.dur); tw.fn(k); if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); } }
  // ambient wind (the GLSL field's base, sampled at the trunk) + gusts → spring
  var base = still ? 0 : 0.55 + 0.3 * Math.sin(t * 0.23) + 0.22 * Math.sin(t * 0.61);
  var tx = 0.86 * base * 0.12 + wind.gx * 0.26, tz = -0.5 * base * 0.12 + wind.gz * 0.16;
  // soft spring, just under critical damping: it leans, sways back once, settles
  wind.vx += ((tx - wind.bx) * 6 - wind.vx * 4.2) * dt; wind.vz += ((tz - wind.bz) * 6 - wind.vz * 4.2) * dt;
  wind.bx += wind.vx * dt; wind.bz += wind.vz * dt;
  wind.bx = Math.max(-0.45, Math.min(0.45, wind.bx)); wind.bz = Math.max(-0.28, Math.min(0.28, wind.bz));
  U.uBend.value.set(wind.bx, wind.bz);
  wind.gx *= Math.pow(0.2, dt); wind.gz *= Math.pow(0.2, dt);
  U.uGust.value[0].z *= Math.pow(0.1, dt); U.uGust.value[0].w *= Math.pow(0.1, dt);
  // hover: the chosen half leans in a touch, the pixels brighten
  ['ivn', 'fi'].forEach(function (s) { st.hoverK[s] += ((st.hover === s ? 1 : 0) - st.hoverK[s]) * Math.min(1, dt * 6); });
  pxHalf.u.uHover.value = st.hoverK.ivn;
  if (S.mode === 'A') fiHalf.grp.scale.setScalar(1 + st.hoverK.fi * 0.025);
  // leaves
  if (leaves.on && !still) leaves.L.forEach(function (l, i) {
    l.life += dt;
    if (l.life > 0 && l.y < 0.05) { var a = hash(i, Math.floor(t), 3) * 6.28; l.x = leaves.x0 + Math.max(leaves.minX - leaves.x0 + 0.3, Math.cos(a) * 2.4); l.y = 5 + hash(i, t, 1) * 2; l.z = Math.sin(a) * 1.4; l.vy = 0.5 + hash(i, 2, t) * 0.4; l.r = a; l.life = -hash(i, t, 9) * 6; }
    if (l.y >= 0.05) { l.y -= l.vy * dt; l.x += (0.35 + wind.bx * 1.4 + Math.sin(t * 2 + i) * 0.25) * dt; l.z += (wind.bz + Math.cos(t * 1.7 + i) * 0.2) * dt; l.r += dt * 2; }
  });
  var Mx = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), Sv = new T.Vector3(0.22, 0.22, 0.22);
  leaves.L.forEach(function (l, i) { E.set(l.r, l.r * 0.7, l.r * 0.3); Q.setFromEuler(E); Mx.compose(P.set(l.x, l.y, l.z), Q, l.y > 0.05 && leaves.on ? Sv : Sv.clone().set(0, 0, 0)); leaves.m.setMatrixAt(i, Mx); });
  leaves.m.instanceMatrix.needsUpdate = true;
  // motes drift
  if (!still) for (var m = 0; m < motes.n; m++) { motes.p[m * 3 + 1] += Math.sin(t * 0.3 + m) * 0.002; motes.p[m * 3] += (0.004 + wind.bx * 0.01); if (motes.p[m * 3] > 11) motes.p[m * 3] = -11; }
  motes.g.attributes.position.needsUpdate = true;
  // camera: slight parallax toward the pointer (as the WtF camera), eases to its target
  var kf = Math.min(1, dt * 2.2);
  cam.d += (cam.td - cam.d) * kf; cam.ox += (cam.tox - cam.ox) * kf; cam.oy += (cam.toy - cam.oy) * kf;
  cam.w += (cam.tw - cam.w) * Math.min(1, dt * (cam.tw ? 0.55 : 1.4));
  var wk = cam.w * cam.w * (3 - 2 * cam.w);            // eased 0..1
  camera.setViewOffset(view.w, view.h, cam.ox * (1 - wk), cam.oy * (1 - wk), view.w, view.h);
  scene.fog.density = 0.48 / cam.d * (1 - wk) + 0.045 * wk;
  cam.spx = (cam.spx || 0) + ((still ? 0 : cam.px) - (cam.spx || 0)) * Math.min(1, dt * 1.6);
  cam.spy = (cam.spy || 0) + ((still ? 0 : cam.py) - (cam.spy || 0)) * Math.min(1, dt * 1.6);
  var px = cam.spx, py = cam.spy;
  camera.position.set(px * 0.8, TREE.cy + cam.d * 0.1 - py * 0.6, cam.d);
  camera.lookAt(px * 0.3, TREE.cy, 0);
  if (cam.follow && cam.walker) {
    var F = cam.follow, el = (now - F.t0) / 1000;
    // an unhurried walk (1.6 m/s), easing in from standing
    var sMeters = el < 0.8 ? 1.6 * el * el / 1.6 : 1.6 * (el - 0.4);
    var u = Math.min(1, F.u0 + sMeters / TRAIL_LEN);
    var P0 = trailCurve.getPointAt(u), tg = trailCurve.getTangentAt(u);
    var x = P0.x, z = P0.z, y = groundY(x, z), rot = Math.atan2(tg.x, tg.z);
    // Walk the Forest's own gait (walk-forest-3d-stations.js): the legs
    // follow the ground covered, one stride cycle per 1.5 m, swing scaled
    // by speed, so he walks exactly like the walker he becomes
    var W = cam.walker, moved = F.last ? Math.hypot(x - F.last.x, z - F.last.z) : 0;
    var speed = dt > 0 ? moved / dt : 0;
    F.last = { x: x, z: z }; F.phase += moved / 1.5;
    var ph = F.phase * Math.PI * 2, amp = Math.min(1, speed / 1.2);
    W.group.position.set(x, y, z); W.group.rotation.y = rot;
    W.legL.rotation.x = Math.sin(ph) * 0.55 * amp; W.legR.rotation.x = -Math.sin(ph) * 0.55 * amp;
    W.armL.rotation.x = -Math.sin(ph) * 0.4 * amp; W.armR.rotation.x = Math.sin(ph) * 0.4 * amp;
    W.hips.position.y = W.hipY + Math.abs(Math.cos(ph)) * 0.035 * amp;
    trail.near(Math.min(1, el / 1.2));
    // The picture holds still while he walks in. Once he is on the path
    // behind the tree, the walk carries on in Walk the Forest itself: the
    // same tree stands in its world, 84 m before activity 1 (wf-bridge.js).
    F.u = u;
    if (u >= TRAIL_CROSS && !F.fired) { F.fired = true; F.done(); }
  }

  if (S.mode === 'A') { placeCue('cue-ivn', -1.7); placeCue('cue-fi', 1.7); }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
})();
