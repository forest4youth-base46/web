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
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {};

const BASE = `http://localhost:${PORT}/index.html`;

async function testFooterAbsent(browser) {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const footerCount = await page.locator('footer').count();
  assert.strictEqual(footerCount, 0, 'expected no <footer> element');
  // The Exploring role is parked (features.js): no role switch while it is off.
  const parked = await page.evaluate(() => !featureOn('participant'));
  const modeBtnCount = await page.locator('.mode-btn').count();
  assert.strictEqual(modeBtnCount, parked ? 0 : 2, parked ? 'role switch is parked with the Exploring role' : 'expected role-switch buttons (.mode-btn)');
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

const TESTS = [
  ['footer is absent; role switch present only when Exploring is on', testFooterAbsent],
  ['Reflect — accordion + single column', (b) => testAccordionScreen(b, '#reflect', 'practitioner', ['mod-reflect-self', 'mod-indicators'])],
  ['Exploring role: parked (or, when on, its doors open the guide\'s pages)', testParticipantDoors],
  ['role/nav state survives a real refresh', testRoleSurvivesRefresh],
  ['QR share link round-trips through a refresh', testQrShareRoundTrip],
  ['Guides — both render as readable sections, no document codes, deep links work', testPracticalGuides],
  ['Entry tree — open each side, go back with Escape, menu items route into the app', testTreeEntry],
  ['Phone — Plan a Session in the pane keeps the builder\'s floating button on top', testPhoneBuilderFab],
  ['Walk the Forest — the trail leads into it, its own toggle leads back to the tree', testWalkRoundTrip],
];

async function testWalkRoundTrip(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('#tr-walk');
  await page.waitForFunction(() => document.body.classList.contains('wf-scene-on'), null, { timeout: 30000 });
  assert.ok(await page.evaluate(() => !document.getElementById('tree-entry').classList.contains('on')), 'the tree steps aside for the forest');
  assert.ok(await page.evaluate(() => !document.querySelector('.screen.active')), 'the forest view has no screen open, as on REVAMP');
  await page.waitForFunction(() => !document.querySelector('.wf-veil').classList.contains('on'), null, { timeout: 30000 });
  await page.click('#wf-toggle-btn');
  await page.waitForFunction(() => document.getElementById('tree-entry').classList.contains('on'), null, { timeout: 10000 });
  assert.ok(await page.evaluate(() => document.getElementById('entry-screen').classList.contains('active')), 'back on the start screen, with the tree');
  await page.close();
}

async function testPhoneBuilderFab(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.tap('#tr-pick-fi');
  await page.waitForTimeout(400);
  await page.tap('#tr-room-fi [data-go="implement/mod-pocket"]');
  await page.waitForTimeout(1200);
  const fab = await page.evaluate(() => {
    const f = document.getElementById('pb-fab'); const r = f.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const pane = document.querySelector('.container').getBoundingClientRect();
    return { shown: getComputedStyle(f).display !== 'none' && r.width > 0, onTop: !!top && (top === f || f.contains(top)), paneW: pane.width };
  });
  assert.ok(fab.shown, 'the builder FAB shows on a phone inside the pane');
  assert.ok(fab.onTop, 'nothing covers the FAB');
  assert.strictEqual(Math.round(fab.paneW), 390, 'the pane takes the full phone width');
  await page.tap('#pb-fab');
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.querySelector('.pb-builder').classList.contains('expanded')), 'the FAB opens the session builder');
  await ctx.close();
}

