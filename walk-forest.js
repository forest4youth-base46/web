// ─── Walk the Forest — animated perspective-trail scene for the role
//     screen (#role-screen). Ported from the Claude Design prototype
//     "Walk the Forest v2.dc.html" (see project/uploads for the source
//     export) into this app's plain-DOM/innerHTML style, wired to the
//     real ACTIVITIES/GROUPS/VISUAL/PB_I18N data and pbT()/pbTagT()/
//     pbGroupT()/pbLocalizeVisual()/currentLang from pocketbook-*.js and
//     content.js, rather than the prototype's own standalone copies of
//     that text. The camera drifts stop to stop on its own; opening a
//     stop's detail panel pauses it. Only runs while #role-screen is the
//     active screen — see wfEnterScene()/wfExitScene(), called from
//     router.js. ───
'use strict';

// Pacing tuned down from the original design's 14s/14s: this now runs
// continuously as a background behind ordinary browsing rather than being
// the thing someone sits and watches, so a bit more visible movement per
// unit time reads as "alive" instead of static without feeling frantic.
const WF_DWELL_MS = 10000;
const WF_TRAVEL_MS = 12000;
const WF_MANUAL_TRAVEL_MS = 2000;
const WF_BACK_PAUSE_MS = 20000;
const WF_CLOSE_PAUSE_MS = 4000;

// Group-level color + small monoline glyph (distinct from the per-activity
// GLYPH set in pocketbook-data.js) — matches the forest palette tokens:
// forest-soft/forest-mid/forest-deep/bark/ember.
// Literal hex (matching the forest-soft/forest-mid/forest-deep/bark/ember
// tokens) rather than var(...) — some of these feed straight into raw SVG
// presentation attributes (stroke=), which the older WebView this app is
// tested against (see README's "Older WebView note") may not resolve
// custom properties inside.
const WF_GROUP_META = {
  1: { color: '#7FA396', glyph: 'M6 26C6 14 14 6 26 6c0 12-8 20-20 20Z' },
  2: { color: '#3A6B5A', glyph: 'M11 24c0-4 1-7 3-9 2-3 1-7 4-7 2 0 3 2 3 5 0 3-1 5-1 7s2 3 2 5-2 4-5 4-6-2-6-5Z' },
  3: { color: '#234A3E', glyph: 'M6 11c0-1.7 4.5-3 10-3s10 1.3 10 3-4.5 3-10 3-10-1.3-10-3Z M6 11v10c0 1.7 4.5 3 10 3s10-1.3 10-3V11' },
  4: { color: '#6B5240', glyph: 'M16 26v-8 M16 18c-4 0-7-2-7-7 4 0 7 2 7 7Z M16 18c4 0 7-3 7-8-4 0-7 3-7 8Z M8 26h16' },
  5: { color: '#B8552E', glyph: 'M16 6c2 5 6 6 6 11a6 6 0 0 1-12 0c0-2 1-3 2-4 1 2 2 2 3 0 1-2 1-4 1-7Z M6 26h20' },
};

// [centre lateral, span factor] — a prop's own width, compressed about its
// place on the verge, so a hammock is ~3m of fabric rather than 8m across.
// Centre-lateral values pulled in from the original design's — several
// (hammock/tinyworld/fire/bivouac/project/campfire) placed their set
// dressing far enough off-centre that it rendered mostly or entirely
// outside the viewport at normal camera framing (fire and campfire were
// the worst: 2.3 and 3.6 lateral units put them well past a full
// viewport-width beyond screen centre). Reined in so every stop's set
// piece is actually on screen while it's the active stop.
const WF_SPAN = {
  hammock: [0.5, 0.85], palette: [0, 0.45], sofa: [0.73, 0.7], bivouac: [-0.6, 0.4],
  project: [-0.55, 0.5], fire: [0.65, 0.6], campfire: [0.4, 0.75], roles: [0.72, 0.7],
  checkin: [-0.7, 0.75], tinyworld: [-0.55, 0.8], naming: [0, 0.9],
};

// [along trail, lateral, pose, height, facing, up] — group sizes follow
// each activity's own description: individual work is one figure apart,
// group work is three or four together.
const WF_CAST = {
  introduce: [[0.42, -0.66, 'kneel', 0.95, 'r']],
  hammock: [[0.11, 0.65, 'lie', 0.95, 'r', 0.52]],
  soundscape: [[0.34, 0.9, 'sit', 0.92], [-0.2, -0.95, 'sit', 0.92, 'l']],
  naming: [[0.06, 0.86, 'reach', 0.95, 'l'], [0.2, 1.12, 'stand', 0.9]],
  barefoot: [[0.72, -0.16, 'stand', 0.95], [0.95, 0.2, 'stand', 0.93]],
  palette: [[0.1, -0.62, 'reach', 0.95, 'r'], [0.18, 0.6, 'stand', 0.92]],
  senses: [[0.5, -0.8, 'stand', 0.95]],
  tinyworld: [[-0.06, -0.92, 'kneel', 0.95, 'r'], [0.12, -0.62, 'kneel', 0.92, 'l']],
  sofa: [[0.1, 0.62, 'sit', 0.95], [0.26, 0.96, 'sit', 0.93], [-0.16, 0.3, 'carry', 0.95, 'r']],
  fire: [[-0.12, -0.42, 'kneel', 0.95, 'r'], [0.24, 0.4, 'kneel', 0.93, 'l'], [0.02, 0.62, 'sit', 0.92]],
  bivouac: [[0.06, -1.5, 'reach', 0.95, 'r'], [0.24, -0.66, 'carry', 0.93, 'l']],
  sitspot: [[0.62, -1.25, 'sit', 0.95], [1.15, 1.3, 'sit', 0.92]],
  roles: [[-0.06, 0.42, 'carry', 0.95, 'r'], [0.18, 0.9, 'stand', 0.93], [0.34, 1.2, 'carry', 0.92, 'l']],
  project: [[0.05, -1.05, 'kneel', 0.95, 'r']],
  object: [[0.02, 0.86, 'kneel', 0.95, 'l']],
  checkin: [[0.1, -0.6, 'reach', 0.95, 'l'], [0.26, -0.3, 'stand', 0.93]],
  campfire: [[-0.18, -0.5, 'sit', 0.95], [0.28, -0.36, 'sit', 0.93], [0.3, 0.5, 'sit', 0.94], [-0.14, 0.52, 'sit', 0.92]],
};

const WF_TREES = (function () {
  const out = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 150; i++) {
    const at = -1 + i * 0.19 + rnd() * 0.14;
    const lat = (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 2.5);
    out.push({ at, lat, h: 0.85 + rnd() * 0.9, w: 0.8 + rnd() * 0.65, crown: rnd(), lean: rnd() - 0.5, sway: 8.5 + rnd() * 9, swayDelay: rnd() * 12 });
  }
  return out;
})();

const WF_SHRUBS = (function () {
  const out = [];
  let seed = 53;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 70; i++) {
    const at = -1 + i * 0.2 + rnd() * 0.14;
    const lat = (rnd() < 0.5 ? -1 : 1) * (0.62 + rnd() * 1.15);
    out.push({ at, lat, s: 0.55 + rnd() * 0.85, tone: rnd() });
  }
  return out;
})();

const WF_DAPPLE = (function () {
  const out = [];
  let seed = 31;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 60; i++) out.push({ at: -0.5 + i * 0.32, lat: (rnd() - 0.5) * 0.9, s: 0.5 + rnd() * 0.9 });
  return out;
})();

// ───────── in-world words (painted onto signs/props) ─────────
// The short label set each VISUAL illustration paints into its own <text>
// nodes, reused here as the words that appear on set-dressing out on the
// trail — same substitution pbLocalizeVisual() does for the detail panel,
// just extracted in English rather than duplicated by hand.
const WF = {
  el: null, active: false, on: false, cam: 0, mode: 'hold',
  from: 0, to: 0, moveStart: 0, holdEnd: 0,
  paused: false, resumeAt: 0, manual: false, reduced: false,
  openId: null, sessionDrawerOpen: false,
  w: 1200, h: 640, raf: null, lastPaint: 0,
  onResize: null, onKey: null, onSceneClick: null,
  _wordsEnCache: {},
};

function wfWordsEnglish(activityId) {
  if (WF._wordsEnCache[activityId]) return WF._wordsEnCache[activityId];
  const a = ACTIVITIES.find(x => x.id === activityId);
  const svg = a && VISUAL[a.visual || a.id];
  const out = [];
  if (svg) {
    const re = /<text[^>]*>(?:<animate[^>]*\/>)?([^<]*)<\/text>/g;
    let m;
    while ((m = re.exec(svg))) { if (m[1].trim()) out.push(m[1]); }
  }
  WF._wordsEnCache[activityId] = out;
  return out;
}
function wfWords(activityId) {
  const dict = PB_I18N[currentLang] && PB_I18N[currentLang].visuals;
  const translated = dict && dict[activityId];
  return (translated && translated.length) ? translated : wfWordsEnglish(activityId);
}

// ───────── projection ─────────
// Amplitude/frequency softened from the original design (0.6/0.72, 0.16/1.9)
// — at full strength the trail swung noticeably per stop, reading more like
// a synthetic wave than a forest path's gentle, irregular bend.
function wfPathLat(t) { return 0.38 * Math.sin(t * 0.6) + 0.1 * Math.sin(t * 1.7 + 1.1); }

