// ─── Trail world: geometry, depth model, figure rig, station layout ───
//
// This file is data and pure functions only — no DOM, no side effects — so
// test/trail-lint.js can load it into a vm context and check every law
// numerically without a browser (same technique as test/unit.js).
//
// THE ONE RULE: every element in this world carries exactly one spatial
// number, `depth`. Scale, parallax speed, ground contact and haze are all
// derived from it — never tuned independently. Lateral apparent velocity is
// proportional to 1/distance, the same as apparent size, so parallax speed
// and scale MUST be the same function. Tuning them apart is what makes a
// layer read as sliding against the world instead of sitting in it.
//
// See .claude/skills/revampnwasd/SKILL.md for the full law table (D1-D6,
// P1-P2, W1-W4, C1-C2) and the verification loop.
'use strict';

// ─── CANVAS ──────────────────────────────────────────────────────────────
// The trail band's SVG viewBox. Wide and short: a side-on slice of forest.
const TRAIL_VIEW_W = 960;
const TRAIL_VIEW_H = 320;

// D1: one horizon for the whole world. Every layer resolves to this line;
// nothing gets its own.
const TRAIL_HORIZON_Y = 96;
// Ground contact for the character's own plane (depth 1).
const TRAIL_BASELINE_Y = 268;
// Ground-to-horizon span at depth 1 — the numerator of the perspective
// divide below.
const TRAIL_GROUND_SPAN = TRAIL_BASELINE_Y - TRAIL_HORIZON_Y; // 172

// ─── DEPTH MODEL ─────────────────────────────────────────────────────────
// depth 1.0 = the character's plane. >1 is farther, <1 is nearer than the
// character (and therefore occludes it).

// D2: scale and parallax speed are the same function. If you change one,
// you have changed the other — that is the point.
function trailScale(depth) {
  return 1 / depth;
}
function trailSpeed(depth) {
  return 1 / depth;
}

// D3: where a given depth's ground line sits on screen. Approaches the
// horizon as depth grows, reaches TRAIL_BASELINE_Y at depth 1.
function trailGroundY(depth) {
  return TRAIL_HORIZON_Y + TRAIL_GROUND_SPAN / depth;
}

// D4: atmospheric perspective. Monotonically non-increasing in depth, and
// clamped at 1 so the near fringe (depth < 1) does not exceed full opacity.
const TRAIL_HAZE_K = 0.35;
function trailHaze(depth) {
  return Math.min(1, 1 / (1 + TRAIL_HAZE_K * (depth - 1)));
}

// ─── LAYERS ──────────────────────────────────────────────────────────────
// Declared far → near. D5: this is also the render order (depth descending),
// so the fringe at depth 0.6 paints over the character at depth 1.
//
// The sky is deliberately NOT in this list: it is a backdrop, not a parallax
// plane, so it has no depth and does not scroll. Giving it a fake depth would
// put a meaningless number through the laws above.
const TRAIL_SKY = { id: 'sky', backdrop: true };

const TRAIL_LAYERS = [
  { id: 'farRidge',  depth: 8   },
  { id: 'midForest', depth: 4   },
  { id: 'nearTrees', depth: 2   },
  { id: 'trail',     depth: 1   }, // the character's plane
  { id: 'fringe',    depth: 0.6 }, // nearer than the character; occludes it
];

// The character's plane, by name rather than by magic number.
const TRAIL_CHARACTER_DEPTH = 1;

// ─── THE CORRIDOR (law C1) ───────────────────────────────────────────────
// In a side-on view, "on the path" is a statement about depth: anything at
// the character's plane is standing in the walkway. So the corridor is a
// depth band reserved for the character and the path surface itself, and
// station props must sit clearly behind it or clearly in front of it.
//
// This is the original "no activity may occupy the pathway" constraint,
// finally expressed as something checkable.
const TRAIL_CORRIDOR_NEAR = 0.85; // props may be at depth <= this
const TRAIL_CORRIDOR_FAR  = 1.15; // ...or >= this. Never between.