async function testTreeEntry(browser) {
  // The practitioner entry is one split tree (entry-tree.js). It must work
  // as plain buttons even if WebGL is unavailable, so this drives the DOM.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { setRole('practitioner'); window.location.hash = ''; });
  await page.waitForTimeout(400);
  const on = () => page.evaluate(() => document.getElementById('tree-entry').classList.contains('on'));
  assert.ok(await on(), 'tree shows on the practitioner entry');
  assert.ok(await page.evaluate(() => document.querySelector('.container').hasAttribute('inert')), 'app underneath is inert');
  await page.click('#tr-pick-fi');
  await page.waitForTimeout(300);
  assert.ok(await page.isVisible('#tr-room-fi .menu'), 'FI menu opens');
  assert.strictEqual(await page.locator('#tr-room-fi .menu li').count(), 4, 'FI menu has four items');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  assert.ok(await page.isVisible('#tr-pick-ivn'), 'Escape returns to the tree');
  await page.click('#tr-pick-ivn');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator('#tr-room-ivn .menu li').count(), 3, 'IVN menu has three items');
  // a menu item opens inside the pane; the tree stays behind
  await page.click('#tr-room-ivn [data-go="guide/g-ivn-sheets"]');
  await page.waitForTimeout(900);
  assert.strictEqual(await page.evaluate(() => location.hash), '#guide/g-ivn-sheets', 'Ready-to-use sheets opens the IVN guide\'s sheets');
  assert.ok(await on(), 'the tree stays behind the pane');
  assert.ok(await page.evaluate(() => document.body.classList.contains('tree-pane') && !document.querySelector('.container').hasAttribute('inert')), 'the app is open in the pane and reachable');
  assert.ok(await page.isVisible('#guide-screen'), 'the guide shows in the pane');
  assert.strictEqual(await page.evaluate(() => document.querySelector('#tr-panetabs [aria-current="page"]').textContent), 'Ready-to-use sheets', 'the open section is marked');
  await page.click('#tr-panetabs [data-go="guide/g-ivn-start"]');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => location.hash), '#guide/g-ivn-start', 'tabs move between sections in the pane');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  assert.ok(await page.isVisible('#tr-room-ivn .menu'), 'Escape closes the pane back to the menu');
  assert.ok(await page.evaluate(() => !document.body.classList.contains('tree-pane') && document.querySelector('.container').hasAttribute('inert')), 'the app is behind the tree again');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  assert.ok(await page.isVisible('#tr-pick-fi'), 'a second Escape returns to the tree');
  // Reference is parked (features.js): no screen, no route, no search entries
  assert.strictEqual(await page.evaluate(() => !!document.getElementById('reference-screen')), false, 'Reference screen is parked');
  await page.evaluate(() => { location.hash = 'reference'; });
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.getElementById('entry-screen').classList.contains('active')), '#reference falls back to the start');
  // back on the tree: every label follows the language (FR, DE)
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(400);
  for (const [lang, fi, hint] of [['fr', 'Interventions en milieu forestier', 'Touchez un côté de l’arbre'], ['de', 'Waldbasierte Interventionen', 'Berühren Sie eine Seite des Baums']]) {
    await page.click(`#tree-entry [data-lang="${lang}"]`);
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => ({ fi: document.querySelector('#tr-pick-fi .name').textContent, hint: document.getElementById('tr-hint').textContent, pressed: document.querySelector('#tree-entry [data-lang][aria-pressed="true"]').dataset.lang }));
    assert.strictEqual(txt.fi, fi, `FI name in ${lang}`);
    assert.strictEqual(txt.hint, hint, `hint in ${lang}`);
    assert.strictEqual(txt.pressed, lang, `${lang} marked as current`);
  }
  await page.evaluate(() => setLang('fr'));
  assert.strictEqual(await page.evaluate(() => document.querySelector('#tree-entry [data-lang][aria-pressed="true"]').dataset.lang), 'fr', 'pills follow a language change made elsewhere');
  await page.click('#tree-entry [data-lang="en"]');
  // the header's tools are on the tree: search opens over it, mode switch leaves it
  await page.click('#tr-search');
  await page.waitForTimeout(200);
  assert.ok(await page.isVisible('#search-input'), 'search opens from the tree');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.locator('#tree-entry [data-mode]').count(), 0, 'no Practitioner/Exploring switch on the tree while Exploring is parked');
  await page.close();
}

async function testParticipantDoors(browser) {
  // The Exploring role has no pages of its own any more: its doors open the
  // Practical Guide's chapters for young people, families and the IVN room.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (await page.evaluate(() => !featureOn('participant'))) {
    // Parked: nothing can switch to it, and a ?role=participant link lands as a practitioner.
    await page.evaluate(() => { setRole('participant'); });
    assert.strictEqual(await page.evaluate(() => document.body.getAttribute('data-role')), 'practitioner', 'setRole(participant) is refused while parked');
    await page.goto(BASE + '?role=participant', { waitUntil: 'networkidle' });
    assert.strictEqual(await page.evaluate(() => document.body.getAttribute('data-role')), 'practitioner', '?role=participant lands as a practitioner');
    await page.evaluate(() => { location.hash = 'role'; });
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => document.getElementById('entry-screen').classList.contains('active')), '#role falls back to the entry');
    await page.close();
    return;
  }
  await page.evaluate(() => { setRole('participant'); window.location.hash = ''; });
  await page.waitForTimeout(250);
  const doors = await page.locator('#entry-screen [data-role-only="participant"] .pathway-card').count();
  assert.strictEqual(doors, 3, 'three Exploring doors');
  for (const [id, title] of [['fi-young', 'Young people'], ['fi-families', 'Family and carers'], ['ivn-young', 'For young people']]) {
    await page.evaluate(id => { window.location.hash = 'guide/g-' + id; }, id);
    await page.waitForTimeout(300);
    const shown = await page.evaluate(() => ({
      active: document.getElementById('guide-screen').classList.contains('active'),
      title: (document.querySelector('#guide-screen .gd-guide:not([hidden]) .gd-title') || {}).textContent,
    }));
    assert.ok(shown.active, `participant can open #guide/g-${id}`);
    assert.strictEqual(shown.title, title, `#guide/g-${id} shows "${title}"`);
  }
  await page.close();
}

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
