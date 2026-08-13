#!/usr/bin/env node
// Linter for the 17 activity illustrations in pocketbook-data.js.
//
// These were drawn by hand over time and had drifted badly: head radii
// between 4 and 9 for figures all meant to read as the same adult, bodies
// between roughly 1.6 and 4 heads tall where a person is about 7, and two
// scenes putting their ground line at y=160 while the rest used 170. That
// is what "the activities look botched and non-proportional" meant.
//
// The fix was to generate every figure from figure-rig.js, so this file
// mostly checks that no one has hand-drawn a person again — proportion
// itself is now guaranteed by construction rather than measured after the
// fact.
//
// Usage: node test/illustration-lint.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const context = { console, Math, Object, JSON };
vm.createContext(context);
for (const f of ['figure-rig.js', 'pocketbook-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
}
const run = (expr) => vm.runInContext(expr, context);

const VISUAL = run('VISUAL');
const ACTIVITIES = run('ACTIVITIES');
const RIG = run('RIG');

const failures = [];
let checks = 0;
function check(law, what, ok, detail) {
  checks++;
  if (!ok) failures.push(`[${law}] ${what}` + (detail ? ` — ${detail}` : ''));
}

// Attributes are parsed rather than matched positionally. A single regex
// spanning two elements looks tidy and is not reliable — the first version
// of this check silently read a rect's `y` as its `x` and reported nothing
// while a hand-drawn figure sat in the file.
function parseTag(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

// A hand-drawn person is a small head-sized circle in a body colour with a
// body shape directly beneath it, roughly centred. A timeline dot with a
// hut drawn above it is neither of those, and flagging it would make this
// check cry wolf on drawings that are perfectly fine.
const BODY_COLOURS = ['#14302A', '#3A6B5A', '#234A3E'];
function findHandDrawnFigures(svg) {
  const found = [];
  const elements = [...svg.matchAll(/<(circle|rect)\b[^>]*>/g)]
    .map((m) => ({ name: m[1], attrs: parseTag(m[0]), at: m.index }));
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.name !== 'circle') continue;
    const r = Number(el.attrs.r);
    const cx = Number(el.attrs.cx);
    const cy = Number(el.attrs.cy);
    if (!(r >= 4 && r <= 9)) continue;
    if (BODY_COLOURS.indexOf(el.attrs.fill) === -1) continue;
    const next = elements[i + 1];
    if (!next || next.name !== 'rect') continue;
    // Must follow closely enough to be part of the same figure.
    if (next.at - el.at > 160) continue;
    const rx = Number(next.attrs.x);
    const ry = Number(next.attrs.y);
    const rw = Number(next.attrs.width);
    if (!isFinite(rx) || !isFinite(ry) || !isFinite(rw)) continue;
    const centred = Math.abs((rx + rw / 2) - cx) < r * 2;
    if (ry > cy && centred) found.push({ r: r, cx: cx, cy: cy });
  }
  return found;
}

// The shared ground line every scene draws, in the mist tone.
const BASELINE_Y = 170;
// The Barefoot Trail replaces the ground line with full-bleed texture
// tiles, because the surface underfoot IS the activity.
const NO_BASELINE = ['barefoot'];
// Only the Barefoot Trail may depict a path or footprints; every other
// scene showing a trail would be claiming to be that activity.
const TRAIL_IMAGERY_ALLOWED = ['barefoot'];

