#!/usr/bin/env node
// Zero-dependency unit tests for this app's pure(ish) logic — the QR/
// share-link round-trip and the arc-balance time computation. These run
// entirely in Node (no browser, no server), by loading the real source
// files into an isolated vm context with minimal DOM/global stubs — same
// technique as scripts/check-i18n-sync.js. Confirmed safe: none of the
// target files (pocketbook-data.js, pocketbook-builder.js, pocketbook-
// export.js, pocketbook-init.js) have top-level DOM/window side effects,
// only function/variable declarations, so loading them here doesn't
// require a full browser environment.
//
// Important vm quirk this file works around: `let`/`const` top-level
// declarations in vm-executed code do NOT become properties of the
// context object the way `var` would (same distinction as `let x` vs
// `var x` never creating `window.x` in a real browser — a vm context's
// object is that realm's global object). That means `context.pbSession =
// [...]` from outside is invisible to code running inside, and reading
// `context.pbSession` after an inside mutation is stale. Every state
// read/write below goes through run() — executing an actual code string
// inside the context — instead of touching context properties directly.
//
// Usage: node test/unit.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');

function loadContext() {
  const context = {
    URLSearchParams,
    console,
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
    },
    window: {
      location: { origin: 'https://forest4youth.example', pathname: '/index.html', search: '', hash: '' },
      matchMedia: () => ({ matches: false }),
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    T: { en: {}, fr: {}, de: {} },
    currentLang: 'en',
    setLang: (lang) => { context.currentLang = lang; },
    warnFailure: () => {},
    t: (key) => key,
    // pocketbook-init.js's own trailing DOMContentLoaded/Promise bootstrap
    // calls the real pbInit(), which in turn calls these render functions
    // (defined in pocketbook-activities.js, not loaded here — this file
    // only needs pbRestoreSharedSession/exportBuildSessionURL/
    // pbComputeGroupTime). No-op stubs so that unavoidable auto-bootstrap
    // doesn't throw; none of the tests below exercise what they'd render.
    pbRenderGroups: () => {},
    pbRenderFilters: () => {},
    pbRenderAdaptations: () => {},
    pbRenderBuilder: () => {},
    pbRefreshAddButtons: () => {},
    pbRestoreReflectState: () => {},
    pbRenderReflectSummary: () => {},
  };
  vm.createContext(context);

  for (const file of ['pocketbook-data.js', 'pocketbook-builder.js', 'pocketbook-export.js', 'pocketbook-init.js']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(src, context, { filename: file });
  }
  // pocketbook-builder.js's real pbRenderBuilder() (unlike the render
  // functions above, which live in pocketbook-activities.js and were
  // never loaded here at all) touches the DOM directly and would throw
  // against the getElementById(): null stub — pbInit()'s auto-bootstrap
  // calls it regardless. Neutralize it the same way, after the real file
  // has already defined pbComputeGroupTime/pbGetItemMins from it.
  vm.runInContext('pbRenderBuilder = function(){};', context);

  // run(code): evaluate a code string inside the context's real lexical
  // environment (so it sees/mutates the actual `let` bindings), then JSON-
  // normalize the result back into this file's realm (vm-context arrays/
  // objects have a different Array/Object identity, which trips up
  // assert.deepStrictEqual's prototype check even when the data matches).
  function run(code) {
    const result = vm.runInContext(code, context);
    return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
  }

  return { run };
}

const TESTS = [];
function test(name, fn) { TESTS.push([name, fn]); }

test('pbComputeGroupTime sums minutes per arc group, using overrides when present', () => {
  const { run } = loadContext();
  const ids = run('ACTIVITIES.slice(0, 3).map(a => a.id)');
  const expectedGroups = run(`ACTIVITIES.filter(a => ${JSON.stringify(ids)}.includes(a.id)).reduce((m,a) => (m[a.id]=a.group, m), {})`);
  const defaultMins = run(`ACTIVITIES.filter(a => ${JSON.stringify(ids)}.includes(a.id)).reduce((m,a) => (m[a.id]=(a.durMax||a.durAvg||5), m), {})`);

  run(`pbSessionMins = ${JSON.stringify({ [ids[0]]: 42 })};`);
  const groupTime = run(`pbComputeGroupTime(${JSON.stringify(ids)})`);

  const expected = [0, 0, 0, 0, 0, 0];
  ids.forEach(id => {
    expected[expectedGroups[id]] += id === ids[0] ? 42 : defaultMins[id];
  });
  assert.deepStrictEqual(groupTime, expected);
});

test('pbComputeGroupTime returns all zeros for an empty session', () => {
  const { run } = loadContext();
  assert.deepStrictEqual(run('pbComputeGroupTime([])'), [0, 0, 0, 0, 0, 0]);
});

test('pbComputeGroupTime ignores an id not present in ACTIVITIES', () => {
  const { run } = loadContext();
  assert.deepStrictEqual(run(`pbComputeGroupTime(['__not_a_real_activity__'])`), [0, 0, 0, 0, 0, 0]);
});

