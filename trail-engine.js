// ─── Trail world: renderer, treadmill camera, and WASD locomotion ───
//
// Draws the continuous forest trail and walks a character along it. All
// spatial decisions come from trail-data.js — this file renders what
// trailPlaceProp()/trailPlaceCharacter() return and computes no geometry of
// its own, so what you see cannot drift away from what test/trail-lint.js
// checks.
//
// Controls (see trailHandleKey, wired from pocketbook-run.js):
//   W — initiate march forward     A — previous activity
//   S — walk back                  D — next activity
//
// W/S and A/D are deliberately different mechanics. W/S is locomotion: the
// character accelerates into a gait and the world scrolls past. A/D is
// navigation: the camera travels to the adjacent station and opens it.
'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────
// The character's world position. The camera is centered on it, so this
// doubles as the camera X — the character never moves horizontally on
// screen (treadmill), the world moves under it.
let trailCameraX = 0;
// Current ground speed in view units/sec. Signed: + marches forward, -
// walks back. Ramped, never snapped, so the gait has something to follow.
let trailVelocity = 0;
// Position within the gait cycle, 0..1. Two steps per cycle.
let trailGaitPhase = 0;
const trailInput = { forward: false, back: false };
let trailRafId = null;
let trailLastTs = 0;
let trailEls = null;
// Camera travel for A/D station jumps; trailJumpTarget is null when not
// travelling. Duration-based rather than "move a fraction of the remaining
// distance each frame": a proportional ease is asymptotic, so a jump across
// the whole trail crawls toward the target and can take seconds to land.
// A bounded duration arrives in the same time from anywhere.
let trailJumpTarget = null;
let trailJumpFrom = 0;
let trailJumpElapsed = 0;
let trailJumpDuration = 0;
const TRAIL_JUMP_MIN_S = 0.28;
const TRAIL_JUMP_MAX_S = 0.7;