function wfProject(at, lat) {
  const w = WF.w, h = WF.h;
  const horizon = h * 0.445;
  const d = at - WF.cam;
  const z = 1 + Math.max(d, -0.85) * 0.66;
  if (z <= 0.18) return null;
  const scale = 1 / z;
  const y = horizon + (h - horizon) * Math.pow(scale, 1.12) * 0.9;
  const x = w / 2 + (wfPathLat(at) + lat - wfPathLat(WF.cam)) * w * 0.42 * scale;
  return { x, y, scale, d };
}

// ───────── in-world cast (the activity as people doing it) ─────────
function wfBuildCast(s, i) {
  const cast = WF_CAST[s.id];
  if (!cast || !cast.length) return '';
  const w = WF.w;
  const R = (v) => Math.round(v * 10) / 10;
  const SP = WF_SPAN[s.id] || [0, 1];
  const P = (a, l, up) => {
    const lat = SP[0] + (l - SP[0]) * SP[1];
    const pr = wfProject(i + a, lat * 1.2);
    if (!pr) return null;
    const u = w * 0.42 * pr.scale;
    return { x: pr.x, y: pr.y - (up || 0) * 0.42 * u, u: u };
  };
  let out = '';
  cast.forEach((c) => {
    const b = P(c[0], c[1], c[5] || 0);
    if (!b) return;
    const H = (c[3] || 0.95) * 0.42 * b.u;
    if (H < 8) return;
    const pose = c[2], face = c[4] === 'l' ? -1 : 1;
    const fill = '#14302A', op = 0.74;
    let g = c[5] ? '' : '<ellipse cx="' + R(b.x) + '" cy="' + R(b.y) + '" rx="' + R(H * 0.2) + '" ry="' + R(H * 0.06) + '" fill="#3A2E22" opacity="0.16"/>';
    const head = (cx, cy, r) => '<circle cx="' + R(cx) + '" cy="' + R(cy) + '" r="' + R(r) + '" fill="' + fill + '" opacity="' + op + '"/>';
    const limb = (x1, y1, x2, y2, t) => '<path d="M' + R(x1) + ' ' + R(y1) + ' L' + R(x2) + ' ' + R(y2) + '" stroke="' + fill + '" stroke-width="' + R(t) + '" stroke-linecap="round" opacity="' + op + '"/>';
    if (pose === 'stand' || pose === 'carry' || pose === 'reach') {
      const top = b.y - H;
      g += limb(b.x - H * 0.06, b.y - H * 0.44, b.x - H * 0.07, b.y, H * 0.075);
      g += limb(b.x + H * 0.06, b.y - H * 0.44, b.x + H * 0.07, b.y, H * 0.075);
      g += '<path d="M' + R(b.x) + ' ' + R(top + H * 0.2) + ' q' + R(-H * 0.15) + ' ' + R(H * 0.07) + ' ' + R(-H * 0.15) + ' ' + R(H * 0.36) + ' l' + R(H * 0.3) + ' 0 q0 ' + R(-H * 0.29) + ' ' + R(-H * 0.15) + ' ' + R(-H * 0.36) + ' Z" fill="' + fill + '" opacity="' + op + '"/>';
      if (pose === 'carry') g += limb(b.x, b.y - H * 0.6, b.x + face * H * 0.3, b.y - H * 0.5, H * 0.065);
      if (pose === 'reach') g += limb(b.x, b.y - H * 0.62, b.x + face * H * 0.34, b.y - H * 0.78, H * 0.06);
      g += head(b.x, top + H * 0.11, H * 0.115);
    } else if (pose === 'sit') {
      const top = b.y - H * 0.72;
      g += limb(b.x + face * H * 0.02, b.y - H * 0.1, b.x + face * H * 0.2, b.y - H * 0.03, H * 0.07);
      g += '<path d="M' + R(b.x) + ' ' + R(top + H * 0.18) + ' q' + R(-H * 0.12) + ' ' + R(H * 0.06) + ' ' + R(-H * 0.12) + ' ' + R(H * 0.4) + ' l' + R(H * 0.24) + ' 0 q0 ' + R(-H * 0.34) + ' ' + R(-H * 0.12) + ' ' + R(-H * 0.4) + ' Z" fill="' + fill + '" opacity="' + op + '"/>';
      g += limb(b.x + face * H * 0.09, b.y - H * 0.42, b.x + face * H * 0.16, b.y - H * 0.16, H * 0.05);
      g += head(b.x, top + H * 0.1, H * 0.105);
    } else if (pose === 'kneel') {
      const top = b.y - H * 0.58;
      g += '<ellipse cx="' + R(b.x + face * H * 0.05) + '" cy="' + R(b.y - H * 0.06) + '" rx="' + R(H * 0.17) + '" ry="' + R(H * 0.08) + '" fill="' + fill + '" opacity="' + op + '"/>';
      g += '<path d="M' + R(b.x) + ' ' + R(top + H * 0.14) + ' q' + R(face * H * 0.1) + ' ' + R(H * 0.16) + ' ' + R(face * H * 0.04) + ' ' + R(H * 0.3) + ' l' + R(-H * 0.2) + ' ' + R(-H * 0.04) + ' q' + R(-H * 0.02) + ' ' + R(-H * 0.16) + ' ' + R(H * 0.16) + ' ' + R(-H * 0.26) + ' Z" fill="' + fill + '" opacity="' + op + '"/>';
      g += limb(b.x + face * H * 0.05, b.y - H * 0.3, b.x + face * H * 0.24, b.y - H * 0.08, H * 0.055);
      g += head(b.x + face * H * 0.02, top + H * 0.06, H * 0.095);
    } else if (pose === 'lie') {
      g += '<ellipse cx="' + R(b.x) + '" cy="' + R(b.y - H * 0.08) + '" rx="' + R(H * 0.48) + '" ry="' + R(H * 0.11) + '" fill="' + fill + '" opacity="' + op + '"/>';
      g += head(b.x - face * H * 0.46, b.y - H * 0.16, H * 0.105);
    }
    out += g;
  });
  return out;
}