test('exportBuildSessionURL / pbRestoreSharedSession round-trip: order, timing, language, session details', () => {
  const { run } = loadContext();
  const ids = run('ACTIVITIES.slice(0, 3).map(a => a.id)');

  run(`pbSession = ${JSON.stringify(ids)};`);
  run(`pbSessionMins = ${JSON.stringify({ [ids[0]]: 62, [ids[2]]: 8 })};`);
  run(`currentLang = 'fr';`);
  run(`pbSessionMeta = ${JSON.stringify({ startTime: '09:30', site: 'Riverside Camp', practitioner: 'A. Dubois' })};`);

  const url = run('exportBuildSessionURL()');
  assert.ok(url.includes('#implement/mod-pocket'), 'URL should target the Session Builder screen');

  // Simulate a fresh load: reset state, point window.location.search at
  // the built URL's query string, then restore from it — exactly what a
  // browser opening the share link does.
  const [, query] = url.split('?');
  const [queryString] = query.split('#');
  run(`pbSession = []; pbSessionMins = {}; currentLang = 'en'; pbSessionMeta = { startTime: '', site: '', practitioner: '' };`);
  run(`window.location.search = ${JSON.stringify('?' + queryString)};`);

  run('pbRestoreSharedSession()');

  assert.deepStrictEqual(run('pbSession'), ids, 'order should round-trip exactly');
  const mins = run('pbSessionMins');
  assert.strictEqual(mins[ids[0]], 62, 'timing override should round-trip');
  assert.strictEqual(mins[ids[2]], 8, 'timing override should round-trip');
  assert.strictEqual(run('currentLang'), 'fr', 'language should round-trip via setLang()');
  const meta = run('pbSessionMeta');
  assert.strictEqual(meta.startTime, '09:30', 'start time should round-trip');
  assert.strictEqual(meta.site, 'Riverside Camp', 'site should round-trip');
  assert.strictEqual(meta.practitioner, 'A. Dubois', 'practitioner should round-trip');
});

test('pbRestoreSharedSession leaves session details blank when the share link has none', () => {
  const { run } = loadContext();
  run(`window.location.search = '?s=0';`);
  run('pbRestoreSharedSession()');
  assert.deepStrictEqual(run('pbSessionMeta'), { startTime: '', site: '', practitioner: '' });
});

test('pbRestoreSharedSession ignores a malformed ?s= without throwing', () => {
  const { run } = loadContext();
  run(`window.location.search = '?s=not-a-real-encoding&m=garbage';`);
  assert.doesNotThrow(() => run('pbRestoreSharedSession()'));
  // Indices that don't parse to a real ACTIVITIES entry are dropped, not crashed on.
  assert.deepStrictEqual(run('pbSession'), []);
});

test('pbRestoreSharedSession drops a timing override whose activity index is out of range', () => {
  const { run } = loadContext();
  run(`window.location.search = '?s=0&m=999:50';`);
  run('pbRestoreSharedSession()');
  assert.strictEqual(run('pbSession').length, 1);
  assert.deepStrictEqual(run('pbSessionMins'), {}, 'an override for an activity not in the session should be dropped');
});

// ── walk-forest-physics.js (the 3D backdrop's physics core) ──
// Pure functions over typed arrays, no DOM/THREE, so they load into a bare
// vm context. These pin down the physical behaviour the scene relies on.
function loadPhysics() {
  const context = { Math, Float32Array, Uint8Array };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'walk-forest-physics.js'), 'utf8'), context, { filename: 'walk-forest-physics.js' });
  return (code) => vm.runInContext(code, context);
}

test('wfpSpring converges to the target without overshoot (critically damped)', () => {
  const run = loadPhysics();
  const r = run(`(function () {
    const s = { x: 0, v: 0 }; let max = 0;
    for (let i = 0; i < 600; i++) { wfpSpring(s, 1, 3, 1 / 60); max = Math.max(max, s.x); }
    return { x: s.x, max };
  })()`);
  assert.ok(Math.abs(r.x - 1) < 1e-3, 'settles on the target');
  assert.ok(r.max <= 1 + 1e-6, 'never overshoots');
});

test('wfpAdvance runs whole fixed steps and caps a long hitch', () => {
  const run = loadPhysics();
  const r = run(`(function () {
    const clock = { acc: 0 }; let n = 0;
    wfpAdvance(clock, 0.05, () => n++);        // 3 steps at 1/60
    const a = n;
    wfpAdvance(clock, 10, () => n++);          // a 10s stall: capped
    return { a, b: n - a };
  })()`);
  assert.strictEqual(r.a, 3);
  assert.strictEqual(r.b, 5, 'catch-up is capped at WFP_MAX_STEPS');
});

