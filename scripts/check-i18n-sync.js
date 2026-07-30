#!/usr/bin/env node
// Zero-dependency i18n key-sync check. i18n-en.js/i18n-fr.js/i18n-de.js each
// define a plain `const T_XX = { "key": "value", ... };` global (loaded as
// classic <script> tags, no module system — see content.js). They're
// documented as needing to stay in sync ("same set, no duplicates"), but
// nothing has ever verified that automatically. This script loads each file
// in an isolated VM context, diffs the resulting key sets, and exits
// non-zero with a readable report if they've drifted.
//
// Usage: node scripts/check-i18n-sync.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = [
  { lang: 'en', file: 'i18n-en.js', varName: 'T_EN' },
  { lang: 'fr', file: 'i18n-fr.js', varName: 'T_FR' },
  { lang: 'de', file: 'i18n-de.js', varName: 'T_DE' },
];

const root = path.join(__dirname, '..');

function loadKeys({ lang, file, varName }) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(src + `\nthis.__RESULT__ = ${varName};`, context, { filename: file });
  const obj = context.__RESULT__;
  if (!obj || typeof obj !== 'object') {
    throw new Error(`${file}: could not find a "${varName}" object after evaluating the file`);
  }
  return { lang, file, keys: new Set(Object.keys(obj)) };
}

function main() {
  const packs = FILES.map(loadKeys);
  const [base, ...rest] = packs;

  let drifted = false;
  for (const pack of rest) {
    const missing = [...base.keys].filter(k => !pack.keys.has(k));
    const extra = [...pack.keys].filter(k => !base.keys.has(k));
    if (missing.length || extra.length) {
      drifted = true;
      console.error(`\n${pack.file} is out of sync with ${base.file}:`);
      if (missing.length) {
        console.error(`  missing ${missing.length} key(s) present in ${base.file}:`);
        missing.forEach(k => console.error(`    - ${k}`));
      }
      if (extra.length) {
        console.error(`  has ${extra.length} extra key(s) not in ${base.file}:`);
        extra.forEach(k => console.error(`    + ${k}`));
      }
    }
  }

  if (drifted) {
    console.error('\ni18n sync check FAILED.');
    process.exit(1);
  }

  console.log(`i18n sync check passed — ${base.keys.size} keys, in sync across ${packs.map(p => p.file).join(', ')}.`);
}

main();