// ───────── in-world set dressing (materials/structures/signs) ─────────
function wfBuildProps(s, i) {
  const w = WF.w;
  const R = (v) => Math.round(v * 10) / 10;
  const OUT = 1.2;
  const UP = 0.42;
  const SZ = 0.45;
  const SP = WF_SPAN[s.id] || [0, 1];
  const P = (a, l, up) => {
    const lat = SP[0] + (l - SP[0]) * SP[1];
    const pr = wfProject(i + a, lat * OUT);
    if (!pr) return null;
    const u = w * 0.42 * pr.scale;
    return { x: pr.x, y: pr.y - (up || 0) * UP * u, u: u, s: pr.scale };
  };
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = wfWords(s.id) || [];
  const W = (k) => esc(words[k] || '');
  const stone = (a, l, r, f, o, cls) => { const q = P(a, l); if (!q) return ''; return '<ellipse ' + (cls ? 'class="' + cls + '" ' : '') + 'cx="' + R(q.x) + '" cy="' + R(q.y) + '" rx="' + R(r * SZ * q.u) + '" ry="' + R(r * SZ * q.u * 0.5) + '" fill="' + f + '"' + (o != null ? ' opacity="' + o + '"' : '') + '/>'; };
  const shade = (a, l, r) => stone(a, l, r, '#3A2E22', 0.14);
  const ring = (a, l, r, cls, col) => { const q = P(a, l); if (!q) return ''; return '<ellipse ' + (cls ? 'class="' + cls + '" ' : '') + 'cx="' + R(q.x) + '" cy="' + R(q.y) + '" rx="' + R(r * SZ * q.u) + '" ry="' + R(r * SZ * q.u * 0.4) + '" fill="none" stroke="' + (col || '#7FA396') + '" stroke-width="' + R(Math.max(1, 0.012 * q.u)) + '"/>'; };
  const post = (a, l, hgt, th, f) => { const b = P(a, l), t = P(a, l, hgt); if (!b || !t) return ''; const tw = Math.max(1.2, th * SZ * b.u); return '<rect x="' + R(b.x - tw / 2) + '" y="' + R(t.y) + '" width="' + R(tw) + '" height="' + R(Math.max(1, b.y - t.y)) + '" rx="' + R(tw / 2) + '" fill="' + f + '"/>'; };
  const beam = (a1, l1, u1, a2, l2, u2, th, f, cls) => { const A = P(a1, l1, u1), B = P(a2, l2, u2); if (!A || !B) return ''; return '<path ' + (cls ? 'class="' + cls + '" ' : '') + 'd="M' + R(A.x) + ' ' + R(A.y) + ' L' + R(B.x) + ' ' + R(B.y) + '" stroke="' + f + '" stroke-width="' + R(Math.max(1.2, th * SZ * Math.max(A.u, B.u))) + '" stroke-linecap="round" fill="none"/>'; };
  const quad = (c, f, o) => { const pts = c.map(v => P(v[0], v[1], v[2] || 0)); if (pts.some(v => !v)) return ''; return '<path d="M' + pts.map(v => R(v.x) + ' ' + R(v.y)).join(' L') + ' Z" fill="' + f + '"' + (o != null ? ' opacity="' + o + '"' : '') + '/>'; };
  const band = (a0, a1, f, o) => { const A = wfProject(i + a0, 0), B = wfProject(i + a1, 0); if (!A || !B) return ''; const hA = w * 0.235 * A.scale, hB = w * 0.235 * B.scale; return '<path d="M' + R(A.x - hA) + ' ' + R(A.y) + ' L' + R(A.x + hA) + ' ' + R(A.y) + ' L' + R(B.x + hB) + ' ' + R(B.y) + ' L' + R(B.x - hB) + ' ' + R(B.y) + ' Z" fill="' + f + '" opacity="' + (o == null ? 1 : o) + '"/>'; };
  const bush = (a, l, r, f, cls) => { const q = P(a, l); if (!q) return ''; const k = r * SZ * q.u; return '<path ' + (cls ? 'class="' + cls + '" ' : '') + 'd="M' + R(q.x - k) + ' ' + R(q.y) + ' q' + R(k * 0.3) + ' ' + R(-k * 1.4) + ' ' + R(k) + ' ' + R(-k * 0.55) + ' q' + R(k * 0.7) + ' ' + R(-k * 0.85) + ' ' + R(k) + ' ' + R(k * 0.55) + ' Z" fill="' + f + '"/>'; };
  const near = Math.abs(WF.cam - i);
  const label = (a, l, up, txt, k) => {
    if (near > 0.42 || !txt || txt.length > 26) return '';
    const q = P(a, l, up || 0);
    if (!q || q.y > WF.h - 104) return '';
    const fs = Math.min(15, (k || 0.058) * 0.62 * q.u);
    if (fs < 8) return '';
    const fade = (1 - near / 0.42).toFixed(2);
    return '<text x="' + R(q.x) + '" y="' + R(q.y) + '" text-anchor="middle" font-family="Open Sans, sans-serif" font-weight="500" font-size="' + R(fs) + '" fill="#2C4F44" opacity="' + fade + '" stroke="#E7E0CE" stroke-opacity="0.8" stroke-width="' + R(fs * 0.3) + '" paint-order="stroke">' + txt + '</text>';
  };
  let o = '';
  switch (s.id) {
    case 'introduce':
      o += shade(0.42, -0.62, 0.34);
      o += beam(0.28, -0.78, 0, 0.46, -0.72, 0, 0.026, '#6B5240');
      o += beam(0.46, -0.72, 0, 0.41, -0.54, 0, 0.026, '#6B5240');
      o += beam(0.41, -0.54, 0, 0.56, -0.48, 0, 0.026, '#6B5240');
      o += stone(0.35, -0.44, 0.045, '#A8A08C') + stone(0.45, -0.37, 0.038, '#8F8877') + stone(0.55, -0.42, 0.032, '#A8A08C');
      o += bush(0.75, -1.15, 0.3, '#3A6B5A');
      o += label(0.42, -0.62, 0.3, W(0), 0.042);
      return o;
    case 'soundscape':
      o += shade(0.02, -0.95, 0.3) + stone(0.02, -0.95, 0.24, '#9A9382') + stone(0.01, -0.97, 0.18, '#B0A992');
      o += ring(0.02, -0.95, 0.34, 'wfBreath') + ring(0.02, -0.95, 0.52, 'wfBreath', '#8FAEA0');
      o += label(1.3, -1.5, 0.62, W(0), 0.036) + label(1.1, 1.5, 0.72, W(1), 0.036);
      o += label(0.7, 1.7, 0.42, W(2), 0.036) + label(0.9, -1.9, 0.46, W(3), 0.036);
      return o;
    case 'naming': {
      const spots = [[-0.32, -0.95], [0.06, 1], [0.44, -1.1]];
      const barks = ['#6B5240', '#5B4636', '#6B5240'];
      const crowns = ['#3A6B5A', '#47775F', '#2E5A4A'];
      const crown2s = ['#31604F', '#3C6B55', '#234A3E'];
      for (let k = 0; k < 3; k++) {
        const a = spots[k][0], l = spots[k][1];
        const base = P(a, l, 0), top = P(a, l, 1.3);
        if (!base || !top) continue;
        const tw = Math.max(1.6, 0.05 * base.u);
        const R2 = Math.max(8, 0.36 * base.u);
        const topY = top.y, midY = topY + R2 * 0.4, cx = base.x;
        o += '<ellipse cx="' + R(cx) + '" cy="' + R(base.y) + '" rx="' + R(tw * 3.2) + '" ry="' + R(tw * 1.1) + '" fill="#3A2E22" opacity="0.15"/>';
        o += '<path d="M' + R(cx - tw) + ' ' + R(base.y) + ' L' + R(cx - tw * 0.4) + ' ' + R(topY) + ' L' + R(cx + tw * 0.4) + ' ' + R(topY) + ' L' + R(cx + tw) + ' ' + R(base.y) + ' Z" fill="' + barks[k] + '"/>';
        o += '<g class="wf-sway" style="animation-duration:' + (9 + k * 2.4) + 's;animation-delay:-' + (k * 3.1) + 's">';
        o += '<ellipse cx="' + R(cx - R2 * 0.55) + '" cy="' + R(midY) + '" rx="' + R(R2 * 0.6) + '" ry="' + R(R2 * 0.48) + '" fill="' + crown2s[k] + '"/>';
        o += '<ellipse cx="' + R(cx + R2 * 0.58) + '" cy="' + R(midY - R2 * 0.05) + '" rx="' + R(R2 * 0.54) + '" ry="' + R(R2 * 0.44) + '" fill="' + crown2s[k] + '"/>';
        o += '<ellipse cx="' + R(cx) + '" cy="' + R(topY + R2 * 0.12) + '" rx="' + R(R2 * 0.9) + '" ry="' + R(R2 * 0.7) + '" fill="' + crowns[k] + '"/>';
        o += '</g>';
        o += label(a, l, 1.55, W(k * 2), 0.048);
      }
      return o;
    }
    case 'hammock': {
      // l=1.9 for the far post put it well past a full viewport width off
      // the right edge — pulled the whole span in (0.6/1.25/1.9 -> 0.3/0.65/1.0).
      const A = P(-0.12, 0.3, 0.8), B = P(0.34, 1.0, 0.8), M = P(0.11, 0.65, 0.5);
      if (!A || !B || !M) return '';
      o += post(-0.12, 0.3, 1.15, 0.05, '#5B4636') + post(0.34, 1.0, 1.15, 0.05, '#5B4636');
      o += '<g class="wfHang">';
      o += '<path d="M' + R(A.x) + ' ' + R(A.y) + ' Q' + R(M.x) + ' ' + R(M.y + 0.12 * M.u) + ' ' + R(B.x) + ' ' + R(B.y) + ' Q' + R(M.x) + ' ' + R(M.y - 0.16 * M.u) + ' ' + R(A.x) + ' ' + R(A.y) + ' Z" fill="#D87B4F" opacity="0.9"/>';
      o += '<path d="M' + R(A.x) + ' ' + R(A.y) + ' Q' + R(M.x) + ' ' + R(M.y + 0.12 * M.u) + ' ' + R(B.x) + ' ' + R(B.y) + '" fill="none" stroke="#B8552E" stroke-width="' + R(Math.max(1.5, 0.022 * M.u)) + '"/>';
      o += '</g>';
      o += label(0.11, 0.65, 0.34, W(0), 0.042);
      return o;
    }
    case 'barefoot': {
      const mat = ['#7FA396', '#6B5240', '#9A7B57', '#3F6B54', '#A8A08C'];
      const speck = ['#5E8C77', '#4A3A2C', '#B08A5E', '#2F5A46', '#BDB6A4'];
      for (let k = 0; k < 5; k++) {
        const a0 = -0.62 + k * 0.26;
        o += band(a0, a0 + 0.24, mat[k], 0.55);
        for (let j = 0; j < 9; j++) {
          const t = a0 + 0.03 + (j % 3) * 0.08, lat = -0.62 + ((j * 7) % 9) * 0.16;
          o += stone(t, lat / OUT, 0.05, speck[k], 0.85);
        }
        o += label(a0 + 0.12, 0.62, 0.16, W(k), 0.05);
      }
      o += shade(-0.78, -0.58, 0.12) + stone(-0.8, -0.6, 0.1, '#4A3A2C') + stone(-0.72, -0.5, 0.1, '#4A3A2C');
      for (let k = 0; k < 5; k++) o += stone(-0.5 + k * 0.26, (k % 2 ? 0.07 : -0.07) / OUT, 0.05, '#3A2E22', 0.22);
      return o;
    }
    case 'palette': {
      const cols = ['#3F6B54', '#7FA396', '#8A6C52', '#B8552E'];
      o += post(-0.04, -0.72, 0.5, 0.022, '#6B5240') + post(0.16, 0.72, 0.5, 0.022, '#6B5240');
      o += beam(-0.04, -0.72, 0.48, 0.16, 0.72, 0.48, 0.008, '#C8BFA6');
      for (let k = 0; k < 4; k++) {
        const l = -0.46 + k * 0.3, q = P(0.06, l, 0.44);
        if (!q) continue;
        o += '<g class="wfPeg"><rect x="' + R(q.x - 0.035 * q.u) + '" y="' + R(q.y) + '" width="' + R(0.07 * q.u) + '" height="' + R(0.1 * q.u) + '" rx="' + R(0.012 * q.u) + '" fill="' + cols[k] + '"/></g>';
      }
      for (let k = 0; k < 3; k++) o += label(0.06, -0.46 + k * 0.3, 0.3, W(k), 0.04);
      return o;
    }
    case 'senses':
      // wfWords('senses') resolves to VISUAL.senses's own <text> node
      // order: the 5-4-3-2-1 countdown first (indices 0-4), then the
      // sense words see/touch/hear/smell/taste (indices 5-9) — the
      // reverse of what this originally assumed, which put a number
      // ("2") where a sense word ("smell") belonged and vice versa.
      for (let k = 0; k < 5; k++) {
        const a = -0.44 + k * 0.22, l = k % 2 ? 0.6 : -0.6;
        o += shade(a, l, 0.11) + stone(a, l, 0.1, '#A8A08C');
        o += label(a, l, 0.13, W(5 + k), 0.05) + label(a, l, 0.27, W(k), 0.038);
      }
      return o;
    case 'tinyworld':
      o += shade(0, -0.78, 0.42) + stone(0, -0.78, 0.36, '#6B5240', 0.5) + stone(0, -0.78, 0.28, '#5B4636', 0.55);
      o += bush(-0.08, -0.9, 0.1, '#47775F') + bush(0.06, -0.68, 0.08, '#3A6B5A');
      o += post(-0.02, -0.8, 0.12, 0.012, '#6B5240') + post(0.04, -0.74, 0.16, 0.012, '#6B5240');
      o += stone(0.1, -0.88, 0.05, '#A8A08C') + stone(-0.06, -0.66, 0.04, '#9A9382');
      o += label(0, -0.78, 0.46, W(0), 0.044);
      return o;
    case 'sofa':
      o += shade(0.1, 0.72, 0.4);
      o += beam(-0.04, 0.42, 0.09, 0.22, 1.04, 0.09, 0.07, '#6B5240');
      o += beam(0.06, 0.44, 0.26, 0.32, 1.06, 0.26, 0.05, '#5B4636');
      o += post(0.06, 0.44, 0.26, 0.035, '#5B4636') + post(0.32, 1.06, 0.26, 0.035, '#5B4636');
      o += stone(-0.14, 0.36, 0.06, '#9A9382') + stone(0.34, 1.16, 0.06, '#9A9382');
      return o;
    case 'fire': {
      for (let k = 0; k < 7; k++) { const ang = k / 7 * Math.PI * 2; o += stone(0.06 + Math.cos(ang) * 0.15, Math.sin(ang) * 0.36, 0.06, '#9A9382'); }
      o += beam(-0.04, -0.2, 0.02, 0.16, 0.2, 0.2, 0.028, '#6B5240') + beam(0.16, -0.2, 0.02, -0.04, 0.2, 0.2, 0.028, '#6B5240');
      const f = P(0.06, 0, 0.16);
      if (f) {
        o += '<path class="wfFlick" d="M' + R(f.x) + ' ' + R(f.y - 0.3 * f.u) + ' q' + R(0.11 * f.u) + ' ' + R(0.18 * f.u) + ' ' + R(0.11 * f.u) + ' ' + R(0.28 * f.u) + ' a' + R(0.11 * f.u) + ' ' + R(0.11 * f.u) + ' 0 0 1 ' + R(-0.22 * f.u) + ' 0 q0 ' + R(-0.1 * f.u) + ' ' + R(0.11 * f.u) + ' ' + R(-0.28 * f.u) + ' Z" fill="#D87B4F"/>';
        o += '<circle class="wfSmoke" cx="' + R(f.x) + '" cy="' + R(f.y - 0.36 * f.u) + '" r="' + R(0.07 * f.u) + '" fill="#C8D8D0"/>';
      }
      o += label(0.06, 0, 0.85, W(8), 0.044);
      return o;
    }
    case 'bivouac':
      o += post(-0.06, -1.3, 0.4, 0.022, '#5B4636') + post(0.2, -0.86, 0.4, 0.022, '#5B4636');
      o += beam(-0.06, -1.3, 0.39, 0.2, -0.86, 0.39, 0.014, '#6B5240');
      o += quad([[-0.06, -1.3, 0.39], [0.2, -0.86, 0.39], [0.26, -0.66, 0], [0, -1.12, 0]], '#3F6B54', 0.92);
      o += quad([[-0.06, -1.3, 0.39], [0.2, -0.86, 0.39], [0.14, -1.06, 0], [-0.12, -1.52, 0]], '#47775F', 0.88);
      o += stone(0.3, -0.6, 0.05, '#9A9382') + stone(-0.16, -1.5, 0.045, '#9A9382');
      o += label(0.07, -1.08, 0.5, W(0), 0.04);
      return o;
    case 'sitspot':
      o += shade(0.02, -0.95, 0.3) + stone(0.02, -0.95, 0.25, '#9A9382') + stone(0.03, -0.97, 0.18, '#B0A992');
      o += ring(0.02, -0.95, 0.32, 'wfBreath') + ring(0.02, -0.95, 0.5, 'wfBreath', '#8FAEA0');
      o += label(0.55, -1.05, 0.34, W(0), 0.04);
      return o;
    case 'roles':
      o += shade(0.06, 0.74, 0.44);
      o += beam(-0.12, 0.48, 0.07, 0.24, 1.02, 0.07, 0.11, '#6B5240');
      o += stone(-0.06, 0.58, 0.05, '#B8552E') + stone(0.05, 0.74, 0.05, '#7FA396') + stone(0.16, 0.9, 0.05, '#C8BFA6');
      o += label(-0.06, 0.58, 0.26, W(0), 0.042) + label(0.05, 0.74, 0.26, W(2), 0.042) + label(0.16, 0.9, 0.26, W(4), 0.042);
      return o;
    case 'project': {
      const c = [[-0.26, -1.3], [-0.26, -0.58], [0.36, -0.58], [0.36, -1.3]];
      for (let k = 0; k < 4; k++) o += post(c[k][0], c[k][1], 0.2, 0.016, '#6B5240');
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; o += beam(a[0], a[1], 0.18, b[0], b[1], 0.18, 0.007, '#C8BFA6'); }
      o += post(0.05, -0.94, 0.42, 0.02, '#3A6B5A') + bush(0.05, -0.94, 0.17, '#47775F');
      o += label(0.05, -0.94, 0.62, W(8), 0.044);
      return o;
    }
    case 'object': {
      o += shade(0, 0.7, 0.26) + stone(0, 0.7, 0.22, '#9A9382');
      const q = P(0, 0.7, 0.24);
      if (q) o += '<g class="wfLift"><ellipse cx="' + R(q.x) + '" cy="' + R(q.y) + '" rx="' + R(0.09 * q.u) + '" ry="' + R(0.07 * q.u) + '" fill="#8A6C52"/></g>';
      o += label(0, 0.7, 0.48, W(4), 0.044);
      return o;
    }
    case 'checkin':
      o += post(0, -0.92, 0.56, 0.02, '#6B5240') + post(0.1, -0.48, 0.56, 0.02, '#6B5240');
      o += quad([[0, -0.92, 0.56], [0.1, -0.48, 0.56], [0.1, -0.48, 0.3], [0, -0.92, 0.3]], '#E6DCC4');
      o += label(0.05, -0.7, 0.5, W(0), 0.044) + label(0.05, -0.7, 0.38, W(1), 0.04);
      return o;
    case 'campfire': {
      for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + 0.4; o += stone(0.05 + Math.cos(ang) * 0.13, Math.sin(ang) * 0.32, 0.055, '#8F8877'); }
      const f = P(0.05, 0, 0.08);
      if (f) {
        o += '<ellipse class="wfBreath" cx="' + R(f.x) + '" cy="' + R(f.y) + '" rx="' + R(0.55 * f.u) + '" ry="' + R(0.22 * f.u) + '" fill="#D87B4F" opacity="0.2"/>';
        o += '<path class="wfFlick" d="M' + R(f.x) + ' ' + R(f.y - 0.2 * f.u) + ' q' + R(0.08 * f.u) + ' ' + R(0.12 * f.u) + ' ' + R(0.08 * f.u) + ' ' + R(0.18 * f.u) + ' a' + R(0.08 * f.u) + ' ' + R(0.08 * f.u) + ' 0 0 1 ' + R(-0.16 * f.u) + ' 0 q0 ' + R(-0.06 * f.u) + ' ' + R(0.08 * f.u) + ' ' + R(-0.18 * f.u) + ' Z" fill="#B8552E"/>';
      }
      o += beam(-0.26, -0.75, 0.05, -0.06, -0.38, 0.05, 0.075, '#6B5240');
      o += beam(0.28, 0.38, 0.05, 0.48, 0.75, 0.05, 0.075, '#6B5240');
      o += label(0.05, 0, 0.5, W(0), 0.04);
      return o;
    }
    default:
      return '';
  }
}
function wfBuildSet(s, i) { return wfBuildProps(s, i) + wfBuildCast(s, i); }

