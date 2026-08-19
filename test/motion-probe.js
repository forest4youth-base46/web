#!/usr/bin/env node
// Motion review instrument for Walk the Forest — NOT a pass/fail test (see
// test/motion.js for the regression test this feeds). Produces the evidence
// a motion/positioning review needs but code-reading can't give you:
//
//  - the animation inventory actually running in the browser (duration,
//    easing, iteration count) per station, cross-checked against what's
//    declared in styles-walk-forest.css
//  - a bounding-box positioning report per station x viewport, flagging
//    off-viewport, header/panel overlap, degenerate or negative dimensions
//  - screenshots per station x viewport for direct visual review
//  - contact sheets (N frames sampled evenly across one loop period) for a
//    representative set of idle loops, so a seam or asymmetric ease is
//    visible without watching video
//
// Usage: node test/motion-probe.js
// Writes everything under test/motion-probe-output/ (gitignored scratch,
// not a deliverable itself).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'motion-probe-output');
const PORT = 8978;

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
const VIEWPORTS = [
  { name: '320w', width: 320, height: 700 },
  { name: '768w', width: 768, height: 900 },
  { name: '1280w', width: 1280, height: 900 },
];

// Jumps the scene deterministically to one station without waiting on the
// camera-move animation or the rAF loop — mirrors what wfGoBack/wfGoNext do
// under WF.reduced (walk-forest.js:895 etc): set WF.cam directly, force a
// synchronous wfRender(). Also clears any open panel/barefoot state so each
// capture starts clean.
async function jumpToStation(page, stationId) {
  return page.evaluate((id) => {
    const idx = ACTIVITIES.findIndex(a => a.id === id);
    if (idx < 0) return false;
    WF.cam = idx;
    WF.mode = 'hold';
    WF.openId = null;
    WF.paused = false;
    WF.barefootAt = null;
    wfRender();
    return true;
  }, stationId);
}

async function waitForSceneReady(page) {
  // `const WF` at walk-forest.js's top level is a classic-script global —
  // visible to any other top-level script/eval in the same realm (which
  // is what page.evaluate runs as), but never a property of `window`
  // (unlike `var`). Test the binding directly, not window.WF.
  await page.waitForFunction(() => typeof WF !== 'undefined' && WF.dom && WF.el, { timeout: 15000 });
}

// Animation inventory for whatever's currently in #wf-scene. Cross-checks
// runtime state (what's actually animating right now) against what's
// possible to declare in CSS — durations/easings here are read straight
// from the live Animation objects, not parsed out of the stylesheet, so
// this catches anything a JS-written inline animation-duration
// (walk-forest.js:443 etc) would hide from a static grep.
async function captureAnimations(page) {
  return page.evaluate(() => {
    const scene = document.getElementById('wf-scene');
    if (!scene) return [];
    return document.getAnimations()
      // CSSAnimation only, not CSS Transitions (pin hover/state feedback
      // — a separate mechanism, not part of the idle-motion grammar).
      .filter(a => a.effect && a.effect.target && scene.contains(a.effect.target) && typeof a.animationName === 'string')
      .map(a => {
        const t = a.effect.getTiming();
        const el = a.effect.target;
        return {
          animationName: a.animationName || (a.id || 'unnamed'),
          className: el.getAttribute('class') || '',
          duration: t.duration,
          easing: t.easing,
          iterations: t.iterations,
          delay: t.delay,
          direction: t.direction,
          playState: a.playState,
        };
      });
  });
}

// Bounding-box positioning report: every direct visual element in the
// scene, flagged for the failure modes the branch's own commit history
// already hit once each (7739447 off-screen set dressing, a33e6a9 a
// figure floating off its hammock cloth).
async function capturePositioning(page, viewport) {
  return page.evaluate((vp) => {
    const scene = document.getElementById('wf-scene');
    const header = document.getElementById('site-header');
    if (!scene) return { error: 'no #wf-scene' };
    const headerBox = header ? header.getBoundingClientRect() : null;
    const nodes = scene.querySelectorAll('*');
    const flags = [];
    let count = 0;
    nodes.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return; // not a rendered leaf
      count++;
      const tag = el.tagName.toLowerCase();
      const cls = el.getAttribute('class') || '';
      const offRight = r.left > vp.width;
      const offLeft = r.right < 0;
      const offBottom = r.top > vp.height;
      const offTop = r.bottom < 0;
      const negative = r.width < 0 || r.height < 0;
      const overlapsHeader = headerBox && r.top < headerBox.bottom && r.bottom > headerBox.top &&
        r.left < headerBox.right && r.right > headerBox.left;
      if (offRight || offLeft || offBottom || offTop || negative || overlapsHeader) {
        flags.push({ tag, cls, rect: { x: r.left, y: r.top, w: r.width, h: r.height },
          offRight, offLeft, offBottom, offTop, negative, overlapsHeader });
      }
    });
    return { totalRenderedNodes: count, flagged: flags };
  }, viewport);
}

