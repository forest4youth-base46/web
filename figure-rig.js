// ─── The figure rig: one person, drawn everywhere ───
//
// Every human figure in this app comes from here — the walker on the trail
// and each person in the 17 activity illustrations — so they are provably
// the same body at the same proportions.
//
// They were not, before this file. The illustrations were drawn by hand
// over time and had drifted to head radii between 4 and 9 for figures meant
// to read as the same adult at the same distance, and to bodies between
// roughly 1.6 and 4 heads tall. A person is about 7. That is what "the
// activities look botched and non-proportional" turned out to mean, and
// generating the figures from a single spec is what stops it recurring.
//
// Pure string building, no DOM: test/illustration-lint.js loads this into a
// vm context alongside pocketbook-data.js.
//
// See .claude/skills/revampnwasd/SKILL.md for laws P1-P3.
'use strict';

// All lengths are multiples of head diameter `h`. Head, torso and legs sum
// to exactly the total height, so the figure closes without a fudge factor.
const RIG = {
  totalHeight:   7.0,
  headDiameter:  1.0,
  shoulderWidth: 1.6,
  torsoLength:   2.4,
  armLength:     3.0,
  legLength:     3.6,
  // Two-segment limbs, so a bend is a bend rather than a stretch.
  thigh:         1.8,
  shank:         1.8,
  upperArm:      1.4,
  foreArm:       1.6,
};

// Acceptable head-count band for anything claiming to be this rig.
const RIG_HEADS_MIN = 6.0;
const RIG_HEADS_MAX = 8.0;

// Poses, as joint angles in degrees. Legs measure from straight-down, arms
// likewise; positive swings forward. `knee`/`elbow` are additional bend, so
// zero is a straight limb.
//
// Angles rather than hand-placed endpoints: a limb built from an angle and
// a fixed segment length cannot come out the wrong length, which is exactly
// the failure the old hand-drawn figures kept making.
const RIG_POSES = {
  stand:  { lean:  2, legs: [{ thigh:  2, knee:  4 }, { thigh: -2, knee:  6 }],
            arms: [{ shoulder:  6, elbow: 10 }, { shoulder: -4, elbow: 14 }] },
  walk:   { lean:  6, legs: [{ thigh: 24, knee:  6 }, { thigh: -20, knee: 28 }],
            arms: [{ shoulder: -22, elbow: 18 }, { shoulder: 20, elbow: 24 }] },
  // Seated on a log or stone: thighs forward and level, shanks straight down.
  sit:    { lean:  8, legs: [{ thigh: 84, knee: 86 }, { thigh: 78, knee: 80 }],
            arms: [{ shoulder: 24, elbow: 52 }, { shoulder: 18, elbow: 44 }] },
  // Sitting on the ground, knees drawn up.
  ground: { lean: 14, legs: [{ thigh: 70, knee: 118 }, { thigh: 62, knee: 110 }],
            arms: [{ shoulder: 34, elbow: 62 }, { shoulder: 28, elbow: 56 }] },
  crouch: { lean: 26, legs: [{ thigh: 46, knee: 92 }, { thigh: 38, knee: 86 }],
            arms: [{ shoulder: 30, elbow: 54 }, { shoulder: 24, elbow: 48 }] },
  // Bent over a task — building, gathering, making.
  bend:   { lean: 54, legs: [{ thigh: 10, knee: 16 }, { thigh: -6, knee: 20 }],
            arms: [{ shoulder: 34, elbow: 30 }, { shoulder: 26, elbow: 36 }] },
  kneel:  { lean: 12, legs: [{ thigh: 58, knee: 138 }, { thigh: 20, knee: 96 }],
            arms: [{ shoulder: 26, elbow: 44 }, { shoulder: 20, elbow: 38 }] },
  // One arm raised — pointing, reaching, holding something up.
  reach:  { lean:  4, legs: [{ thigh:  4, knee:  6 }, { thigh: -4, knee:  8 }],
            arms: [{ shoulder: 14, elbow: 16 }, { shoulder: 128, elbow: 22 }] },
  // Lying back with the legs out — a hammock, not the ground. The caller
  // places this on the fabric rather than on a ground line.
  recline: { lean: 74, legs: [{ thigh: 96, knee: 22 }, { thigh: 90, knee: 16 }],
            arms: [{ shoulder: 62, elbow: 28 }, { shoulder: 74, elbow: 34 }] },
};

function rigRad(deg) { return (deg * Math.PI) / 180; }