function trailEaseInOut(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

// TRAIL_STANCE_FRACTION and TRAIL_FOOT_LIFT come from trail-data.js, where
// the reach law (P3) is computed from them.
//
// Peak arm swing, in head diameters of hand travel.
const TRAIL_ARM_SWING = 0.55;
// Width of one repeat of a scenery band, in view units.
const TRAIL_PATTERN_W = 480;

// SMIL and CSS animation are both unreachable from here, and this world
// animates from JS, so it has to consult the OS preference itself — same
// reasoning as pbPrefersReducedMotion() in pocketbook-activities.js.
// Checked live, since the setting can be toggled mid-session.
function trailPrefersReducedMotion() {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─── THE WALK CYCLE (laws W1-W4) ─────────────────────────────────────────
// The gait itself is pure geometry and lives in trail-data.js, so the
// linter can sweep it phase by phase without a browser. What follows is
// only the part that needs live state.

// The planted foot's world position. Constant while that foot is in stance
// — test/trail-frames.js asserts exactly that, which is the runtime proof
// of W1 that no still frame can give you.
function trailFootWorldX(which) {
  const stride = trailActiveStride();
  const phase = trailGaitPhase + (which === 'left' ? TRAIL_LIMB_PHASE.legLeft : TRAIL_LIMB_PHASE.legRight);
  return trailCameraX + trailFootOffsetAt(phase, stride) * (trailVelocity < 0 ? -1 : 1);
}

// Marching and walking back are different gaits, so stride follows whichever
// is active rather than being one number reused.
function trailActiveStride() {
  const base = trailStrideLength(TRAIL_HEAD_DIAMETER);
  return trailVelocity < 0 ? base * TRAIL_BACK_STRIDE_FACTOR : base;
}

// ─── SCENERY ─────────────────────────────────────────────────────────────
// One repeat of a parallax band, drawn in that layer's own screen scale.
// These are silhouettes, not detailed trees: at depth 4 and 8 the haze has
// already taken most of the contrast, and detail there reads as noise.
//
// Tone is assigned per depth as well as opacity. Haze alone, over a single
// dark green, flattens the bands into one mass; receding toward the misty
// end of the palette is what actually separates them.
function trailBandTone(depth) {
  if (depth >= 6) return 'var(--forest-soft)';
  if (depth >= 3) return 'var(--forest-mid)';
  return 'var(--forest-deep)';
}

function trailBandPattern(layer) {
  // A layer nearer than the character is a fringe, not a treeline. Its
  // ground line sits below the frame — which is what being that close
  // means — so full trees there would fill the screen with a solid wall.
  // It gets low, sparse foreground growth instead.
  if (layer.depth < TRAIL_CHARACTER_DEPTH) return trailFringePattern(layer);

  const g = trailGroundY(layer.depth);
  const s = trailScale(layer.depth);
  const h = 116 * s; // canopy height at this depth
  let out = '';
  // Deterministic spacing, so the band tiles seamlessly at TRAIL_PATTERN_W.
  const spots = [0.06, 0.19, 0.31, 0.44, 0.58, 0.71, 0.83, 0.94];
  spots.forEach(function (f, i) {
    const x = f * TRAIL_PATTERN_W;
    const th = (i % 3 === 0) ? h * 1.25 : h;
    if (i % 2 === 0) {
      // Conifer silhouette.
      out += '<path d="M' + x + ' ' + g + ' L' + (x - th * 0.22) + ' ' + g +
        ' L' + x + ' ' + (g - th) + ' L' + (x + th * 0.22) + ' ' + g + ' Z"/>';
    } else {
      // Broadleaf silhouette.
      out += '<ellipse cx="' + x + '" cy="' + (g - th * 0.6) + '" rx="' + (th * 0.3) +
        '" ry="' + (th * 0.42) + '"/>';
      out += '<rect x="' + (x - th * 0.03) + '" y="' + (g - th * 0.6) + '" width="' +
        (th * 0.06) + '" height="' + (th * 0.6) + '"/>';
    }
  });
  return out;
}

// Foreground growth for a layer nearer than the character. Anchored on its
// own (off-frame) ground line like everything else, so only the tips reach
// into the bottom of the picture — and kept away from the centre, where the
// character walks.
function trailFringePattern(layer) {
  const g = trailGroundY(layer.depth);
  const s = trailScale(layer.depth);
  let out = '';
  // Sparse on purpose. This layer passes the fastest, so anything dense
  // here strobes across the picture and hides the path the character is
  // supposed to be walking on. Two tufts per repeat is enough to register
  // as foreground.
  const spots = [0.11, 0.58];
  spots.forEach(function (f, i) {
    const x = f * TRAIL_PATTERN_W;
    const th = (74 + i * 16) * s;
    for (let b = -1; b <= 1; b++) {
      const tipX = x + b * 9 * s;
      const ctrlX = x + b * 15 * s;
      out += '<path d="M' + x + ' ' + g + ' Q' + ctrlX + ' ' + (g - th * 0.55) +
        ' ' + tipX + ' ' + (g - th) + '" stroke-width="' + (1.9 * s).toFixed(2) + '"/>';
    }
  });
  return out;
}

// Scrolling texture on the path surface itself. Without it the ground is a
// flat band and the treadmill reads as the character running on the spot.
function trailPathPattern() {
  const g = TRAIL_BASELINE_Y;
  let out = '';
  const marks = [0.04, 0.13, 0.22, 0.29, 0.38, 0.47, 0.55, 0.63, 0.72, 0.81, 0.89, 0.96];
  marks.forEach(function (f, i) {
    const x = f * TRAIL_PATTERN_W;
    const y = g + (i % 3) * 5 + 4;
    const r = 2 + (i % 4) * 0.9;
    out += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r + '" ry="' + (r * 0.45) + '"/>';
  });
  return out;
}

// ─── PROPS ───────────────────────────────────────────────────────────────
// Each shape is drawn in view units at depth 1, anchored at the origin =
// its ground contact point, extending upward. The caller applies the
// depth scale, so a prop's size follows the same law as everything else.
function trailPropShape(kind) {
  switch (kind) {
    case 'tree':
      return '<rect x="-5" y="-96" width="10" height="96" fill="var(--bark)"/>' +
             '<ellipse cx="0" cy="-112" rx="46" ry="34" fill="var(--forest-mid)"/>' +
             '<ellipse cx="-18" cy="-96" rx="26" ry="19" fill="var(--forest-mid)"/>';
    case 'pine':
      return '<rect x="-4" y="-70" width="8" height="70" fill="var(--bark)"/>' +
             '<path d="M0 -170 L-34 -66 L34 -66 Z" fill="var(--forest-deep)"/>' +
             '<path d="M0 -140 L-42 -34 L42 -34 Z" fill="var(--forest-mid)"/>';
    case 'log':
      return '<rect x="-45" y="-22" width="90" height="22" rx="8" fill="var(--bark)"/>' +
             '<ellipse cx="-45" cy="-11" rx="7" ry="11" fill="#8B6B52"/>';
    case 'stump':
      return '<rect x="-17" y="-30" width="34" height="30" rx="3" fill="var(--bark)"/>' +
             '<ellipse cx="0" cy="-30" rx="17" ry="6" fill="#8B6B52"/>';
    case 'rock':
      return '<path d="M-20 0 Q-22 -20 -4 -25 Q14 -28 20 -12 Q22 0 20 0 Z" fill="#7C8E85"/>';
    case 'cairn':
      return '<ellipse cx="0" cy="-6" rx="17" ry="7" fill="#7C8E85"/>' +
             '<ellipse cx="1" cy="-19" rx="12" ry="6" fill="#8B9A92"/>' +
             '<ellipse cx="0" cy="-29" rx="8" ry="5" fill="#7C8E85"/>';
    case 'reeds':
      return '<g stroke="var(--forest-mid)" stroke-width="2.5" fill="none" stroke-linecap="round">' +
             '<path d="M-12 0 Q-16 -30 -22 -54"/><path d="M-4 0 Q-4 -32 -8 -60"/>' +
             '<path d="M4 0 Q6 -30 4 -56"/><path d="M12 0 Q18 -28 24 -50"/></g>';
    case 'fire':
      return '<ellipse cx="0" cy="-3" rx="26" ry="8" fill="#7C8E85" opacity="0.7"/>' +
             '<path d="M-14 -6 L0 -30 M14 -6 L0 -30" stroke="var(--bark)" stroke-width="4" stroke-linecap="round"/>' +
             '<path d="M0 -14 Q-10 -28 0 -44 Q10 -28 0 -14" fill="var(--ember)" opacity="0.9"/>' +
             '<path d="M0 -18 Q-5 -27 0 -36 Q5 -27 0 -18" fill="var(--ember-soft)"/>';
    case 'shelter':
      return '<path d="M-64 0 L0 -78 L64 0 Z" fill="var(--forest-deep)" opacity="0.85"/>' +
             '<path d="M0 -78 L0 0" stroke="var(--bark)" stroke-width="4"/>' +
             '<path d="M-64 0 L-52 -14 M64 0 L52 -14" stroke="var(--bark)" stroke-width="3"/>';
    case 'hammock':
      return '<rect x="-62" y="-104" width="8" height="104" fill="var(--bark)"/>' +
             '<rect x="54" y="-104" width="8" height="104" fill="var(--bark)"/>' +
             '<path d="M-58 -70 Q0 -30 58 -70" stroke="var(--forest-mid)" stroke-width="6" fill="none" stroke-linecap="round"/>';
    case 'signpost':
      return '<rect x="-3" y="-84" width="6" height="84" fill="var(--bark)"/>' +
             '<rect x="-30" y="-84" width="60" height="20" rx="3" fill="var(--paper-card)" stroke="var(--bark)" stroke-width="2"/>';
    case 'tiles':
      // The Barefoot Trail's surface patches — the one thing that belongs
      // in the walkway (law C1's single exception).
      return '<rect x="-38" y="-3" width="76" height="14" rx="3" fill="var(--forest-soft)" opacity="0.75"/>' +
             '<g fill="var(--forest-ink)" opacity="0.35">' +
             '<circle cx="-24" cy="3" r="1.7"/><circle cx="-8" cy="6" r="1.4"/>' +
             '<circle cx="9" cy="3" r="1.8"/><circle cx="25" cy="6" r="1.5"/></g>';
    default:
      return '';
  }
}

// ─── BUILD ───────────────────────────────────────────────────────────────
// The DOM is built once. Per frame only transform attributes change, which
// keeps a 60fps loop off the parser.
function trailBuild(mount) {
  const layers = trailSortedLayers();
  const character = trailPlaceCharacter();

  // D5: one flat list, painted far to near. Scenery bands, station props and
  // the character all sort into the same order by the same number, so the
  // fringe at depth 0.6 lands on top of the character at depth 1 without
  // anything special-casing it.
  const items = [];
  layers.forEach(function (layer) {
    if (layer.depth === TRAIL_CHARACTER_DEPTH) return; // the path, drawn below
    items.push({ type: 'band', depth: layer.depth, layer: layer });
  });
  TRAIL_STATIONS.forEach(function (station, si) {
    const stationX = trailStationWorldX(si);
    station.props.forEach(function (prop, pi) {
      items.push({ type: 'prop', depth: prop.depth, prop: prop, stationX: stationX, si: si, pi: pi });
    });
    items.push({
      type: 'prop', depth: TRAIL_SIGNPOST_DEPTH, si: si, pi: -1, stationX: stationX,
      prop: { kind: 'signpost', dx: -150, depth: TRAIL_SIGNPOST_DEPTH }, label: station.id,
    });
  });
  items.push({ type: 'character', depth: TRAIL_CHARACTER_DEPTH - 0.0001 });
  items.sort(function (a, b) { return b.depth - a.depth; });

  let svg = '<svg class="trail-svg" viewBox="0 0 ' + TRAIL_VIEW_W + ' ' + TRAIL_VIEW_H + '" ' +
    'preserveAspectRatio="xMidYMax slice" role="img" aria-label="Forest trail">';
  // Sky: a backdrop, not a parallax plane — it has no depth and does not
  // scroll, which is why it is not one of TRAIL_LAYERS.
  svg += '<defs>' +
    '<linearGradient id="trailSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#CFE0D8"/><stop offset="100%" stop-color="#E9F0EC"/>' +
    '</linearGradient>' +
    // The ground recedes to the same horizon everything else does (D1), so
    // it fades into the haze at the top rather than meeting the sky on a
    // hard line.
    '<linearGradient id="trailGround" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#C6D6CD"/>' +
      '<stop offset="45%" stop-color="#BFC9AE"/>' +
      '<stop offset="100%" stop-color="#AFAE8C"/>' +
    '</linearGradient>' +
    '</defs>';
  svg += '<rect width="' + TRAIL_VIEW_W + '" height="' + TRAIL_VIEW_H + '" fill="url(#trailSky)"/>';
  // The floor of the world. Without it the distant bands and mid-ground
  // props stand on nothing and the whole scene reads as cut-out shapes
  // floating over the sky.
  svg += '<rect x="0" y="' + TRAIL_HORIZON_Y + '" width="' + TRAIL_VIEW_W +
    '" height="' + (TRAIL_VIEW_H - TRAIL_HORIZON_Y) + '" fill="url(#trailGround)"/>';

  // The path surface is the ground at depth 1, not an object standing on
  // it, so it belongs with the backdrop. Sorting it in with the props would
  // put it at the same depth as anything lying ON the path — the Barefoot
  // Trail's tiles above all — and insertion order, not depth, would decide
  // which one won. Painting the floor first removes the ambiguity.
  // The trodden strip starts a little above the walking line, so the
  // character stands within the path rather than balanced on its far edge.
  const pathY = TRAIL_BASELINE_Y - 22;
  let pathTex = '';
  for (let k = -1; k <= 2; k++) {
    pathTex += '<g transform="translate(' + (k * TRAIL_PATTERN_W) + ' 0)">' + trailPathPattern() + '</g>';
  }
  svg += '<rect x="0" y="' + pathY + '" width="' + TRAIL_VIEW_W + '" height="' +
    (TRAIL_VIEW_H - pathY) + '" fill="#D9D2C2"/>';
  svg += '<rect x="0" y="' + (pathY - 2) + '" width="' + TRAIL_VIEW_W + '" height="4" fill="#C4BBA6" opacity="0.6"/>';
  svg += '<g class="trail-path-texture" fill="#B3A98F" opacity="0.55">' + pathTex + '</g>';

  items.forEach(function (item) {
    if (item.type === 'band') {
      const opacity = trailHaze(item.layer.depth);
      let inner = '';
      for (let k = -1; k <= 2; k++) {
        inner += '<g transform="translate(' + (k * TRAIL_PATTERN_W) + ' 0)">' +
          trailBandPattern(item.layer) + '</g>';
      }
      const isFringe = item.layer.depth < TRAIL_CHARACTER_DEPTH;
      const paint = isFringe
        ? 'fill="none" stroke="' + trailBandTone(item.layer.depth) + '" stroke-linecap="round"'
        : 'fill="' + trailBandTone(item.layer.depth) + '"';
      svg += '<g class="trail-band" data-layer="' + item.layer.id + '" ' + paint +
        ' opacity="' + opacity.toFixed(4) + '">' + inner + '</g>';
    } else if (item.type === 'prop') {
      svg += '<g class="trail-prop" data-si="' + item.si + '" data-pi="' + item.pi + '">' +
        '<ellipse class="trail-shadow" fill="var(--forest-ink)" opacity="0.16"/>' +
        '<g class="trail-prop-shape">' + trailPropShape(item.prop.kind) + '</g></g>';
    } else if (item.type === 'character') {
      svg += trailCharacterMarkup();
    }
  });
  svg += '</svg>';
  mount.innerHTML = svg;

  const root = mount.querySelector('.trail-svg');
  trailEls = {
    root: root,
    bands: Array.prototype.slice.call(root.querySelectorAll('.trail-band')),
    pathTexture: root.querySelector('.trail-path-texture'),
    props: Array.prototype.slice.call(root.querySelectorAll('.trail-prop')),
    character: root.querySelector('.trail-character'),
    body: root.querySelector('.trail-body'),
    legLeft: root.querySelector('.trail-leg-left'),
    legRight: root.querySelector('.trail-leg-right'),
    footLeft: root.querySelector('.trail-foot-left'),
    footRight: root.querySelector('.trail-foot-right'),
    armLeft: root.querySelector('.trail-arm-left'),
    armRight: root.querySelector('.trail-arm-right'),
    torso: root.querySelector('.trail-torso'),
    neck: root.querySelector('.trail-neck'),
    head: root.querySelector('.trail-head'),
  };
}

// Two-bone inverse kinematics. Given a root and an end effector, finds the
// joint between them so both segments keep their length — the thing a
// single hip-to-foot line cannot do. `bend` picks which of the two mirror
// solutions to use, so knees go forward and elbows go back.
function trailSolveJoint(rootX, rootY, endX, endY, upper, lower, bend) {
  const dx = endX - rootX;
  const dy = endY - rootY;
  const raw = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  // Never ask for more reach than the limb has; at full extension the two
  // solutions collapse and the joint pops.
  const d = Math.min(raw, (upper + lower) * 0.999);
  const ux = dx / raw;
  const uy = dy / raw;
  // Distance along the root→end line to the joint's projection.
  const m = (upper * upper - lower * lower + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, upper * upper - m * m));
  return {
    x: rootX + ux * m - uy * off * bend,
    y: rootY + uy * m + ux * off * bend,
  };
}

// The rig, built from TRAIL_RIG ratios rather than hand-placed pixels, so
// the trail character and the illustration figures are provably the same
// person (laws P1/P2).
//
// Limbs are drawn in two passes with the torso between them, so the far
// arm and leg sit behind the body and the near ones in front. Without that
// the figure reads flat, and the arms vanish inside the torso silhouette.
function trailCharacterMarkup() {
  const h = TRAIL_HEAD_DIAMETER;
  const torso = TRAIL_RIG.torsoLength * h;
  const headR = (TRAIL_RIG.headDiameter * h) / 2;
  const shoulderW = TRAIL_RIG.shoulderWidth * h;
  const hipY = -TRAIL_RIG.legLength * h * TRAIL_HIP_HEIGHT_FACTOR;
  const shoulderY = hipY - torso;
  const headY = shoulderY - headR;
  const legW = 0.26 * h;
  const armW = 0.19 * h;

  function limb(cls, color, width) {
    return '<polyline class="' + cls + '" fill="none" stroke="' + color +
      '" stroke-width="' + width.toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round" points="0,0 0,0 0,0"/>';
  }
  function foot(cls, color) {
    return '<path class="' + cls + '" fill="none" stroke="' + color + '" stroke-width="' +
      (0.16 * h).toFixed(2) + '" stroke-linecap="round" d="M0 0 L0 0"/>';
  }

  return '<g class="trail-character">' +
    '<ellipse class="trail-shadow" fill="var(--forest-ink)" opacity="0.2"/>' +
    '<g class="trail-body">' +
      // Far side: behind the torso, and lighter, so it reads as further.
      limb('trail-leg-left', 'var(--forest-mid)', legW) +
      foot('trail-foot-left', 'var(--forest-mid)') +
      limb('trail-arm-left', 'var(--forest-mid)', armW) +
      // Torso and head.
      '<path class="trail-torso" d="M' + (-shoulderW / 2) + ' ' + shoulderY + ' L' + (shoulderW / 2) + ' ' + shoulderY +
        ' L' + (shoulderW * 0.34) + ' ' + hipY + ' L' + (-shoulderW * 0.34) + ' ' + hipY + ' Z" ' +
        'fill="var(--forest-deep)"/>' +
      '<rect class="trail-neck" x="' + (-headR * 0.32) + '" y="' + (shoulderY - headR * 0.7) + '" width="' + (headR * 0.64) +
        '" height="' + (headR * 0.9) + '" fill="var(--forest-deep)"/>' +
      '<circle class="trail-head" cx="0" cy="' + headY + '" r="' + headR + '" fill="var(--forest-ink)"/>' +
      // Near side: in front of the torso, darker.
      limb('trail-arm-right', 'var(--forest-ink)', armW) +
      limb('trail-leg-right', 'var(--forest-ink)', legW) +
      foot('trail-foot-right', 'var(--forest-ink)') +
    '</g></g>';
}

// ─── FRAME ───────────────────────────────────────────────────────────────
function trailRender() {
  if (!trailEls) return;
  const h = TRAIL_HEAD_DIAMETER;
  const stride = trailActiveStride();
  const facing = trailVelocity < 0 ? -1 : 1;

  // Parallax bands. The offset multiplier is trailSpeed(depth), which is
  // the same function as trailScale(depth) — law D2, and the reason these
  // sit in the world instead of sliding across it.
  trailEls.bands.forEach(function (band) {
    const layer = TRAIL_LAYERS.filter(function (l) { return l.id === band.getAttribute('data-layer'); })[0];
    if (!layer) return;
    const shift = (trailCameraX * trailSpeed(layer.depth)) % TRAIL_PATTERN_W;
    band.setAttribute('transform', 'translate(' + (-shift) + ' 0)');
  });
  if (trailEls.pathTexture) {
    const shift = (trailCameraX * trailSpeed(TRAIL_CHARACTER_DEPTH)) % TRAIL_PATTERN_W;
    trailEls.pathTexture.setAttribute('transform', 'translate(' + (-shift) + ' 0)');
  }

  // Station props, placed by trail-data.js. Anything off-screen is hidden
  // rather than transformed, which keeps the per-frame work proportional to
  // what is actually visible.
  trailEls.props.forEach(function (el) {
    const si = parseInt(el.getAttribute('data-si'), 10);
    const pi = parseInt(el.getAttribute('data-pi'), 10);
    const station = TRAIL_STATIONS[si];
    const prop = pi < 0
      ? { kind: 'signpost', dx: -150, depth: TRAIL_SIGNPOST_DEPTH }
      : station.props[pi];
    const placed = trailPlaceProp(prop, trailStationWorldX(si), trailCameraX);
    if (placed.x < -260 || placed.x > TRAIL_VIEW_W + 260) {
      el.setAttribute('visibility', 'hidden');
      return;
    }
    el.removeAttribute('visibility');
    el.setAttribute('opacity', placed.opacity.toFixed(4));
    const shape = el.querySelector('.trail-prop-shape');
    if (shape) {
      shape.setAttribute('transform',
        'translate(' + placed.x.toFixed(2) + ' ' + placed.groundY.toFixed(2) + ') scale(' + placed.scale.toFixed(4) + ')');
    }
    const shadow = el.querySelector('.trail-shadow');
    if (shadow) {
      // D6: the contact shadow comes from the same placement, so a prop
      // cannot end up floating above its own shadow.
      shadow.setAttribute('cx', placed.shadow.cx.toFixed(2));
      shadow.setAttribute('cy', placed.shadow.cy.toFixed(2));
      shadow.setAttribute('rx', placed.shadow.rx.toFixed(2));
      shadow.setAttribute('ry', placed.shadow.ry.toFixed(2));
    }
  });

  // The character. Stays centered — the world moved, not it.
  const c = trailPlaceCharacter();
  if (trailEls.character) {
    trailEls.character.setAttribute('transform',
      'translate(' + c.x + ' ' + c.groundY + ') scale(' + facing + ' 1)');
    const shadow = trailEls.character.querySelector('.trail-shadow');
    if (shadow) {
      shadow.setAttribute('cx', '0');
      shadow.setAttribute('cy', '0');
      shadow.setAttribute('rx', c.shadow.rx.toFixed(2));
      shadow.setAttribute('ry', c.shadow.ry.toFixed(2));
    }
  }

  const moving = Math.abs(trailVelocity) > 0.01;
  // A stand, not a march in place: with no ground speed there is no stride
  // to match, so the gait stops rather than cycling on the spot.
  const still = !moving || trailPrefersReducedMotion();
  const phase = still ? 0 : trailGaitPhase;

  const legLen = TRAIL_RIG.legLength * h;
  const thigh = TRAIL_RIG.thigh * h;
  const shank = TRAIL_RIG.shank * h;
  const upperArm = TRAIL_RIG.upperArm * h;
  const foreArm = TRAIL_RIG.foreArm * h;
  const torso = TRAIL_RIG.torsoLength * h;
  const shoulderW = TRAIL_RIG.shoulderWidth * h;

  // Feet and hip both come from trail-data.js. Standing still is the gait
  // evaluated with no stride rather than a separate pose, so there is one
  // definition of where a foot goes.
  const feet = still
    ? { right: { x: 0, y: 0 }, left: { x: 0, y: 0 } }
    : trailFeetAt(phase, h, stride);
  const hipY = still
    ? -legLen * TRAIL_HIP_HEIGHT_FACTOR
    : trailHipYAt(phase, h, stride);

  const shoulderY = hipY - torso;
  if (trailEls.torso) {
    trailEls.torso.setAttribute('d',
      'M' + (-shoulderW / 2) + ' ' + shoulderY.toFixed(2) + ' L' + (shoulderW / 2) + ' ' + shoulderY.toFixed(2) +
      ' L' + (shoulderW * 0.34) + ' ' + hipY.toFixed(2) + ' L' + (-shoulderW * 0.34) + ' ' + hipY.toFixed(2) + ' Z');
  }
  if (trailEls.head) {
    trailEls.head.setAttribute('cy', (shoulderY - (TRAIL_RIG.headDiameter * h) / 2).toFixed(2));
  }
  if (trailEls.neck) {
    trailEls.neck.setAttribute('y', (shoulderY - (TRAIL_RIG.headDiameter * h) / 2 * 0.7).toFixed(2));
  }

  // Knees bend forward, so the two IK solutions are picked with opposite
  // signs for legs and arms.
  [['right', trailEls.legRight, trailEls.footRight], ['left', trailEls.legLeft, trailEls.footLeft]]
    .forEach(function (entry) {
      const f = feet[entry[0]];
      const knee = trailSolveJoint(0, hipY, f.x, f.y, thigh, shank, -1);
      if (entry[1]) {
        entry[1].setAttribute('points',
          '0,' + hipY.toFixed(2) + ' ' + knee.x.toFixed(2) + ',' + knee.y.toFixed(2) +
          ' ' + f.x.toFixed(2) + ',' + f.y.toFixed(2));
      }
      if (entry[2]) {
        // A short foot pointing the way the character is travelling, so the
        // figure has something to actually stand on.
        entry[2].setAttribute('d',
          'M' + f.x.toFixed(2) + ' ' + f.y.toFixed(2) + ' L' + (f.x + 0.42 * h).toFixed(2) + ' ' + f.y.toFixed(2));
      }
    });

  // W4: each arm swings with the opposite leg.
  [[trailEls.armRight, TRAIL_LIMB_PHASE.armRight, 1], [trailEls.armLeft, TRAIL_LIMB_PHASE.armLeft, -1]]
    .forEach(function (entry) {
      const el = entry[0];
      if (!el) return;
      const swing = still ? 0 : TRAIL_ARM_SWING * h * Math.cos(2 * Math.PI * (phase + entry[1]));
      const shoulderX = entry[2] * shoulderW * 0.34;
      const handX = shoulderX + swing;
      const handY = shoulderY + (upperArm + foreArm) * 0.92;
      const elbow = trailSolveJoint(shoulderX, shoulderY, handX, handY, upperArm, foreArm, 1);
      el.setAttribute('points',
        shoulderX.toFixed(2) + ',' + shoulderY.toFixed(2) + ' ' +
        elbow.x.toFixed(2) + ',' + elbow.y.toFixed(2) + ' ' +
        handX.toFixed(2) + ',' + handY.toFixed(2));
    });
}

// ─── LOOP ────────────────────────────────────────────────────────────────
function trailStep(ts) {
  const dt = trailLastTs ? Math.min((ts - trailLastTs) / 1000, 0.05) : 0;
  trailLastTs = ts;

  // The Pocketbook is one screen among several. While it is off screen
  // there is nothing to draw, so skip the frame's work but keep the loop
  // alive rather than tearing it down and rebuilding on every route change.
  const mount = document.getElementById('trail-band');
  if (!mount || !mount.offsetParent) {
    trailRafId = window.requestAnimationFrame(trailStep);
    return;
  }

  const reduced = trailPrefersReducedMotion();
  // Target speed from what is held. Both keys at once cancel rather than
  // fighting, which is what a player expects.
  let target = 0;
  if (trailInput.forward && !trailInput.back) target = TRAIL_MARCH_SPEED;
  else if (trailInput.back && !trailInput.forward) target = -TRAIL_MARCH_SPEED * TRAIL_BACK_SPEED_FACTOR;

  if (trailJumpTarget !== null) {
    trailVelocity = 0;
    trailJumpElapsed += dt;
    const u = trailJumpDuration > 0 ? Math.min(1, trailJumpElapsed / trailJumpDuration) : 1;
    if (reduced || u >= 1) {
      trailCameraX = trailJumpTarget;
      trailJumpTarget = null;
    } else {
      trailCameraX = trailJumpFrom + (trailJumpTarget - trailJumpFrom) * trailEaseInOut(u);
    }
  } else if (reduced) {
    // Direct manipulation is still fine with reduced motion on — what is
    // not fine is the gait and the bob, which trailRender() freezes. The
    // ramp is skipped so nothing eases.
    trailVelocity = target;
    trailCameraX += trailVelocity * dt;
  } else {
    // Ramp toward the target. Accelerating is quicker than stopping, which
    // is both true of walking and reads better than a snap in either
    // direction.
    const rate = (target === 0)
      ? TRAIL_MARCH_SPEED / TRAIL_DECEL_TIME
      : TRAIL_MARCH_SPEED / TRAIL_ACCEL_TIME;
    const delta = target - trailVelocity;
    const maxStep = rate * dt;
    trailVelocity += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
    trailCameraX += trailVelocity * dt;
  }

  // The trail has two ends. Walking into one stops the gait rather than
  // grinding against an invisible wall.
  const maxX = trailWorldLength();
  if (trailCameraX < 0) { trailCameraX = 0; trailVelocity = 0; }
  if (trailCameraX > maxX) { trailCameraX = maxX; trailVelocity = 0; }

  // W1/W2: cadence is derived from the speed we just resolved, so the feet
  // stay planted through the entire ramp and not only at full march.
  if (!reduced && Math.abs(trailVelocity) > 0.01) {
    const cadence = trailCadence(trailVelocity, trailActiveStride());
    // Phase advances by half a cycle per step.
    trailGaitPhase = (trailGaitPhase + (cadence / 2) * dt) % 1;
  }

  trailRender();
  trailRafId = window.requestAnimationFrame(trailStep);
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────
function trailNearestStationIndex() {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < TRAIL_STATIONS.length; i++) {
    const d = Math.abs(trailStationWorldX(i) - trailCameraX);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function trailCurrentStationId() {
  const i = trailNearestStationIndex();
  const d = Math.abs(trailStationWorldX(i) - trailCameraX);
  return d <= TRAIL_STATION_ARRIVE_RADIUS ? TRAIL_STATIONS[i].id : null;
}

// A/D — travel to the adjacent station and open it. The activity's own
// content comes from the Pocketbook rather than being duplicated here.
function trailGoToStation(index) {
  const i = Math.max(0, Math.min(TRAIL_STATIONS.length - 1, index));
  trailJumpFrom = trailCameraX;
  trailJumpTarget = trailStationWorldX(i);
  trailJumpElapsed = 0;
  // Longer hops take a little longer, but never unboundedly so.
  const distance = Math.abs(trailJumpTarget - trailJumpFrom);
  trailJumpDuration = Math.min(
    TRAIL_JUMP_MAX_S,
    TRAIL_JUMP_MIN_S + (distance / TRAIL_STATION_SPACING) * 0.12
  );
  trailInput.forward = false;
  trailInput.back = false;
  const id = TRAIL_STATIONS[i].id;
  if (typeof pbOpenActivity === 'function') pbOpenActivity(id);
  trailAnnounce(id);
  return id;
}

function trailNextStation() {
  const from = trailJumpTarget !== null
    ? Math.round(trailJumpTarget / TRAIL_STATION_SPACING)
    : trailNearestStationIndex();
  return trailGoToStation(from + 1);
}
function trailPrevStation() {
  const from = trailJumpTarget !== null
    ? Math.round(trailJumpTarget / TRAIL_STATION_SPACING)
    : trailNearestStationIndex();
  return trailGoToStation(from - 1);
}

// The trail is a visual layer; a screen reader gets the station name
// through this live region instead.
function trailAnnounce(id) {
  const el = document.getElementById('trail-status');
  if (!el) return;
  const activity = typeof ACTIVITIES !== 'undefined'
    ? ACTIVITIES.filter(function (a) { return a.id === id; })[0]
    : null;
  el.textContent = activity
    ? (typeof pbT === 'function' ? pbT(activity, 'name') : activity.name)
    : '';
}

// ─── INPUT ───────────────────────────────────────────────────────────────
// WASD are bare letter keys, so this has to be careful about when it is
// entitled to them. It yields to anything that wants text or has taken over
// the screen: a focused field, Run Mode, the timer, the search dialog, and
// any chord (so Cmd+D still bookmarks and Ctrl+S still saves).
function trailKeyGuard(e) {
  if (!trailEls) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const el = e.target;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
  if (el && el.isContentEditable) return false;
  const blocking = ['pb-runMode', 'pb-timerModal', 'search-overlay'];
  for (let i = 0; i < blocking.length; i++) {
    const m = document.getElementById(blocking[i]);
    if (m && m.classList.contains('active')) return false;
  }
  // Only while the trail is actually on screen.
  const mount = document.getElementById('trail-band');
  if (!mount || !mount.offsetParent) return false;
  return true;
}

// Returns true when the key was consumed, so the caller can decide whether
// to preventDefault.
function trailHandleKey(e, isDown) {
  if (!trailKeyGuard(e)) return false;
  const k = (e.key || '').toLowerCase();
  if (k === 'w') { trailInput.forward = isDown; return true; }
  if (k === 's') { trailInput.back = isDown; return true; }
  if (!isDown) return false;
  // A/D are momentary, so they only act on press.
  if (k === 'd') { trailNextStation(); return true; }
  if (k === 'a') { trailPrevStation(); return true; }
  return false;
}

// ─── LIFECYCLE ───────────────────────────────────────────────────────────
function trailInit() {
  const mount = document.getElementById('trail-band');
  if (!mount) return; // no trail on this screen — nothing to do
  trailBuild(mount);
  trailRender();
  if (trailRafId === null) {
    trailLastTs = 0;
    trailRafId = window.requestAnimationFrame(trailStep);
  }
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return; // held keys are state, not a stream of events
    if (trailHandleKey(e, true)) e.preventDefault();
  });
  // Key release is unconditional on purpose. If a modal opened or focus
  // moved into a field while W was held, the guard would reject the keyup
  // and the character would march on with nothing able to stop it.
  document.addEventListener('keyup', function (e) {
    const k = (e.key || '').toLowerCase();
    if (k === 'w') trailInput.forward = false;
    if (k === 's') trailInput.back = false;
  });
  // Releasing a key outside the window would otherwise leave the character
  // marching off on its own.
  window.addEventListener('blur', function () {
    trailInput.forward = false;
    trailInput.back = false;
  });
}

function trailStop() {
  if (trailRafId !== null) {
    window.cancelAnimationFrame(trailRafId);
    trailRafId = null;
  }
  trailInput.forward = false;
  trailInput.back = false;
}

// ─── TEST HOOK ───────────────────────────────────────────────────────────
// test/trail-frames.js drives the world from here so it can assert on real
// runtime state — above all that a planted foot does not move in world
// space, which is the one thing a still frame can never show.
const TrailDebug = {
  get cameraX() { return trailCameraX; },
  set cameraX(v) { trailCameraX = v; },
  get velocity() { return trailVelocity; },
  set velocity(v) { trailVelocity = v; },
  get gaitPhase() { return trailGaitPhase; },
  set gaitPhase(v) { trailGaitPhase = v; },
  footWorldX: trailFootWorldX,
  footOffset: trailFootOffsetAt,
  stanceFraction: TRAIL_STANCE_FRACTION,
  activeStride: trailActiveStride,
  currentStationId: trailCurrentStationId,
  goToStation: trailGoToStation,
  render: trailRender,
  stop: trailStop,
  input: trailInput,
};
if (typeof window !== 'undefined') window.TrailDebug = TrailDebug;