// ───────── state machine ─────────
function wfDwellMs() { return WF_DWELL_MS; }
function wfTravelMs() { return WF.manual ? WF_MANUAL_TRAVEL_MS : WF_TRAVEL_MS; }

function wfStep(now) {
  const last = WF.openId !== null;
  if (WF.paused && !last && WF.resumeAt !== Infinity && now > WF.resumeAt) {
    WF.paused = false; WF.holdEnd = now + 600;
  }
  const wasMoving = WF.mode === 'move';
  if (WF.mode === 'move') {
    const span = wfTravelMs();
    const p = Math.min(1, (now - WF.moveStart) / span);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
    WF.cam = WF.from + (WF.to - WF.from) * e;
    if (p >= 1) { WF.cam = WF.to; WF.mode = 'hold'; WF.manual = false; WF.holdEnd = now + wfDwellMs(); }
  } else if (!WF.paused && !last && now >= WF.holdEnd) {
    const at = Math.round(WF.cam);
    if (at >= ACTIVITIES.length - 1) { WF.cam = 0; WF.holdEnd = now + wfDwellMs(); }
    else { WF.mode = 'move'; WF.from = at; WF.to = at + 1; WF.moveStart = now; }
  }
  // Only repaint while the camera is actually moving — holding still
  // doesn't change anything wfRender() would draw differently (the
  // character bob and tree sway are pure CSS animations, no JS involved).
  // Repainting unconditionally every ~32ms was rebuilding the whole
  // scene's innerHTML ~30x/second even at rest, destroying and recreating
  // every pin/control/link out from under the pointer — real clicks on
  // them ranged from unreliable to impossible.
  if ((wasMoving || WF.mode === 'move') && now - (WF.lastPaint || 0) > 32) {
    WF.lastPaint = now; wfRender();
  }
}