// The one legitimate exception: the Barefoot Trail's texture tiles ARE the
// path — grass, soil, bark, moss, stone underfoot. Do not add a second
// entry here; a station that seems to need one is almost certainly placed
// wrong.
const TRAIL_CORRIDOR_EXCEPTIONS = ['barefoot'];

function trailPropClearsCorridor(depth) {
  return depth <= TRAIL_CORRIDOR_NEAR || depth >= TRAIL_CORRIDOR_FAR;
}

// ─── THE FIGURE RIG (laws P1, P2) ────────────────────────────────────────
// One spec for every figure in the app — the trail character and each of the
// 17 illustrations — so the same person appears throughout. All lengths are
// multiples of head diameter `h`.
//
// The head/torso/leg ratios sum to exactly the total height (1.0 + 2.4 + 3.6
// = 7.0), so the figure closes without a fudge factor.
const TRAIL_RIG = {
  totalHeight:   7.0,
  headDiameter:  1.0,
  shoulderWidth: 1.6,
  torsoLength:   2.4,
  armLength:     3.0,
  legLength:     3.6,
  // Limbs are two-segment, so they can bend at knee and elbow instead of
  // stretching. Drawing a leg as one line from hip to foot changes its
  // length through the cycle, which is the other half of why a walk reads
  // as wrong even when the feet do not slide.
  thigh:         1.8,
  shank:         1.8,
  upperArm:      1.4,
  foreArm:       1.6,
  // Stride as a fraction of leg length. Drives cadence via law W1.
  //
  // Bounded from above by reach, not taste: over a stance the planted foot
  // travels 2 * stride * stanceFraction through the body frame, and at the
  // extremes the hip must still be within leg length of the foot. Longer
  // than this and the leg cannot reach without the hip dropping so far that
  // the walk turns into a crouch.
  strideFactor:  0.66,
};

// Hip height while walking, as a fraction of leg length. Below 1 so the
// knee carries a permanent slight bend — a fully extended leg has no
// solution to bend toward and snaps straight.
const TRAIL_HIP_HEIGHT_FACTOR = 0.86;

// Acceptable proportion band for any figure claiming to be this rig.
const TRAIL_RIG_HEADS_MIN = 6.0;
const TRAIL_RIG_HEADS_MAX = 8.0;

// Head diameter in view units for the trail character, giving a figure
// 7 x 16 = 112px tall against the 172px ground-to-horizon span.
const TRAIL_HEAD_DIAMETER = 16;

function trailFigureHeight(headDiameter) {
  return TRAIL_RIG.totalHeight * headDiameter;
}
function trailStrideLength(headDiameter) {
  return TRAIL_RIG.strideFactor * TRAIL_RIG.legLength * headDiameter;
}

// ─── LOCOMOTION (laws W1-W4) ─────────────────────────────────────────────
// Marching forward (W) and walking back (S) are different gaits, not the
// same one mirrored: walking backward uses a visibly shorter stride and a
// lower top speed, which is why each carries its own factor.
// Paired with strideFactor to land the cadence in a human walking range;
// the linter checks the resulting steps/min, since a gait can satisfy the
// no-slide law perfectly and still scurry.
const TRAIL_MARCH_SPEED = 70;        // view units per second, at depth 1
const TRAIL_BACK_SPEED_FACTOR = 0.6; // walking back is slower
const TRAIL_BACK_STRIDE_FACTOR = 0.62;

// Ramps. W eases up to march speed; releasing decays back to a stand.
const TRAIL_ACCEL_TIME = 0.35; // seconds, 0 -> full march
const TRAIL_DECEL_TIME = 0.45; // seconds, full march -> 0