// Builds one figure and returns SVG markup.
//
//   x, y   ground contact point (the feet land here)
//   h      head diameter — the single scale knob; everything else follows
//   pose   a key of RIG_POSES
//   facing 1 for right, -1 for left
function figureSVG(opts) {
  const o = Object.assign({
    x: 0, y: 0, h: 12, pose: 'stand', facing: 1,
    ink: '#14302A', limb: '#234A3E', body: '#3A6B5A', shadow: true, opacity: 1,
  }, opts || {});
  const h = o.h;
  const pose = RIG_POSES[o.pose] || RIG_POSES.stand;

  const thigh = RIG.thigh * h;
  const shank = RIG.shank * h;
  const upper = RIG.upperArm * h;
  const fore = RIG.foreArm * h;
  const torsoLen = RIG.torsoLength * h;
  const headR = (RIG.headDiameter * h) / 2;
  const shoulderW = RIG.shoulderWidth * h;

  // Everything is built with the hip at the origin, then shifted so the
  // lowest foot lands on the ground.
  const legs = pose.legs.map(function (L) {
    const t = rigRad(L.thigh);
    const s = rigRad(L.thigh - L.knee);
    const knee = { x: Math.sin(t) * thigh, y: Math.cos(t) * thigh };
    const foot = { x: knee.x + Math.sin(s) * shank, y: knee.y + Math.cos(s) * shank };
    return { knee: knee, foot: foot };
  });

  const lean = rigRad(pose.lean);
  const shoulder = { x: Math.sin(lean) * torsoLen, y: -Math.cos(lean) * torsoLen };
  const head = {
    x: shoulder.x + Math.sin(lean) * headR * 1.35,
    y: shoulder.y - Math.cos(lean) * headR * 1.35,
  };

  const arms = pose.arms.map(function (A) {
    const a = rigRad(A.shoulder);
    const b = rigRad(A.shoulder - A.elbow);
    const elbow = { x: shoulder.x + Math.sin(a) * upper, y: shoulder.y + Math.cos(a) * upper };
    const hand = { x: elbow.x + Math.sin(b) * fore, y: elbow.y + Math.cos(b) * fore };
    return { elbow: elbow, hand: hand };
  });

  const groundY = Math.max(legs[0].foot.y, legs[1].foot.y);

  // facing flips x; the ground shift moves everything onto o.y.
  function px(p) { return (o.x + p.x * o.facing).toFixed(2); }
  function py(p) { return (o.y + (p.y - groundY)).toFixed(2); }
  const hip = { x: 0, y: 0 };

  function limbPath(a, b, c, width, color) {
    return '<polyline points="' + px(a) + ',' + py(a) + ' ' + px(b) + ',' + py(b) + ' ' +
      px(c) + ',' + py(c) + '" fill="none" stroke="' + color + '" stroke-width="' +
      width.toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  let out = '<g class="pb-fig" data-pose="' + o.pose + '"' +
    (o.opacity !== 1 ? ' opacity="' + o.opacity + '"' : '') + '>';
  if (o.shadow) {
    // Law D6: nothing floats.
    out += '<ellipse cx="' + o.x.toFixed(2) + '" cy="' + o.y.toFixed(2) + '" rx="' +
      (h * 1.05).toFixed(2) + '" ry="' + (h * 0.2).toFixed(2) + '" fill="#14302A" opacity="0.16"/>';
  }
  // Far limbs first, then the body, then near limbs — so arms read as
  // attached to a body rather than buried inside it.
  out += limbPath(hip, legs[1].knee, legs[1].foot, h * 0.24, o.body);
  out += limbPath(shoulder, arms[1].elbow, arms[1].hand, h * 0.18, o.body);
  // The torso is a quad between the shoulder line and the hip line. Both
  // lines are perpendicular to the torso axis — rotating only the shoulders
  // shears the body into a wedge as soon as the figure leans.
  const perp = { x: Math.cos(lean), y: Math.sin(lean) };
  const halfS = shoulderW / 2;
  const halfH = shoulderW * 0.34;
  const corners = [
    { x: shoulder.x - perp.x * halfS, y: shoulder.y - perp.y * halfS },
    { x: shoulder.x + perp.x * halfS, y: shoulder.y + perp.y * halfS },
    { x: hip.x + perp.x * halfH, y: hip.y + perp.y * halfH },
    { x: hip.x - perp.x * halfH, y: hip.y - perp.y * halfH },
  ];
  out += '<path d="M' + corners.map(function (c) { return px(c) + ' ' + py(c); }).join(' L') +
    ' Z" fill="' + o.limb + '"/>';
  out += '<circle cx="' + px(head) + '" cy="' + py(head) + '" r="' + headR.toFixed(2) +
    '" fill="' + o.ink + '"/>';
  out += limbPath(hip, legs[0].knee, legs[0].foot, h * 0.24, o.limb);
  out += limbPath(shoulder, arms[0].elbow, arms[0].hand, h * 0.18, o.ink);
  out += '</g>';
  return out;
}

// Total drawn height of a figure, for checking it against its scene.
function figureHeight(h) { return RIG.totalHeight * h; }
