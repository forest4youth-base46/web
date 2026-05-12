#!/usr/bin/env node
// Regenerate everything under `docs/` from `index.html`.
//
// Usage (from the repo root):   node tools/generate-docs.js
//
// The script extracts three JS literals from index.html — the translation
// dictionary `T`, the `ACTIVITIES` array, and the `ADAPTATIONS` array —
// and renders them into a set of markdown and CSV files for collaborative
// review. `index.html` remains the single source of truth; this script
// just keeps the human-readable mirror in sync.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const docs = path.join(repoRoot, 'docs');
fs.mkdirSync(docs, { recursive: true });

// ─── Parse helpers ────────────────────────────────────────────────────────
function matchPair(s, openIdx, openChar, closeChar) {
  let depth = 0, i = openIdx, inStr = null, esc = false;
  while (i < s.length) {
    const c = s[i];
    if (esc) { esc = false; i++; continue; }
    if (inStr) {
      if (c === '\\') { esc = true; i++; continue; }
      if (c === inStr) { inStr = null; i++; continue; }
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '/' && s[i+1] === '/') { const nl = s.indexOf('\n', i); i = nl < 0 ? s.length : nl + 1; continue; }
    if (c === '/' && s[i+1] === '*') { const end = s.indexOf('*/', i + 2); i = end < 0 ? s.length : end + 2; continue; }
    if (c === openChar) depth++;
    else if (c === closeChar) { depth--; if (depth === 0) return i; }
    i++;
  }
  throw new Error('unbalanced ' + openChar + closeChar);
}
function extractLiteral(decl, openChar, closeChar) {
  const i = html.indexOf(decl);
  if (i < 0) throw new Error('not found: ' + decl);
  const open = html.indexOf(openChar, i);
  const close = matchPair(html, open, openChar, closeChar);
  return html.slice(open, close + 1);
}
const tSrc  = extractLiteral('const T = {',           '{', '}');
const aSrc  = extractLiteral('const ACTIVITIES = [',  '[', ']');
const adSrc = extractLiteral('const ADAPTATIONS = [', '[', ']');
const [T, ACTIVITIES, ADAPTATIONS] = (new Function('return [' + tSrc + ',' + aSrc + ',' + adSrc + '];'))();

const en = T.en;
const enKeys = Object.keys(en);
process.stderr.write(`T.en keys: ${enKeys.length}, ACTIVITIES: ${ACTIVITIES.length}, ADAPTATIONS: ${ADAPTATIONS.length}\n`);

