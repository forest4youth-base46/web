#!/usr/bin/env node
// Zero-build smoke suite. Serves the app with Node's built-in http module
// (no python/http-server dependency) and drives it with Playwright,
// covering the real regressions found and fixed in this branch's history:
//
//  - role/nav state must survive a genuine page refresh (ensureRole() bug)
//  - accordion cards (What is FBT? / Before your first session / Learn
//    More / Implement in Practice) default closed and enforce single-open
//  - those same screens are single-column at desktop width
//  - the footer is gone
//  - the QR/session-share link round-trips order + timing + language
//    through a refresh without wiping to empty
//  - Walk the Forest's WebGL backdrop (?wf=3d) keeps the whole scene
//    contract: pins are real buttons that open the panel, Esc closes it,
//    next/back drive the walk, a drag is not a click on open space, a
//    language switch relabels the pins — and it falls back to the painted
//    SVG scene without WebGL or under reduced motion
//
// Usage: node test/smoke.js
// Exits 0 on success, 1 (with a report) on any failure.

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8977;

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

// Allows this sandbox's pre-installed browser path to be used without
// hardcoding it — a real CI runner just uses Playwright's own install.
// SwiftShader gives headless Chromium a (software) WebGL context, so the
// 3D backdrop tests below run on any CI box without a GPU.
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const launchOpts = Object.assign(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  { args: GL_ARGS });

const BASE = `http://localhost:${PORT}/index.html`;

async function testFooterAbsent(browser) {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const footerCount = await page.locator('footer').count();
  assert.strictEqual(footerCount, 0, 'expected no <footer> element');
  const modeBtnCount = await page.locator('.mode-btn').count();
  assert.strictEqual(modeBtnCount, 2, 'expected role-switch buttons (.mode-btn) to still be present');
  await page.close();
}

async function testAccordionScreen(browser, hash, role, cardIds) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(({ role, hash }) => { setRole(role); window.location.hash = hash; }, { role, hash });
  await page.waitForTimeout(250);

  for (const id of cardIds) {
    const isOpen = await page.locator('#' + id).evaluate(el => el.classList.contains('open'));
    assert.strictEqual(isOpen, false, `${hash}: card #${id} should start closed`);
  }

  await page.locator('#' + cardIds[0] + ' .module-header').click();
  await page.waitForTimeout(100);
  await page.locator('#' + cardIds[1] + ' .module-header').click();
  await page.waitForTimeout(100);

  const first = await page.locator('#' + cardIds[0]).evaluate(el => el.classList.contains('open'));
  const second = await page.locator('#' + cardIds[1]).evaluate(el => el.classList.contains('open'));
  assert.strictEqual(first, false, `${hash}: opening card #${cardIds[1]} should have closed #${cardIds[0]}`);
  assert.strictEqual(second, true, `${hash}: #${cardIds[1]} should be open after clicking it`);

  const gridSelector = '#' + hash.replace('#', '') + '-screen .modules-grid';
  const gridEl = await page.locator(gridSelector).first();
  const box = await gridEl.boundingBox();
  const firstCardBox = await page.locator('#' + cardIds[0]).boundingBox();
  const secondCardBox = await page.locator('#' + cardIds[1]).boundingBox();
  assert.ok(firstCardBox && secondCardBox, `${hash}: cards should be visible/measurable`);
  assert.ok(
    Math.abs(firstCardBox.x - secondCardBox.x) < 2,
    `${hash}: cards should share the same x position (single column), got ${firstCardBox.x} vs ${secondCardBox.x}`
  );

  await page.close();
}

async function testRoleSurvivesRefresh(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' }); // second load — sessionStorage already has a role
  const info = await page.evaluate(() => ({
    bodyDataRole: document.body.getAttribute('data-role'),
    navDisplay: getComputedStyle(document.getElementById('site-nav')).display,
  }));
  assert.ok(info.bodyDataRole === 'practitioner' || info.bodyDataRole === 'participant',
    `body[data-role] should be set after a refresh, got ${info.bodyDataRole}`);
  assert.notStrictEqual(info.navDisplay, 'none', 'top nav should not be display:none after a refresh');
  await page.close();
}