// Fraction of the gait cycle each foot spends planted. Real walking sits
// near 0.6, which gives two double-support windows per cycle and never
// leaves both feet off the ground. Lives here rather than in the engine
// because the reach law below is computed from it.
const TRAIL_STANCE_FRACTION = 0.6;
// How high a swinging foot lifts, in head diameters.
const TRAIL_FOOT_LIFT = 0.22;

// ─── REACH (law P3) ──────────────────────────────────────────────────────
// How far a planted foot travels through the body frame during one stance.
// Over a full cycle the body advances two strides, and the foot is down for
// `stanceFraction` of it, so the foot sweeps 2 * stride * stanceFraction.
function trailFootExcursion(headDiameter) {
  return 2 * trailStrideLength(headDiameter) * TRAIL_STANCE_FRACTION;
}

// How much of the leg's length is usable; the last sliver is left alone
// because at full extension a two-bone solve has no bend direction and the
// knee pops between solutions.
const TRAIL_REACH_MARGIN = 0.985;

// The highest the hip can sit and still be within leg length of a foot
// standing `footX` from it.
function trailMaxHipHeight(headDiameter, footX) {
  const legLen = TRAIL_RIG.legLength * headDiameter;
  const reach = legLen * TRAIL_REACH_MARGIN;
  const dx = footX || 0;
  return Math.sqrt(Math.max(0, reach * reach - dx * dx));
}

// ─── THE GAIT, AS PURE GEOMETRY ──────────────────────────────────────────
// The whole walk lives here rather than in the renderer, so test/trail-lint
// can sweep it phase by phase without a browser. trail-engine.js draws what
// these return and solves nothing itself.

// Horizontal offset of a foot from the body (law W1). A foot alternates
// between stance and swing; during stance it is planted, so it must travel
// backward through the body frame at exactly the ground speed. That is why
// stance is strictly linear — a sinusoid slides the whole way through, and
// is the most common reason a walk cycle looks wrong.
function trailFootOffsetAt(phase, stride) {
  const p = ((phase % 1) + 1) % 1;
  const sigma = TRAIL_STANCE_FRACTION;
  const excursion = 2 * stride * sigma;
  if (p < sigma) {
    // Derivative is -excursion / (sigma * cycle) = -speed exactly.
    return excursion / 2 - excursion * (p / sigma);
  }
  // Swing: ease the foot back to the front so it does not snap at hand-off.
  const u = (p - sigma) / (1 - sigma);
  return -excursion / 2 + excursion * (1 - Math.cos(Math.PI * u)) / 2;
}

// Height of a foot above the ground. Zero through stance — a planted foot
// that hovers is the other half of looking wrong.
function trailFootLiftAt(phase, headDiameter) {
  const p = ((phase % 1) + 1) % 1;
  if (p < TRAIL_STANCE_FRACTION) return 0;
  const u = (p - TRAIL_STANCE_FRACTION) / (1 - TRAIL_STANCE_FRACTION);
  return TRAIL_FOOT_LIFT * headDiameter * Math.sin(Math.PI * u);
}

// W3: the body rises at mid-stance and drops through each hand-off, twice
// per gait cycle. Returned as a non-positive offset in SVG coordinates, so
// the base hip height is the LOW point of the walk and the bob only ever
// lifts from there — the hip never rises above where the legs can hold it.
function trailBodyBobAt(phase, figureHeight) {
  const p = ((phase % 1) + 1) % 1;
  return -TRAIL_BOB_AMPLITUDE * figureHeight *
    Math.abs(Math.sin(Math.PI * TRAIL_BOB_CYCLES_PER_GAIT * p));
}

// Both feet at a given phase, in body-frame coordinates.
function trailFeetAt(phase, headDiameter, stride) {
  return {
    right: {
      x: trailFootOffsetAt(phase + TRAIL_LIMB_PHASE.legRight, stride),
      y: -trailFootLiftAt(phase + TRAIL_LIMB_PHASE.legRight, headDiameter),
    },
    left: {
      x: trailFootOffsetAt(phase + TRAIL_LIMB_PHASE.legLeft, stride),
      y: -trailFootLiftAt(phase + TRAIL_LIMB_PHASE.legLeft, headDiameter),
    },
  };
}

