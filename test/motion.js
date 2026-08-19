#!/usr/bin/env node
// Motion regression test for Walk the Forest. Unlike test/motion-probe.js
// (a review instrument that produces evidence for a human to look at),
// this is pass/fail: it locks in the idle-motion grammar so a future
// change can't silently reintroduce the failures this branch fixed.
//
// Usage: node test/motion.js
// Exits 0 on success, 1 (with a report) on any failure.

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8980;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
      if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// Same sandbox accommodation as test/smoke.js — see that file's comment.
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  : {};

const BASE = `http://localhost:${PORT}/index.html`;

async function jumpToStation(page, stationId) {
  return page.evaluate((id) => {
    const idx = ACTIVITIES.findIndex(a => a.id === id);
    if (idx < 0) return false;
    WF.cam = idx; WF.mode = 'hold'; WF.openId = null; WF.paused = false; WF.barefootAt = null;
    wfRender();
    return true;
  }, stationId);
}

async function sceneAnimations(page) {
  return page.evaluate(() => {
    const scene = document.getElementById('wf-scene');
    return document.getAnimations()
      .filter(a => a.effect && a.effect.target && scene.contains(a.effect.target) && typeof a.animationName === 'string')
      .map(a => {
        const t = a.effect.getTiming();
        return { className: a.effect.target.getAttribute('class') || '', duration: t.duration, easing: t.easing };
      });
  });
}

// Duration allowlist: the shared beat and its harmonics (tokens.css,
// milliseconds), plus the named exceptions the plan explicitly carves
// out — a locomotion cycle (tied to camera travel, not ambient idle), a
// deliberately eye-catching interaction cue, a one-shot transition, and
// one deliberate off-ratio rung for cloud-layer parallax depth. Anything
// else appearing here means a 21st rogue duration snuck back in.
const BEAT_MS = new Set([3250, 6500, 9750, 13000, 19500, 39000, 78000, 91000]);
const EXCEPTION_DURATIONS_MS = new Set([
  1900,  // wfThigh/wfShin — locomotion, tied to camera travel speed, not the ambient beat
  4600,  // wf-ping — named exception, deliberately draws the eye to an armed pin
  3600,  // wfChipFloat — one-shot arrival transition, not an idle loop (28%/100% keyframe)
]);

