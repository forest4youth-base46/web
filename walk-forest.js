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

// Every activity's own tuned lateral "side" offset from the trail centre —
// carried over 1:1 from the design prototype (WF_STOPS[].side), keyed by
// id rather than array index so it stays correct regardless of any future
// reordering of ACTIVITIES.
//   This is the SINGLE SOURCE OF TRUTH for which side of the trail a
// station lives on. wfLatFor() and WF_CLEARINGS below both derive their
// side from it rather than restating it, because when they were
// independent hand-tuned tables they silently disagreed — Build a Tiny
// World's pin sat at +0.7 while its whole scene was authored at negative
// offsets, so the marker pointed across the path at empty treeline.
const WF_STOP_SIDE = {
  introduce: -0.62, soundscape: 0.66, naming: -0.5, hammock: 0.58,
  barefoot: -0.68, palette: 0.52, senses: -0.55, tinyworld: 0.7,
  sofa: -0.6, fire: 0.6, bivouac: -0.66, sitspot: 0.55,
  roles: -0.58, project: 0.68, object: -0.54, checkin: 0.5, campfire: -0.46,
};

// ── how far off the path anything can sit ──
// wfProject()'s x is `w/2 + latEffective * w * 0.42 * scale`, and the trail
// ribbon's own half-width is `w * 0.235 * scale` (wfComputeFrame()'s
// trailPts). Equate them and the path's edge lands at latEffective =
// 0.235/0.42 ≈ 0.56 — the same number for every station and every zoom,
// since scale cancels. Props/cast then multiply their own lateral by
// WF_OUT before projecting, so in the pre-multiply units the per-station
// cases are written in, the path edge is 0.56/WF_OUT.
const WF_OUT = 1.2;
const WF_TRAIL_EDGE_LAT = 0.235 / 0.42 / WF_OUT;  // ≈ 0.467
// +0.18, not a hair past the edge: wfLatFor() places a prop's ANCHOR, and
// the shape drawn there still has its own width, so anchoring exactly on
// the boundary leaves half of every stone/log lying over the path. This
// buys roughly a prop-radius of clearance.
const WF_VERGE = WF_TRAIL_EDGE_LAT + 0.18;        // first safe lateral off the path

// ── how wide a station's scene is on the ground ──
// The old model was [centre, spanFactor], compressing each raw lateral
// toward a chosen centre: lat = centre + (l - centre) * spanFactor. Its
// flaw was that where the resulting interval LANDS depends on where the
// centre happens to sit relative to the station's own raw values, so
// nothing stopped the near end from falling back across the path — which
// is exactly what it did for campfire, tinyworld, sofa and bivouac, and
// why tuning those two numbers per station never converged.
//   This replaces it with a mapping that cannot straddle: measure the
// station's own raw lateral range (wfPrimeLatExtents(), below — measured
// from the real builders, never declared by hand), then map that range
// onto the band [verge, verge + width] on the side WF_STOP_SIDE names.
// Both endpoints are off-path by construction, so "scene sits on the
// path" stops being a thing that can happen rather than a thing to test
// for. The only per-station number left is a meaningful one: how many
// lateral units of ground the scene covers.
//   The ceiling isn't a matter of taste: at a held station (scale 1) the
// viewport half-width is w/2, and wfProject turns one lateral unit into
// w * 0.42 * WF_OUT px, so the furthest lateral still on screen is
// 0.5 / (0.42 * WF_OUT) ≈ 0.99. Take off WF_VERGE (~0.57, where the path
// ends) and only ~0.42 of usable ground remains between path edge and
// screen edge. Widths above that don't make a scene grander, they push
// its far side out of frame — which is what sent the fire off the right
// edge on the first attempt at this. Hence the cap below, with the
// gathering stations spending most of the budget and small single-prop
// stations (object, sitspot) using little of it.
const WF_SCENE_MAX_WIDTH = 0.5 / (0.42 * WF_OUT) - WF_VERGE;
const WF_SCENE_WIDTH = {
  introduce: 0.26, soundscape: 0.3, naming: 0.4, hammock: 0.38,
  barefoot: 0.3, palette: 0.3, senses: 0.3, tinyworld: 0.34,
  sofa: 0.38, fire: 0.4, bivouac: 0.38, sitspot: 0.22,
  roles: 0.34, project: 0.32, object: 0.18, checkin: 0.26, campfire: 0.42,
};

// Raw lateral extent per station, filled by wfPrimeLatExtents().
const WF_LAT_EXTENT = {};
// When non-null, the builders' P() closures push their raw lateral into
// this array instead of the frame being used for anything — see
// wfPrimeLatExtents().
let WF_RECORD_LAT = null;

// Maps one raw lateral (as written in a station's own case / WF_CAST) to
// its final lateral in the scene. Orientation is preserved: whichever end
// of the station's raw range faces the trail ends up nearest the trail.
function wfLatFor(id, l) {
  if (WF_RECORD_LAT) { WF_RECORD_LAT.push(l); return 0; }
  const side = (WF_STOP_SIDE[id] || 0) < 0 ? -1 : 1;
  const ext = WF_LAT_EXTENT[id];
  const width = Math.min(WF_SCENE_WIDTH[id] != null ? WF_SCENE_WIDTH[id] : 0.3, WF_SCENE_MAX_WIDTH);
  if (!ext || ext.max - ext.min < 1e-6) return side * WF_VERGE;
  const t = (l - ext.min) / (ext.max - ext.min);      // 0..1 across the scene
  return side * (WF_VERGE + (side > 0 ? t : 1 - t) * width);
}

// Runs every station's builders once with the recording hook on, to learn
// each one's raw lateral range from the actual code rather than a
// hand-maintained table that could drift out of sync with it. Cheap
// (17 stations, once per scene build) and self-maintaining: edit a
// station's offsets and its extent updates itself.
function wfPrimeLatExtents() {
  const savedCam = WF.cam;
  ACTIVITIES.forEach((s, i) => {
    WF_RECORD_LAT = [];
    WF.cam = i;
    const sink = [];
    try { wfBuildProps(s, i, sink); wfBuildCast(s, i, sink); } catch (e) { /* ignore */ }
    const ls = WF_RECORD_LAT;
    WF_RECORD_LAT = null;
    if (ls.length) {
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < ls.length; k++) { if (ls[k] < mn) mn = ls[k]; if (ls[k] > mx) mx = ls[k]; }
      WF_LAT_EXTENT[s.id] = { min: mn, max: mx };
    }
  });
  WF.cam = savedCam;
}

// ── clearings ──
// Five activities are about occupying open ground: building something,
// or gathering in a circle around a fire. Squeezing those into the thin
// strip between path and treeline is what made them read as cluttered and
// half-hidden. So the forest itself opens up for them — the tree and
// shrub scatter below skips anything landing inside a clearing, leaving a
// real glade at that point on the trail for the scene to occupy.
//   alongR is the glade's radius in trail-index units (1.0 ≈ the spacing
// between two consecutive stations); latMax is how far back the treeline
// is pushed on that side. Side is derived, never restated.
const WF_CLEARING_SPEC = {
  tinyworld: { alongR: 0.9, latMax: 2.4 },
  sofa: { alongR: 1.0, latMax: 2.6 },
  fire: { alongR: 1.05, latMax: 2.8 },
  bivouac: { alongR: 1.0, latMax: 2.7 },
  campfire: { alongR: 1.15, latMax: 3.1 },
};

const WF_CLEARINGS = Object.keys(WF_CLEARING_SPEC).map((id) => {
  const at = ACTIVITIES.findIndex((a) => a.id === id);
  const spec = WF_CLEARING_SPEC[id];
  return {
    id, at,
    side: (WF_STOP_SIDE[id] || 0) < 0 ? -1 : 1,
    alongR: spec.alongR,
    latMax: spec.latMax,
  };
}).filter((c) => c.at >= 0);

// True when (at, lat) falls in a station's glade, i.e. no tree/shrub there.
// The along-trail falloff is elliptical rather than a hard cylinder so the
// treeline curves in and out of the glade instead of stopping dead.
function wfInClearing(at, lat) {
  for (let i = 0; i < WF_CLEARINGS.length; i++) {
    const c = WF_CLEARINGS[i];
    if ((lat < 0 ? -1 : 1) !== c.side) continue;
    const da = (at - c.at) / c.alongR;
    if (da < -1 || da > 1) continue;
    // Half-ellipse: full latMax reach at the glade's centre, tapering to
    // nothing at its along-trail ends.
    if (Math.abs(lat) < c.latMax * Math.sqrt(1 - da * da)) return true;
  }
  return false;
}

// The hammock's two suspension posts, in [along, lateral, up] — shared by
// wfBuildProps() (the cloth itself) and wfBuildCast()'s 'lie' pose, so the
// reclining figure's rotation always matches the cloth's actual diagonal
// instead of drifting out of sync if one side is retuned alone.
const WF_HAMMOCK_A = [-0.12, 0.3, 0.8];
const WF_HAMMOCK_B = [0.34, 1.0, 0.8];

// [along trail, lateral, pose, height, facing, up, gesture] — group sizes
// follow each activity's own description: individual work is one figure
// apart, group work is three or four together.
//   gesture, where present, is [durationS, delayS] for that figure's arm
// — see castGesture() / wfBuildCast()'s use of it below. Only on the
// figure that's the station's actual "doing something" moment (per its
// own pocketbook-data.js purpose text); stations whose purpose is
// stillness (soundscape, sitspot, checkin, campfire) carry none, same
// reasoning as the prop side (wfBuildProps()) leaving those untouched.
const WF_CAST = {
  introduce: [[0.42, -0.66, 'kneel', 0.95, 'r', 0, [3.4, 0]]],
  hammock: [[0.11, 0.65, 'lie', 0.95, 'r', 0.52]],
  soundscape: [[0.34, 0.9, 'sit', 0.92], [-0.2, -0.95, 'sit', 0.92, 'l']],
  naming: [[0.06, 0.86, 'reach', 0.95, 'l', 0, [4.2, 0]], [0.2, 1.12, 'stand', 0.9]],
  barefoot: [[0.72, -0.16, 'stand', 0.95], [0.95, 0.2, 'stand', 0.93]],
  palette: [[0.1, -0.62, 'reach', 0.95, 'r', 0, [2.8, 0]], [0.18, 0.6, 'stand', 0.92]],
  senses: [[0.5, -0.8, 'stand', 0.95]],
  tinyworld: [[-0.06, -0.92, 'kneel', 0.95, 'r', 0, [3.6, 0]], [0.12, -0.62, 'kneel', 0.92, 'l']],
  sofa: [[0.1, 0.62, 'sit', 0.95], [0.26, 0.96, 'sit', 0.93], [-0.16, 0.3, 'carry', 0.95, 'r', 0, [3.0, 0]]],
  // Positioned ~1.3x further out from the ring's own center (0.06, 0)
  // than the ring's stones themselves, along each figure's own direction
  // from that center — so the group reads as sitting around the fire
  // pit's edge rather than overlapping its footprint (the flame, whose
  // own size was also corrected — see case 'fire' in wfBuildProps()).
  fire: [[-0.17, -0.35, 'kneel', 0.95, 'r', 0, [1.9, 0]], [0.29, 0.34, 'kneel', 0.93, 'l'], [0.01, 0.52, 'sit', 0.92]],
  bivouac: [[0.06, -1.5, 'reach', 0.95, 'r', 0, [3.2, 0]], [0.24, -0.66, 'carry', 0.93, 'l']],
  sitspot: [[0.62, -1.25, 'sit', 0.95], [1.15, 1.3, 'sit', 0.92]],
  roles: [[-0.06, 0.42, 'carry', 0.95, 'r', 0, [3.0, 0]], [0.18, 0.9, 'stand', 0.93], [0.34, 1.2, 'carry', 0.92, 'l', 0, [3.0, -1.5]]],
  project: [[0.05, -1.05, 'kneel', 0.95, 'r', 0, [4.0, 0]]],
  object: [[0.02, 0.86, 'kneel', 0.95, 'l', 0, [3.8, 0]]],
  checkin: [[0.1, -0.6, 'reach', 0.95, 'l'], [0.26, -0.3, 'stand', 0.93]],
  // Same tightening as fire, same reason — was spread ±0.52.
  campfire: [[-0.18, -0.3, 'sit', 0.95], [0.28, -0.22, 'sit', 0.93], [0.3, 0.3, 'sit', 0.94], [-0.14, 0.31, 'sit', 0.92]],
};