function wfGoBack() {
  const target = Math.max(0, Math.round(WF.cam) - 1);
  WF.from = WF.cam; WF.to = target; WF.moveStart = performance.now();
  WF.mode = 'move'; WF.manual = true;
  WF.paused = true; WF.resumeAt = performance.now() + WF_BACK_PAUSE_MS;
  if (WF.reduced) { WF.cam = target; WF.mode = 'hold'; }
  wfRender();
}
function wfGoNext() {
  const now = performance.now();
  const at = Math.round(WF.cam);
  const target = at >= ACTIVITIES.length - 1 ? 0 : at + 1;
  WF.from = WF.cam; WF.to = target; WF.moveStart = now;
  WF.mode = 'move'; WF.manual = true;
  WF.paused = false; WF.holdEnd = now + wfDwellMs();
  if (WF.reduced) { WF.cam = target; WF.mode = 'hold'; }
  WF.openId = null;
  wfRender();
}
function wfRestart() {
  WF.from = WF.cam; WF.to = 0; WF.moveStart = performance.now();
  WF.mode = 'move'; WF.manual = true;
  WF.paused = false; WF.holdEnd = performance.now() + wfDwellMs();
  if (WF.reduced) { WF.cam = 0; WF.mode = 'hold'; }
  WF.openId = null;
  wfRender();
}
function wfOpenStop(id) {
  WF.paused = true; WF.resumeAt = Infinity;
  WF.openId = id;
  WF.sessionDrawerOpen = false;
  wfRender();
  if (typeof pbRefreshAddButtons === 'function') pbRefreshAddButtons();
}
function wfClose() {
  WF.resumeAt = performance.now() + WF_CLOSE_PAUSE_MS;
  WF.openId = null;
  wfRender();
}
function wfToggleSessionDrawer() {
  WF.sessionDrawerOpen = !WF.sessionDrawerOpen;
  wfRender();
}

// ───────── frame computation + render ─────────
function wfComputeFrame() {
  const w = WF.w, h = WF.h, lang = currentLang;
  const narrow = w < 768;
  const camIndex = Math.round(WF.cam);

  // Desktop-only: the title/logo chip drifts a little as the camera sweeps
  // the trail's own curve (wfPathLat — the same signal every foreground
  // element reads for its lateral position), but at a small fraction of
  // the amplitude, so it reads as a distant layer moving with the
  // landscape rather than pinned dead still against everything else in
  // motion — a sun tracking slowly overhead, not a HUD label. Left at 0 on
  // narrow widths, where the chip keeps its current fixed placement (see
  // the ≤768px rule in styles-walk-forest.css) — mobile tuning is for a
  // separate pass.
  const logoDriftX = narrow ? 0 : -wfPathLat(WF.cam) * w * 0.05;

  const trailPts = [];
  for (let t = WF.cam - 0.7; t < WF.cam + 7.2; t += 0.22) {
    const p = wfProject(t, 0);
    if (!p) continue;
    trailPts.push({ x: p.x, y: p.y, hw: w * 0.235 * p.scale });
  }
  let trailD = '';
  if (trailPts.length > 1) {
    const near = trailPts.slice().reverse();
    trailD = 'M' + near.map(p => (p.x - p.hw).toFixed(1) + ' ' + p.y.toFixed(1)).join(' L') +
      ' L' + trailPts.map(p => (p.x + p.hw).toFixed(1) + ' ' + p.y.toFixed(1)).join(' L') + ' Z';
  }

  const farTrees = [], nearTrees = [];
  WF_TREES.forEach((tr) => {
    const p = wfProject(tr.at, tr.lat);
    if (!p || p.scale < 0.09 || p.scale > 3.2 || p.d > 12) return;
    const th = h * 0.44 * tr.h * p.scale;
    const tw = Math.max(1.4, w * 0.019 * tr.w * p.scale);
    const R = Math.max(5, w * 0.086 * p.scale * tr.w);
    const topY = p.y - th;
    const lean = tr.lean * tw * 1.6;
    const far = p.scale < 0.34;
    const item = {
      cx: p.x.toFixed(1), by: p.y.toFixed(1),
      shRx: (tw * 2.4).toFixed(1), shRy: (tw * 0.8).toFixed(1),
      trunkD: 'M' + (p.x - tw * 0.72).toFixed(1) + ' ' + p.y.toFixed(1) +
        ' L' + (p.x - tw * 0.3 + lean).toFixed(1) + ' ' + topY.toFixed(1) +
        ' L' + (p.x + tw * 0.3 + lean).toFixed(1) + ' ' + topY.toFixed(1) +
        ' L' + (p.x + tw * 0.72).toFixed(1) + ' ' + p.y.toFixed(1) + ' Z',
      bark: far ? '#8A7A66' : (tr.crown > 0.5 ? '#6B5240' : '#5B4636'),
      c1x: (p.x + lean).toFixed(1), c1y: (topY + R * 0.1).toFixed(1),
      c1rx: R.toFixed(1), c1ry: (R * 0.78).toFixed(1),
      c2x: (p.x + lean - R * 0.62).toFixed(1), c2y: (topY + R * 0.46).toFixed(1),
      c2rx: (R * 0.66).toFixed(1), c2ry: (R * 0.54).toFixed(1),
      c3x: (p.x + lean + R * 0.66).toFixed(1), c3y: (topY + R * 0.38).toFixed(1),
      c3rx: (R * 0.6).toFixed(1), c3ry: (R * 0.5).toFixed(1),
      crown: far ? '#8FAEA0' : (tr.crown > 0.62 ? '#2E5A4A' : (tr.crown > 0.3 ? '#3A6B5A' : '#47775F')),
      crown2: far ? '#A3BEB1' : (tr.crown > 0.62 ? '#234A3E' : (tr.crown > 0.3 ? '#31604F' : '#3C6B55')),
      op: (Math.min(1, 0.55 + p.scale * 0.8) * (p.d > 9 ? 0.55 : 1)).toFixed(2),
      swayStyle: 'animation-duration:' + tr.sway.toFixed(1) + 's;animation-delay:-' + tr.swayDelay.toFixed(1) + 's',
      _s: p.scale,
    };
    if (p.scale > 0.62) nearTrees.push(item); else farTrees.push(item);
  });
  farTrees.sort((a, b) => a._s - b._s);
  nearTrees.sort((a, b) => a._s - b._s);

  const dapples = [];
  WF_DAPPLE.forEach((dp) => {
    const p = wfProject(dp.at, dp.lat);
    if (!p || p.scale < 0.18 || p.d > 7) return;
    dapples.push({
      cx: p.x.toFixed(1), cy: p.y.toFixed(1),
      rx: (w * 0.05 * dp.s * p.scale).toFixed(1), ry: (w * 0.014 * dp.s * p.scale).toFixed(1),
      op: (0.5 * Math.min(1, p.scale)).toFixed(2),
    });
  });

  const shrubs = [];
  WF_SHRUBS.forEach((sh) => {
    const p = wfProject(sh.at, sh.lat);
    if (!p || p.scale < 0.12 || p.scale > 3.2 || p.d > 10) return;
    const k = w * 0.032 * sh.s * p.scale;
    const fill = sh.tone > 0.6 ? '#3A6B5A' : (sh.tone > 0.3 ? '#47775F' : '#5E8C77');
    shrubs.push({
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), rx: (k * 1.3).toFixed(1), ry: (k * 0.8).toFixed(1),
      cx2: (p.x + k * 0.9).toFixed(1), cy2: (p.y - k * 0.32).toFixed(1), rx2: (k * 0.82).toFixed(1), ry2: (k * 0.52).toFixed(1),
      fill, op: Math.min(1, 0.42 + p.scale * 0.85).toFixed(2),
    });
  });

  const stops = [];
  ACTIVITIES.forEach((s, i) => {
    const gMeta = WF_GROUP_META[s.group];
    const p = wfProject(i, WF_STOP_SIDE[s.id] || 0);
    if (!p || p.scale < 0.16 || p.d > 6.4) return;
    const armed = Math.abs(p.d) < 0.34;
    const size = Math.max(narrow ? 26 : 22, Math.min(64, w * (narrow ? 0.085 : 0.052) * p.scale));
    const hit = Math.max(44, size + 18);
    const near = p.scale;
    const baseRx = w * 0.062 * near;
    const chipW = Math.max(170, Math.min(300, w * 0.26));
    const group = GROUPS.find(g => g.id === s.group);
    stops.push({
      id: s.id, name: pbT(s, 'name'), sub: pbGroupT(group, 'title') + ' · ' + pbFmtDuration(s),
      color: gMeta.color, glyph: gMeta.glyph,
      aria: pbT(s, 'name') + ' — ' + pbGroupT(group, 'title') + ', ' + pbFmtDuration(s),
      expanded: WF.openId === s.id, armed, showChip: armed || WF.openId === s.id,
      op: Math.min(1, 0.35 + near * 1.1).toFixed(2),
      cx: p.x.toFixed(1), baseY: p.y.toFixed(1),
      pinLeft: p.x.toFixed(1), pinTop: (p.y - baseRx * 0.5).toFixed(1),
      z: 200 + Math.round(near * 100),
      hit, size,
      // Narrow mode docks the "nearest stop" caption to a fixed band
      // rather than following the pin — anchored from the bottom (above
      // the rail/controls stack) rather than the top, since the top is
      // where the site's own persistent header sits (#wf-scene is a fixed
      // viewport-relative background behind every screen — see the
      // comment on #wf-scene in index.html).
      chipStyle: narrow
        ? 'position:absolute;left:' + (12 - p.x).toFixed(1) + 'px;bottom:' + (230 + (p.y - baseRx * 0.5) - WF.h).toFixed(1) +
          'px;width:' + (w - 24).toFixed(0) + 'px'
        : 'position:absolute;left:' +
          (Math.max(10, Math.min(w - chipW - 10, p.x - chipW / 2)) - p.x).toFixed(1) +
          'px;top:' + (-size - 62).toFixed(1) + 'px;width:' + chipW.toFixed(0) + 'px',
      baseRx: baseRx.toFixed(1),
    });
  });
  stops.sort((a, b) => parseFloat(a.baseRx) - parseFloat(b.baseRx));

  const setPieces = [];
  ACTIVITIES.forEach((s, i) => {
    const p = wfProject(i, 0);
    if (!p) return;
    const d = p.d;
    let t;
    if (d >= 0) { if (d > 0.62) return; t = 1 - d / 0.62; }
    else { if (d < -0.4) return; t = 1 + d / 0.4; }
    const op = t * t * (3 - 2 * t);
    if (op < 0.02) return;
    const body = wfBuildSet(s, i);
    if (body) setPieces.push({ d, html: '<g opacity="' + op.toFixed(2) + '">' + body + '</g>' });
  });
  setPieces.sort((a, b) => b.d - a.d);
  const setLayer = setPieces.map(x => x.html).join('');

  const atStop = Math.abs(WF.cam - camIndex) < 0.3 ? ACTIVITIES[camIndex] : null;
  const atId = atStop ? atStop.id : '';
  const seated = atId === 'soundscape' || atId === 'sitspot' || atId === 'campfire';
  const hidden = atId === 'hammock';
  const shoeless = atId === 'barefoot';

  const rail = ACTIVITIES.map((s, i) => {
    const group = GROUPS.find(g => g.id === s.group);
    const gMeta = WF_GROUP_META[s.group];
    const active = i === camIndex;
    const done = i < camIndex;
    const gap = i > 0 && ACTIVITIES[i - 1].group !== s.group ? 12 : 3;
    return {
      title: pbT(s, 'name'),
      style: 'width:' + (narrow ? 12 : 16) + 'px;height:' + (active ? 8 : 4) + 'px;border-radius:3px;margin-left:' +
        (i === 0 ? 0 : gap) + 'px;background:' + (active ? 'var(--ember)' : (done ? gMeta.color : 'var(--forest-mist)')) +
        ';opacity:' + (active || done ? 1 : 0.75) + ';transition:height .25s',
    };
  });

  const walking = WF.mode === 'move' && !WF.paused && !WF.openId && !WF.reduced;
  const openStop = ACTIVITIES.find(s => s.id === WF.openId) || null;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  let status = t('walk.status.walking');
  if (WF.openId) status = t('walk.status.paused');
  else if (WF.paused && WF.resumeAt !== Infinity) {
    status = t('walk.status.resuming').replace('{n}', String(Math.max(1, Math.ceil((WF.resumeAt - now) / 1000))));
  }

  // Shrunk from the original 0.36/320 cap, which put the walker at ~60%+
  // of a near tree's height — too close to tree scale to read as a person
  // among mature trees. This lands closer to 35-45% depending on viewport,
  // still legible as the "you are here" marker without competing with the
  // canopy for scale.
  const charH = Math.max(120, Math.min(h * 0.22, 220));
  return {
    trailD, farTrees, nearTrees, dapples, shrubs, stops, rail, setLayer,
    narrow, walking, logoDriftX,
    stepLabel: t('walk.stop') + ' ' + (camIndex + 1) + ' ' + t('walk.of') + ' ' + ACTIVITIES.length,
    status,
    useArtSlot: false, poseStand: !seated, poseSeated: seated,
    footFill: shoeless ? '#C9A88A' : '#14302A',
    charH, hidden,
    isOpen: !!openStop,
    open: openStop ? {
      visual: pbLocalizeVisual(VISUAL[openStop.visual || openStop.id] || '', openStop.id),
      name: pbT(openStop, 'name'),
      purpose: pbT(openStop, 'purpose'),
      materials: pbT(openStop, 'materials'),
      intro: pbT(openStop, 'intro'),
      dur: pbFmtDuration(openStop),
      tags: (openStop.tags || []).map(pbTagT),
      groupTitle: pbGroupT(GROUPS.find(g => g.id === openStop.group), 'title'),
      color: WF_GROUP_META[openStop.group].color,
      id: openStop.id,
    } : null,
  };
}