async function testQrShareRoundTrip(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const url = await page.evaluate(() => {
    setRole('practitioner');
    pbSession = ACTIVITIES.slice(0, 3).map(a => a.id);
    pbSessionMins = {};
    pbSession.forEach((id, i) => { pbSessionMins[id] = 20 + i; });
    setLang('fr');
    return exportBuildSessionURL();
  });
  assert.ok(url.includes('#implement/mod-pocket'), 'share URL should target the Session Builder screen');

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' }); // this is the exact bug that shipped once already
  const restored = await page.evaluate(() => ({
    session: pbSession.slice(),
    mins: Object.assign({}, pbSessionMins),
    lang: currentLang,
    search: location.search,
    implementActive: document.getElementById('implement-screen').classList.contains('active'),
  }));
  assert.strictEqual(restored.session.length, 3, 'session should still have 3 activities after refresh');
  assert.strictEqual(restored.lang, 'fr', 'language should still be fr after refresh');
  assert.ok(restored.search.includes('s='), 'share params should still be in the URL after refresh (not stripped)');
  assert.strictEqual(restored.implementActive, true, 'should still be on the Implement screen after refresh');
  await page.close();
}

// The header must be one straight line: title, nav and controls on a
// single row with their centres level, at every desktop width, in every
// language, in both roles. It regressed exactly once already — the nav
// wrapped to 2-4 rows (FR/DE participant labels are ~800px wide), which
// pushed the header from 101px to 237px tall and left the title and the
// language bar floating at different heights than the row they belong to.
async function testHeaderSingleLine(browser) {
  const WIDTHS = [1900, 1440, 1280, 1100, 900];
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    for (const role of ['practitioner', 'participant']) {
      for (const lang of ['en', 'fr', 'de']) {
        await page.evaluate(({ role, lang }) => { setRole(role, true); setLang(lang); }, { role, lang });
        await page.waitForTimeout(80);
        const m = await page.evaluate(() => {
          const mid = el => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };
          const group = document.querySelector('.site-nav-group[data-role-only="' + document.body.dataset.role + '"]');
          const tops = [...group.querySelectorAll('a')].map(a => Math.round(a.getBoundingClientRect().top));
          return {
            navRows: new Set(tops).size,
            title: mid(document.querySelector('.header-text h1')),
            nav: mid(document.querySelector('.site-nav')),
            controls: mid(document.querySelector('.header-controls')),
            headerHeight: document.getElementById('site-header').getBoundingClientRect().height,
            docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        const where = `${width}px / ${role} / ${lang}`;
        assert.strictEqual(m.navRows, 1, `${where}: nav links must stay on one row, got ${m.navRows}`);
        assert.ok(Math.abs(m.title - m.controls) <= 2,
          `${where}: title and controls must share the header's line (${m.title} vs ${m.controls})`);
        assert.ok(Math.abs(m.nav - m.controls) <= 2,
          `${where}: nav and controls must share the header's line (${m.nav} vs ${m.controls})`);
        assert.ok(m.headerHeight < 130,
          `${where}: single-line header should stay near 101px tall, got ${m.headerHeight}`);
        assert.strictEqual(m.docOverflow, 0,
          `${where}: the full-bleed header must not overhang the viewport (${m.docOverflow}px)`);
      }
    }
    await page.close();
  }
}


// ── Walk the Forest: 3D backdrop ──
// wfgov=0 turns off the frame-time governor: SwiftShader is slow enough
// that it would (correctly) fall back to SVG, which isn't what these test.
const WF3D_URL = `http://localhost:${PORT}/index.html?wf=3d&wfgov=0`;

// Runs fn(page) on a fresh 3D page and always closes it — a failed test
// must not leave a SwiftShader page rendering in the background and
// starving the tests after it.
async function withWf3d(browser, fn) {
  const { page, errors } = await wf3dPage(browser);
  try { await fn(page, errors); } finally { await page.close(); }
}

async function wf3dPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WF3D_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof WF3D !== 'undefined' && WF3D.state === 'ready' && wfUse3d(), null, { timeout: 30000 });
  return { page, errors };
}

