#!/usr/bin/env node
// Geometry linter for the trail world. Checks every law in
// .claude/skills/revampnwasd/SKILL.md numerically — D1-D6 (depth), P1-P2
// (figure proportion), W1-W4 (walk cycle), C1-C2 (corridor + stations).
//
// Pure math and data: no browser, no server. trail-data.js is declarations
// only, so it loads into a vm context the same way test/unit.js loads the
// pocketbook files. Fast enough to run on every edit.
//
// The point of this file is the checks a person cannot do by looking. W1 in
// particular sweeps the whole speed range including the acceleration ramp,
// which is where foot slide hides — a gait that is correct at march speed
// and wrong at 30% of it looks fine in a still frame and wrong in motion.
//
// Usage: node test/trail-lint.js
// Exits 0 on success, 1 with a report on any failure.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const EPS = 1e-9;

// ─── load ────────────────────────────────────────────────────────────────
function load(files) {
  const context = { console, Math, Array, Object, JSON };
  vm.createContext(context);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  }
  // `const`/`let` at the top level of vm code do not become properties of
  // the context object (same as `let x` never creating `window.x`), so
  // everything is read back by evaluating an expression inside the realm.
  return (expr) => vm.runInContext(expr, context);
}

const run = load(['figure-rig.js', 'trail-data.js', 'pocketbook-data.js']);

// ─── harness ─────────────────────────────────────────────────────────────
const failures = [];
let checks = 0;

function check(law, what, ok, detail) {
  checks++;
  if (!ok) failures.push(`[${law}] ${what}` + (detail ? ` — ${detail}` : ''));
}
function near(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? EPS : tol);
}

const layers = run('TRAIL_LAYERS');
const stations = run('TRAIL_STATIONS');
const rig = run('TRAIL_RIG');
const horizonY = run('TRAIL_HORIZON_Y');
const baselineY = run('TRAIL_BASELINE_Y');
const activityIds = run('ACTIVITIES.map(a => a.id)');
const corridorNear = run('TRAIL_CORRIDOR_NEAR');
const corridorFar = run('TRAIL_CORRIDOR_FAR');
const exceptions = run('TRAIL_CORRIDOR_EXCEPTIONS');

// ─── D1: one horizon ─────────────────────────────────────────────────────
// Every layer's ground line must be the same function of depth, which means
// they all converge on one horizon. Checked by pushing depth very large:
// the ground line must approach TRAIL_HORIZON_Y for every layer.
for (const layer of layers) {
  const farAway = run(`trailGroundY(1e9)`);
  check('D1', `layer "${layer.id}" resolves the shared horizon`,
    near(farAway, horizonY, 1e-3), `got ${farAway}, expected ${horizonY}`);
}
check('D1', 'depth 1 lands on the baseline',
  near(run('trailGroundY(1)'), baselineY), `got ${run('trailGroundY(1)')}`);

// ─── D2: parallax speed equals scale ─────────────────────────────────────
// The law most easily broken by "just nudging" one layer.
for (const layer of layers) {
  const s = run(`trailScale(${layer.depth})`);
  const v = run(`trailSpeed(${layer.depth})`);
  check('D2', `layer "${layer.id}" speed equals scale`,
    near(s, v, 1e-6), `scale ${s} vs speed ${v}`);
}
// Also across a sweep, so a future non-linear scale function can't pass by
// coincidence at the five declared depths.
for (let d = 0.4; d <= 12; d += 0.1) {
  const s = run(`trailScale(${d})`);
  const v = run(`trailSpeed(${d})`);
  check('D2', `speed equals scale at depth ${d.toFixed(1)}`, near(s, v, 1e-6));
}

// ─── D3: ground contact follows perspective ──────────────────────────────
// Every placed prop must sit on its own depth's ground line, not a
// hand-chosen y.
stations.forEach((st, i) => {
  const stationX = run(`trailStationWorldX(${i})`);
  st.props.forEach((prop, j) => {
    const placed = run(`trailPlaceProp(TRAIL_STATIONS[${i}].props[${j}], ${stationX}, 0)`);
    const expected = run(`trailGroundY(${prop.depth})`);
    check('D3', `${st.id} prop ${j} (${prop.kind}) sits on its ground line`,
      near(placed.groundY, expected, 1e-6), `got ${placed.groundY}, expected ${expected}`);
    // And it must be between horizon and the bottom of the world, or it is
    // placed somewhere the viewer cannot make sense of.
    check('D3', `${st.id} prop ${j} (${prop.kind}) ground line is below the horizon`,
      placed.groundY > horizonY, `groundY ${placed.groundY} vs horizon ${horizonY}`);
  });
});