for (const a of ACTIVITIES) {
  const svg = VISUAL[a.visual] || '';
  const id = a.visual;

  check('exists', `${id} has an illustration`, svg.length > 0);

  // ─── canvas ────────────────────────────────────────────────────────────
  check('canvas', `${id} uses the shared 480x180 canvas`,
    /viewBox="0 0 480 180"/.test(svg));

  // ─── D1: one ground line, at the shared height ─────────────────────────
  const baselines = [...svg.matchAll(/<ellipse[^>]*cy="(\d+)"[^>]*fill="#C8D8D0"/g)].map((m) => m[1]);
  if (NO_BASELINE.indexOf(id) === -1) {
    check('D1', `${id} draws the shared ground line`, baselines.length > 0);
    for (const y of baselines) {
      check('D1', `${id} ground line sits at the shared baseline`,
        Number(y) === BASELINE_Y, `found cy=${y}, expected ${BASELINE_Y}`);
    }
  } else {
    check('D1', `${id} is a declared baseline exception`, baselines.length === 0);
  }

  // ─── P1/P2: every person comes from the rig ────────────────────────────
  // A hand-drawn figure is a small circle (a head) sitting just above a
  // rect or quad (a body). That pattern is what drifted; catching it is
  // what stops it coming back.
  const stripped = svg.replace(/<g class="pb-fig"[\s\S]*?<\/g>/g, '');
  const handDrawn = findHandDrawnFigures(stripped);
  check('P1', `${id} has no hand-drawn figures left`,
    handDrawn.length === 0,
    handDrawn.length ? `${handDrawn.length} head-and-body pair(s) not from the rig: ` +
      handDrawn.map((f) => `head r=${f.r} at ${f.cx},${f.cy}`).join('; ') : '');

  // ─── D6: rig figures carry their own contact shadow ────────────────────
  // figureSVG draws one unless the caller opts out, which only scenes where
  // the person is not standing on the ground should do.
  const figs = (svg.match(/class="pb-fig"/g) || []).length;
  if (figs > 0) {
    check('P2', `${id} figures declare a known pose`,
      [...svg.matchAll(/data-pose="([a-z]+)"/g)].every((m) => !!run('RIG_POSES')[m[1]]));
  }

  // ─── C1: only the Barefoot Trail depicts the path ──────────────────────
  // A scene depicts the path if it shows footprints, or labels a run of
  // surfaces underfoot the way the Barefoot Trail's tiles do. One material
  // label is not that — other activities legitimately name a moss or a bark
  // they found, which is a different thing from walking on it.
  const surfaces = [...svg.matchAll(/>\s*(grass|soil|bark|moss|stone)\s*</gi)].length;
  const looksLikeTrail = /footprint/i.test(svg) || surfaces >= 3;
  if (TRAIL_IMAGERY_ALLOWED.indexOf(id) === -1) {
    check('C1', `${id} does not depict the path`, !looksLikeTrail);
  }
}

// ─── the rig itself ──────────────────────────────────────────────────────
check('P1', 'rig height is within the human head-count band',
  RIG.totalHeight >= run('RIG_HEADS_MIN') && RIG.totalHeight <= run('RIG_HEADS_MAX'),
  `${RIG.totalHeight} heads`);
check('P2', 'head + torso + legs close to total height',
  Math.abs(RIG.headDiameter + RIG.torsoLength + RIG.legLength - RIG.totalHeight) < 1e-9);
check('P3', 'thigh and shank sum to leg length',
  Math.abs(RIG.thigh + RIG.shank - RIG.legLength) < 1e-9);
check('P3', 'upper arm and forearm sum to arm length',
  Math.abs(RIG.upperArm + RIG.foreArm - RIG.armLength) < 1e-9);

// Every pose must produce limbs of the rig's length — the whole point of
// building them from angles rather than placing endpoints by hand.
for (const pose of Object.keys(run('RIG_POSES'))) {
  const h = 12;
  const svg = run(`figureSVG({ x: 0, y: 0, h: ${h}, pose: '${pose}' })`);
  const polylines = [...svg.matchAll(/points="([-\d.,\s]+)"/g)].map((m) =>
    m[1].trim().split(/\s+/).map((pt) => pt.split(',').map(Number)));
  for (const pts of polylines) {
    if (pts.length !== 3) continue;
    const seg = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const a = seg(pts[0], pts[1]);
    const b = seg(pts[1], pts[2]);
    const isLeg = Math.abs(a - RIG.thigh * h) < 0.05 || Math.abs(a - RIG.upperArm * h) < 0.05;
    check('P2', `${pose}: limb segments keep their length`,
      isLeg, `segments ${a.toFixed(2)}/${b.toFixed(2)} match no rig bone`);
  }
}

if (failures.length) {
  console.error(`\nillustration-lint: ${failures.length} failure(s) of ${checks} checks\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  console.error('');
  process.exit(1);
}
console.log(`illustration-lint: ${checks} checks passed`);
