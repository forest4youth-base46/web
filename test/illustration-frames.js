#!/usr/bin/env node
// Renders each of the 17 activity illustrations to test/frames/ for human
// review. The linter can prove every figure comes from the rig and every
// ground line sits on the shared baseline; it cannot tell you whether a
// scene reads well. That part is still a person looking at pictures, and
// this is what gives them the pictures.
//
// Usage: node test/illustration-frames.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'frames');

const context = { console, Math, Object, JSON };
vm.createContext(context);
for (const f of ['figure-rig.js', 'pocketbook-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
}
const VISUAL = vm.runInContext('VISUAL', context);
const ACTIVITIES = vm.runInContext('ACTIVITIES', context);

// Same PLAYWRIGHT_CHROMIUM_PATH override test/smoke.js uses.
function launchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return { executablePath: c };
  return {};
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(launchOptions());
  // 2x so the small figures are actually judgeable.
  const page = await browser.newPage({ viewport: { width: 480, height: 180 }, deviceScaleFactor: 2 });
  try {
    for (const a of ACTIVITIES) {
      const svg = VISUAL[a.visual] || '';
      await page.setContent(
        '<style>html,body{margin:0;padding:0}svg{display:block;width:480px;height:180px}</style>' + svg,
        { waitUntil: 'load' });
      // Let the SMIL animations settle so the reviewed frame is the state a
      // reader actually ends up looking at, not an empty first frame.
      await page.waitForTimeout(4600);
      await page.screenshot({ path: path.join(OUT, `illustration-${a.visual}.png`) });
    }
  } finally {
    await browser.close();
  }
  console.log(`illustration-frames: ${ACTIVITIES.length} illustrations written to test/frames/`);
})().catch((e) => { console.error(e); process.exit(1); });