// ─── D4: atmospheric perspective is monotonic ────────────────────────────
let prevOpacity = Infinity;
for (const layer of trailSortByDepthAsc(layers)) {
  const o = run(`trailHaze(${layer.depth})`);
  check('D4', `layer "${layer.id}" opacity does not increase with depth`,
    o <= prevOpacity + EPS, `depth ${layer.depth} opacity ${o} > previous ${prevOpacity}`);
  prevOpacity = o;
}
// Sweep too — the declared layers are only five samples of a continuous law.
let sweepPrev = Infinity;
for (let d = 0.4; d <= 12; d += 0.1) {
  const o = run(`trailHaze(${d})`);
  check('D4', `haze non-increasing at depth ${d.toFixed(1)}`, o <= sweepPrev + 1e-9);
  check('D4', `haze never exceeds 1 at depth ${d.toFixed(1)}`, o <= 1 + EPS, `got ${o}`);
  sweepPrev = o;
}

function trailSortByDepthAsc(list) {
  return list.slice().sort((a, b) => a.depth - b.depth);
}

// ─── D5: z-order equals depth order ──────────────────────────────────────
const sorted = run('trailSortedLayers()');
for (let i = 1; i < sorted.length; i++) {
  check('D5', `render order is depth-descending at index ${i}`,
    sorted[i - 1].depth >= sorted[i].depth,
    `${sorted[i - 1].id}(${sorted[i - 1].depth}) before ${sorted[i].id}(${sorted[i].depth})`);
}
const characterDepth = run('TRAIL_CHARACTER_DEPTH');
const fringe = sorted[sorted.length - 1];
check('D5', 'a foreground layer exists nearer than the character',
  fringe.depth < characterDepth, `nearest layer is ${fringe.id} at depth ${fringe.depth}`);
check('D5', 'the character plane is one of the declared layers',
  layers.some(l => l.depth === characterDepth));

// ─── D6: nothing floats ──────────────────────────────────────────────────
stations.forEach((st, i) => {
  const stationX = run(`trailStationWorldX(${i})`);
  st.props.forEach((prop, j) => {
    const placed = run(`trailPlaceProp(TRAIL_STATIONS[${i}].props[${j}], ${stationX}, 0)`);
    check('D6', `${st.id} prop ${j} (${prop.kind}) has a contact shadow`,
      !!placed.shadow);
    check('D6', `${st.id} prop ${j} (${prop.kind}) shadow sits on its ground line`,
      near(placed.shadow.cy, placed.groundY, 1e-6));
    check('D6', `${st.id} prop ${j} (${prop.kind}) shadow is scaled by depth`,
      near(placed.shadow.rx, run(`TRAIL_SHADOW_RX * trailScale(${prop.depth})`), 1e-6));
    check('D6', `${st.id} prop ${j} (${prop.kind}) shadow tracks the prop horizontally`,
      near(placed.shadow.cx, placed.x, 1e-6));
  });
});
const character = run('trailPlaceCharacter()');
check('D6', 'the character has a contact shadow', !!character.shadow);
check('D6', 'the character shadow sits on the baseline',
  near(character.shadow.cy, baselineY, 1e-6));

// ─── P1/P2: figure proportion ────────────────────────────────────────────
check('P1', 'rig total height is within the head-count band',
  rig.totalHeight >= run('TRAIL_RIG_HEADS_MIN') && rig.totalHeight <= run('TRAIL_RIG_HEADS_MAX'),
  `${rig.totalHeight} heads`);
check('P2', 'head + torso + legs close to the declared total height',
  near(rig.headDiameter + rig.torsoLength + rig.legLength, rig.totalHeight, 1e-6),
  `${rig.headDiameter} + ${rig.torsoLength} + ${rig.legLength} != ${rig.totalHeight}`);
for (const part of ['headDiameter', 'shoulderWidth', 'torsoLength', 'armLength', 'legLength']) {
  check('P2', `rig part "${part}" is a positive ratio`, rig[part] > 0, `got ${rig[part]}`);
}
check('P2', 'arms are shorter than legs', rig.armLength < rig.legLength);
const headD = run('TRAIL_HEAD_DIAMETER');
check('P1', 'character height derives from the rig, not a literal',
  near(run(`trailFigureHeight(${headD})`), rig.totalHeight * headD, 1e-6));
check('P1', 'character fits between baseline and horizon',
  run(`trailFigureHeight(${headD})`) < baselineY - horizonY,
  `figure ${run(`trailFigureHeight(${headD})`)} vs span ${baselineY - horizonY}`);