// Where the hip sits at a given phase (law P3). Walking height plus the
// bob, then lowered if either leg would otherwise have to stretch to reach
// its own foot. The clamp is a safety net, not the mechanism: if it engages
// during normal walking the stride is too long, and trail-lint says so.
function trailHipYAt(phase, headDiameter, stride) {
  const legLen = TRAIL_RIG.legLength * headDiameter;
  const feet = trailFeetAt(phase, headDiameter, stride);
  let hipY = -legLen * TRAIL_HIP_HEIGHT_FACTOR +
    trailBodyBobAt(phase, trailFigureHeight(headDiameter));
  ['right', 'left'].forEach(function (side) {
    const f = feet[side];
    const lowest = f.y - trailMaxHipHeight(headDiameter, f.x);
    if (hipY < lowest) hipY = lowest;
  });
  return hipY;
}

// Slack left in the legs at a given phase: the smallest gap between what a
// leg must span and what it can. Negative means the rig is over-extending.
function trailReachSlackAt(phase, headDiameter, stride) {
  const legLen = TRAIL_RIG.legLength * headDiameter;
  const reach = legLen * TRAIL_REACH_MARGIN;
  const feet = trailFeetAt(phase, headDiameter, stride);
  const hipY = -legLen * TRAIL_HIP_HEIGHT_FACTOR +
    trailBodyBobAt(phase, trailFigureHeight(headDiameter));
  let worst = Infinity;
  ['right', 'left'].forEach(function (side) {
    const f = feet[side];
    const need = Math.sqrt(f.x * f.x + (f.y - hipY) * (f.y - hipY));
    worst = Math.min(worst, reach - need);
  });
  return worst;
}

// W1/W2: cadence is DERIVED from current speed, never hardcoded. A fixed
// cycle duration looks right at exactly one speed and slides at every other
// one — including through the whole acceleration ramp, which is where the
// eye catches it most.
//
//   speed = stride x cadence   =>   cadence = speed / stride
//
// Returns steps per second. Zero speed means no cycle at all (a stand, not
// a march in place).
function trailCadence(speed, stride) {
  if (stride <= 0) return 0;
  return Math.abs(speed) / stride;
}
// A full gait cycle is two steps.
function trailGaitCycle(speed, stride) {
  const c = trailCadence(speed, stride);
  return c > 0 ? 2 / c : 0;
}
// The planted foot must be stationary in world space. On screen it travels
// backward at exactly the ground speed; this returns that velocity so the
// linter and the engine agree on it.
function trailPlantedFootScreenVelocity(speed) {
  return -speed;
}

// W3: vertical bob — two oscillations per gait cycle (one per step), peaking
// at mid-stance, as a fraction of figure height.
const TRAIL_BOB_AMPLITUDE = 0.025;
const TRAIL_BOB_CYCLES_PER_GAIT = 2;

// W4: limb phase offsets within a gait cycle, in turns (1.0 = full cycle).
// Left arm swings with the right leg; each pair is half a cycle apart.
const TRAIL_LIMB_PHASE = {
  legRight: 0,
  legLeft:  0.5,
  armLeft:  0,   // shares phase with the right leg
  armRight: 0.5,
};

// ─── STATIONS (law C2) ───────────────────────────────────────────────────
// The 17 activities as places along one continuous trail. `id` must match an
// entry in ACTIVITIES (pocketbook-data.js) — the name, duration and detail
// content are read from there at runtime rather than duplicated here.
//
// `props` are what you see at that place. Each carries its own depth, which
// must clear the corridor (C1). Prop kinds the renderer knows how to draw:
// tree, pine, log, stump, rock, cairn, reeds, fire, shelter, hammock,
// signpost, tiles.
const TRAIL_STATION_SPACING = 720;   // world units between stations
const TRAIL_STATION_MIN_SEPARATION = 480;
// How close the character must be to a station to count as arrived.
const TRAIL_STATION_ARRIVE_RADIUS = 120;