async function testWf3dPinsPanelControls(browser) {
  await withWf3d(browser, async (page, errors) => {
    assert.strictEqual(await page.locator('[data-wf-layer="gl"] canvas').count(), 1, 'expected the WebGL canvas');
    assert.strictEqual(await page.locator('[data-wf-layer="scene"] svg').count(), 0, 'SVG scene should not be painted under 3D');
    const n = await page.evaluate(() => ACTIVITIES.length);
    assert.strictEqual(await page.locator('[data-wf-stop] .wf-pin-btn').count(), n, 'every stop keeps a real pin button');
    // Wait for the per-frame placement to show the first pin, then click it.
    const pin = page.locator('[data-wf-stop="0"] .wf-pin-btn');
    await page.waitForFunction(() => document.querySelector('[data-wf-stop="0"]').style.visibility !== 'hidden');
    await pin.click();
    await page.waitForSelector('#wf-panel-root .wf-panel');
    assert.strictEqual(await page.evaluate(() => WF.openId), await page.evaluate(() => ACTIVITIES[0].id));
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('#wf-panel-root .wf-panel').count(), 0, 'Esc closes the panel');
    await page.locator('.wf-ctrl-btn').nth(2).click();   // next
    assert.strictEqual(await page.evaluate(() => WF.to), 1, 'next moves the walk to stop 2');
    await page.locator('.wf-ctrl-btn').nth(0).click();   // back
    assert.strictEqual(await page.evaluate(() => WF.to), 0, 'back returns to stop 1');
    assert.deepStrictEqual(errors, [], 'no page errors');
  });
}

async function testWf3dDragIsNotAClick(browser) {
  await withWf3d(browser, async (page, errors) => {
    await page.evaluate(() => {
      window.__esc = 0;
      const orig = appEscapeAction;
      window.appEscapeAction = function () { window.__esc++; return orig.apply(this, arguments); };
    });
    // An open patch of scene: not a pin, control, link or header.
    const pt = await page.evaluate(() => {
      for (let y = 520; y < 700; y += 20) for (let x = 300; x < 1000; x += 40) {
        const el = document.elementFromPoint(x, y);
        if (el && el.closest('#wf-scene') && !el.closest('button, a')) return { x, y };
      }
      return null;
    });
    assert.ok(pt, 'found an open patch of scene');
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.move(pt.x + 90, pt.y + 10, { steps: 6 });
    await page.mouse.up();
    assert.strictEqual(await page.evaluate(() => window.__esc), 0, 'a drag must not count as a click on open space');
    assert.ok(await page.evaluate(() => WF3D.gusts.list.length > 0), 'a drag pushes air (gusts)');
    await page.mouse.click(pt.x, pt.y);
    assert.strictEqual(await page.evaluate(() => window.__esc), 1, 'a plain click still reaches appEscapeAction');
  });
}

async function testWf3dLanguageRelabels(browser) {
  await withWf3d(browser, async (page, errors) => {
    const before = await page.locator('[data-wf-stop="0"] .wf-pin-btn').getAttribute('aria-label');
    await page.locator('.lang-btn', { hasText: 'FR' }).click();
    await page.waitForFunction((b) => document.querySelector('[data-wf-stop="0"] .wf-pin-btn').getAttribute('aria-label') !== b, before);
    assert.strictEqual(await page.evaluate(() => WF3D.labelLang), 'fr', 'in-world words rebuilt for the new language');
  });
}

async function testWf3dGovernorFallsBack(browser) {
  await withWf3d(browser, async (page) => {
    // Force the ladder: at the lowest tier, a slow median frame hands the
    // scene back to the SVG painter — pins and all — rather than stuttering.
    await page.evaluate(() => {
      WF3D.governOn = true;
      wf3dApplyTier(WF3D_TIERS.low);
      for (let i = 0; i < 149; i++) WF3D.samples.push(45);
      wf3dGovern(45);
    });
    assert.strictEqual(await page.evaluate(() => WF.renderer), 'svg');
    assert.strictEqual(await page.locator('#wf-scene canvas').count(), 0, 'canvas removed');
    assert.ok(await page.locator('[data-wf-layer="scene"] svg').count() > 0, 'painted scene back');
    await page.locator('.wf-pin-btn').first().click();
    await page.waitForSelector('#wf-panel-root .wf-panel');
  });
}