// Every activity's own tuned lateral "side" offset from the trail centre —
// carried over 1:1 from the design prototype (WF_STOPS[].side), keyed by
// id rather than array index so it stays correct regardless of any future
// reordering of ACTIVITIES.
const WF_STOP_SIDE = {
  introduce: -0.62, soundscape: 0.66, naming: -0.5, hammock: 0.58,
  barefoot: -0.68, palette: 0.52, senses: -0.55, tinyworld: 0.7,
  sofa: -0.6, fire: 0.6, bivouac: -0.66, sitspot: 0.55,
  roles: -0.58, project: 0.68, object: -0.54, checkin: 0.5, campfire: -0.46,
};

function wfEsc(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wfTreeMarkup(tr, hint) {
  return '<g opacity="' + tr.op + '"><ellipse cx="' + tr.cx + '" cy="' + tr.by + '" rx="' + tr.shRx + '" ry="' + tr.shRy + '" fill="#3A2E22" opacity="0.13"/>' +
    '<path d="' + tr.trunkD + '" fill="' + tr.bark + '"/>' +
    '<g class="wf-sway" style="' + tr.swayStyle + '">' +
    '<ellipse cx="' + tr.c2x + '" cy="' + tr.c2y + '" rx="' + tr.c2rx + '" ry="' + tr.c2ry + '" fill="' + tr.crown2 + '"/>' +
    '<ellipse cx="' + tr.c3x + '" cy="' + tr.c3y + '" rx="' + tr.c3rx + '" ry="' + tr.c3ry + '" fill="' + tr.crown2 + '"/>' +
    '<ellipse cx="' + tr.c1x + '" cy="' + tr.c1y + '" rx="' + tr.c1rx + '" ry="' + tr.c1ry + '" fill="' + tr.crown + '"/>' +
    '</g></g>';
}

function wfCharacterSVG(frame) {
  if (frame.poseSeated) {
    return '<svg viewBox="0 0 64 148" style="width:100%;height:100%;display:block;overflow:visible" aria-hidden="true">' +
      '<ellipse cx="32" cy="143" rx="19" ry="5" fill="#3A2E22" opacity="0.22"/>' +
      '<path d="M22 138 q-4 -22 6 -30 l10 0 q10 8 6 30 Z" fill="#14302A" opacity="0.7"/>' +
      '<rect x="14" y="128" width="36" height="12" rx="6" fill="#14302A" opacity="0.74"/>' +
      '<ellipse cx="14" cy="134" rx="6" ry="4" fill="' + frame.footFill + '"/>' +
      '<path d="M32 76 q-11 5 -11 22 l0 22 q0 5 5 5 l12 0 q5 0 5 -5 l0 -22 q0 -17 -11 -22 Z" fill="#14302A" opacity="0.78"/>' +
      '<circle cx="32" cy="64" r="11.5" fill="#14302A" opacity="0.8"/></svg>';
  }
  const legA = frame.walking ? 'wfThighA' : '', legB = frame.walking ? 'wfThighB' : '';
  const shinA = frame.walking ? 'wfShinA' : '', shinB = frame.walking ? 'wfShinB' : '';
  return '<svg viewBox="0 0 64 148" style="width:100%;height:100%;display:block;overflow:visible" aria-hidden="true">' +
    '<ellipse cx="32" cy="143" rx="17" ry="4.5" fill="#3A2E22" opacity="0.22"/>' +
    '<g class="' + legB + '"><rect x="12" y="46" width="5.5" height="36" rx="2.75" fill="#14302A" opacity="0.68"/></g>' +
    '<g class="' + legA + '"><rect x="46" y="46" width="5.5" height="36" rx="2.75" fill="#14302A" opacity="0.68"/></g>' +
    '<g class="' + shinA + '"><rect x="23" y="92" width="6.5" height="46" rx="3.25" fill="#14302A" opacity="0.78"/><ellipse cx="26.2" cy="140" rx="5.4" ry="3.4" fill="' + frame.footFill + '"/></g>' +
    '<g class="' + shinB + '"><rect x="34" y="92" width="6.5" height="46" rx="3.25" fill="#14302A" opacity="0.78"/><ellipse cx="37.2" cy="140" rx="5.4" ry="3.4" fill="' + frame.footFill + '"/></g>' +
    '<path d="M32 34 q-14 6 -14 28 l0 28 q0 6 6 6 l16 0 q6 0 6 -6 l0 -28 q0 -22 -14 -28 Z" fill="#14302A" opacity="0.78"/>' +
    '<circle cx="32" cy="21" r="12.5" fill="#14302A" opacity="0.8"/></svg>';
}

function wfPanelHTML(frame) {
  if (!frame.isOpen) return '';
  const o = frame.open;
  const inSession = typeof pbSession !== 'undefined' && pbSession.includes(o.id);
  const count = typeof pbSession !== 'undefined' ? pbSession.length : 0;
  const mins = (typeof pbSession !== 'undefined' && typeof pbGetItemMins === 'function')
    ? pbSession.reduce((sum, id) => sum + pbGetItemMins(id), 0) : 0;
  const exportDisabled = count === 0;
  return '' +
    '<div onclick="wfClose()" style="position:absolute;inset:0;background:#14302A;opacity:.28;cursor:pointer"></div>' +
    '<div role="dialog" aria-label="' + wfEsc(o.name) + '" class="wf-panel ' + (frame.narrow ? 'wf-panel--sheet' : 'wf-panel--side') + '">' +
      // padding-top clears the site's own #wf-toggle-btn (top-right,
      // ~14-48px tall) sitting above the scene at a higher z-index — see
      // body.wf-scene-on .container in styles-walk-forest.css.
      '<div style="display:flex;align-items:flex-start;gap:12px;padding:52px 22px 0">' +
        '<div style="flex:1">' +
          '<div style="font:400 9.5px/1 \'Open Sans\',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:' + o.color + '">' + wfEsc(o.groupTitle) + '</div>' +
          '<div style="margin-top:7px;font:600 20px/1.2 \'Montserrat\',sans-serif;color:#14302A;letter-spacing:-0.01em">' + wfEsc(o.name) + '</div>' +
        '</div>' +
        '<button type="button" onclick="wfClose()" aria-label="' + wfEsc(t('pbui.timer.close')) + '" class="wf-panel-close">×</button>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:14px 22px 0">' +
        '<span class="wf-tag-chip">' + wfEsc(o.dur) + '</span>' +
        o.tags.map(tg => '<span class="wf-tag-chip">' + wfEsc(tg) + '</span>').join('') +
      '</div>' +
      '<div style="margin:16px 22px 0;border-radius:10px;background:#F4F1EA;overflow:hidden">' + (o.visual || '') + '</div>' +
      '<div style="padding:18px 22px 8px;overflow-y:auto;flex:1">' +
        '<div style="display:grid;grid-template-columns:1fr;gap:14px">' +
          '<div><div class="wf-panel-label">' + wfEsc(pbLabel('purpose')) + '</div>' +
            '<div class="wf-panel-text">' + wfEsc(o.purpose) + '</div></div>' +
          '<div><div class="wf-panel-label">' + wfEsc(pbLabel('materials')) + '</div>' +
            '<div class="wf-panel-text">' + wfEsc(o.materials) + '</div></div>' +
          '<div><div class="wf-panel-label">' + wfEsc(pbLabel('introduce')) + '</div>' +
            '<div class="wf-panel-text-example">' + wfEsc(o.intro) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="wf-session-strip">' +
        '<button type="button" class="wf-session-toggle" onclick="wfToggleSessionDrawer()" aria-expanded="' + (WF.sessionDrawerOpen ? 'true' : 'false') + '">' +
          '<span>🌲 ' + wfEsc(t('walk.session.strip').replace('{n}', String(count)).replace('{m}', String(mins))) + '</span>' +
          '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + (WF.sessionDrawerOpen ? '180deg' : '0deg') + ');transition:transform .2s"><path d="M3 5l4 4 4-4"/></svg>' +
        '</button>' +
        (WF.sessionDrawerOpen ? (
          '<div class="wf-session-drawer">' +
            '<button type="button" class="wf-session-add" data-add="' + o.id + '" onclick="pbToggleInSession(\'' + o.id + '\'); wfRender();">' + (inSession ? '✓ ' + wfEsc(t('pbui.export.removetitle')) : '+ ' + wfEsc(t('pbui.export.addtitle'))) + '</button>' +
            '<div class="wf-session-actions">' +
              '<button type="button" class="wf-session-export" onclick="exportRunPDF()" ' + (exportDisabled ? 'disabled aria-disabled="true"' : '') + ' aria-label="' + wfEsc(t('export.pdf')) + '" title="' + wfEsc(t('export.pdf')) + '">PDF</button>' +
              '<button type="button" class="wf-session-export" onclick="exportRunPNG()" ' + (exportDisabled ? 'disabled aria-disabled="true"' : '') + ' aria-label="' + wfEsc(t('export.png')) + '" title="' + wfEsc(t('export.png')) + '">PNG</button>' +
              '<a href="#implement/mod-pocket" class="wf-session-open">' + wfEsc(t('walk.session.open')) + '</a>' +
            '</div>' +
          '</div>'
        ) : '') +
      '</div>' +
      '<div class="wf-panel-foot">' + wfEsc(t('walk.panelfoot')) + '</div>' +
    '</div>';
}

