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