test('leaves fall near terminal velocity (~1 m/s), land, and lie flat', () => {
  const run = loadPhysics();
  const r = run(`(function () {
    const pool = wfpPool(4), field = wfpGustField();
    const i = wfpSpawn(pool, WFP_LEAF, 0, 8, 0, 0, 0, 0, 60, 0.15, 0);
    let vmax = 0, t = 0;
    while (pool.state[i] === 1 && t < 30) {
      wfpStepPool(pool, field, t, 1 / 60, () => 0);
      vmax = Math.max(vmax, -pool.vy[i]); t += 1 / 60;
    }
    return { state: pool.state[i], y: pool.py[i], vmax, t };
  })()`);
  assert.strictEqual(r.state, 2, 'came to rest on the ground');
  assert.ok(r.y >= 0 && r.y < 0.05, 'resting at ground height');
  assert.ok(r.vmax > 0.6 && r.vmax < 2.5, 'fell at a leaf-like speed, not a stone-like one (' + r.vmax.toFixed(2) + ' m/s)');
  assert.ok(r.t > 3, 'took seconds, not a fraction of one, to fall 8m');
});

test('a strong pointer gust lifts a resting leaf; ambient wind alone does not', () => {
  const run = loadPhysics();
  const r = run(`(function () {
    const pool = wfpPool(2), field = wfpGustField();
    const i = wfpSpawn(pool, WFP_LEAF, 0, 0.5, 0, 0, 0, 0, 60, 0.15, 0);
    let t = 0;
    while (pool.state[i] === 1) { wfpStepPool(pool, field, t, 1 / 60, () => 0); t += 1 / 60; }
    for (let k = 0; k < 120; k++) { wfpStepPool(pool, field, t, 1 / 60, () => 0); t += 1 / 60; }
    const stillResting = pool.state[i] === 2;
    wfpAddGust(field, 0, 0, 12, 0);
    wfpStepPool(pool, field, t, 1 / 60, () => 0);
    return { stillResting, lifted: pool.state[i] === 1 };
  })()`);
  assert.ok(r.stillResting, 'ambient wind leaves it on the ground');
  assert.ok(r.lifted, 'a gust picks it back up');
});

test('tree springs lean with the wind, recoil after a shove, and stay bounded', () => {
  const run = loadPhysics();
  const r = run(`(function () {
    const b = wfpBenders(1), field = wfpGustField();
    b.x[0] = 0; b.z[0] = 0; b.h[0] = 10;
    for (let s = 0; s < 600; s++) wfpStepBenders(b, field, s / 60, 1 / 60, 0, 1);
    const lean = Math.hypot(b.bx[0], b.bz[0]);
    wfpKickBender(b, 0, 50, 0);
    let max = 0, sign = 0, crossings = 0;
    for (let s = 0; s < 600; s++) {
      wfpStepBenders(b, field, 10 + s / 60, 1 / 60, 0, 1);
      max = Math.max(max, Math.hypot(b.bx[0], b.bz[0]));
      const sg = Math.sign(b.vx[0]);
      if (sign && sg && sg !== sign) crossings++;
      if (sg) sign = sg;
    }
    return { lean, max, crossings, cap: WFP_BEND_MAX };
  })()`);
  assert.ok(r.lean > 0.05 && r.lean < 1, 'ambient wind leans a 10m crown a little (' + r.lean.toFixed(2) + 'm)');
  assert.ok(r.max <= r.cap + 1e-6, 'bend never exceeds the cap');
  assert.ok(r.crossings >= 2, 'a shove makes it sway back and forth (underdamped), not just drift');
});

test('verlet rope holds its length and hangs below its pins', () => {
  const run = loadPhysics();
  const r = run(`(function () {
    const n = 11, v = wfpVerlet(n), field = wfpGustField();
    for (let k = 0; k < n; k++) {
      const x = k * 0.3;
      if (k === 0 || k === n - 1) wfpVerletPin(v, k, x, 2, 0); else wfpVerletSet(v, k, x, 2, 0);
    }
    for (let k = 0; k < n - 1; k++) wfpVerletLink(v, k, k + 1, 0.32);
    for (let s = 0; s < 900; s++) wfpStepVerlet(v, field, s / 60, 1 / 60, 8);
    let len = 0;
    for (let k = 0; k < n - 1; k++) len += Math.hypot(v.x[(k+1)*3] - v.x[k*3], v.x[(k+1)*3+1] - v.x[k*3+1], v.x[(k+1)*3+2] - v.x[k*3+2]);
    return { len, midY: v.x[5 * 3 + 1], endY: v.x[1], finite: Array.from(v.x).every(Number.isFinite) };
  })()`);
  assert.ok(r.finite, 'no NaN/Infinity');
  assert.ok(Math.abs(r.len - 3.2) < 0.15, 'total length stays near rest (' + r.len.toFixed(2) + ')');
  assert.ok(r.midY < 1.9, 'middle sags under gravity');
  assert.strictEqual(r.endY, 2, 'pinned ends stay put');
});

function main() {
  let failures = 0;
  for (const [name, fn] of TESTS) {
    try {
      fn();
      console.log(`  ok  - ${name}`);
    } catch (err) {
      failures++;
      console.error(`FAIL  - ${name}`);
      console.error(`        ${err.message}`);
    }
  }
  console.log('');
  if (failures) {
    console.error(`${failures}/${TESTS.length} unit tests failed.`);
    process.exit(1);
  }
  console.log(`All ${TESTS.length} unit tests passed.`);
}

main();