// ─── P3: the stride must be reachable ────────────────────────────────────
// A two-bone limb cannot stretch. If the stride sweeps the foot further
// than the hip can reach, the leg either detaches from the foot or the
// figure sinks into a crouch to compensate — both of which look wrong in
// ways that no other law here would catch.
const hipFactor = run('TRAIL_HIP_HEIGHT_FACTOR');
const strideForReach = run(`trailStrideLength(${headD})`);
// Swept by phase rather than checked against a worst case, because the
// worst cases do not co-occur: the hip peaks at mid-stance, exactly when
// the legs are together and reach is least constrained. Combining the two
// extremes rejects rigs that are in fact fine.
for (let i = 0; i < 120; i++) {
  const p = i / 120;
  const slack = run(`trailReachSlackAt(${p}, ${headD}, ${strideForReach})`);
  check('P3', `legs reach their feet at phase ${p.toFixed(3)}`,
    slack >= 0, `over-extended by ${(-slack).toFixed(3)} view units`);
}
// If the clamp inside trailHipYAt ever engages during a normal cycle, the
// stride is too long: the figure would sink instead of walking, and the
// bob it is supposed to have would be quietly eaten.
for (let i = 0; i < 120; i++) {
  const p = i / 120;
  const clamped = run(`trailHipYAt(${p}, ${headD}, ${strideForReach})`);
  const unclamped = run(
    `-TRAIL_RIG.legLength * ${headD} * TRAIL_HIP_HEIGHT_FACTOR + trailBodyBobAt(${p}, trailFigureHeight(${headD}))`);
  check('P3', `hip is not clamped down at phase ${p.toFixed(3)}`,
    near(clamped, unclamped, 1e-6),
    `clamp lowered the hip by ${(clamped - unclamped).toFixed(3)}`);
}
check('P3', 'the knee keeps a bend at walking height',
  hipFactor < 1, `hip factor ${hipFactor} leaves the leg fully extended`);
check('P3', 'thigh and shank sum to leg length',
  near(rig.thigh + rig.shank, rig.legLength, 1e-9),
  `${rig.thigh} + ${rig.shank} != ${rig.legLength}`);
check('P3', 'upper arm and forearm sum to arm length',
  near(rig.upperArm + rig.foreArm, rig.armLength, 1e-9),
  `${rig.upperArm} + ${rig.foreArm} != ${rig.armLength}`);
check('P3', 'stance fraction keeps a foot on the ground at all times',
  run('TRAIL_STANCE_FRACTION') > 0.5,
  `${run('TRAIL_STANCE_FRACTION')} would leave both feet airborne`);

// ─── W1/W2: no foot slide, at every speed ────────────────────────────────
// The planted foot must have zero world-space velocity. Equivalently
// stride x cadence must equal ground speed exactly — swept across the full
// range so the acceleration ramp is covered, not just the top speed.
const marchSpeed = run('TRAIL_MARCH_SPEED');
const stride = run(`trailStrideLength(${headD})`);
for (let i = 0; i <= 100; i++) {
  const v = (marchSpeed * i) / 100;
  const cadence = run(`trailCadence(${v}, ${stride})`);
  check('W1', `no foot slide at ${v.toFixed(1)} u/s (forward)`,
    near(stride * cadence, v, 1e-6), `stride*cadence = ${stride * cadence}, speed = ${v}`);
  const footV = run(`trailPlantedFootScreenVelocity(${v})`);
  check('W1', `planted foot cancels ground motion at ${v.toFixed(1)} u/s`,
    near(footV + v, 0, 1e-6), `foot ${footV} + ground ${v} != 0`);
}
// Walking back is a different gait — shorter stride, lower speed — and must
// obey the same law rather than being a mirrored copy of the march.
const backSpeed = marchSpeed * run('TRAIL_BACK_SPEED_FACTOR');
const backStride = stride * run('TRAIL_BACK_STRIDE_FACTOR');
for (let i = 0; i <= 100; i++) {
  const v = (backSpeed * i) / 100;
  const cadence = run(`trailCadence(${v}, ${backStride})`);
  check('W1', `no foot slide at ${v.toFixed(1)} u/s (backward)`,
    near(backStride * cadence, v, 1e-6));
}
check('W2', 'a standing figure has no cadence',
  run(`trailCadence(0, ${stride})`) === 0);
check('W2', 'cadence rises with speed',
  run(`trailCadence(${marchSpeed}, ${stride})`) > run(`trailCadence(${marchSpeed / 2}, ${stride})`));
check('W2', 'walking back uses a shorter stride than marching',
  backStride < stride, `${backStride} vs ${stride}`);