function wfRender() {
  if (!WF.el) return;
  wfMeasure();
  const frame = wfComputeFrame();

  const sceneSvg = '' +
    '<g>' + frame.farTrees.map(tr => wfTreeMarkup(tr)).join('') + '</g>' +
    '<g>' + frame.shrubs.map(sh => '<g opacity="' + sh.op + '"><ellipse cx="' + sh.cx + '" cy="' + sh.cy + '" rx="' + sh.rx + '" ry="' + sh.ry + '" fill="' + sh.fill + '"/><ellipse cx="' + sh.cx2 + '" cy="' + sh.cy2 + '" rx="' + sh.rx2 + '" ry="' + sh.ry2 + '" fill="' + sh.fill + '"/></g>').join('') + '</g>' +
    '<path d="' + frame.trailD + '" fill="#D8CDAF"/>' +
    '<g>' + frame.dapples.map(dp => '<ellipse cx="' + dp.cx + '" cy="' + dp.cy + '" rx="' + dp.rx + '" ry="' + dp.ry + '" fill="#F2EBD8" opacity="' + dp.op + '"/>').join('') + '</g>' +
    '<g>' + frame.nearTrees.map(tr => wfTreeMarkup(tr)).join('') + '</g>';

  const pinsHtml = frame.stops.map(st => '' +
    '<div style="position:absolute;left:' + st.pinLeft + 'px;top:' + st.pinTop + 'px;width:0;height:0;z-index:' + st.z + '">' +
      '<button type="button" class="wf-pin-btn" aria-label="' + wfEsc(st.aria) + '" aria-expanded="' + st.expanded + '" onclick="wfOpenStop(\'' + st.id + '\')" ' +
        'style="left:' + (-st.hit / 2).toFixed(1) + 'px;top:' + (-st.size / 2 - st.hit / 2).toFixed(1) + 'px;width:' + st.hit.toFixed(1) + 'px;height:' + st.hit.toFixed(1) + 'px">' +
        '<div class="wf-pin-disc" style="width:' + st.size.toFixed(1) + 'px;height:' + st.size.toFixed(1) + 'px;border-color:' + (st.armed ? '#B8552E' : '#FBF9F4') + '">' +
          '<svg viewBox="0 0 32 32" style="width:' + (st.size * 0.56).toFixed(1) + 'px;height:' + (st.size * 0.56).toFixed(1) + 'px;display:block" fill="none" stroke="' + st.color + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + st.glyph + '"/></svg>' +
          (st.armed ? '<svg viewBox="0 0 40 40" style="position:absolute;inset:-9px;width:calc(100% + 18px);height:calc(100% + 18px);pointer-events:none" aria-hidden="true"><circle class="wf-ping" cx="20" cy="20" r="16" fill="none" stroke="#B8552E" stroke-width="2"/></svg>' : '') +
        '</div>' +
      '</button>' +
      (st.showChip ? '<div class="wf-pin-chip" style="' + st.chipStyle + '"><div class="wf-pin-chip-name">' + wfEsc(st.name) + '</div><div class="wf-pin-chip-sub">' + wfEsc(st.sub) + '</div></div>' : '') +
    '</div>'
  ).join('');

  const railHtml = frame.rail.map(rn => '<div title="' + wfEsc(rn.title) + '" style="' + rn.style + '"></div>').join('');

  const html = '' +
    '<div class="wf-blur-layer">' +
    '<div style="position:absolute;left:0;right:0;top:0;height:47%;background:linear-gradient(180deg,#E7EEE4 0%,#DCE6DE 58%,#D3E0D6 100%)"></div>' +
    '<div class="wf-drift" style="position:absolute;left:-14%;top:-20%;width:70%;height:36%;border-radius:50%;background:#EEF3EB;opacity:.7;filter:blur(1px)"></div>' +
    '<div class="wf-drift2" style="position:absolute;right:-16%;top:-13%;width:78%;height:34%;border-radius:50%;background:#EAF0E8;opacity:.55"></div>' +
    '<div class="wf-drift" style="position:absolute;left:34%;top:-6%;width:32%;height:18%;border-radius:50%;background:#EEF3EB;opacity:.4;filter:blur(1px)"></div>' +
    '<svg style="position:absolute;left:0;right:0;top:29%;width:100%;height:20%;display:block" viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0,122 C130,64 250,96 380,74 C520,50 630,88 780,66 C880,52 950,68 1000,60 L1000,140 L0,140 Z" fill="#C6D5C7" opacity="0.5"/>' +
      '<path d="M0,132 C160,94 300,112 440,94 C580,78 700,106 840,90 C920,82 970,94 1000,88 L1000,140 L0,140 Z" fill="#B7CAC0" opacity="0.5"/>' +
    '</svg>' +
    '<div class="wf-glow" style="position:absolute;left:22%;top:-8%;width:6%;height:62%;background:linear-gradient(180deg,rgba(251,249,244,.55),rgba(251,249,244,0));transform:skewX(-9deg);filter:blur(4px);pointer-events:none"></div>' +
    '<div class="wf-glow2" style="position:absolute;left:64%;top:-6%;width:5%;height:58%;background:linear-gradient(180deg,rgba(251,249,244,.5),rgba(251,249,244,0));transform:skewX(-7deg);filter:blur(4px);pointer-events:none"></div>' +
    '<div style="position:absolute;left:0;right:0;top:47%;bottom:0;background:linear-gradient(180deg,#B9BA9C 0%,#A9AA8E 38%,#9B9C79 100%)"></div>' +
    '<div style="position:absolute;left:0;right:0;top:40%;height:7.5%;background:#B4C8BC;opacity:.7;filter:blur(3px)"></div>' +
    '<div style="position:absolute;left:0;right:0;top:44.5%;height:5%;background:#C8D8D0;opacity:.8;filter:blur(2px)"></div>' +
    '<svg style="position:absolute;inset:0;width:100%;height:100%;display:block" role="img" aria-label="' + wfEsc(t('walk.title')) + '">' + sceneSvg + '</svg>' +
    '<div style="position:absolute;left:-4%;bottom:-6%;width:26%;height:22%;background:#22463A;opacity:.82;clip-path:ellipse(58% 54% at 26% 92%);pointer-events:none;z-index:200"></div>' +
    '<div style="position:absolute;left:6%;bottom:-8%;width:15%;height:15%;background:#2E5A4A;opacity:.8;clip-path:ellipse(52% 52% at 44% 90%);pointer-events:none;z-index:200"></div>' +
    '<div style="position:absolute;right:-4%;bottom:-6%;width:22%;height:19%;background:#22463A;opacity:.8;clip-path:ellipse(56% 54% at 72% 94%);pointer-events:none;z-index:200"></div>' +
    '<div class="wf-mote" style="position:absolute;left:32%;top:52%;width:5px;height:5px;border-radius:50%;background:#FBF9F4;opacity:.6;pointer-events:none"></div>' +
    '<div class="wf-mote" style="position:absolute;left:58%;top:60%;width:4px;height:4px;border-radius:50%;background:#FBF9F4;opacity:.5;animation-delay:3.4s;pointer-events:none"></div>' +
    '<div class="wf-mote" style="position:absolute;left:71%;top:47%;width:6px;height:6px;border-radius:50%;background:#FBF9F4;opacity:.45;animation-delay:6.8s;pointer-events:none"></div>' +
    '<svg style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:150" aria-hidden="true">' + frame.setLayer + '</svg>' +
    '<div style="position:absolute;left:50%;bottom:' + (WF.h * 0.055).toFixed(0) + 'px;transform:translateX(-58%);width:' + (frame.charH * 0.52).toFixed(0) + 'px;height:' + frame.charH.toFixed(0) + 'px;z-index:320;pointer-events:none;transition:opacity .6s;opacity:' + (frame.hidden ? 0 : 1) + '">' +
      '<div class="wf-bob" style="width:100%;height:100%;position:relative">' + wfCharacterSVG(frame) + '</div>' +
    '</div>' +
    pinsHtml +
    '<div class="wf-title-chip"' + (frame.narrow ? '' : ' style="transform:translateX(' + frame.logoDriftX.toFixed(1) + 'px)"') + '><div class="wf-title-chip-main">' + wfEsc(t('walk.title')) + '</div><div class="wf-title-chip-sub">' + wfEsc(frame.stepLabel) + '</div></div>' +
    (frame.narrow ? '<div style="position:absolute;left:0;right:0;bottom:0;height:70px;background:rgba(244,241,234,0.92);border-top:1px solid #DCD6C8;pointer-events:none"></div>' : '') +
    '<div class="wf-controls" style="left:20px;bottom:' + (frame.narrow ? 16 : 20) + 'px">' +
      '<button type="button" class="wf-ctrl-btn" onclick="wfGoBack()" aria-label="' + wfEsc(t('walk.back')) + '" title="' + wfEsc(t('walk.back')) + '">' +
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg></button>' +
      '<button type="button" class="wf-ctrl-btn" onclick="wfRestart()" aria-label="' + wfEsc(t('walk.restart')) + '" title="' + wfEsc(t('walk.restart')) + '">' +
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5V5h-2.5"/></svg></button>' +
      '<button type="button" class="wf-ctrl-btn" onclick="wfGoNext()" aria-label="' + wfEsc(t('walk.next')) + '" title="' + wfEsc(t('walk.next')) + '">' +
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg></button>' +
      '<div class="wf-status-pill">' + wfEsc(frame.status) + '</div>' +
    '</div>' +
    '<div class="wf-rail" style="' + (frame.narrow ? 'left:50%;transform:translateX(-50%);bottom:190px' : 'right:20px;bottom:66px') + '">' + railHtml + '</div>' +
    // Narrow-mode top offset (160px) clears the site's own persistent
    // header, which wraps to ~150px tall on phone widths — #wf-scene is a
    // fixed viewport-relative layer (see index.html) behind every screen,
    // so this and the title chip above both need to duck under it
    // explicitly rather than assuming they start below it.
    '<a href="#implement/mod-pocket" class="wf-list-link" style="' + (frame.narrow ? 'right:14px;top:220px' : 'right:20px;bottom:22px') + '">' + wfEsc(t('walk.listlink')) + '</a>' +
    '</div>';

  WF.el.innerHTML = html;

  // Rendered into its own body-level root, not inside #wf-scene — see the
  // #wf-panel-root comment in styles-walk-forest.css for why (z-index on a
  // descendant of #wf-scene can't out-rank .container/the header).
  const panelRoot = document.getElementById('wf-panel-root');
  if (panelRoot) panelRoot.innerHTML = frame.isOpen ? wfPanelHTML(frame) : '';
}