// Three species, matching the three the Naming the Forest panel
// illustration names and draws (VISUAL.naming in pocketbook-data.js) —
// so a walker who reads that panel and then looks at the trail sees the
// same trees. Weighted rather than even: oak stays the commonest (it was
// the only shape the canopy had), with pine and birch as real variety.
//   oak   — broad three-lobe crown, brown trunk (the original shape)
//   pine  — stacked triangular tiers, darkest green, narrow
//   birch — pale near-white trunk with dark bark scars, slim oval crown
const WF_SPECIES = ['oak', 'oak', 'oak', 'oak', 'pine', 'pine', 'birch', 'birch'];

const WF_TREES = (function () {
  const out = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  // Denser than the original 150 at a 0.19 step: the canopy read as a
  // thin screen of separate trees rather than a wood. Trees landing in a
  // station's glade (wfInClearing) are dropped instead of relocated, so
  // the clearings read as genuinely open ground rather than a suspicious
  // ring of trees around a gap.
  for (let i = 0; i < 520; i++) {
    const at = -1 + i * 0.054 + rnd() * 0.07;
    const lat = (rnd() < 0.5 ? -1 : 1) * (1.28 + rnd() * 2.7);
    const species = WF_SPECIES[Math.floor(rnd() * WF_SPECIES.length)];
    if (wfInClearing(at, lat)) continue;
    out.push({
      at, lat, species,
      h: 0.85 + rnd() * 0.9, w: 0.8 + rnd() * 0.65, crown: rnd(),
      lean: rnd() - 0.5, sway: 8.5 + rnd() * 9, swayDelay: rnd() * 12,
    });
  }
  return out;
})();