async function testWfSvgOverride(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${PORT}/index.html?wf=svg`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert.strictEqual(await page.locator('#wf-scene canvas').count(), 0, '?wf=svg paints no canvas');
  assert.ok(await page.locator('[data-wf-layer="scene"] svg').count() > 0, '?wf=svg paints the SVG scene');
  assert.strictEqual(await page.evaluate(() => typeof THREE), 'undefined', 'Three.js is not even downloaded');
  await page.close();
}

async function testWf3dFallbacks() {
  // No WebGL at all -> the painted scene, silently.
  const noGl = await chromium.launch(Object.assign({}, launchOpts, { args: ['--disable-webgl', '--disable-3d-apis'] }));
  try {
    const page = await noGl.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(WF3D_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    assert.strictEqual(await page.locator('#wf-scene canvas').count(), 0, 'no canvas without WebGL');
    assert.ok(await page.locator('[data-wf-layer="scene"] svg').count() > 0, 'SVG scene without WebGL');
    assert.ok(await page.locator('.wf-pin-btn').count() > 0, 'pins still there');
    assert.deepStrictEqual(errors, [], 'no page errors without WebGL');
  } finally { await noGl.close(); }

  // Reduced motion -> never boots the 3D layer (static scene, no loop).
  const b = await chromium.launch(launchOpts);
  try {
    const ctx = await b.newContext({ reducedMotion: 'reduce' });
    const p2 = await ctx.newPage();
    await p2.goto(WF3D_URL, { waitUntil: 'networkidle' });
    await p2.waitForTimeout(800);
    assert.strictEqual(await p2.evaluate(() => WF3D.state), 'off', 'reduced motion never boots 3D');
    assert.strictEqual(await p2.evaluate(() => WF.raf), null, 'reduced motion runs no animation loop');
  } finally { await b.close(); }
}

const TESTS = [
  ['footer is absent, role switch still present', testFooterAbsent],
  ['header is a single straight line at every width/lang/role', testHeaderSingleLine],
  ['What is FI? — accordion + single column', (b) => testAccordionScreen(b, '#pwhat', 'participant', ['pw-def', 'pw-vs', 'pw-works'])],
  ['Before your first session — accordion + single column', (b) => testAccordionScreen(b, '#pbefore', 'participant', ['pb-share', 'pb-normal'])],
  ['Learn More — accordion + single column', (b) => testAccordionScreen(b, '#learn', 'practitioner', ['mod-what', 'mod-evidence'])],
  ['role/nav state survives a real refresh', testRoleSurvivesRefresh],
  ['QR share link round-trips through a refresh', testQrShareRoundTrip],
  ['Forest and IVN hubs — tools work end to end, guidance content, no codes', testToolHubs],
  ['Guides — both render as readable sections, no document codes, deep links work', testPracticalGuides],
  ['Walk the Forest 3D: pins, panel, Esc, next/back', testWf3dPinsPanelControls],
  ['Walk the Forest 3D: a drag is not a click on open space', testWf3dDragIsNotAClick],
  ['Walk the Forest 3D: language switch relabels pins + in-world words', testWf3dLanguageRelabels],
  ['Walk the Forest 3D: governor falls back to the painted scene', testWf3dGovernorFallsBack],
  ['Walk the Forest ?wf=svg: painted scene, no Three.js download', testWfSvgOverride],
  ['Walk the Forest 3D: falls back without WebGL / under reduced motion', () => testWf3dFallbacks()],
];

async function testPracticalGuides(browser) {
  // #guide renders both practical guides as readable sections
  // (guide-render.js). Public-facing: no document codes, no chapter
  // numbers, and the Pocketbook is not repeated inside the guide.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { setRole('practitioner'); window.location.hash = 'guide'; });
  await page.waitForTimeout(250);
  const info = await page.evaluate(() => ({
    fiNav: document.querySelectorAll('#gd-nav-fi a').length,
    ivnNav: document.querySelectorAll('#gd-nav-ivn a').length,
    ivnHidden: document.getElementById('guide-panel-ivn').hidden,
    text: document.getElementById('guide-screen').innerText + ' ' +
      [...document.querySelectorAll('#gd-nav-fi a, #gd-nav-ivn a')].map(a => a.textContent).join(' '),
  }));
  assert.strictEqual(info.fiNav, 8, 'forest guide should have 8 sections');
  assert.strictEqual(info.ivnNav, 8, 'IVN guide should have 8 sections');
  assert.strictEqual(info.ivnHidden, true, 'IVN guide starts hidden');
  assert.ok(!/D1\.\d|D2\.\d|Canva|Appendix|Chapter \d|Pocketbook of activities/i.test(info.text),
    'guide UI must not show document codes, appendix/chapter numbers or the Pocketbook chapter');

  await page.evaluate(() => { window.location.hash = 'guide/g-ivn-sheets'; });
  await page.waitForTimeout(300);
  const deep = await page.evaluate(() => ({
    ivnSelected: document.getElementById('guide-tab-ivn').getAttribute('aria-selected'),
    title: document.querySelector('#gd-article-ivn .gd-title').textContent,
    checks: document.querySelectorAll('#gd-article-ivn .gd-check button').length,
    current: document.querySelector('#gd-nav-ivn [aria-current]').getAttribute('href'),
  }));
  assert.strictEqual(deep.ivnSelected, 'true', 'deep link should select the IVN guide');
  assert.strictEqual(deep.title, 'Ready-to-use sheets');
  assert.strictEqual(deep.checks, 13, 'pre-session check has 6 first-use + 7 every-session items');
  assert.strictEqual(deep.current, '#guide/g-ivn-sheets', 'menu marks the open section');

  await page.locator('#gd-article-ivn .gd-check button').first().click();
  const ticked = await page.locator('#gd-article-ivn .gd-check button').first().getAttribute('aria-checked');
  assert.strictEqual(ticked, 'true', 'checklist items tick');
  await page.close();
}

async function testToolHubs(browser) {
  // Forest and IVN hubs (fi-tools.js, ivn-tools.js): cards render, a full
  // IVN session (plan → check → run → debrief) saves a record carrying the
  // plan's choices and before/after measures, first-use screening is
  // remembered per young-person ID, and Reference/Implement show the
  // guidance-for-professionals content. No document codes anywhere.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); setRole('practitioner'); window.location.hash = 'fi'; });
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#fi-root .hub-card').count() >= 7, 'forest hub shows its tool cards');
  await page.evaluate(() => { window.location.hash = 'ivn'; });
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#ivn-root .hub-card').count() >= 9, 'IVN hub shows its tool cards');

  await page.evaluate(() => { window.location.hash = 'ivn/plan'; });
  await page.waitForTimeout(200);
  await page.fill('input[data-f="youngId"]', 'T-1');
  await page.click('.ivn-module[data-module="C"]');
  await page.click('.gd-chips[data-name="intention"] .gd-chip >> nth=0');
  await page.click('.gd-chips[data-name="measures"] .gd-chip >> nth=0');
  await page.evaluate(() => { window.location.hash = 'ivn/check'; });
  await page.waitForTimeout(200);
  for (const btn of await page.$$('.gd-check[data-name="first"] button')) await btn.click();
  await page.evaluate(() => { window.location.hash = 'ivn/run'; });
  await page.waitForTimeout(200);
  await page.fill('input[data-when="before"]', '8');
  await page.evaluate(() => ivnEnd());
  await page.waitForTimeout(200);
  await page.fill('input[data-when="after"]', '4');
  await page.fill('textarea[data-d="keep"]', 'the stream');
  await page.evaluate(() => ivnSaveRecord());
  await page.waitForTimeout(250);
  const rec = await page.locator('.ivn-record').innerText();
  assert.ok(/T-1/.test(rec) && /C — After the forest/.test(rec) && /8 → 4/.test(rec) && /the stream/.test(rec),
    'saved record carries ID, module, before→after measure and the module C question');
  const screened = await page.evaluate(() => (storageLoad('f4y.ivn.screening', {})['T-1'] || {}).items);
  assert.ok(screened && screened.length === 6 && screened.every(Boolean), 'first-use screening remembered for the ID');

  await page.evaluate(() => { window.location.hash = 'reference'; });
  await page.waitForTimeout(200);
  const ref = await page.locator('#mod-contraindications').innerText();
  assert.ok(/Symptom severity, not diagnosis/.test(ref) && /Eating disorders with active physical risk/.test(ref), 'Reference contraindications follow the guidance for professionals');
  await page.evaluate(() => { window.location.hash = 'implement/mod-plan'; });
  await page.waitForTimeout(250);
  const plan = await page.locator('#fi-plan-summary').innerText();
  assert.ok(/Threshold/.test(plan) && /2–3 hours/.test(plan), 'session structure shows the arc and session lengths');

  let text = '';
  for (const h of ['fi', 'fi/structure', 'fi/prepare', 'fi/screening', 'fi/debrief', 'ivn', 'ivn/plan', 'ivn/check', 'ivn/run', 'ivn/measures', 'ivn/distress', 'ivn/young']) {
    await page.evaluate(h => { window.location.hash = h; }, h);
    await page.waitForTimeout(120);
    text += await page.locator('.screen.active').innerText();
  }
  assert.ok(!/D1\.\d|D2\.\d|Canva|Appendix|Chapter \d|WP1|deliverable/i.test(text), 'tool screens must not show document codes');
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

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
    console.error(`${failures}/${TESTS.length} smoke tests failed.`);
    process.exit(1);
  }
  console.log(`All ${TESTS.length} smoke tests passed.`);
}

main().catch((err) => {
  console.error('Smoke suite crashed:', err);
  process.exit(1);
});