async function testSharedBeatGrammar(browser) {
  const page = await browser.newPage({ viewport: { width: 768, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el);

  const stationIds = await page.evaluate(() => ACTIVITIES.map(a => a.id));
  const offGrammar = [];
  for (const id of stationIds) {
    await jumpToStation(page, id);
    const anims = await sceneAnimations(page);
    for (const a of anims) {
      if (BEAT_MS.has(a.duration) || EXCEPTION_DURATIONS_MS.has(a.duration)) continue;
      offGrammar.push({ station: id, className: a.className, duration: a.duration });
    }
  }
  assert.strictEqual(offGrammar.length, 0,
    `every idle animation must be on the shared beat scale or an explicitly listed exception; ` +
    `found off-grammar durations: ${JSON.stringify(offGrammar)}`);
  await page.close();
}

// Locks in the wfBuildCast() fix: a 'carry' pose's gesture must never be
// wfGesture (an arm-swing that reads as waving while supposedly carrying
// a load) — it must be wfLift (a small vertical bob) instead. See
// test/motion-dossier.md.
async function testCarryPoseUsesLiftNotGesture(browser) {
  const page = await browser.newPage({ viewport: { width: 768, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el);

  for (const id of ['sofa', 'roles']) {
    await jumpToStation(page, id);
    const classes = await page.evaluate(() => {
      const scene = document.getElementById('wf-scene');
      return [...scene.querySelectorAll('g[class]')].map(g => g.getAttribute('class'));
    });
    assert.ok(!classes.includes('wfGesture'), `${id}: a carry figure must not use wfGesture (reads as waving) — got classes ${JSON.stringify(classes)}`);
  }
  await page.close();
}

// Locks in every animated class's presence in the reduced-motion disable
// block — the exact check that would have caught the cascade-order bug
// this codebase's own comments record hitting twice already.
async function testReducedMotionCoversEveryAnimatedClass(browser) {
  const page = await browser.newPage({ viewport: { width: 768, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el);

  const stationIds = await page.evaluate(() => ACTIVITIES.map(a => a.id));
  const stillAnimating = [];
  for (const id of stationIds) {
    await jumpToStation(page, id);
    const running = await page.evaluate(() => {
      const scene = document.getElementById('wf-scene');
      // CSSAnimation only (typeof animationName === 'string') — CSS
      // Transitions (pin hover/state feedback, e.g. transition:
      // border-color .18s) are a separate mechanism with their own rules,
      // not covered by the idle-motion grammar's reduced-motion block.
      return document.getAnimations()
        .filter(a => a.effect && a.effect.target && scene.contains(a.effect.target) &&
          typeof a.animationName === 'string' && a.playState === 'running')
        .map(a => a.effect.target.getAttribute('class') || '');
    });
    if (running.length) stillAnimating.push({ station: id, classes: running });
  }
  assert.strictEqual(stillAnimating.length, 0,
    `no animation should be running under prefers-reduced-motion; found: ${JSON.stringify(stillAnimating)}`);
  await page.close();
}

// Locks in reachability under reduced motion: every station must still be
// reachable via wfGoNext/wfGoBack (ArrowRight/ArrowLeft), and each jump
// must be instant (no animation started).
async function testStationsReachableUnderReducedMotion(browser) {
  const page = await browser.newPage({ viewport: { width: 768, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el);

  const n = await page.evaluate(() => ACTIVITIES.length);
  await page.evaluate(() => { WF.cam = 0; WF.mode = 'hold'; wfRender(); });
  for (let i = 0; i < n - 1; i++) {
    await page.evaluate(() => wfGoNext());
  }
  const finalCam = await page.evaluate(() => Math.round(WF.cam));
  assert.strictEqual(finalCam, n - 1, `wfGoNext x${n - 1} under reduced motion should reach the last station, got index ${finalCam}`);
  await page.close();
}

// Locks in the f433b03 fix (stable nodes, no full-subtree rebuild during a
// move) for the reconciled cast/set/pins layers specifically — a
// regression here would reintroduce the strobing bug that commit fixed.
async function testNoSubtreeReplacementDuringMove(browser) {
  const page = await browser.newPage({ viewport: { width: 768, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el);

  const result = await page.evaluate(() => {
    WF.reduced = false; WF.from = 2; WF.to = 3; WF.mode = 'move'; WF.cam = 2;
    const t0 = performance.now();
    WF.moveStart = t0;
    const pinsBefore = WF.dom.pins;
    let replaced = false;
    for (let i = 0; i < 10; i++) {
      wfStep(t0 + i * 32);
      if (WF.dom.pins !== pinsBefore) replaced = true;
    }
    return { replaced };
  });
  assert.strictEqual(result.replaced, false, 'the pins container node must survive a camera move (f433b03 regression check)');
  await page.close();
}

// The rail (the row of small station markers) used to be inert divs with
// no click handler at all — this locks in that every rail button actually
// navigates: a normal click starts a tween toward the clicked station, and
// under reduced motion the same click snaps straight there.
async function testRailButtonsNavigate(browser) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el);

  const n = await page.evaluate(() => ACTIVITIES.length);
  await page.evaluate(() => { WF.cam = 0; WF.mode = 'hold'; wfSetOn(true); wfRender(); });

  const railCount = await page.$$eval('.wf-rail > button', els => els.length);
  assert.strictEqual(railCount, n, `expected one rail button per station (${n}), found ${railCount}`);

  await page.$$eval('.wf-rail > button', els => els[5].click());
  const moved = await page.evaluate(() => ({ to: WF.to, mode: WF.mode }));
  assert.strictEqual(moved.to, 5, `clicking rail button 5 should target station 5, got ${moved.to}`);
  assert.strictEqual(moved.mode, 'move', 'a normal click should animate the camera, not snap it');

  await page.evaluate(() => { wfSetReduced(true); });
  await page.$$eval('.wf-rail > button', els => els[10].click());
  const reduced = await page.evaluate(() => ({ cam: WF.cam, mode: WF.mode }));
  assert.strictEqual(reduced.cam, 10, `reduced-motion click on rail button 10 should land there instantly, got ${reduced.cam}`);
  assert.strictEqual(reduced.mode, 'hold', 'reduced-motion navigation must not leave the camera mid-move');

  const current = await page.$$eval('.wf-rail > button', els =>
    els.map((e, i) => e.getAttribute('aria-current') === 'step' ? i : null).filter(x => x !== null));
  assert.deepStrictEqual(current, [10], `exactly the active station's rail button should carry aria-current="step", got indices ${JSON.stringify(current)}`);

  await page.close();
}

// Birds (.wf-bird-gate) are an event-class element gated by CSS to only
// senses/soundscape (the two stations whose own text is about noticing
// things overhead — see test/idle-scene-audit.md Part E) and only while
// no detail panel is open. Locks in that the gate actually opens/closes
// correctly rather than just existing in the DOM inert.
async function testBirdsGatedToRightStations(browser) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el);
  await page.evaluate(() => { wfSetOn(true); });

  const gateOpacity = async () => page.evaluate(() => {
    const gate = document.querySelector('.wf-bird-gate');
    return parseFloat(getComputedStyle(gate).opacity);
  });

  await jumpToStation(page, 'introduce');
  await page.waitForTimeout(650);
  assert.ok((await gateOpacity()) < 0.05, 'birds must stay hidden at a station with no reason for them (introduce)');

  await jumpToStation(page, 'senses');
  await page.waitForTimeout(650);
  assert.ok((await gateOpacity()) > 0.95, 'birds must be eligible to appear at senses');

  await page.evaluate(() => { wfOpenStop('senses'); });
  await page.waitForTimeout(650);
  assert.ok((await gateOpacity()) < 0.05, 'birds must hide again while senses\' own detail panel is open');

  await page.evaluate(() => { WF.openId = null; wfRender(); });
  await jumpToStation(page, 'soundscape');
  await page.waitForTimeout(650);
  assert.ok((await gateOpacity()) > 0.95, 'birds must also be eligible to appear at soundscape');

  await page.close();
}

const TESTS = [
  ['every idle animation is on the shared beat grammar or a named exception', testSharedBeatGrammar],
  ['carry-pose figures use wfLift, never wfGesture', testCarryPoseUsesLiftNotGesture],
  ['prefers-reduced-motion stops every idle animation, at every station', testReducedMotionCoversEveryAnimatedClass],
  ['every station stays reachable via wfGoNext under reduced motion', testStationsReachableUnderReducedMotion],
  ['pins container node identity survives a camera move (no subtree replacement)', testNoSubtreeReplacementDuringMove],
  ['every rail button navigates to its own station, instantly under reduced motion', testRailButtonsNavigate],
  ['birds only become visible at senses/soundscape, and hide while a panel is open', testBirdsGatedToRightStations],
];

async function main() {
  const server = await startServer();
  const browser = await chromium.launch(launchOpts);
  let failures = 0;

  for (const [name, fn] of TESTS) {
    try {
      await fn(browser);
      console.log(`  ok  - ${name}`);
    } catch (err) {
      failures++;
      console.error(`FAIL  - ${name}`);
      console.error(`        ${err.message}`);
    }
  }

  await browser.close();
  server.close();

  console.log('');
  if (failures) {
    console.error(`${failures}/${TESTS.length} motion tests failed.`);
    process.exit(1);
  }
  console.log(`All ${TESTS.length} motion tests passed.`);
}

main().catch((err) => {
  console.error('Motion test suite crashed:', err);
  process.exit(1);
});