// Every station gets a signpost so arrival is legible. Set back from the
// path at depth 1.3, well clear of the corridor.
const TRAIL_SIGNPOST_DEPTH = 1.3;

const TRAIL_STATIONS = [
  { id: 'introduce', props: [
    { kind: 'tree',  dx: -170, depth: 2.2 },
    { kind: 'pine',  dx:  150, depth: 1.6 },
    { kind: 'stump', dx:   70, depth: 1.25 },
  ] },
  { id: 'soundscape', props: [
    { kind: 'pine',  dx: -140, depth: 2.6 },
    { kind: 'pine',  dx:  180, depth: 1.9 },
    { kind: 'reeds', dx:  -60, depth: 0.78 },
  ] },
  { id: 'naming', props: [
    { kind: 'cairn', dx:   90, depth: 1.2 },
    { kind: 'tree',  dx: -160, depth: 2.4 },
  ] },
  { id: 'hammock', props: [
    { kind: 'hammock', dx:   0, depth: 1.35 },
    { kind: 'tree',    dx: -120, depth: 1.5 },
    { kind: 'tree',    dx:  120, depth: 1.5 },
  ] },
  // The Barefoot Trail — the one station whose content lies ON the path.
  // Its texture tiles sit at the character's own depth by design; see
  // TRAIL_CORRIDOR_EXCEPTIONS.
  { id: 'barefoot', props: [
    { kind: 'tiles', dx: -160, depth: 1 },
    { kind: 'tiles', dx:  -80, depth: 1 },
    { kind: 'tiles', dx:    0, depth: 1 },
    { kind: 'tiles', dx:   80, depth: 1 },
    { kind: 'tiles', dx:  160, depth: 1 },
    { kind: 'pine',  dx:  220, depth: 2.1 },
  ] },
  { id: 'palette', props: [
    { kind: 'tree',  dx: -150, depth: 1.8 },
    { kind: 'rock',  dx:  110, depth: 1.22 },
    { kind: 'reeds', dx: -200, depth: 0.7 },
  ] },
  { id: 'senses', props: [
    { kind: 'stump', dx:  -90, depth: 1.2 },
    { kind: 'pine',  dx:  170, depth: 2.3 },
  ] },
  { id: 'tinyworld', props: [
    { kind: 'rock',  dx:  -70, depth: 1.18 },
    { kind: 'rock',  dx:   40, depth: 1.3 },
    { kind: 'log',   dx:  140, depth: 1.45 },
  ] },
  { id: 'sofa', props: [
    { kind: 'log',   dx:    0, depth: 1.25 },
    { kind: 'tree',  dx: -180, depth: 2.0 },
    { kind: 'stump', dx:  130, depth: 1.4 },
  ] },
  { id: 'fire', props: [
    { kind: 'fire',  dx:    0, depth: 1.28 },
    { kind: 'log',   dx: -110, depth: 1.5 },
    { kind: 'log',   dx:  110, depth: 1.5 },
  ] },
  { id: 'bivouac', props: [
    { kind: 'shelter', dx:   0, depth: 1.4 },
    { kind: 'tree',    dx: -150, depth: 1.7 },
    { kind: 'tree',    dx:  150, depth: 1.7 },
  ] },
  { id: 'sitspot', props: [
    { kind: 'stump', dx:  -60, depth: 1.2 },
    { kind: 'pine',  dx:  160, depth: 2.5 },
    { kind: 'reeds', dx:  200, depth: 0.75 },
  ] },
  { id: 'roles', props: [
    { kind: 'cairn', dx: -100, depth: 1.25 },
    { kind: 'cairn', dx:    0, depth: 1.25 },
    { kind: 'cairn', dx:  100, depth: 1.25 },
  ] },
  { id: 'project', props: [
    { kind: 'stump',   dx: -80, depth: 1.2 },
    { kind: 'shelter', dx: 140, depth: 1.6 },
  ] },
  { id: 'object', props: [
    { kind: 'rock',  dx:  -50, depth: 1.16 },
    { kind: 'tree',  dx:  170, depth: 2.1 },
  ] },
  { id: 'checkin', props: [
    { kind: 'signpost', dx: 60, depth: 1.2 },
    { kind: 'pine',     dx: -160, depth: 2.2 },
  ] },
  { id: 'campfire', props: [
    { kind: 'fire',  dx:    0, depth: 1.3 },
    { kind: 'log',   dx: -120, depth: 1.45 },
    { kind: 'log',   dx:  120, depth: 1.45 },
    { kind: 'pine',  dx:  210, depth: 2.4 },
  ] },
];

