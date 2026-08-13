#!/usr/bin/env node
// Frame capture and runtime assertions for the trail world.
//
// The linter proves the model is self-consistent. This proves the running
// page agrees with it — above all law W1, which no still frame can show:
// a planted foot must not move in world space while the world scrolls past.
// It is asserted here by stepping the gait in-page and reading the foot's
// world position back through TrailDebug.
//
// Also writes a PNG per station and per gait keyframe to test/frames/ for
// human review. The linter cannot tell you whether a scene reads well; that
// part is still a person looking at pictures.
//
// Usage: node test/trail-frames.js
// Exits 0 on success, 1 with a report on any failure.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'frames');
const PORT = 8979;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
};

// Same PLAYWRIGHT_CHROMIUM_PATH override test/smoke.js uses, so a sandbox
// with a preinstalled browser needs no hardcoded path and a real CI runner
// just uses Playwright's own install. Falls back to the stable `chromium`
// symlink under PLAYWRIGHT_BROWSERS_PATH, which is how this environment
// exposes a build whose number does not match Playwright's expectation.
function launchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return { executablePath: c };
  }
  return {};
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
      if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

const failures = [];
let checks = 0;
function check(law, what, ok, detail) {
  checks++;
  if (!ok) failures.push(`[${law}] ${what}` + (detail ? ` — ${detail}` : ''));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // Page errors matter; the environment's missing favicon and the blocked
  // Google Fonts request do not, and would otherwise fail this run for
  // reasons that have nothing to do with the trail.
  const IGNORE = [/favicon\.ico/, /fonts\.googleapis\.com/, /fonts\.gstatic\.com/];
  const errors = [];
  const noteError = (text) => { if (!IGNORE.some((re) => re.test(text))) errors.push(text); };
  page.on('pageerror', (e) => noteError(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // "Failed to load resource" carries no URL in its text — the URL is in
    // the message location, so match on both.
    const url = (m.location() && m.location().url) || '';
    noteError(`${m.text()} ${url}`.trim());
  });

  try {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    // Practitioner role, then the Pocketbook screen where the trail lives.
    await page.evaluate(() => { if (typeof setRole === 'function') setRole('practitioner'); });
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('implement'); });
    await page.waitForTimeout(300);
    // The Pocketbook lives inside a collapsed "door" card; the trail is not
    // laid out until it is opened.
    await page.evaluate(() => { if (typeof toggleModule === 'function') toggleModule('mod-pocket'); });
    await page.waitForTimeout(300);
    await page.waitForSelector('#trail-band svg.trail-svg', { state: 'visible', timeout: 5000 });

    check('build', 'the trail rendered without page errors', errors.length === 0, errors.join(' | '));

    // ─── D5: paint order is depth-descending ─────────────────────────────
    // Read the real document order and confirm the fringe really does land
    // on top of the character, rather than trusting the sort that built it.
    const order = await page.evaluate(() => {
      const svg = document.querySelector('#trail-band svg.trail-svg');
      return Array.prototype.slice.call(svg.children).map((el) => ({
        cls: el.getAttribute('class') || el.tagName,
        layer: el.getAttribute('data-layer'),
      }));
    });
    const charIdx = order.findIndex((o) => o.cls === 'trail-character');
    const fringeIdx = order.findIndex((o) => o.layer === 'fringe');
    const farIdx = order.findIndex((o) => o.layer === 'farRidge');
    check('D5', 'the character is painted', charIdx >= 0);
    check('D5', 'the near fringe paints over the character', fringeIdx > charIdx,
      `fringe at ${fringeIdx}, character at ${charIdx}`);
    check('D5', 'the far ridge paints behind the character', farIdx < charIdx,
      `farRidge at ${farIdx}, character at ${charIdx}`);

    // ─── W1: the planted foot does not move in world space ───────────────
    // Step the gait by hand through a full cycle at several speeds. While a
    // foot is in stance its world X must not change; the whole point of the
    // linear stance phase is that the ground slides and the foot does not.
    const slide = await page.evaluate(() => {
      const D = window.TrailDebug;
      const out = [];
      const speeds = [12, 30, 60, 96];
      for (const v of speeds) {
        D.velocity = v;
        const stride = D.activeStride();
        const cadence = v / stride;
        const dt = 1 / 120;
        D.cameraX = 5000;
        D.gaitPhase = 0.02; // just inside right-foot stance
        let worst = 0;
        // Walk forward through stance only, advancing camera and phase the
        // way the real loop does.
        while (D.gaitPhase < D.stanceFraction - 0.02) {
          const before = D.footWorldX('right');
          D.cameraX += v * dt;
          D.gaitPhase += (cadence / 2) * dt;
          const after = D.footWorldX('right');
          worst = Math.max(worst, Math.abs(after - before));
        }
        out.push({ v, worst, stride });
      }
      return out;
    });
    for (const s of slide) {
      // Tolerance is per-frame drift at 120Hz; anything above a hair of a
      // view unit would be visible as sliding.
      check('W1', `planted foot holds still at ${s.v} u/s`, s.worst < 0.01,
        `worst per-frame drift ${s.worst.toFixed(6)} view units`);
    }

    // ─── W1 continued: the same must hold walking back ───────────────────
    const slideBack = await page.evaluate(() => {
      const D = window.TrailDebug;
      const v = -57.6;
      D.velocity = v;
      const stride = D.activeStride();
      const cadence = Math.abs(v) / stride;
      const dt = 1 / 120;
      D.cameraX = 5000;
      D.gaitPhase = 0.02;
      let worst = 0;
      while (D.gaitPhase < D.stanceFraction - 0.02) {
        const before = D.footWorldX('right');
        D.cameraX += v * dt;
        D.gaitPhase += (cadence / 2) * dt;
        const after = D.footWorldX('right');
        worst = Math.max(worst, Math.abs(after - before));
      }
      return { worst, stride };
    });
    check('W1', 'planted foot holds still walking back', slideBack.worst < 0.01,
      `worst per-frame drift ${slideBack.worst.toFixed(6)} view units`);
    check('W2', 'walking back uses a shorter stride', slideBack.stride < slide[0].stride,
      `${slideBack.stride} vs ${slide[0].stride}`);

    // ─── C1 as rendered: nothing but barefoot sits in the walkway ────────
    const corridor = await page.evaluate(() => {
      const bad = [];
      TRAIL_STATIONS.forEach((st) => {
        st.props.forEach((p, i) => {
          const clears = trailPropClearsCorridor(p.depth);
          if (!clears && TRAIL_CORRIDOR_EXCEPTIONS.indexOf(st.id) === -1) {
            bad.push(`${st.id}[${i}] ${p.kind} @${p.depth}`);
          }
        });
      });
      return bad;
    });
    check('C1', 'no station prop stands in the walkway', corridor.length === 0, corridor.join(', '));

    // ─── A/D navigation ──────────────────────────────────────────────────
    const nav = await page.evaluate(async () => {
      const D = window.TrailDebug;
      D.velocity = 0;
      D.goToStation(0);
      await new Promise((r) => setTimeout(r, 900));
      const first = D.currentStationId();
      D.goToStation(4); // barefoot
      await new Promise((r) => setTimeout(r, 900));
      const fifth = D.currentStationId();
      const opened = !!document.querySelector('#pb-act-barefoot.open');
      return { first, fifth, opened };
    });
    check('C2', 'station 0 is the first activity', nav.first === 'introduce', `got ${nav.first}`);
    check('C2', 'station 4 is the Barefoot Trail', nav.fifth === 'barefoot', `got ${nav.fifth}`);
    check('nav', 'arriving at a station opens its activity', nav.opened);

    // ─── capture: one frame per station ──────────────────────────────────
    const band = await page.$('#trail-band');
    const stations = await page.evaluate(() => TRAIL_STATIONS.map((s) => s.id));
    for (let i = 0; i < stations.length; i++) {
      await page.evaluate((idx) => {
        const D = window.TrailDebug;
        D.velocity = 0;
        D.cameraX = trailStationWorldX(idx);
        D.gaitPhase = 0;
        D.render();
      }, i);
      await page.waitForTimeout(60);
      await band.screenshot({ path: path.join(OUT, `station-${String(i).padStart(2, '0')}-${stations[i]}.png`) });
    }

    // ─── capture: the character, close up ────────────────────────────────
    // At band scale the figure is ~65px tall, which is too small to judge a
    // walk cycle from. These are cropped to the character and captured at
    // 4x so the gait can actually be reviewed.
    const zoom = await browser.newPage({ viewport: { width: 420, height: 360 }, deviceScaleFactor: 4 });
    await zoom.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await zoom.evaluate(() => { if (typeof setRole === 'function') setRole('practitioner'); });
    await zoom.evaluate(() => { if (typeof navigate === 'function') navigate('implement'); });
    await zoom.waitForTimeout(200);
    await zoom.evaluate(() => { if (typeof toggleModule === 'function') toggleModule('mod-pocket'); });
    await zoom.waitForSelector('#trail-band svg.trail-svg', { state: 'visible', timeout: 5000 });
    // Reframe the SVG on the character alone.
    await zoom.evaluate(() => {
      const svg = document.querySelector('#trail-band svg.trail-svg');
      svg.setAttribute('viewBox', '370 140 220 150');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    });
    const zoomBand = await zoom.$('#trail-band');
    for (const dir of ['march', 'back']) {
      for (const phase of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
        await zoom.evaluate(([d, p]) => {
          const D = window.TrailDebug;
          D.velocity = d === 'march' ? 96 : -57.6;
          D.cameraX = trailStationWorldX(2) + 120;
          D.gaitPhase = p;
          D.render();
        }, [dir, phase]);
        await zoom.waitForTimeout(30);
        await zoomBand.screenshot({
          path: path.join(OUT, `figure-${dir}-${String(phase).replace('.', '_')}.png`),
        });
      }
    }
    await zoom.evaluate(() => window.TrailDebug.stop());
    await zoom.close();

    // ─── capture: gait keyframes, forward and back ───────────────────────
    for (const dir of ['march', 'back']) {
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        await page.evaluate(([d, p]) => {
          const D = window.TrailDebug;
          D.velocity = d === 'march' ? 96 : -57.6;
          D.cameraX = trailStationWorldX(2) + 120;
          D.gaitPhase = p;
          D.render();
        }, [dir, phase]);
        await page.waitForTimeout(40);
        await band.screenshot({ path: path.join(OUT, `gait-${dir}-${String(phase).replace('.', '_')}.png`) });
      }
    }

    // Stop the loop so the browser can close cleanly.
    await page.evaluate(() => window.TrailDebug.stop());
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.error(`\ntrail-frames: ${failures.length} failure(s) of ${checks} checks\n`);
    for (const f of failures) console.error('  ✗ ' + f);
    console.error('');
    process.exit(1);
  }
  console.log(`trail-frames: ${checks} checks passed; frames written to test/frames/`);
})().catch((e) => { console.error(e); process.exit(1); });