// ─── CSV helpers ──────────────────────────────────────────────────────────
function csv(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Order i18n keys by sensible section, then alphabetical within section.
const PREFIX_ORDER = [
  'header','footer','nav','ui',
  'role','entry','pentry','pathway','ppath',
  'pwhat','psession','pforme','pbefore',
  'learn','implement','reflect',
  'mod','ref','guide',
  'act','tag','visual','check','detail',
];
const orderedKeys = enKeys.slice().sort((a, b) => {
  const ia = PREFIX_ORDER.indexOf(a.split('.')[0]);
  const ib = PREFIX_ORDER.indexOf(b.split('.')[0]);
  const da = ia < 0 ? 999 : ia;
  const db = ib < 0 ? 999 : ib;
  return da !== db ? da - db : a.localeCompare(b);
});

// =========================================================================
// translations.csv
// =========================================================================
{
  const lines = ['key,en'];
  for (const k of orderedKeys) lines.push(`${csv(k)},${csv(en[k])}`);
  fs.writeFileSync(path.join(docs, 'translations.csv'), lines.join('\n') + '\n');
}

// =========================================================================
// activities.csv  +  adaptations.csv
// =========================================================================
const GROUP_NAMES = {
  1: 'Getting There',
  2: 'Waking Up Your Senses',
  3: 'Discovering Yourself',
  4: 'Connecting with Others',
  5: 'Coming Back to Yourself',
};
{
  const cols = ['id','group','group_name','name','dur_min','dur_max','dur_avg',
                'glyph','visual','caption','purpose','materials','intro','close','tags'];
  const lines = [cols.join(',')];
  for (const a of ACTIVITIES) {
    lines.push([
      a.id, a.group, GROUP_NAMES[a.group] || '',
      a.name, a.durMin, a.durMax, a.durAvg,
      a.glyph, a.visual, a.caption, a.purpose, a.materials,
      a.intro, a.close, (a.tags || []).join('; '),
    ].map(csv).join(','));
  }
  fs.writeFileSync(path.join(docs, 'activities.csv'), lines.join('\n') + '\n');
}
{
  const lines = ['label,text'];
  for (const a of ADAPTATIONS) lines.push(`${csv(a.label)},${csv(a.text)}`);
  fs.writeFileSync(path.join(docs, 'adaptations.csv'), lines.join('\n') + '\n');
}

// =========================================================================
// pathways.md
// =========================================================================
{
  const o = [];
  o.push('# Pathways & Navigation', '');
  o.push('Visual map of every route through the Forest4Youth Practice Guide. The');
  o.push('app branches at the role screen into a participant track and a');
  o.push('practitioner track. Square nodes are screens; rounded triple-paren nodes');
  o.push('are door-modules (full-page module views).', '');
  o.push('## Diagram', '');
  o.push('```mermaid');
  o.push('flowchart TB');
  o.push('    classDef role fill:#2d4a3f,stroke:#2d4a3f,color:#fff;');
  o.push('    classDef entry fill:#e9efe8,stroke:#2d4a3f,color:#2d4a3f;');
  o.push('    classDef partScreen fill:#dde7d9,stroke:#2d4a3f,color:#2d4a3f;');
  o.push('    classDef pracScreen fill:#d6e5f5,stroke:#1f3a5c,color:#1f3a5c;');
  o.push('    classDef door fill:#fff,stroke:#b8552e,color:#b8552e,stroke-width:2px;', '');
  o.push('    role([Role Screen]):::role', '');
  o.push('    role -- "I\'m exploring FBT" --> entryPart{Participant Entry}:::entry');
  o.push('    role -- "I\'m a practitioner" --> entryPrac{Practitioner Entry}:::entry', '');
  o.push('    %% PARTICIPANT TRACK');
  o.push('    entryPart --> pwhat[What is FBT?]:::partScreen');
  o.push('    entryPart --> psession[A typical session]:::partScreen');
  o.push('    entryPart --> pforme[Is it for me?]:::partScreen');
  o.push('    entryPart --> pbefore[Before your first session]:::partScreen');
  o.push('    pbefore --> pb_share(((What to share with practitioner))):::door');
  o.push('    pbefore --> pb_normal(((What is normal to feel))):::door');
  o.push('    pbefore --> pb_signs(((Signs it may be helping))):::door');
  o.push('    pbefore --> pb_bb(((Things to bring back))):::door');
  o.push('    pbefore --> pb_q(((Questions for first meeting))):::door', '');
  o.push('    %% PRACTITIONER TRACK');
  o.push('    entryPrac --> learn[Learn More]:::pracScreen');
  o.push('    entryPrac --> implement[Implement in Practice]:::pracScreen');
  o.push('    entryPrac --> reflect[Reflect &amp; Evaluate]:::pracScreen');
  o.push('    entryPrac --> reference[Clinical Reference]:::pracScreen');
  o.push('    entryPrac --> guide[Companion Guide]:::pracScreen', '');
  o.push('    learn --> mod_what(((What is FBT?))):::door');
  o.push('    learn --> mod_ev(((Evidence Base))):::door');
  o.push('    learn --> mod_contra(((Contraindications))):::door', '');
  o.push('    implement --> mod_pocket(((Pocketbook of Activities))):::door');
  o.push('    implement --> mod_pre(((Pre-Session Checklist))):::door');
  o.push('    implement --> mod_plan(((Session Structure Guide))):::door', '');
  o.push('    reflect --> mod_refself(((Practitioner Self-Reflection))):::door');
  o.push('    reflect --> mod_ind(((Observable Outcome Indicators))):::door');
  o.push('    reflect --> mod_gloss(((Key Terms))):::door', '');
  o.push('    reference --> ref_ind(((Clinical indications))):::door');
  o.push('    reference --> ref_con(((Contraindications))):::door');
  o.push('    reference --> ref_pop(((Population-specific guidance))):::door');
  o.push('    reference --> ref_dos(((Session dosage reference))):::door');
  o.push('    reference --> ref_int(((Integration with other modalities))):::door', '');
  o.push('    guide -.->|14 chapters in 4 parts| guide_parts((Foundations · Practice · Clinical · Professional))', '');
  o.push('    mod_pocket --> pocketGroups((5 thematic groups · session builder · run mode))');
  o.push('```', '');
  o.push('## Screen + module outline', '');

  const screens = [
    ['Role screen (#role)', 'role-screen', null, [
      ['role.title', en['role.title']],
      ['role.part.title', en['role.part.title']],
      ['role.part.desc', en['role.part.desc']],
      ['role.part.cta', en['role.part.cta']],
      ['role.prac.title', en['role.prac.title']],
      ['role.prac.desc', en['role.prac.desc']],
      ['role.prac.cta', en['role.prac.cta']],
    ]],
    ['Entry screen — practitioner (#)', 'entry-screen', 'practitioner', [
      ['entry.title', en['entry.title']],
      ['entry.sub', en['entry.sub']],
      ['Learn pathway', `${en['pathway.learn.title']} — ${en['pathway.learn.desc']}`],
      ['Implement pathway', `${en['pathway.implement.title']} — ${en['pathway.implement.desc']}`],
      ['Reflect pathway', `${en['pathway.reflect.title']} — ${en['pathway.reflect.desc']}`],
      ['Reference pathway', `${en['pathway.reference.title']} — ${en['pathway.reference.desc']}`],
      ['Guide pathway', `${en['pathway.guide.title']} — ${en['pathway.guide.desc']}`],
    ]],
    ['Entry screen — participant (#)', 'entry-screen (participant subview)', 'participant', [
      ['pentry.title', en['pentry.title']],
      ['pentry.sub', en['pentry.sub']],
      ['ppath.what', `${en['ppath.what.title']} — ${en['ppath.what.desc']}`],
      ['ppath.session', `${en['ppath.session.title']} — ${en['ppath.session.desc']}`],
      ['ppath.forme', `${en['ppath.forme.title']} — ${en['ppath.forme.desc']}`],
      ['ppath.before', `${en['ppath.before.title']} — ${en['ppath.before.desc']}`],
    ]],
    ['What is FBT? (#pwhat)', 'pwhat-screen', 'participant', null],
    ['A typical session (#psession)', 'psession-screen', 'participant', null],
    ['Is it for me? (#pforme)', 'pforme-screen', 'participant', null],
    ['Before your first session (#pbefore)', 'pbefore-screen', 'participant', null],
    ['Learn More (#learn)', 'learn-screen', 'practitioner', null],
    ['Implement in Practice (#implement)', 'implement-screen', 'practitioner', null],
    ['Reflect & Evaluate (#reflect)', 'reflect-screen', 'practitioner', null],
    ['Clinical Reference (#reference)', 'reference-screen', 'practitioner', null],
    ['Companion Guide (#guide)', 'guide-screen', 'practitioner', null],
  ];
  for (const [title, id, role, simpleRows] of screens) {
    o.push(`### ${title}`);
    o.push(`- **DOM id**: \`${id}\``);
    if (role) o.push(`- **Audience**: ${role}`);
    o.push('');
    if (simpleRows) {
      for (const [label, value] of simpleRows) if (value) o.push(`- **${label}** — ${value}`);
      o.push('');
    } else {
      o.push('See [content.md](./content.md) for the full text of this screen.');
      o.push('');
    }
  }

  o.push('## Door-modules (full-page views)', '');
  o.push('When a door-module is opened, it replaces the screen with a focused');
  o.push('single-module page. The set is hard-coded in `applyRoute()` in `index.html`:', '');
  o.push('| Module id | Found on screen | Title (EN) |');
  o.push('|-----------|-----------------|------------|');
  const doors = [
    ['mod-pocket',       'implement', en['mod.pocket.title']],
    ['mod-pre',          'implement', en['mod.pre.title']],
    ['mod-plan',         'implement', en['mod.plan.title']],
    ['mod-reflect-self', 'reflect',   en['mod.reflectself.title']],
    ['mod-indicators',   'reflect',   en['mod.indicators.title']],
    ['mod-glossary',     'reflect',   en['mod.glossary.title']],
  ];
  for (const [id, screen, title] of doors) o.push(`| \`${id}\` | ${screen} | ${title || ''} |`);
  o.push('');

  fs.writeFileSync(path.join(docs, 'pathways.md'), o.join('\n'));
}

// =========================================================================
// content.md
// =========================================================================
{
  const o = [];
  o.push('# All Visible Content (EN)', '');
  o.push(`Every visible string in the app, grouped by screen and module. Total: **${enKeys.length}** translation keys.`, '');
  o.push('Each entry shows the i18n **key** and its English value. To change a value, edit it in `index.html` (search for the key) or use `translations.csv` for bulk editing.', '');
  o.push('---', '');

  const byPrefix = {};
  for (const k of orderedKeys) (byPrefix[k.split('.')[0]] ||= []).push(k);

  const sections = [
    ['header', 'Site shell · header', 'The fixed header bar.'],
    ['footer', 'Site shell · footer', 'Footer text.'],
    ['nav',    'Site shell · nav',    'Navigation labels.'],
    ['ui',     'Site shell · UI strings', ''],
    ['role',   'Role screen', 'The very first screen — user picks their perspective.'],
    ['entry',  'Entry screen (practitioner)', 'Practitioner pathway selection.'],
    ['pentry', 'Entry screen (participant)', 'Participant pathway selection.'],
    ['pathway', 'Practitioner pathway cards', 'The five cards on the practitioner entry screen.'],
    ['ppath',  'Participant pathway cards', 'The four cards on the participant entry screen.'],
    ['pwhat',  'Participant · What is FBT?', 'Screen #pwhat'],
    ['psession', 'Participant · A typical session', 'Screen #psession — phase-by-phase timeline.'],
    ['pforme', 'Participant · Is it for me?', 'Screen #pforme — five lived experiences.'],
    ['pbefore', 'Participant · Before your first session', 'Screen #pbefore — five preparation modules.'],
    ['learn',  'Practitioner · Learn More (heading)', ''],
    ['implement', 'Practitioner · Implement (heading)', ''],
    ['reflect', 'Practitioner · Reflect (heading)', ''],
    ['mod',    'Practitioner module content', 'Module titles and body text across Learn, Implement, Reflect, and other modules.'],
    ['ref',    'Practitioner · Clinical Reference', 'Screen #reference — clinical indications, contraindications, populations, dosage, and integration.'],
    ['guide',  'Practitioner · Companion Guide', 'Screen #guide — 14-chapter practitioner handbook (4 parts).'],
    ['act',    'Activities · pocketbook text', 'Activity labels, run-mode strings, etc.'],
    ['tag',    'Activity tags', 'Tag labels shown on activity cards.'],
    ['visual', 'Activity visuals · captions', 'Captions for activity illustrations.'],
    ['check',  'Pre-session checklist items', ''],
    ['detail', 'Activity detail labels', ''],
  ];
  const written = new Set();
  for (const [pfx, title, desc] of sections) {
    const ks = byPrefix[pfx] || [];
    if (!ks.length) continue;
    o.push(`## ${title}`);
    if (desc) o.push(`*${desc}*`);
    o.push('');
    for (const k of ks) { o.push(`- **\`${k}\`** — ${en[k]}`); written.add(k); }
    o.push('');
  }
  const leftover = orderedKeys.filter(k => !written.has(k));
  if (leftover.length) {
    o.push('## Other / uncategorised', '');
    for (const k of leftover) o.push(`- **\`${k}\`** — ${en[k]}`);
    o.push('');
  }
  fs.writeFileSync(path.join(docs, 'content.md'), o.join('\n'));
}

// =========================================================================
// activities.md
// =========================================================================
{
  const o = [];
  o.push('# Pocketbook of Activities — Full Content', '');
  o.push(`Every activity in the pocketbook (${ACTIVITIES.length} total), grouped by the five therapeutic-arc themes. Use \`activities.csv\` for bulk editing in a spreadsheet.`, '');
  o.push('Adaptations for specific presentations appear at the end.', '');

  const grouped = {};
  for (const a of ACTIVITIES) (grouped[a.group] ||= []).push(a);

  for (const g of [1,2,3,4,5]) {
    o.push(`## Group ${g} · ${GROUP_NAMES[g]}`, '');
    const items = grouped[g] || [];
    if (!items.length) { o.push('*(no activities)*', ''); continue; }
    for (const a of items) {
      o.push(`### ${a.name}  *(id: \`${a.id}\`, ${a.durMin}–${a.durMax} min, avg ${a.durAvg})*`, '');
      o.push(`- **Caption (under illustration):** ${a.caption}`);
      o.push(`- **Purpose:** ${a.purpose}`);
      o.push(`- **Materials:** ${a.materials}`);
      o.push(`- **Intro (facilitator script):** ${a.intro}`);
      o.push(`- **Close (facilitator note):** ${a.close}`);
      o.push(`- **Tags:** ${(a.tags || []).map(t => '`' + t + '`').join(', ')}`, '');
    }
  }
  o.push('## Adaptations for specific presentations', '');
  for (const ad of ADAPTATIONS) {
    o.push(`### ${ad.label}`, '');
    o.push(ad.text, '');
  }
  fs.writeFileSync(path.join(docs, 'activities.md'), o.join('\n'));
}

// =========================================================================
// README.md
// =========================================================================
{
  const o = [];
  o.push('# Forest4Youth — Content & Pathways Documentation', '');
  o.push('These files are a snapshot of every screen, module, and visible string');
  o.push('in the Forest4Youth Practice Guide as of the current commit. They are');
  o.push('intended for **collaborative review and rewriting** with non-technical');
  o.push('contributors — therapists, educators, translators — without anyone');
  o.push('needing to open `index.html`.', '');
  o.push('## What\'s in here', '');
  o.push('| File | Format | What it contains | Best for |');
  o.push('|------|--------|------------------|----------|');
  o.push('| `pathways.md` | Markdown + Mermaid | Visual map of every navigation route + per-screen outline | Discussing structure, reorganising flow |');
  o.push('| `content.md` | Markdown | Every visible string in the app, grouped by screen | Reading top-to-bottom; spotting inconsistencies |');
  o.push('| `activities.md` | Markdown | The 17 pocketbook activities + adaptations, in readable form | Reviewing activity content, facilitator scripts |');
  o.push(`| \`translations.csv\` | CSV | All ${enKeys.length} i18n keys with their English values | Bulk editing in Google Sheets / Excel |`);
  o.push('| `activities.csv` | CSV | The 17 activities × 15 columns | Bulk editing activity metadata |');
  o.push('| `adaptations.csv` | CSV | The 5 adaptation presets | Editing the per-presentation adaptation copy |', '');
  o.push('## How to collaborate', '');
  o.push('1. **Upload these files to SharePoint** so collaborators can read/comment.');
  o.push('2. **Suggest text changes** directly in the markdown files (track changes / comments).');
  o.push('3. **For bulk text/translation work**, edit `translations.csv` in Google Sheets or Excel — the `key` column is the contract, the `en` column is the editable text.');
  o.push('4. **For activity rewrites**, edit `activities.csv` (or `activities.md` for prose-style review).');
  o.push('5. When you\'re ready to push changes back into the app, hand the edited files to a developer; they\'ll apply the changes to `index.html` (the source of truth) and rerun the generator to keep these docs in sync.', '');
  o.push('## Regenerating these files', '');
  o.push('All six files are produced by `tools/generate-docs.js` from `index.html`:', '');
  o.push('```');
  o.push('node tools/generate-docs.js');
  o.push('```', '');
  o.push('Requires Node ≥ 18. No npm packages needed.', '');
  o.push('## Source-of-truth note', '');
  o.push('`index.html` is the source of truth for what actually ships. These docs are derived from it and may drift if `index.html` changes without rerunning the generator. Treat them as a working copy for discussion, not a parallel implementation.');
  fs.writeFileSync(path.join(docs, 'README.md'), o.join('\n'));
}

console.log('Generated docs/:');
for (const f of fs.readdirSync(docs).sort()) {
  const sz = fs.statSync(path.join(docs, f)).size;
  console.log(`  ${f.padEnd(22)} ${(sz/1024).toFixed(1).padStart(6)} KB`);
}