// World X for a station, derived from its order so the spacing law can't
// drift out of sync with the data.
function trailStationWorldX(index) {
  return index * TRAIL_STATION_SPACING;
}
function trailWorldLength() {
  return (TRAIL_STATIONS.length - 1) * TRAIL_STATION_SPACING;
}

// ─── PLACEMENT (laws D3, D5, D6) ─────────────────────────────────────────
// The single source of truth for where anything ends up on screen. The
// engine renders whatever this returns and computes nothing spatial of its
// own, so a rendered scene cannot drift away from the model the linter
// checks.

// Contact shadow at depth 1, scaled down with everything else by D6.
const TRAIL_SHADOW_RX = 18;
const TRAIL_SHADOW_RY = 4;

function trailPlaceProp(prop, stationWorldX, cameraX) {
  const depth = prop.depth;
  const scale = trailScale(depth);
  const worldX = stationWorldX + prop.dx;
  // D2 in action: the parallax multiplier IS the scale.
  const x = TRAIL_VIEW_W / 2 + (worldX - cameraX) * trailSpeed(depth);
  const groundY = trailGroundY(depth);
  return {
    kind: prop.kind,
    depth: depth,
    scale: scale,
    x: x,
    worldX: worldX,
    // D3: ground contact is the depth's ground line, never a hand-placed y.
    groundY: groundY,
    // D4
    opacity: trailHaze(depth),
    // D6: nothing floats — every placed prop carries its contact shadow,
    // sitting exactly on its own ground line and scaled with it.
    shadow: {
      cx: x,
      cy: groundY,
      rx: TRAIL_SHADOW_RX * scale,
      ry: TRAIL_SHADOW_RY * scale,
    },
  };
}

// The character never moves horizontally: the world scrolls past instead
// (treadmill camera), so it stays centered by construction.
function trailPlaceCharacter() {
  const depth = TRAIL_CHARACTER_DEPTH;
  const scale = trailScale(depth);
  const groundY = trailGroundY(depth);
  return {
    depth: depth,
    scale: scale,
    x: TRAIL_VIEW_W / 2,
    groundY: groundY,
    opacity: trailHaze(depth),
    height: trailFigureHeight(TRAIL_HEAD_DIAMETER),
    shadow: {
      cx: TRAIL_VIEW_W / 2,
      cy: groundY,
      rx: TRAIL_SHADOW_RX * scale,
      ry: TRAIL_SHADOW_RY * scale,
    },
  };
}

// D5: render order is depth descending — far painted first, so the fringe
// at depth 0.6 lands on top of the character at depth 1.
function trailSortedLayers() {
  return TRAIL_LAYERS.slice().sort(function (a, b) { return b.depth - a.depth; });
}

// ─── NODE INTEROP ────────────────────────────────────────────────────────
// The browser gets these as plain globals via <script> (no modules — see
// ARCHITECTURE.md). test/trail-lint.js loads this file into a vm context and
// reads the same names from there, so nothing extra is needed here.