const WF_SHRUBS = (function () {
  const out = [];
  let seed = 53;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 165; i++) {
    const at = -1 + i * 0.085 + rnd() * 0.1;
    const lat = (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 1.25);
    // Undergrowth clears the glades too, but only the inner part of them
    // — a clearing with waist-high scrub right up to the treeline still
    // reads as open ground you could sit a group down in.
    if (wfInClearing(at, lat * 0.55)) continue;
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
  // Set once wfPrimeLatExtents() has measured every station's raw lateral
  // range — see wfLatFor().
  latPrimed: false,
  // Timestamp the walker arrived at the barefoot station, for the one
  // scripted crouch/shoe-off/resume sequence — see wfComputeFrame()'s
  // barefootPhase. null whenever the camera isn't currently there.
  barefootAt: null,
  w: 1200, h: 640, raf: null, lastPaint: 0,
  onResize: null, onKey: null, onSceneClick: null,
  // Cached handles on the scene's persistent nodes, plus the last value
  // written to each — see wfBuildScene(). Null until the scene is built.
  dom: null,
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

// Shared human-figure scale, used by both the walker (wfComputeFrame(),
// always called with scale=1 — the walker never projects through
// wfProject(), it's drawn at a fixed screen position/size representing
// "right where the camera is looking") and every WF_CAST figure (via
// wfBuildCast(), called with that figure's own projected scale). Before
// this, the two had separate, uncalibrated formulas: the walker's height
// was clamp(h*0.22, 120, 220) — driven by viewport HEIGHT — while a
// WF_CAST figure's was driven by viewport WIDTH (c[3]*0.42*(w*0.42*scale)
// = c[3]*0.1764*w*scale). At the same effective distance from camera —
// which happens exactly when a station is held, the moment both are
// actually on screen together — the two disagreed by roughly 20%, taller
// or shorter depending on aspect ratio. Routing both through this one
// function (linear in scale, same convention every other sized element in
// the scene already follows) makes a WF_CAST figure standing where the
// walker would be read as the same height as the walker, by construction.
function wfPersonHeight(scale) {
  return Math.max(120, Math.min(WF.h * 0.22, 220)) * scale;
}

// Rough size guide for wfBuildProps()/wfBuildCast(), in fractions of
// wfPersonHeight() at the same scale — a reusable reference for tuning
// new or existing prop sizes by eye against a person, rather than
// guessing fresh each time. Not enforced anywhere in code.
//   seat-height object (log, sofa frame, low stone) ......... 0.35–0.45H
//   hand-sized stone / marker / peg .......................... 0.05–0.08H
//   standing post / ridge pole / sign board .................. 1.6–2.0H
//   waist-to-chest prop (fire ring, table stone) .............. 0.5–0.7H
//   tree trunk width at person's height (for scale reference) . 0.08–0.15H

// ───────── in-world cast (the activity as people doing it) ─────────
// Every helper below pushes a shape *descriptor* — {key, tag, cls, attrs}
// — into the caller-supplied `out` array, instead of returning an SVG
// string. `key` is stable across frames for a given figure/call site (a
// static, frame-independent table drives which figures/parts exist, so the
// same sequence of descriptors comes out every call) — that's what lets
// wfSyncSet() (below wfSyncPins) reconcile the persistent DOM node for
// "figure 2's left arm" in place, frame after frame, rather than tearing
// down and recreating it, which is what reset any per-figure animation
// while the camera moved. See the wfSyncSet()/wfSyncShapes() comment for
// the reconciliation side of this.
function wfBuildCast(s, i, out) {
  const cast = WF_CAST[s.id];
  if (!cast || !cast.length) return;
  const w = WF.w;
  const R = (v) => Math.round(v * 10) / 10;
  const P = (a, l, up) => {
    const lat = wfLatFor(s.id, l);
    const pr = wfProject(i + a, lat * WF_OUT);
    if (!pr) return null;
    const u = w * 0.42 * pr.scale;
    return { x: pr.x, y: pr.y - (up || 0) * 0.42 * u, u: u, scale: pr.scale };
  };
  cast.forEach((c, fi) => {
    const b = P(c[0], c[1], c[5] || 0);
    if (!b) return;
    // wfPersonHeight(), not the old c[3]*0.42*b.u — see that function's
    // comment for why: b.u alone (width-based) put a WF_CAST figure at a
    // different height than the walker at the same distance.
    const H = (c[3] || 0.95) * wfPersonHeight(b.scale);
    if (H < 8) return;
    const pose = c[2], face = c[4] === 'l' ? -1 : 1;
    const fill = '#14302A', op = 0.74;
    const kp = 'c' + fi + '-';
    if (!c[5]) {
      out.push({ key: kp + 'shadow', tag: 'ellipse', attrs: {
        cx: R(b.x), cy: R(b.y), rx: R(H * 0.2), ry: R(H * 0.06), fill: '#3A2E22', opacity: 0.16,
      } });
    }
    const head = (key, cx, cy, r) => out.push({ key: kp + key, tag: 'circle', attrs: {
      cx: R(cx), cy: R(cy), r: R(r), fill, opacity: op,
    } });
    const limb = (key, x1, y1, x2, y2, tw) => out.push({ key: kp + key, tag: 'path', attrs: {
      d: 'M' + R(x1) + ' ' + R(y1) + ' L' + R(x2) + ' ' + R(y2), stroke: fill, 'stroke-width': R(tw), 'stroke-linecap': 'round', opacity: op,
    } });
    // The one arm that reads as "this figure is doing something" for
    // stations that got a gesture assigned in WF_CAST (c[6] = [durationS,
    // delayS]) — same path as limb('arm', ...) would draw, wrapped in a
    // persistent <g> pivoted on the shoulder point (x1,y1) rather than
    // drawn as a bare stroke, so wfGesture (styles-walk-forest.css) can
    // rotate it there. Every other limb stays a plain limb() call —
    // static, same as before.
    const armLimb = (x1, y1, x2, y2, tw) => {
      if (!c[6]) { limb('arm', x1, y1, x2, y2, tw); return; }
      const [dur, delay] = c[6];
      out.push({ key: kp + 'arm', tag: 'path',
        group: {
          key: kp + 'arm-grp', cls: 'wfGesture',
          style: 'transform-origin:' + R(x1) + 'px ' + R(y1) + 'px;animation-duration:' + dur + 's;animation-delay:' + delay + 's',
        },
        attrs: { d: 'M' + R(x1) + ' ' + R(y1) + ' L' + R(x2) + ' ' + R(y2), stroke: fill, 'stroke-width': R(tw), 'stroke-linecap': 'round', opacity: op },
      });
    };
    const torso = (key, d) => out.push({ key: kp + key, tag: 'path', attrs: { d, fill, opacity: op } });
    if (pose === 'stand' || pose === 'carry' || pose === 'reach') {
      const top = b.y - H;
      limb('legL', b.x - H * 0.06, b.y - H * 0.44, b.x - H * 0.07, b.y, H * 0.075);
      limb('legR', b.x + H * 0.06, b.y - H * 0.44, b.x + H * 0.07, b.y, H * 0.075);
      torso('torso', 'M' + R(b.x) + ' ' + R(top + H * 0.2) + ' q' + R(-H * 0.15) + ' ' + R(H * 0.07) + ' ' + R(-H * 0.15) + ' ' + R(H * 0.36) + ' l' + R(H * 0.3) + ' 0 q0 ' + R(-H * 0.29) + ' ' + R(-H * 0.15) + ' ' + R(-H * 0.36) + ' Z');
      if (pose === 'carry') armLimb(b.x, b.y - H * 0.6, b.x + face * H * 0.3, b.y - H * 0.5, H * 0.065);
      if (pose === 'reach') armLimb(b.x, b.y - H * 0.62, b.x + face * H * 0.34, b.y - H * 0.78, H * 0.06);
      head('head', b.x, top + H * 0.11, H * 0.115);
    } else if (pose === 'sit') {
      const top = b.y - H * 0.72;
      limb('legL', b.x + face * H * 0.02, b.y - H * 0.1, b.x + face * H * 0.2, b.y - H * 0.03, H * 0.07);
      torso('torso', 'M' + R(b.x) + ' ' + R(top + H * 0.18) + ' q' + R(-H * 0.12) + ' ' + R(H * 0.06) + ' ' + R(-H * 0.12) + ' ' + R(H * 0.4) + ' l' + R(H * 0.24) + ' 0 q0 ' + R(-H * 0.34) + ' ' + R(-H * 0.12) + ' ' + R(-H * 0.4) + ' Z');
      armLimb(b.x + face * H * 0.09, b.y - H * 0.42, b.x + face * H * 0.16, b.y - H * 0.16, H * 0.05);
      head('head', b.x, top + H * 0.1, H * 0.105);
    } else if (pose === 'kneel') {
      const top = b.y - H * 0.58;
      out.push({ key: kp + 'shin', tag: 'ellipse', attrs: {
        cx: R(b.x + face * H * 0.05), cy: R(b.y - H * 0.06), rx: R(H * 0.17), ry: R(H * 0.08), fill, opacity: op,
      } });
      torso('torso', 'M' + R(b.x) + ' ' + R(top + H * 0.14) + ' q' + R(face * H * 0.1) + ' ' + R(H * 0.16) + ' ' + R(face * H * 0.04) + ' ' + R(H * 0.3) + ' l' + R(-H * 0.2) + ' ' + R(-H * 0.04) + ' q' + R(-H * 0.02) + ' ' + R(-H * 0.16) + ' ' + R(H * 0.16) + ' ' + R(-H * 0.26) + ' Z');
      armLimb(b.x + face * H * 0.05, b.y - H * 0.3, b.x + face * H * 0.24, b.y - H * 0.08, H * 0.055);
      head('head', b.x + face * H * 0.02, top + H * 0.06, H * 0.095);
    } else if (pose === 'lie') {
      // Oriented along the hammock's own rope diagonal (post to post),
      // not a flat horizontal blob — the flat version spilled off both
      // sides of the cloth and put the head entirely outside it. Only
      // hammock uses this pose today; falls back to the flat body if
      // 'lie' is ever reused somewhere without matching suspension posts.
      const hA = s.id === 'hammock' ? P(...WF_HAMMOCK_A) : null;
      const hB = s.id === 'hammock' ? P(...WF_HAMMOCK_B) : null;
      const dx = hA && hB ? hB.x - hA.x : 1, dy = hA && hB ? hB.y - hA.y : 0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const angDeg = Math.atan2(dy, dx) * 180 / Math.PI;
      // Sized to sit inside the cloth's own drawn silhouette with margin —
      // the cloth is a sagging curve, not a straight band, so a body drawn
      // at the full post-to-post length overshoots it at both ends.
      const bodyRx = hA && hB ? Math.min(H * 0.42, len * 0.3) : H * 0.36;
      const bodyCx = b.x, bodyCy = b.y - H * 0.16;
      out.push({ key: kp + 'body', tag: 'ellipse', attrs: {
        cx: R(bodyCx), cy: R(bodyCy), rx: R(bodyRx), ry: R(H * 0.085), fill, opacity: op,
        transform: 'rotate(' + angDeg.toFixed(1) + ' ' + R(bodyCx) + ' ' + R(bodyCy) + ')',
      } });
      head('head', bodyCx - face * ux * bodyRx * 0.85, bodyCy - face * uy * bodyRx * 0.85, H * 0.085);
    }
  });
}

// ───────── in-world set dressing (materials/structures/signs) ─────────
// Descriptor-pushing, same rationale as wfBuildCast() above: each shape
// helper pushes {key, tag, cls, attrs} into `out` rather than returning a
// string, keyed by call order (`n`, reset to 0 per station) — stable
// because every station's switch case runs the exact same sequence of
// helper calls every frame (all loop bounds below are static literals,
// never frame-dependent), so call order is a valid, stable identity.
function wfBuildProps(s, i, out) {
  const w = WF.w;
  const R = (v) => Math.round(v * 10) / 10;
  const OUT = WF_OUT;
  const UP = 0.42;
  const SZ = 0.45;
  const P = (a, l, up) => {
    const lat = wfLatFor(s.id, l);
    const pr = wfProject(i + a, lat * OUT);
    if (!pr) return null;
    const u = w * 0.42 * pr.scale;
    return { x: pr.x, y: pr.y - (up || 0) * UP * u, u: u, s: pr.scale };
  };
  // No HTML-escaping here (unlike wfEsc() elsewhere in this file) — label()
  // below sets this via a shape descriptor's `text` field, which
  // wfSyncShapes() applies through el.textContent, not innerHTML. That's
  // the safe DOM API already; escaping into HTML entities first would
  // make textContent display the literal entity text (e.g. "Tom &amp;
  // Jerry" instead of "Tom & Jerry") instead of un-escaping it.
  const words = wfWords(s.id) || [];
  const W = (k) => words[k] || '';
  let n = 0;
  const key = () => 'p' + (n++);
  const stone = (a, l, r, f, o, cls, style) => {
    const k = key(); const q = P(a, l); if (!q) return;
    out.push({ key: k, tag: 'ellipse', cls, style, attrs: {
      cx: R(q.x), cy: R(q.y), rx: R(r * SZ * q.u), ry: R(r * SZ * q.u * 0.5), fill: f,
      ...(o != null ? { opacity: o } : {}),
    } });
  };
  const shade = (a, l, r) => stone(a, l, r, '#3A2E22', 0.14);
  const ring = (a, l, r, cls, col, style) => {
    const k = key(); const q = P(a, l); if (!q) return;
    out.push({ key: k, tag: 'ellipse', cls, style, attrs: {
      cx: R(q.x), cy: R(q.y), rx: R(r * SZ * q.u), ry: R(r * SZ * q.u * 0.4),
      fill: 'none', stroke: col || '#7FA396', 'stroke-width': R(Math.max(1, 0.012 * q.u)),
    } });
  };
  const post = (a, l, hgt, th, f, cls, style) => {
    const k = key(); const b = P(a, l), t = P(a, l, hgt); if (!b || !t) return;
    const tw = Math.max(1.2, th * SZ * b.u);
    out.push({ key: k, tag: 'rect', cls, style, attrs: {
      x: R(b.x - tw / 2), y: R(t.y), width: R(tw), height: R(Math.max(1, b.y - t.y)), rx: R(tw / 2), fill: f,
    } });
  };
  const beam = (a1, l1, u1, a2, l2, u2, th, f, cls) => {
    const k = key(); const A = P(a1, l1, u1), B = P(a2, l2, u2); if (!A || !B) return;
    out.push({ key: k, tag: 'path', cls, attrs: {
      d: 'M' + R(A.x) + ' ' + R(A.y) + ' L' + R(B.x) + ' ' + R(B.y),
      stroke: f, 'stroke-width': R(Math.max(1.2, th * SZ * Math.max(A.u, B.u))), 'stroke-linecap': 'round', fill: 'none',
    } });
  };
  const quad = (c, f, o, cls) => {
    const k = key(); const pts = c.map(v => P(v[0], v[1], v[2] || 0)); if (pts.some(v => !v)) return;
    out.push({ key: k, tag: 'path', cls, attrs: {
      d: 'M' + pts.map(v => R(v.x) + ' ' + R(v.y)).join(' L') + ' Z', fill: f,
      ...(o != null ? { opacity: o } : {}),
    } });
  };
  const band = (a0, a1, f, o, cls) => {
    const k = key(); const A = wfProject(i + a0, 0), B = wfProject(i + a1, 0); if (!A || !B) return;
    const hA = w * 0.235 * A.scale, hB = w * 0.235 * B.scale;
    out.push({ key: k, tag: 'path', cls, attrs: {
      d: 'M' + R(A.x - hA) + ' ' + R(A.y) + ' L' + R(A.x + hA) + ' ' + R(A.y) + ' L' + R(B.x + hB) + ' ' + R(B.y) + ' L' + R(B.x - hB) + ' ' + R(B.y) + ' Z',
      fill: f, opacity: (o == null ? 1 : o),
    } });
  };
  const bush = (a, l, r, f, cls, style) => {
    const k = key(); const q = P(a, l); if (!q) return;
    const kk = r * SZ * q.u;
    out.push({ key: k, tag: 'path', cls, style, attrs: {
      d: 'M' + R(q.x - kk) + ' ' + R(q.y) + ' q' + R(kk * 0.3) + ' ' + R(-kk * 1.4) + ' ' + R(kk) + ' ' + R(-kk * 0.55) +
         ' q' + R(kk * 0.7) + ' ' + R(-kk * 0.85) + ' ' + R(kk) + ' ' + R(kk * 0.55) + ' Z', fill: f,
    } });
  };
  const near = Math.abs(WF.cam - i);
  const label = (a, l, up, txt, ksz) => {
    const k = key();
    if (near > 0.42 || !txt || txt.length > 26) return;
    const q = P(a, l, up || 0);
    if (!q || q.y > WF.h - 104) return;
    const fs = Math.min(15, (ksz || 0.058) * 0.62 * q.u);
    if (fs < 8) return;
    const fade = (1 - near / 0.42).toFixed(2);
    out.push({ key: k, tag: 'text', text: txt, attrs: {
      x: R(q.x), y: R(q.y), 'text-anchor': 'middle', 'font-family': 'Open Sans, sans-serif',
      'font-weight': 500, 'font-size': R(fs), fill: '#2C4F44', opacity: fade,
      stroke: '#E7E0CE', 'stroke-opacity': 0.8, 'stroke-width': R(fs * 0.3), 'paint-order': 'stroke',
    } });
  };
  switch (s.id) {
    case 'introduce':
      shade(0.42, -0.62, 0.34);
      beam(0.28, -0.78, 0, 0.46, -0.72, 0, 0.026, '#6B5240');
      beam(0.46, -0.72, 0, 0.41, -0.54, 0, 0.026, '#6B5240');
      beam(0.41, -0.54, 0, 0.56, -0.48, 0, 0.026, '#6B5240');
      stone(0.35, -0.44, 0.045, '#A8A08C'); stone(0.45, -0.37, 0.038, '#8F8877'); stone(0.55, -0.42, 0.032, '#A8A08C');
      bush(0.75, -1.15, 0.3, '#3A6B5A', 'wf-sway');
      label(0.42, -0.62, 0.3, W(0), 0.042);
      return;
    case 'soundscape':
      shade(0.02, -0.95, 0.3); stone(0.02, -0.95, 0.24, '#9A9382'); stone(0.01, -0.97, 0.18, '#B0A992');
      ring(0.02, -0.95, 0.34, 'wfBreath'); ring(0.02, -0.95, 0.52, 'wfBreath', '#8FAEA0');
      label(1.3, -1.5, 0.62, W(0), 0.036); label(1.1, 1.5, 0.72, W(1), 0.036);
      label(0.7, 1.7, 0.42, W(2), 0.036); label(0.9, -1.9, 0.46, W(3), 0.036);
      return;
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
        const kt = key();
        out.push({ key: kt + 'sh', tag: 'ellipse', attrs: {
          cx: R(cx), cy: R(base.y), rx: R(tw * 3.2), ry: R(tw * 1.1), fill: '#3A2E22', opacity: 0.15,
        } });
        out.push({ key: kt + 'tr', tag: 'path', attrs: {
          d: 'M' + R(cx - tw) + ' ' + R(base.y) + ' L' + R(cx - tw * 0.4) + ' ' + R(topY) + ' L' + R(cx + tw * 0.4) + ' ' + R(topY) + ' L' + R(cx + tw) + ' ' + R(base.y) + ' Z',
          fill: barks[k],
        } });
        // The three crown ellipses share one wf-sway group (a wrapping <g>,
        // not a shape descriptor) so they sway as one rigid unit — see
        // wfSyncShapes()'s `group` handling for how descriptors that share
        // a `group.key` get one persistent <g> wrapper between them.
        const swayStyle = 'animation-duration:' + (9 + k * 2.4) + 's;animation-delay:-' + (k * 3.1) + 's';
        const grp = { key: kt + 'crown', cls: 'wf-sway', style: swayStyle };
        out.push({ key: kt + 'c2', tag: 'ellipse', group: grp, attrs: {
          cx: R(cx - R2 * 0.55), cy: R(midY), rx: R(R2 * 0.6), ry: R(R2 * 0.48), fill: crown2s[k],
        } });
        out.push({ key: kt + 'c3', tag: 'ellipse', group: grp, attrs: {
          cx: R(cx + R2 * 0.58), cy: R(midY - R2 * 0.05), rx: R(R2 * 0.54), ry: R(R2 * 0.44), fill: crown2s[k],
        } });
        out.push({ key: kt + 'c1', tag: 'ellipse', group: grp, attrs: {
          cx: R(cx), cy: R(topY + R2 * 0.12), rx: R(R2 * 0.9), ry: R(R2 * 0.7), fill: crowns[k],
        } });
        label(a, l, 1.55, W(k * 2), 0.048);
      }
      return;
    }
    case 'hammock': {
      // l=1.9 for the far post put it well past a full viewport width off
      // the right edge — pulled the whole span in (0.6/1.25/1.9 -> 0.3/0.65/1.0).
      const A = P(...WF_HAMMOCK_A), B = P(...WF_HAMMOCK_B), M = P(0.11, 0.65, 0.5);
      if (!A || !B || !M) return;
      post(WF_HAMMOCK_A[0], WF_HAMMOCK_A[1], 1.15, 0.05, '#5B4636'); post(WF_HAMMOCK_B[0], WF_HAMMOCK_B[1], 1.15, 0.05, '#5B4636');
      const kh = key();
      const grp = { key: kh + 'hang', cls: 'wfHang' };
      out.push({ key: kh + 'cloth', tag: 'path', group: grp, attrs: {
        d: 'M' + R(A.x) + ' ' + R(A.y) + ' Q' + R(M.x) + ' ' + R(M.y + 0.12 * M.u) + ' ' + R(B.x) + ' ' + R(B.y) + ' Q' + R(M.x) + ' ' + R(M.y - 0.16 * M.u) + ' ' + R(A.x) + ' ' + R(A.y) + ' Z',
        fill: '#D87B4F', opacity: 0.9,
      } });
      out.push({ key: kh + 'edge', tag: 'path', group: grp, attrs: {
        d: 'M' + R(A.x) + ' ' + R(A.y) + ' Q' + R(M.x) + ' ' + R(M.y + 0.12 * M.u) + ' ' + R(B.x) + ' ' + R(B.y),
        fill: 'none', stroke: '#B8552E', 'stroke-width': R(Math.max(1.5, 0.022 * M.u)),
      } });
      label(0.11, 0.65, 0.34, W(0), 0.042);
      return;
    }
    case 'barefoot': {
      const mat = ['#7FA396', '#6B5240', '#9A7B57', '#3F6B54', '#A8A08C'];
      const speck = ['#5E8C77', '#4A3A2C', '#B08A5E', '#2F5A46', '#BDB6A4'];
      for (let k = 0; k < 5; k++) {
        const a0 = -0.62 + k * 0.26;
        band(a0, a0 + 0.24, mat[k], 0.55);
        for (let j = 0; j < 9; j++) {
          const t = a0 + 0.03 + (j % 3) * 0.08, lat = -0.62 + ((j * 7) % 9) * 0.16;
          stone(t, lat / OUT, 0.05, speck[k], 0.85);
        }
        label(a0 + 0.12, 0.62, 0.16, W(k), 0.05);
      }
      shade(-0.78, -0.58, 0.12); stone(-0.8, -0.6, 0.1, '#4A3A2C'); stone(-0.72, -0.5, 0.1, '#4A3A2C');
      for (let k = 0; k < 5; k++) stone(-0.5 + k * 0.26, (k % 2 ? 0.07 : -0.07) / OUT, 0.05, '#3A2E22', 0.22);
      return;
    }
    case 'palette': {
      const cols = ['#3F6B54', '#7FA396', '#8A6C52', '#B8552E'];
      post(-0.04, -0.72, 0.5, 0.022, '#6B5240'); post(0.16, 0.72, 0.5, 0.022, '#6B5240');
      beam(-0.04, -0.72, 0.48, 0.16, 0.72, 0.48, 0.008, '#C8BFA6');
      for (let k = 0; k < 4; k++) {
        const l = -0.46 + k * 0.3, q = P(0.06, l, 0.44);
        const kp = key();
        if (!q) continue;
        out.push({ key: kp, tag: 'rect', cls: 'wfPeg', attrs: {
          x: R(q.x - 0.035 * q.u), y: R(q.y), width: R(0.07 * q.u), height: R(0.1 * q.u), rx: R(0.012 * q.u), fill: cols[k],
        } });
      }
      for (let k = 0; k < 3; k++) label(0.06, -0.46 + k * 0.3, 0.3, W(k), 0.04);
      return;
    }
    case 'senses':
      // wfWords('senses') resolves to VISUAL.senses's own <text> node
      // order: the 5-4-3-2-1 countdown first (indices 0-4), then the
      // sense words see/touch/hear/smell/taste (indices 5-9) — the
      // reverse of what this originally assumed, which put a number
      // ("2") where a sense word ("smell") belonged and vice versa.
      for (let k = 0; k < 5; k++) {
        const a = -0.44 + k * 0.22, l = k % 2 ? 0.6 : -0.6;
        shade(a, l, 0.11);
        // Staggered per marker — an "awareness cascade" from one marker
        // to the next, matching the 5-4-3-2-1 grounding sequence rather
        // than five rings pulsing in lockstep. Same technique naming's
        // trees use (inline animation-delay alongside the shared class).
        stone(a, l, 0.1, '#A8A08C', null, 'wfBreath', 'animation-delay:-' + (k * 1.9).toFixed(1) + 's');
        label(a, l, 0.13, W(5 + k), 0.05); label(a, l, 0.27, W(k), 0.038);
      }
      return;
    case 'tinyworld': {
      // The mound the world is built on is always there; everything
      // placed ON it arrives one piece at a time (wfPlace, staggered),
      // so the station reads as a world being assembled rather than a
      // finished diorama. Order follows the panel illustration's own
      // reveal order: ground cover first, then the built pieces, then
      // the small finishing details.
      shade(0, -0.78, 0.42); stone(0, -0.78, 0.36, '#6B5240', 0.5); stone(0, -0.78, 0.28, '#5B4636', 0.55);
      const place = (n) => 'animation-delay:-' + (16 - n * 1.6).toFixed(2) + 's';
      bush(-0.08, -0.9, 0.1, '#47775F', 'wfPlace', place(1));
      bush(0.06, -0.68, 0.08, '#3A6B5A', 'wfPlace', place(2));
      post(-0.02, -0.8, 0.12, 0.012, '#6B5240', 'wfPlace', place(3));
      post(0.04, -0.74, 0.16, 0.012, '#6B5240', 'wfPlace', place(4));
      stone(0.1, -0.88, 0.05, '#A8A08C', null, 'wfPlace', place(5));
      stone(-0.06, -0.66, 0.04, '#9A9382', null, 'wfPlace', place(6));
      label(0, -0.78, 0.46, W(0), 0.044);
      return;
    }
    case 'sofa':
      shade(0.1, 0.72, 0.4);
      beam(-0.04, 0.42, 0.09, 0.22, 1.04, 0.09, 0.07, '#6B5240');
      // Slower/smaller than wfPeg's rocking — a log still being settled
      // into place, not an object swinging freely.
      beam(0.06, 0.44, 0.26, 0.32, 1.06, 0.26, 0.05, '#5B4636', 'wfSettle');
      post(0.06, 0.44, 0.26, 0.035, '#5B4636'); post(0.32, 1.06, 0.26, 0.035, '#5B4636');
      stone(-0.14, 0.36, 0.06, '#9A9382'); stone(0.34, 1.16, 0.06, '#9A9382');
      return;
    case 'fire': {
      for (let k = 0; k < 7; k++) { const ang = k / 7 * Math.PI * 2; stone(0.06 + Math.cos(ang) * 0.15, Math.sin(ang) * 0.36, 0.06, '#9A9382'); }
      beam(-0.04, -0.2, 0.02, 0.16, 0.2, 0.2, 0.028, '#6B5240'); beam(0.16, -0.2, 0.02, -0.04, 0.2, 0.2, 0.028, '#6B5240');
      const f = P(0.06, 0, 0.16);
      const kf = key();
      if (f) {
        // Flame size is derived from a person's height at this point, not
        // from f.u directly — the raw-u version stood ~1.4x a kneeling
        // figure's own height (a bonfire, not a small gathering fire) and
        // its top reached up into the far-side figure's head, reading as
        // "sitting in the fire" rather than around it. 1.3H keeps it inside
        // the documented "waist-to-chest prop" guide (0.5-0.7 of person
        // height) near its upper end, clearing a kneeling head with margin.
        const fu = wfPersonHeight(f.s) * 1.3;
        out.push({ key: kf + 'flame', tag: 'path', cls: 'wfFlick', attrs: {
          d: 'M' + R(f.x) + ' ' + R(f.y - 0.3 * fu) + ' q' + R(0.11 * fu) + ' ' + R(0.18 * fu) + ' ' + R(0.11 * fu) + ' ' + R(0.28 * fu) + ' a' + R(0.11 * fu) + ' ' + R(0.11 * fu) + ' 0 0 1 ' + R(-0.22 * fu) + ' 0 q0 ' + R(-0.1 * fu) + ' ' + R(0.11 * fu) + ' ' + R(-0.28 * fu) + ' Z',
          fill: '#D87B4F',
        } });
        out.push({ key: kf + 'smoke', tag: 'circle', cls: 'wfSmoke', attrs: {
          cx: R(f.x), cy: R(f.y - 0.36 * fu), r: R(0.07 * fu), fill: '#C8D8D0',
        } });
      }
      label(0.06, 0, 0.85, W(8), 0.044);
      return;
    }
    case 'bivouac':
      post(-0.06, -1.3, 0.4, 0.022, '#5B4636'); post(0.2, -0.86, 0.4, 0.022, '#5B4636');
      beam(-0.06, -1.3, 0.39, 0.2, -0.86, 0.39, 0.014, '#6B5240');
      // Only the near panel flaps — the far/back panel sits behind the
      // ridge and wouldn't catch a believable gust the same way.
      quad([[-0.06, -1.3, 0.39], [0.2, -0.86, 0.39], [0.26, -0.66, 0], [0, -1.12, 0]], '#3F6B54', 0.92, 'wfFlap');
      quad([[-0.06, -1.3, 0.39], [0.2, -0.86, 0.39], [0.14, -1.06, 0], [-0.12, -1.52, 0]], '#47775F', 0.88);
      stone(0.3, -0.6, 0.05, '#9A9382'); stone(-0.16, -1.5, 0.045, '#9A9382');
      label(0.07, -1.08, 0.5, W(0), 0.04);
      return;
    case 'sitspot':
      shade(0.02, -0.95, 0.3); stone(0.02, -0.95, 0.25, '#9A9382'); stone(0.03, -0.97, 0.18, '#B0A992');
      // One travelling ripple rather than rings breathing in unison: same
      // ring at three phases of the same 7s wfRipple cycle.
      for (let k = 0; k < 3; k++) {
        ring(0.02, -0.95, 0.42, 'wfRipple', k === 1 ? '#8FAEA0' : '#7FA396',
          'animation-delay:-' + (k * 2.33).toFixed(2) + 's');
      }
      label(0.55, -1.05, 0.34, W(0), 0.04);
      return;
    case 'roles':
      shade(0.06, 0.74, 0.44);
      beam(-0.12, 0.48, 0.07, 0.24, 1.02, 0.07, 0.11, '#6B5240');
      // Role-tokens rock independently — objects actively being handed off.
      stone(-0.06, 0.58, 0.05, '#B8552E', null, 'wfPeg'); stone(0.05, 0.74, 0.05, '#7FA396', null, 'wfPeg'); stone(0.16, 0.9, 0.05, '#C8BFA6', null, 'wfPeg');
      label(-0.06, 0.58, 0.26, W(0), 0.042); label(0.05, 0.74, 0.26, W(2), 0.042); label(0.16, 0.9, 0.26, W(4), 0.042);
      return;
    case 'project': {
      const c = [[-0.26, -1.3], [-0.26, -0.58], [0.36, -0.58], [0.36, -1.3]];
      for (let k = 0; k < 4; k++) post(c[k][0], c[k][1], 0.2, 0.016, '#6B5240');
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; beam(a[0], a[1], 0.18, b[0], b[1], 0.18, 0.007, '#C8BFA6'); }
      post(0.05, -0.94, 0.42, 0.02, '#3A6B5A'); bush(0.05, -0.94, 0.17, '#47775F', 'wf-sway');
      label(0.05, -0.94, 0.62, W(8), 0.044);
      return;
    }
    case 'object': {
      shade(0, 0.7, 0.26); stone(0, 0.7, 0.22, '#9A9382');
      const q = P(0, 0.7, 0.24);
      const ko = key();
      if (q) out.push({ key: ko, tag: 'ellipse', cls: 'wfLift', attrs: {
        cx: R(q.x), cy: R(q.y), rx: R(0.09 * q.u), ry: R(0.07 * q.u), fill: '#8A6C52',
      } });
      label(0, 0.7, 0.48, W(4), 0.044);
      return;
    }
    case 'checkin':
      post(0, -0.92, 0.56, 0.02, '#6B5240'); post(0.1, -0.48, 0.56, 0.02, '#6B5240');
      // Very low-amplitude breathing highlight — reuses wfBreath, damped
      // via .wf-breath-soft (styles-walk-forest.css) rather than a new
      // keyframe, since the shape is the same pulse, just quieter.
      quad([[0, -0.92, 0.56], [0.1, -0.48, 0.56], [0.1, -0.48, 0.3], [0, -0.92, 0.3]], '#E6DCC4', null, 'wfBreath wf-breath-soft');
      label(0.05, -0.7, 0.5, W(0), 0.044); label(0.05, -0.7, 0.38, W(1), 0.04);
      return;
    case 'campfire': {
      for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + 0.4; stone(0.05 + Math.cos(ang) * 0.13, Math.sin(ang) * 0.32, 0.055, '#8F8877'); }
      const f = P(0.05, 0, 0.08);
      const kc = key();
      if (f) {
        out.push({ key: kc + 'glow', tag: 'ellipse', cls: 'wfBreath', attrs: {
          cx: R(f.x), cy: R(f.y), rx: R(0.17 * f.u), ry: R(0.07 * f.u), fill: '#D87B4F', opacity: 0.28,
        } });
        out.push({ key: kc + 'flame', tag: 'path', cls: 'wfFlick', attrs: {
          d: 'M' + R(f.x) + ' ' + R(f.y - 0.2 * f.u) + ' q' + R(0.08 * f.u) + ' ' + R(0.12 * f.u) + ' ' + R(0.08 * f.u) + ' ' + R(0.18 * f.u) + ' a' + R(0.08 * f.u) + ' ' + R(0.08 * f.u) + ' 0 0 1 ' + R(-0.16 * f.u) + ' 0 q0 ' + R(-0.06 * f.u) + ' ' + R(0.08 * f.u) + ' ' + R(-0.18 * f.u) + ' Z',
          fill: '#B8552E',
        } });
      }
      beam(-0.26, -0.75, 0.05, -0.06, -0.38, 0.05, 0.075, '#6B5240');
      beam(0.28, 0.38, 0.05, 0.48, 0.75, 0.05, 0.075, '#6B5240');
      label(0.05, 0, 0.5, W(0), 0.04);
      return;
    }
    default:
      return;
  }
}
function wfBuildSet(s, i, out) { wfBuildProps(s, i, out); wfBuildCast(s, i, out); }

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
  //   One exception: the barefoot station's scripted crouch/shoe-off/
  // resume sequence (wfComputeFrame()'s barefootPhase) is time-driven,
  // not camera-driven — it plays out entirely while WF.mode is 'hold',
  // so without this it would never advance past whatever phase happened
  // to be current on the single render that starts it. barefootTicking
  // mirrors wfComputeFrame()'s own "are we at this station" check rather
  // than reading WF.barefootAt directly, since that's only ever set
  // *inside* the render this is deciding whether to trigger.
  const camIndex = Math.round(WF.cam);
  const atStation = Math.abs(WF.cam - camIndex) < 0.3 ? ACTIVITIES[camIndex] : null;
  const barefootTicking = atStation && atStation.id === 'barefoot' &&
    (WF.barefootAt == null || now - WF.barefootAt < 3300);
  if ((wasMoving || WF.mode === 'move' || barefootTicking) && now - (WF.lastPaint || 0) > 32) {
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
    if (!p || p.scale < 0.13 || p.scale > 3.2 || p.d > 12) return;
    const sp = tr.species || 'oak';
    // Per-species proportions: a pine is tall and narrow, a birch taller
    // still and slimmer again, an oak broad and shorter. Applied to the
    // shared trunk-height/crown-radius maths rather than each species
    // re-deriving its own, so depth scaling stays identical across all
    // three and only the silhouette differs.
    const hMul = sp === 'pine' ? 1.25 : (sp === 'birch' ? 1.18 : 1);
    const wMul = sp === 'pine' ? 0.66 : (sp === 'birch' ? 0.52 : 1);
    const rMul = sp === 'pine' ? 0.72 : (sp === 'birch' ? 0.66 : 1);
    const th = h * 0.44 * tr.h * p.scale * hMul;
    const tw = Math.max(1.4, w * 0.019 * tr.w * p.scale * wMul);
    const R = Math.max(5, w * 0.086 * p.scale * tr.w * rMul);
    const topY = p.y - th;
    const lean = tr.lean * tw * 1.6;
    const far = p.scale < 0.34;
    const item = {
      species: sp, far,
      cx: p.x.toFixed(1), by: p.y.toFixed(1),
      shRx: (tw * 2.4).toFixed(1), shRy: (tw * 0.8).toFixed(1),
      trunkD: 'M' + (p.x - tw * 0.72).toFixed(1) + ' ' + p.y.toFixed(1) +
        ' L' + (p.x - tw * 0.3 + lean).toFixed(1) + ' ' + topY.toFixed(1) +
        ' L' + (p.x + tw * 0.3 + lean).toFixed(1) + ' ' + topY.toFixed(1) +
        ' L' + (p.x + tw * 0.72).toFixed(1) + ' ' + p.y.toFixed(1) + ' Z',
      // Birch bark is the species' whole signature — near-white, never the
      // brown the other two share, and it keeps its identity into the far
      // palette (a pale trunk reads paler with distance, not browner).
      bark: sp === 'birch'
        ? (far ? '#EDE7DA' : '#F4F1E8')
        : (far ? '#8A7A66' : (tr.crown > 0.5 ? '#6B5240' : '#5B4636')),
      // Dark scar marks up the birch trunk, the detail that makes it read
      // as birch rather than just a pale pole. Skipped on far/small trees
      // where they'd be sub-pixel noise.
      barkMarks: sp === 'birch' && !far ? [0.28, 0.46, 0.63, 0.78].map((f) => ({
        x: (p.x - tw * 0.5 + lean * f).toFixed(1),
        y: (p.y - th * f).toFixed(1),
        w: (tw * 0.85).toFixed(1),
        h: Math.max(0.8, tw * 0.16).toFixed(1),
      })) : null,
      // Pine: three stacked tiers, widest at the bottom, drawn as
      // triangles rather than the oak's ellipse cluster.
      tiers: sp === 'pine' && !far ? [0, 1, 2].map((k) => {
        const tierW = R * (0.68 + k * 0.18);
        const tierTop = topY + th * (k * 0.17);
        const tierBot = tierTop + R * 1.08;
        const cxk = p.x + lean * (1 - k * 0.28);
        return 'M' + cxk.toFixed(1) + ' ' + tierTop.toFixed(1) +
          ' L' + (cxk - tierW).toFixed(1) + ' ' + tierBot.toFixed(1) +
          ' L' + (cxk + tierW).toFixed(1) + ' ' + tierBot.toFixed(1) + ' Z';
      }) : null,
      c1x: (p.x + lean).toFixed(1), c1y: (topY + R * 0.1).toFixed(1),
      c1rx: R.toFixed(1), c1ry: (R * (sp === 'birch' ? 1.15 : 0.78)).toFixed(1),
      c2x: (p.x + lean - R * 0.62).toFixed(1), c2y: (topY + R * 0.46).toFixed(1),
      c2rx: (R * 0.66).toFixed(1), c2ry: (R * (sp === 'birch' ? 0.8 : 0.54)).toFixed(1),
      c3x: (p.x + lean + R * 0.66).toFixed(1), c3y: (topY + R * 0.38).toFixed(1),
      c3rx: (R * 0.6).toFixed(1), c3ry: (R * (sp === 'birch' ? 0.74 : 0.5)).toFixed(1),
      // Pine reads darkest, birch lightest — the same tonal separation the
      // Naming panel's own three trees use.
      crown: far ? (sp === 'pine' ? '#7E9E92' : '#8FAEA0')
        : (sp === 'pine' ? '#234A3E' : (sp === 'birch' ? '#5E8C77'
          : (tr.crown > 0.62 ? '#2E5A4A' : (tr.crown > 0.3 ? '#3A6B5A' : '#47775F')))),
      crown2: far ? (sp === 'pine' ? '#93AEA4' : '#A3BEB1')
        : (sp === 'pine' ? '#1B3A31' : (sp === 'birch' ? '#4F7D68'
          : (tr.crown > 0.62 ? '#234A3E' : (tr.crown > 0.3 ? '#31604F' : '#3C6B55')))),
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
    const shapes = [];
    wfBuildSet(s, i, shapes);
    if (shapes.length) setPieces.push({ id: s.id, d, op: op.toFixed(2), shapes });
  });
  setPieces.sort((a, b) => b.d - a.d);

  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const atStop = Math.abs(WF.cam - camIndex) < 0.3 ? ACTIVITIES[camIndex] : null;
  const atId = atStop ? atStop.id : '';
  const seated = atId === 'soundscape' || atId === 'sitspot' || atId === 'campfire';
  const hidden = atId === 'hammock';
  const shoeless = atId === 'barefoot';

  // Barefoot's one scripted moment: the walker crouches, a shoe comes
  // off, then it stands and resumes — not just the instant footFill
  // colour swap `shoeless` alone gives it. Timed off elapsed time since
  // arrival (WF.barefootAt), the same convention WF.holdEnd/WF_DWELL_MS
  // already use elsewhere, so it plays once per visit regardless of
  // repaint cadence. Cleared (WF.barefootAt = null) the moment the
  // camera leaves this station — see wfGoBack()/wfGoNext()/wfRestart(),
  // which all reset WF.cam away from here — so a manual skip mid-
  // sequence can't leave the walker stuck crouched once the camera has
  // actually moved on to somewhere else.
  // null (not the string 'stand') outside barefoot, so wfCharacterSVG()
  // can tell "standing normally, elsewhere" apart from "standing at
  // barefoot, sequence finished" — both would otherwise read as the same
  // 'stand' value, and the walker would show a phantom shoe at every
  // other station too.
  let barefootPhase = null;
  if (shoeless && !WF.reduced) {
    // wfEnterScene() never starts the rAF loop when WF.reduced is true,
    // so wfStep() (the only thing that keeps this ticking forward once
    // the camera stops moving — see its own barefootTicking comment)
    // never runs either: the sequence would render once, on whatever
    // single synchronous call happens to trigger it, and then freeze
    // there indefinitely. Skipping straight to the settled end state
    // is the same choice wfGoBack()/wfGoNext()/wfRestart() already make
    // for the camera move itself under reduced motion — jump to the
    // result, don't play a transition nothing will advance.
    if (WF.barefootAt == null) WF.barefootAt = now;
    const elapsed = now - WF.barefootAt;
    if (elapsed < 900) barefootPhase = 'crouch-in';
    else if (elapsed < 2400) barefootPhase = 'crouch';
    else if (elapsed < 3300) barefootPhase = 'crouch-out';
    else barefootPhase = 'stand';
  } else {
    WF.barefootAt = null;
  }

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
  // wfPersonHeight(1) — the walker is the scale=1 reference every WF_CAST
  // figure's own height (wfBuildCast()) is now calibrated against; see
  // that function's comment.
  const charH = wfPersonHeight(1);

  // Funder credit "sun": grows and brightens as the walk approaches its
  // final stop, reusing the same distance→scale falloff wfProject() uses
  // for trees/pins (closer = bigger) — computed directly rather than via
  // wfProject() itself, since the sun stays fixed in the sky rather than
  // following the trail's lateral curve or migrating toward the ground
  // plane the way ground-level objects do as they scale up.
  const sunD = (ACTIVITIES.length - 1) - WF.cam;
  const sunZ = 1 + Math.max(sunD, -0.85) * 0.66;
  const sunScale = 1 / Math.max(sunZ, 0.18);
  const sunT = Math.max(0, Math.min(1, (sunScale - 0.08) / (0.6 - 0.08)));
  const sunOpacity = (0.86 + sunT * 0.14).toFixed(2);
  const sunWidth = Math.round((narrow ? 110 : 150) * (0.85 + sunT * 0.5));
  const sunGlow = (8 + sunT * 16).toFixed(0);

  return {
    trailD, farTrees, nearTrees, dapples, shrubs, stops, rail, setPieces,
    narrow, walking, sunOpacity, sunWidth, sunGlow,
    stepLabel: t('walk.stop') + ' ' + (camIndex + 1) + ' ' + t('walk.of') + ' ' + ACTIVITIES.length,
    status,
    useArtSlot: false, poseStand: !seated, poseSeated: seated,
    footFill: shoeless ? '#C9A88A' : '#14302A',
    barefootPhase,
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

// (WF_STOP_SIDE moved to the top of this file — wfLatFor()/WF_CLEARINGS
// both derive their side from it, so it has to be defined before them.)

function wfEsc(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wfTreeMarkup(tr, hint) {
  // Distant trees get a deliberately cheap body: trunk plus a single crown
  // shape, no ground shadow, no bark detail, no tiering, and crucially no
  // wf-sway wrapper. At that size none of it resolves to more than a pixel
  // or two, but it was costing 7-11 SVG nodes and one live CSS animation
  // per tree — and the whole geo layer is rebuilt by innerHTML on every
  // repaint while the camera moves, so that per-tree cost is paid ~30x a
  // second. Measured on a 1280x800 viewport this was the difference
  // between a ~12fps walk and a smooth one.
  if (tr.far) {
    return '<g opacity="' + tr.op + '"><path d="' + tr.trunkD + '" fill="' + tr.bark + '"/>' +
      '<ellipse cx="' + tr.c1x + '" cy="' + tr.c1y + '" rx="' + tr.c1rx + '" ry="' + tr.c1ry +
      '" fill="' + tr.crown + '"/></g>';
  }
  // Trunk, plus birch's dark bark scars where the species calls for them.
  let trunk = '<path d="' + tr.trunkD + '" fill="' + tr.bark + '"/>';
  if (tr.barkMarks) {
    trunk += tr.barkMarks.map(m =>
      '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="#3E4A42" opacity="0.55"/>'
    ).join('');
  }
  // Crown: a pine's stacked triangular tiers, or the broad ellipse cluster
  // oak and birch share (birch's is stretched tall and narrow by its own
  // ry multipliers in wfComputeFrame(), giving the slim upright crown
  // without needing separate geometry here).
  const crown = tr.tiers
    ? tr.tiers.map((d, i) => '<path d="' + d + '" fill="' + (i === 2 ? tr.crown : tr.crown2) + '"/>').join('')
    : '<ellipse cx="' + tr.c2x + '" cy="' + tr.c2y + '" rx="' + tr.c2rx + '" ry="' + tr.c2ry + '" fill="' + tr.crown2 + '"/>' +
      '<ellipse cx="' + tr.c3x + '" cy="' + tr.c3y + '" rx="' + tr.c3rx + '" ry="' + tr.c3ry + '" fill="' + tr.crown2 + '"/>' +
      '<ellipse cx="' + tr.c1x + '" cy="' + tr.c1y + '" rx="' + tr.c1rx + '" ry="' + tr.c1ry + '" fill="' + tr.crown + '"/>';
  return '<g opacity="' + tr.op + '"><ellipse cx="' + tr.cx + '" cy="' + tr.by + '" rx="' + tr.shRx + '" ry="' + tr.shRy + '" fill="#3A2E22" opacity="0.13"/>' +
    trunk +
    '<g class="wf-sway" style="' + tr.swayStyle + '">' + crown + '</g></g>';
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
  // The barefoot station's one scripted beat: a shoe, set down beside the
  // left foot, appears once the crouch has settled (not during crouch-in
  // — it would read as dropping mid-motion) and then just stays there —
  // a shoe left on the ground once it's off, rather than a shape that
  // needs to be caught disappearing again on some later frame no one is
  // forcing a repaint for once WF.mode goes back to a plain 'hold' (see
  // wfStep()'s barefootTicking window, which stops forcing repaints
  // shortly after this same boundary). The wrapping <g>'s own crouch
  // transform (wfRender()'s charWrap style) is what actually lowers the
  // whole figure to reach it — this shape only needs its own resting
  // position beside the foot, not a fall/removal arc of its own.
  const showShoe = frame.barefootPhase === 'crouch' || frame.barefootPhase === 'crouch-out' || frame.barefootPhase === 'stand';
  const shoe = showShoe
    ? '<g transform="translate(15 143) rotate(-18)"><ellipse cx="0" cy="0" rx="7.5" ry="4" fill="#6B5240"/><path d="M-6 0 q0 -4.5 5 -4.5 l4 0 q3 0 3 3" fill="none" stroke="#5B4636" stroke-width="1.4" stroke-linecap="round"/></g>'
    : '';
  return '<svg viewBox="0 0 64 148" style="width:100%;height:100%;display:block;overflow:visible" aria-hidden="true">' +
    '<ellipse cx="32" cy="143" rx="17" ry="4.5" fill="#3A2E22" opacity="0.22"/>' +
    '<g class="' + legB + '"><rect x="12" y="46" width="5.5" height="36" rx="2.75" fill="#14302A" opacity="0.68"/></g>' +
    '<g class="' + legA + '"><rect x="46" y="46" width="5.5" height="36" rx="2.75" fill="#14302A" opacity="0.68"/></g>' +
    '<g class="' + shinA + '"><rect x="23" y="92" width="6.5" height="46" rx="3.25" fill="#14302A" opacity="0.78"/><ellipse cx="26.2" cy="140" rx="5.4" ry="3.4" fill="' + frame.footFill + '"/></g>' +
    '<g class="' + shinB + '"><rect x="34" y="92" width="6.5" height="46" rx="3.25" fill="#14302A" opacity="0.78"/><ellipse cx="37.2" cy="140" rx="5.4" ry="3.4" fill="' + frame.footFill + '"/></g>' +
    shoe +
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

// ───────── persistent scene DOM ─────────
// The scene used to be rebuilt with a single `WF.el.innerHTML = html` per
// painted frame. That is what made the graphics flash. While the camera is
// moving wfStep() repaints ~30x/second, and a wholesale innerHTML write
// throws away and re-creates every element in the scene — including every
// element carrying a CSS animation. A CSS animation restarts from its 0%
// keyframe whenever its element is newly inserted, so across the whole 12s
// of a move the drifting clouds, light shafts, dust motes, sun drift, pin
// pings, arrival chips and the walker's own leg cycle never advanced past
// their first frame: they were reset ~30x/second and strobed in place
// instead of animating. (The funder logo <img> was re-created at that rate
// too, and every pin was destroyed out from under the pointer mid-move —
// the same class of breakage the "only repaint while moving" guard in
// wfStep() already works around while the camera is at rest.)
//
// So the scene is built once, into stable nodes cached on WF.dom, and each
// painted frame writes only the values that actually changed. The two
// geometry <svg>s — the trail/tree projection and the per-stop set
// dressing — genuinely differ every frame and still have their innards
// replaced wholesale; the only CSS animation inside either is the tree
// sway, which is imperceptible while the trees are being re-projected and
// runs uninterrupted at rest, when no repaints happen at all.
function wfSkeletonHTML() {
  return '' +
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
    // Funder credit (Interreg North-West Europe / Forest4Youth), sitting
    // up in the sky band like a sun — horizontally fixed regardless of
    // trail position, painted before the trees so their canopies
    // naturally sit in front of it where they overlap, same as the
    // sky/cloud layers above it. Grows and brightens as the walk nears
    // its end (frame.sunOpacity/sunWidth, computed in wfComputeFrame()) —
    // a soft warm drop-shadow (frame.sunGlow) stands in for actual
    // sunlight, since the logo itself is flat art with no glow of its own.
    // The centering transform lives on this wrapper, not the <img>, so
    // .wf-sun's own idle-drift animation (styles-walk-forest.css) can
    // freely animate the <img>'s transform without a CSS animation and an
    // inline style fighting over the same property on the same element.
    '<div data-wf="sun-wrap" style="position:absolute;left:50%;transform:translateX(-50%)">' +
      '<img src="assets/logo-interreg-forest4youth.png" alt="" data-wf="sun" class="wf-sun" style="display:block;height:auto;pointer-events:none" />' +
    '</div>' +
    '<div style="position:absolute;left:0;right:0;top:47%;bottom:0;background:linear-gradient(180deg,#B9BA9C 0%,#A9AA8E 38%,#9B9C79 100%)"></div>' +
    '<div style="position:absolute;left:0;right:0;top:40%;height:7.5%;background:#B4C8BC;opacity:.7;filter:blur(3px)"></div>' +
    '<div style="position:absolute;left:0;right:0;top:44.5%;height:5%;background:#C8D8D0;opacity:.8;filter:blur(2px)"></div>' +
    '<svg data-wf="geo" style="position:absolute;inset:0;width:100%;height:100%;display:block" role="img" aria-label=""></svg>' +
    '<div style="position:absolute;left:-4%;bottom:-6%;width:26%;height:22%;background:#22463A;opacity:.82;clip-path:ellipse(58% 54% at 26% 92%);pointer-events:none;z-index:200"></div>' +
    '<div style="position:absolute;left:6%;bottom:-8%;width:15%;height:15%;background:#2E5A4A;opacity:.8;clip-path:ellipse(52% 52% at 44% 90%);pointer-events:none;z-index:200"></div>' +
    '<div style="position:absolute;right:-4%;bottom:-6%;width:22%;height:19%;background:#22463A;opacity:.8;clip-path:ellipse(56% 54% at 72% 94%);pointer-events:none;z-index:200"></div>' +
    '<div class="wf-mote" style="position:absolute;left:32%;top:52%;width:5px;height:5px;border-radius:50%;background:#FBF9F4;opacity:.6;pointer-events:none"></div>' +
    '<div class="wf-mote" style="position:absolute;left:58%;top:60%;width:4px;height:4px;border-radius:50%;background:#FBF9F4;opacity:.5;animation-delay:3.4s;pointer-events:none"></div>' +
    '<div class="wf-mote" style="position:absolute;left:71%;top:47%;width:6px;height:6px;border-radius:50%;background:#FBF9F4;opacity:.45;animation-delay:6.8s;pointer-events:none"></div>' +
    '<svg data-wf="set" style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:150" aria-hidden="true"></svg>' +
    '<div data-wf="char-wrap" style="position:absolute;left:50%;transform:translateX(-58%);z-index:320;pointer-events:none;transition:opacity .6s">' +
      '<div class="wf-bob" data-wf="char-bob" style="width:100%;height:100%;position:relative"></div>' +
    '</div>' +
    // Zero-size, statically positioned host: the pins inside it are
    // absolute and this box establishes neither a containing block nor a
    // stacking context, so each pin still resolves its left/top and its
    // z-index against .wf-blur-layer exactly as it did when they were
    // emitted as loose siblings here.
    '<div data-wf="pins"></div>' +
    '<div class="wf-title-chip"><div class="wf-title-chip-main" data-wf="title-main"></div><div class="wf-title-chip-sub" data-wf="title-sub"></div></div>' +
    '<div data-wf="narrow-bar" style="position:absolute;left:0;right:0;bottom:0;height:70px;background:rgba(244,241,234,0.92);border-top:1px solid #DCD6C8;pointer-events:none;display:none"></div>' +
    '<div class="wf-controls" data-wf="controls" style="left:20px">' +
      '<button type="button" class="wf-ctrl-btn" data-wf="btn-back" onclick="wfGoBack()">' +
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg></button>' +
      '<button type="button" class="wf-ctrl-btn" data-wf="btn-restart" onclick="wfRestart()">' +
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5V5h-2.5"/></svg></button>' +
      '<button type="button" class="wf-ctrl-btn" data-wf="btn-next" onclick="wfGoNext()">' +
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg></button>' +
      '<div class="wf-status-pill" data-wf="status"></div>' +
    '</div>' +
    // Narrow mode: below both the character (whose feet land ~47px above
    // the viewport bottom) and the control buttons (bottom:16px above) —
    // sitting in the ~16px margin already unused below them, rather than
    // mid-screen where it used to cut across the character's body.
    '<div class="wf-rail" data-wf="rail"></div>' +
    // Narrow-mode top offset (160px) clears the site's own persistent
    // header, which wraps to ~150px tall on phone widths — #wf-scene is a
    // fixed viewport-relative layer (see index.html) behind every screen,
    // so this and the title chip above both need to duck under it
    // explicitly rather than assuming they start below it.
    '<a href="#implement/mod-pocket" class="wf-list-link" data-wf="list-link"></a>' +
    '</div>';
}

function wfBuildScene() {
  if (WF.dom && WF.dom.root === WF.el && WF.el.firstChild) return;
  WF.el.innerHTML = wfSkeletonHTML();
  const q = (name) => WF.el.querySelector('[data-wf="' + name + '"]');
  WF.dom = {
    root: WF.el,
    geo: q('geo'), set: q('set'),
    sunWrap: q('sun-wrap'), sun: q('sun'),
    charWrap: q('char-wrap'), charBob: q('char-bob'),
    pins: q('pins'), pinById: new Map(),
    setById: new Map(),
    titleMain: q('title-main'), titleSub: q('title-sub'),
    narrowBar: q('narrow-bar'),
    controls: q('controls'), status: q('status'),
    btnBack: q('btn-back'), btnRestart: q('btn-restart'), btnNext: q('btn-next'),
    rail: q('rail'), listLink: q('list-link'),
    // Last value written for each keyed slot below. Re-writing an
    // identical attribute still costs a style recalc, and this runs
    // ~30x/second, so every write goes through wfSet().
    last: {},
  };
}

function wfSet(key, value, apply) {
  const last = WF.dom.last;
  if (last[key] === value) return;
  last[key] = value;
  apply(value);
}

const WF_SVG_NS = 'http://www.w3.org/2000/svg';

function wfMakePin(id) {
  const wrap = document.createElement('div');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'wf-pin-btn';
  btn.onclick = () => wfOpenStop(id);
  const disc = document.createElement('div');
  disc.className = 'wf-pin-disc';
  const glyph = document.createElementNS(WF_SVG_NS, 'svg');
  glyph.setAttribute('viewBox', '0 0 32 32');
  glyph.setAttribute('fill', 'none');
  glyph.setAttribute('stroke-width', '1.9');
  glyph.setAttribute('stroke-linecap', 'round');
  glyph.setAttribute('stroke-linejoin', 'round');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.style.display = 'block';
  const path = document.createElementNS(WF_SVG_NS, 'path');
  glyph.appendChild(path);
  disc.appendChild(glyph);
  btn.appendChild(disc);
  wrap.appendChild(btn);
  return { wrap, btn, disc, glyph, path, ping: null, chip: null, chipName: null, chipSub: null, last: {} };
}

function wfMakePing() {
  const svg = document.createElementNS(WF_SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;inset:-120%;width:340%;height:340%;overflow:visible;pointer-events:none');
  const circle = document.createElementNS(WF_SVG_NS, 'circle');
  circle.setAttribute('class', 'wf-ping');
  circle.setAttribute('cx', '60');
  circle.setAttribute('cy', '60');
  circle.setAttribute('r', '18');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'var(--ember)');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);
  return svg;
}

function wfMakeChip() {
  const chip = document.createElement('div');
  chip.className = 'wf-pin-chip';
  const name = document.createElement('div');
  name.className = 'wf-pin-chip-name';
  const sub = document.createElement('div');
  sub.className = 'wf-pin-chip-sub';
  chip.appendChild(name);
  chip.appendChild(sub);
  return { chip, name, sub };
}

// Pins are reconciled by stop id rather than re-emitted, so a pin that is
// on screen for several seconds is the *same* element throughout. That is
// what lets .wf-ping keep looping and .wf-pin-chip play its one-shot
// wfChipFloat exactly once — and it keeps the button under the pointer
// alive across a move, so a click on a pin lands even mid-walk.
function wfSyncPins(frame) {
  const byId = WF.dom.pinById;
  const seen = new Set();
  frame.stops.forEach(st => {
    seen.add(st.id);
    let p = byId.get(st.id);
    if (!p) {
      p = wfMakePin(st.id);
      byId.set(st.id, p);
      WF.dom.pins.appendChild(p.wrap);
    }
    const L = p.last;
    const wrapCss = 'position:absolute;left:' + st.pinLeft + 'px;top:' + st.pinTop + 'px;width:0;height:0;z-index:' + st.z;
    if (L.wrap !== wrapCss) { p.wrap.setAttribute('style', wrapCss); L.wrap = wrapCss; }
    const btnCss = 'left:' + (-st.hit / 2).toFixed(1) + 'px;top:' + (-st.size / 2 - st.hit / 2).toFixed(1) +
      'px;width:' + st.hit.toFixed(1) + 'px;height:' + st.hit.toFixed(1) + 'px';
    if (L.btn !== btnCss) { p.btn.setAttribute('style', btnCss); L.btn = btnCss; }
    if (L.aria !== st.aria) { p.btn.setAttribute('aria-label', st.aria); L.aria = st.aria; }
    const expanded = String(st.expanded);
    if (L.expanded !== expanded) { p.btn.setAttribute('aria-expanded', expanded); L.expanded = expanded; }
    const discCss = 'width:' + st.size.toFixed(1) + 'px;height:' + st.size.toFixed(1) +
      'px;border-color:' + (st.armed ? '#B8552E' : '#FBF9F4');
    if (L.disc !== discCss) { p.disc.setAttribute('style', discCss); L.disc = discCss; }
    const glyphSize = (st.size * 0.56).toFixed(1) + 'px';
    if (L.glyphSize !== glyphSize) {
      p.glyph.style.width = glyphSize;
      p.glyph.style.height = glyphSize;
      L.glyphSize = glyphSize;
    }
    if (L.color !== st.color) { p.glyph.setAttribute('stroke', st.color); L.color = st.color; }
    if (L.glyph !== st.glyph) { p.path.setAttribute('d', st.glyph); L.glyph = st.glyph; }

    if (st.armed && !p.ping) { p.ping = wfMakePing(); p.disc.appendChild(p.ping); }
    else if (!st.armed && p.ping) { p.ping.remove(); p.ping = null; }

    if (st.showChip && !p.chip) {
      const made = wfMakeChip();
      p.chip = made.chip; p.chipName = made.name; p.chipSub = made.sub;
      L.chipCss = L.chipName = L.chipSub = null;
      p.wrap.appendChild(p.chip);
    } else if (!st.showChip && p.chip) {
      p.chip.remove();
      p.chip = p.chipName = p.chipSub = null;
    }
    if (p.chip) {
      if (L.chipCss !== st.chipStyle) { p.chip.setAttribute('style', st.chipStyle); L.chipCss = st.chipStyle; }
      if (L.chipName !== st.name) { p.chipName.textContent = st.name; L.chipName = st.name; }
      if (L.chipSub !== st.sub) { p.chipSub.textContent = st.sub; L.chipSub = st.sub; }
    }
  });
  byId.forEach((p, id) => {
    if (seen.has(id)) return;
    p.wrap.remove();
    byId.delete(id);
  });
}

function wfSyncRail(frame) {
  const host = WF.dom.rail;
  while (host.children.length > frame.rail.length) host.lastChild.remove();
  while (host.children.length < frame.rail.length) host.appendChild(document.createElement('div'));
  for (let i = 0; i < frame.rail.length; i++) {
    const el = host.children[i];
    const rn = frame.rail[i];
    if (el.getAttribute('style') !== rn.style) el.setAttribute('style', rn.style);
    if (el.getAttribute('title') !== rn.title) el.setAttribute('title', rn.title);
  }
}

// Per-station set dressing (props via wfBuildProps, figures via
// wfBuildCast) used to be one string joined into frame.setLayer and
// written with `d.set.innerHTML = frame.setLayer` — a wholesale replace,
// same as the rest of the scene used to be before the persistent-DOM
// refactor. It stayed that way through that refactor because at the time
// nothing inside it was animated with anything that needed to survive a
// repaint. Now that stations get real ambient/gesture animation (wfFlick,
// wfBreath, wfHang, wfPeg, wf-sway, and the new gesture classes), the same
// bug applies here: frame.setPieces' shape coordinates are a function of
// WF.cam, so the string changed on nearly every repaint while the camera
// was travelling, and every CSS animation on every prop/figure reset to
// 0% on nearly every tick — it only ever played correctly during a
// station's ~10s hold, never during the 2-12s approach or departure.
//
// wfSyncSet() below reconciles the set-dressing SVG exactly the way
// wfSyncPins() reconciles pins: one persistent <g> per visible station
// (there's normally exactly one, briefly two during a handoff — see the
// fade-window comment in wfComputeFrame()), and inside it, one persistent
// element per shape descriptor, updated in place by wfSyncShapes(). No
// animated node is ever destroyed and recreated while it's still visible,
// so its CSS animation timeline keeps running through camera movement.
function wfMakeShapeNode(desc) {
  const el = document.createElementNS(WF_SVG_NS, desc.tag);
  if (desc.cls) el.setAttribute('class', desc.cls);
  return el;
}

// Reconciles a flat list of shape descriptors into `host`'s children,
// keyed by `desc.key`. Descriptors that share the same `desc.group.key`
// get one shared persistent <g> wrapper between them (for shapes that must
// move together as one rigid unit — a hammock's cloth + its edge stroke,
// a tree crown's three lobes) rather than each carrying its own class;
// `cache` is a Map from shape key to {el, last} and from group key to
// {g, children: Set, last}, reused across calls so identity survives.
function wfSyncShapes(host, shapes, cache) {
  const seenShapes = new Set();
  const seenGroups = new Set();
  shapes.forEach(desc => {
    let parent = host;
    if (desc.group) {
      const gk = desc.group.key;
      seenGroups.add(gk);
      let gEntry = cache.get(gk);
      if (!gEntry) {
        const g = document.createElementNS(WF_SVG_NS, 'g');
        gEntry = { isGroup: true, el: g, last: {} };
        cache.set(gk, gEntry);
        host.appendChild(g);
      }
      if (gEntry.last.cls !== desc.group.cls) {
        if (desc.group.cls) gEntry.el.setAttribute('class', desc.group.cls); else gEntry.el.removeAttribute('class');
        gEntry.last.cls = desc.group.cls;
      }
      if (desc.group.style !== undefined && gEntry.last.style !== desc.group.style) {
        gEntry.el.setAttribute('style', desc.group.style || '');
        gEntry.last.style = desc.group.style;
      }
      parent = gEntry.el;
    }
    seenShapes.add(desc.key);
    let entry = cache.get(desc.key);
    if (!entry || entry.el.parentNode !== parent) {
      if (entry) entry.el.remove();
      const el = wfMakeShapeNode(desc);
      entry = { el, last: {} };
      cache.set(desc.key, entry);
      parent.appendChild(el);
    }
    const el = entry.el, last = entry.last;
    if (!desc.group && last.cls !== desc.cls) {
      if (desc.cls) el.setAttribute('class', desc.cls); else el.removeAttribute('class');
      last.cls = desc.cls;
    }
    if (desc.style !== undefined && last.style !== desc.style) {
      el.setAttribute('style', desc.style || '');
      last.style = desc.style;
    }
    for (const k in desc.attrs) {
      const v = desc.attrs[k];
      if (last[k] !== v) { el.setAttribute(k, v); last[k] = v; }
    }
    if (desc.text !== undefined && last.text !== desc.text) {
      el.textContent = desc.text; last.text = desc.text;
    }
  });
  cache.forEach((entry, key) => {
    if (entry.isGroup) { if (!seenGroups.has(key)) { entry.el.remove(); cache.delete(key); } return; }
    if (seenShapes.has(key)) return;
    entry.el.remove();
    cache.delete(key);
  });
}

function wfSyncSet(frame) {
  const byId = WF.dom.setById;
  const seen = new Set();
  let prevG = null;
  frame.setPieces.forEach(piece => {
    seen.add(piece.id);
    let entry = byId.get(piece.id);
    if (!entry) {
      const g = document.createElementNS(WF_SVG_NS, 'g');
      entry = { g, shapes: new Map(), lastOp: null };
      byId.set(piece.id, entry);
      WF.dom.set.appendChild(g);
    } else if (entry.g.previousElementSibling !== prevG) {
      // Reorder only a piece that's actually out of position — even
      // re-appendChild-ing an element that's already exactly where it
      // belongs still counts as a remove-then-insert per the DOM spec,
      // and that resets any running CSS animation on it (confirmed:
      // getAnimations()[0].currentTime drops to 0 on a same-parent,
      // same-position re-append). With normally exactly one piece
      // visible — see the fade-window comment in wfComputeFrame() — this
      // check means the overwhelmingly common case never touches the
      // node at all. It only actually moves something during the brief
      // handoff window where two stations overlap and their near/far
      // order has flipped since the last frame.
      WF.dom.set.appendChild(entry.g);
    }
    prevG = entry.g;
    if (entry.lastOp !== piece.op) { entry.g.setAttribute('opacity', piece.op); entry.lastOp = piece.op; }
    wfSyncShapes(entry.g, piece.shapes, entry.shapes);
  });
  byId.forEach((entry, id) => {
    if (seen.has(id)) return;
    entry.g.remove();
    byId.delete(id);
  });
}

function wfRender() {
  if (!WF.el) return;
  wfBuildScene();
  // wfMeasure() is deliberately NOT called here. It reads
  // clientWidth/clientHeight, which forces the browser to synchronously
  // flush any pending layout — including every DOM write this same
  // function just made last frame (the geo layer's innerHTML, style
  // attributes, etc.). Doing that on every repaint (~30x/sec while the
  // camera moves) measured at ~38ms of the ~80ms wfRender was costing —
  // more than the actual rendering work. WF.w/WF.h only change on an
  // actual viewport resize, so they're measured once on scene-enter and
  // again only from the resize handler (wfEnterScene/WF.onResize) — see
  // wfMeasure()'s own comment.
  // Learn each station's raw lateral range from its own builders, once,
  // before the first frame that positions anything — wfLatFor() needs it
  // and wfMeasure() (called once on scene-enter, before this) has already
  // established WF.w/WF.h that the builders project against.
  if (!WF.latPrimed) { WF.latPrimed = true; wfPrimeLatExtents(); }
  const frame = wfComputeFrame();
  const d = WF.dom;

  const sceneSvg = '' +
    '<g>' + frame.farTrees.map(tr => wfTreeMarkup(tr)).join('') + '</g>' +
    '<g>' + frame.shrubs.map(sh => '<g opacity="' + sh.op + '"><ellipse cx="' + sh.cx + '" cy="' + sh.cy + '" rx="' + sh.rx + '" ry="' + sh.ry + '" fill="' + sh.fill + '"/><ellipse cx="' + sh.cx2 + '" cy="' + sh.cy2 + '" rx="' + sh.rx2 + '" ry="' + sh.ry2 + '" fill="' + sh.fill + '"/></g>').join('') + '</g>' +
    '<path d="' + frame.trailD + '" fill="#D8CDAF"/>' +
    '<g>' + frame.dapples.map(dp => '<ellipse cx="' + dp.cx + '" cy="' + dp.cy + '" rx="' + dp.rx + '" ry="' + dp.ry + '" fill="#F2EBD8" opacity="' + dp.op + '"/>').join('') + '</g>' +
    '<g>' + frame.nearTrees.map(tr => wfTreeMarkup(tr)).join('') + '</g>';

  wfSet('geo', sceneSvg, v => { d.geo.innerHTML = v; });
  wfSyncSet(frame);
  wfSet('geoLabel', t('walk.title'), v => d.geo.setAttribute('aria-label', v));
  wfSet('sunAlt', t('walk.funder'), v => d.sun.setAttribute('alt', v));

  wfSet('sunWrap',
    'position:absolute;left:50%;top:' + (frame.narrow ? 195 : 225) + 'px;transform:translateX(-50%)',
    v => d.sunWrap.setAttribute('style', v));
  wfSet('sunImg',
    'display:block;width:' + frame.sunWidth + 'px;height:auto;opacity:' + frame.sunOpacity +
    ';filter:drop-shadow(0 0 ' + frame.sunGlow + 'px rgba(255,241,196,0.35));pointer-events:none',
    v => d.sun.setAttribute('style', v));

  // Barefoot's crouch is a CSS *transition* on this wrapper's own
  // transform (scaleY, anchored bottom-center so the feet stay put and
  // the figure visibly sinks/rises), not a keyframe loop — it only needs
  // to play once each way, triggered by the target value actually
  // changing between two consecutive writes. That only works because
  // d.charWrap itself is never destroyed and recreated (wfSet() here
  // only ever calls setAttribute('style', ...) on the same persistent
  // node) — see wfSyncSet()'s own comment for what happens to a running
  // animation/transition when a node IS torn down mid-flight instead.
  const crouched = frame.barefootPhase === 'crouch-in' || frame.barefootPhase === 'crouch';
  wfSet('charWrap',
    'position:absolute;left:50%;bottom:' + (WF.h * 0.055).toFixed(0) + 'px;transform-origin:center bottom;' +
    'transform:translateX(-58%)' + (crouched ? ' scaleY(0.8)' : '') + ';width:' +
    (frame.charH * 0.52).toFixed(0) + 'px;height:' + frame.charH.toFixed(0) +
    'px;z-index:320;pointer-events:none;transition:opacity .6s, transform .5s ease-in-out;opacity:' + (frame.hidden ? 0 : 1),
    v => d.charWrap.setAttribute('style', v));
  // Re-draw the walker only when its pose actually changes. The leg cycle
  // is a CSS animation on the <g>s inside this SVG, so re-emitting it every
  // frame is precisely what used to freeze the walk mid-stride. barefoot
  // Phase is included so the shoe shape (wfCharacterSVG()) appears/
  // disappears exactly on the phase boundaries that need a redraw, not
  // continuously through the sequence.
  wfSet('char', (frame.poseSeated ? 'sit' : 'stand') + '|' + frame.walking + '|' + frame.footFill + '|' + frame.barefootPhase,
    () => { d.charBob.innerHTML = wfCharacterSVG(frame); });

  wfSyncPins(frame);

  wfSet('titleMain', t('walk.title'), v => { d.titleMain.textContent = v; });
  wfSet('titleSub', frame.stepLabel, v => { d.titleSub.textContent = v; });
  wfSet('narrowBar', frame.narrow, v => { d.narrowBar.style.display = v ? 'block' : 'none'; });
  wfSet('controls', 'left:20px;bottom:' + (frame.narrow ? 16 : 20) + 'px',
    v => d.controls.setAttribute('style', v));
  wfSet('status', frame.status, v => { d.status.textContent = v; });
  wfSet('backLabel', t('walk.back'), v => {
    d.btnBack.setAttribute('aria-label', v); d.btnBack.setAttribute('title', v);
  });
  wfSet('restartLabel', t('walk.restart'), v => {
    d.btnRestart.setAttribute('aria-label', v); d.btnRestart.setAttribute('title', v);
  });
  wfSet('nextLabel', t('walk.next'), v => {
    d.btnNext.setAttribute('aria-label', v); d.btnNext.setAttribute('title', v);
  });

  wfSyncRail(frame);
  wfSet('rail', frame.narrow ? 'left:50%;transform:translateX(-50%);bottom:2px' : 'right:20px;bottom:66px',
    v => d.rail.setAttribute('style', v));
  wfSet('listLink', frame.narrow ? 'right:14px;top:220px' : 'right:20px;bottom:22px',
    v => d.listLink.setAttribute('style', v));
  wfSet('listLinkText', t('walk.listlink'), v => { d.listLink.textContent = v; });

  // Rendered into its own body-level root, not inside #wf-scene — see the
  // #wf-panel-root comment in styles-walk-forest.css for why (z-index on a
  // descendant of #wf-scene can't out-rank .container/the header).
  wfSet('panel', frame.isOpen ? wfPanelHTML(frame) : '', v => {
    const panelRoot = document.getElementById('wf-panel-root');
    if (panelRoot) panelRoot.innerHTML = v;
  });
}

// Reads the scene's actual box size. Deliberately called only on scene
// entry and on an actual window resize (see WF.onResize below) — NOT from
// inside wfRender()'s per-frame path. clientWidth/clientHeight are
// layout-dependent reads that force the browser to synchronously flush
// any pending style/DOM mutations first; calling this every repaint while
// the camera moves (~30x/sec) was measured forcing ~38ms of layout work
// per frame, more than the rest of wfRender() combined.
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
  WF.onResize = () => { wfMeasure(); wfRender(); };
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
  // The scene's nodes survive an off/on cycle, but the panel root above is
  // emptied behind wfRender()'s back, so drop the memo of what was last
  // written — otherwise switching back on with a stop still open would see
  // an unchanged panel string and skip re-rendering it.
  if (WF.dom) WF.dom.last = {};
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