// Contact sheet: samples one CSS animation across its full period by
// setting Animation.currentTime directly (no real time needs to pass),
// screenshotting the element's own bounding box (plus a small margin) at
// each sample. A seam, jitter, or non-monotonic ease shows up as visible
// discontinuity between adjacent frames without needing video.
async function contactSheet(page, className, frames, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const info = await page.evaluate((cls) => {
    const scene = document.getElementById('wf-scene');
    const anim = document.getAnimations().find(a =>
      a.effect && a.effect.target && scene.contains(a.effect.target) &&
      (a.effect.target.getAttribute('class') || '').split(/\s+/).includes(cls));
    if (!anim) return null;
    const t = anim.effect.getTiming();
    const r = anim.effect.target.getBoundingClientRect();
    return { duration: t.duration, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  }, className);
  if (!info || typeof info.duration !== 'number') return { className, found: false };
  const pad = 24;
  const clip = {
    x: Math.max(0, info.rect.x - pad), y: Math.max(0, info.rect.y - pad),
    width: info.rect.width + pad * 2, height: info.rect.height + pad * 2,
  };
  for (let i = 0; i < frames; i++) {
    const frac = i / frames;
    await page.evaluate(({ cls, t }) => {
      const scene = document.getElementById('wf-scene');
      const anim = document.getAnimations().find(a =>
        a.effect && a.effect.target && scene.contains(a.effect.target) &&
        (a.effect.target.getAttribute('class') || '').split(/\s+/).includes(cls));
      if (anim) anim.currentTime = t;
    }, { cls: className, t: frac * info.duration });
    await page.screenshot({ path: path.join(outDir, `${className}-${String(i).padStart(2, '0')}.png`), clip });
  }
  return { className, found: true, duration: info.duration, frames };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch(launchOpts);
  const report = { generatedAt: new Date().toISOString(), stations: {}, positioning: {}, contactSheets: [] };

  try {
    const page = await browser.newPage({ viewport: { width: 768, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitForSceneReady(page);

    const stationIds = await page.evaluate(() => ACTIVITIES.map(a => a.id));
    console.log(`Found ${stationIds.length} stations: ${stationIds.join(', ')}`);

    // Per-station animation inventory + one screenshot per viewport.
    for (const id of stationIds) {
      const ok = await jumpToStation(page, id);
      if (!ok) { console.log(`  SKIP ${id} — not found`); continue; }
      const anims = await captureAnimations(page);
      report.stations[id] = { animations: anims };
      console.log(`  ${id}: ${anims.length} live animations`);
    }

    // Positioning report across viewports (reuses same page, resized).
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      report.positioning[vp.name] = {};
      for (const id of stationIds) {
        await jumpToStation(page, id);
        const pos = await capturePositioning(page, vp);
        report.positioning[vp.name][id] = pos;
        if (pos.flagged && pos.flagged.length) {
          console.log(`  FLAG ${vp.name}/${id}: ${pos.flagged.length} elements (off-viewport/overlap/negative)`);
        }
      }
      // One full-scene screenshot per viewport, at the first station, for
      // a quick visual sanity check of the overall composition.
      await jumpToStation(page, stationIds[0]);
      await page.screenshot({ path: path.join(OUT, `scene-${vp.name}.png`) });
    }
    await page.setViewportSize({ width: 768, height: 900 });

    // Per-station screenshots at 768w for visual review of every stop.
    const stopsDir = path.join(OUT, 'stops');
    fs.mkdirSync(stopsDir, { recursive: true });
    for (const id of stationIds) {
      await jumpToStation(page, id);
      const scene = await page.$('#wf-scene');
      await scene.screenshot({ path: path.join(stopsDir, `${id}.png`) });
    }

    // Contact sheets for a representative cross-section: the scene's most
    // common duration (wf-bob/lift/peg family), the slowest ambient drift,
    // the fastest ambient loop (wfGesture, flagged in the plan as
    // possibly too fast for something in the periphery), and the two
    // one-way travel loops (mote/smoke) whose wrap-hiding needs checking.
    await jumpToStation(page, stationIds[0]);
    const targets = ['wf-bob', 'wf-drift', 'wfGesture', 'wf-mote', 'wfSmoke', 'wf-sun'];
    for (const cls of targets) {
      const result = await contactSheet(page, cls, 8, path.join(OUT, 'contact-sheets'));
      report.contactSheets.push(result);
      console.log(`  contact sheet ${cls}: ${result.found ? `${result.frames} frames, ${result.duration}ms` : 'NOT FOUND on this station'}`);
    }

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${path.join(OUT, 'report.json')}`);
}

main().catch((err) => {
  console.error('Motion probe crashed:', err);
  process.exit(1);
});