check('W2', 'walking back is slower than marching', backSpeed < marchSpeed);
// A gait cycle is two steps, so cadence and cycle must stay reciprocal.
check('W2', 'gait cycle is two steps',
  near(run(`trailGaitCycle(${marchSpeed}, ${stride})`),
       2 / run(`trailCadence(${marchSpeed}, ${stride})`), 1e-9));
// Sanity: the resulting cadence should be a human walking pace, roughly
// 90-130 steps/min. A rig that passes W1 but marches at 300 steps/min is
// arithmetically correct and still looks wrong.
const stepsPerMin = run(`trailCadence(${marchSpeed}, ${stride})`) * 60;
check('W2', 'march cadence is a human walking pace',
  stepsPerMin >= 90 && stepsPerMin <= 130, `${stepsPerMin.toFixed(1)} steps/min`);

// ─── W3: vertical bob ────────────────────────────────────────────────────
const bob = run('TRAIL_BOB_AMPLITUDE');
check('W3', 'bob amplitude is 2-3% of figure height',
  bob >= 0.02 && bob <= 0.03, `${bob}`);
check('W3', 'bob runs two oscillations per gait cycle',
  run('TRAIL_BOB_CYCLES_PER_GAIT') === 2);

// ─── W4: counter-phase limbs ─────────────────────────────────────────────
const phase = run('TRAIL_LIMB_PHASE');
check('W4', 'legs are half a cycle apart',
  near(Math.abs(phase.legLeft - phase.legRight), 0.5, 1e-9));
check('W4', 'arms are half a cycle apart',
  near(Math.abs(phase.armLeft - phase.armRight), 0.5, 1e-9));
check('W4', 'left arm swings with the right leg',
  near(phase.armLeft, phase.legRight, 1e-9));
check('W4', 'right arm swings with the left leg',
  near(phase.armRight, phase.legLeft, 1e-9));

// ─── C1: the trail corridor stays clear ──────────────────────────────────
for (const st of stations) {
  const isException = exceptions.indexOf(st.id) !== -1;
  for (let j = 0; j < st.props.length; j++) {
    const prop = st.props[j];
    const clears = run(`trailPropClearsCorridor(${prop.depth})`);
    if (isException) continue;
    check('C1', `${st.id} prop ${j} (${prop.kind}) keeps out of the walkway`,
      clears, `depth ${prop.depth} is inside the corridor (${corridorNear}, ${corridorFar})`);
  }
}
// The exception list is a liability, not a feature: keep it to the one
// station whose content genuinely is the path.
check('C1', 'only the Barefoot Trail may occupy the walkway',
  exceptions.length === 1 && exceptions[0] === 'barefoot',
  `exceptions: ${JSON.stringify(exceptions)}`);
check('C1', 'the barefoot exception is actually used',
  stations.some(s => s.id === 'barefoot' && s.props.some(p => !run(`trailPropClearsCorridor(${p.depth})`))));
check('C1', 'the corridor band is well formed', corridorNear < characterDepth && corridorFar > characterDepth);

// ─── C2: station integrity ───────────────────────────────────────────────
check('C2', 'there are 17 stations', stations.length === 17, `got ${stations.length}`);
for (const st of stations) {
  check('C2', `station "${st.id}" matches an activity`,
    activityIds.indexOf(st.id) !== -1);
  check('C2', `station "${st.id}" has at least one prop`, st.props.length > 0);
}
for (const id of activityIds) {
  check('C2', `activity "${id}" has a station`, stations.some(s => s.id === id));
}
const seen = new Set();
for (const st of stations) {
  check('C2', `station "${st.id}" is not duplicated`, !seen.has(st.id));
  seen.add(st.id);
}
const spacing = run('TRAIL_STATION_SPACING');
check('C2', 'station spacing clears the minimum separation',
  spacing >= run('TRAIL_STATION_MIN_SEPARATION'),
  `${spacing} < ${run('TRAIL_STATION_MIN_SEPARATION')}`);
check('C2', 'the arrival radius cannot span two stations',
  run('TRAIL_STATION_ARRIVE_RADIUS') * 2 < spacing);
// Props must stay within their own station's half-spacing, or two stations
// visually bleed into each other.
stations.forEach((st) => {
  st.props.forEach((prop, j) => {
    check('C2', `${st.id} prop ${j} (${prop.kind}) stays in its own station`,
      Math.abs(prop.dx) < spacing / 2,
      `dx ${prop.dx} vs half-spacing ${spacing / 2}`);
  });
});

// ─── report ──────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\ntrail-lint: ${failures.length} failure(s) of ${checks} checks\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  console.error('');
  process.exit(1);
}
console.log(`trail-lint: ${checks} checks passed`);