function wfMeasure() {
  if (!WF.el) return;
  const w = WF.el.clientWidth || 1200;
  const h = WF.el.clientHeight || 640;
  WF.w = w; WF.h = h;
}

// ───────── mount / unmount ─────────
// ───────── global on/off toggle ─────────
// Two-layer UI: the scene is a persistent, always-playable backdrop; the
// site itself (header, nav, search, mode switch, lang bar, every screen) is
// the foreground and is never hidden or taken over. #wf-toggle-btn just
// switches the backdrop between off ("clean mode", plain paper site) and on
// (scene visible behind everything, menu tones darkened for legibility —
// see body.wf-scene-on in styles-walk-forest.css). It does not gate
// playability: the trail, pins, panel and controls are all live the moment
// the scene is on, with no separate "enter" step.
function wfToggleGlobal() {
  wfSetOn(!WF.on);
}

function wfSetOn(on) {
  WF.on = on;
  document.body.classList.toggle('wf-scene-on', on);
  const btn = document.getElementById('wf-toggle-btn');
  if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) wfEnterScene(); else wfExitScene();
}

// Contextual blur: crisp while the visible screen is the entry/role landing
// pair (the scene reads as a clear hero there), blurred once the user has
// actually navigated into functional practitioner/participant content — see
// body.wf-scene-deep .wf-blur-layer in styles-walk-forest.css. Called from
// router.js on every navigation; the panel (a sibling of .wf-blur-layer, not
// inside it) is never blurred regardless of this state.
function wfSetDeep(on) {
  document.body.classList.toggle('wf-scene-deep', on);
}

function wfSetDeepFromScreen(screenId) {
  // No active screen (the default view — just the game) reads as crisp,
  // same as role-screen already did.
  wfSetDeep(!!screenId && screenId !== 'role-screen');
}

// A click that reaches the scene's own background — anywhere that isn't a
// pin/control/link (all real buttons/anchors) — counts as "open space,"
// same as Escape: see appEscapeAction() in router.js, which this defers
// to entirely (closing whatever's open, or reverting to the game if
// nothing is). Without a route back like this, suspension (blur) could get
// stuck with no way out short of switching the whole backdrop off and on —
// e.g. the mode-switch toggles deep on while already sitting on
// entry-screen, which navigating can't undo since you never left.
function wfOnSceneClick(e) {
  if (!WF.on || !e.target.closest) return;
  if (e.target.closest('button, a')) return;
  if (typeof appEscapeAction === 'function') appEscapeAction();
}

function wfEnterScene() {
  WF.el = document.getElementById('wf-scene');
  if (!WF.el) return;
  WF.el.classList.add('wf-scene--visible');
  const activeScreen = document.querySelector('.screen.active');
  wfSetDeepFromScreen(activeScreen ? activeScreen.id : null);
  if (WF.active) return;
  WF.active = true;
  WF.reduced = typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  wfMeasure();
  WF.holdEnd = performance.now() + wfDwellMs();
  wfRender();
  WF.onResize = () => wfRender();
  window.addEventListener('resize', WF.onResize);
  WF.onKey = (e) => {
    if (!WF.active) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); wfGoBack(); }
    else if (e.key === 'r' || e.key === 'R') { wfRestart(); }
    // Escape is handled centrally — see appEscapeAction() in router.js,
    // which closes the panel (among everything else it cascades through).
  };
  window.addEventListener('keydown', WF.onKey);
  WF.onSceneClick = wfOnSceneClick;
  WF.el.addEventListener('click', WF.onSceneClick);
  if (WF.reduced) return;
  const loop = (now) => {
    if (!WF.active) return;
    wfStep(now);
    WF.raf = requestAnimationFrame(loop);
  };
  WF.raf = requestAnimationFrame(loop);
}

function wfExitScene() {
  if (WF.el) WF.el.classList.remove('wf-scene--visible');
  const panelRoot = document.getElementById('wf-panel-root');
  if (panelRoot) panelRoot.innerHTML = '';
  if (!WF.active) return;
  WF.active = false;
  if (WF.raf) cancelAnimationFrame(WF.raf);
  WF.raf = null;
  if (WF.onResize) window.removeEventListener('resize', WF.onResize);
  if (WF.onKey) window.removeEventListener('keydown', WF.onKey);
  if (WF.onSceneClick && WF.el) WF.el.removeEventListener('click', WF.onSceneClick);
}

// The site starts on the game: the scene is on from the first paint, not
// behind an extra click on #wf-toggle-btn. wfEnterScene() still respects
// prefers-reduced-motion (crisp scene, no animation loop), and the toggle
// button remains a normal off switch from here — this only changes the
// starting state.
wfSetOn(true);
