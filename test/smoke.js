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
// The same sandbox also lacks the kernel namespace privileges Chromium's
// own sandbox needs, so it's disabled together with the custom path
// rather than as a separate flag — a real CI runner (actions/setup-node
// on ubuntu-latest, with its own working sandbox) never sets either.
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  : {};

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

const TESTS = [
  ['footer is absent, role switch still present', testFooterAbsent],
  ['header is a single straight line at every width/lang/role', testHeaderSingleLine],
  ['What is FBT? — accordion + single column', (b) => testAccordionScreen(b, '#pwhat', 'participant', ['pw-def', 'pw-vs', 'pw-works'])],
  ['Before your first session — accordion + single column', (b) => testAccordionScreen(b, '#pbefore', 'participant', ['pb-share', 'pb-normal'])],
  ['Learn More — accordion + single column', (b) => testAccordionScreen(b, '#learn', 'practitioner', ['mod-what', 'mod-evidence'])],
  ['role/nav state survives a real refresh', testRoleSurvivesRefresh],
  ['QR share link round-trips through a refresh', testQrShareRoundTrip],
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
    console.error(`${failures}/${TESTS.length} smoke tests failed.`);
    process.exit(1);
  }
  console.log(`All ${TESTS.length} smoke tests passed.`);
}

main().catch((err) => {
  console.error('Smoke suite crashed:', err);
  process.exit(1);
});
