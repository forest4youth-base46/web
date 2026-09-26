// ============================================================
// IMMERSIVE VIRTUAL NATURE — hub and tools (#ivn, #ivn/<tool>)
// ============================================================
// The IVN guide's sheets, made usable. One session object (ivnCur) is
// carried through the four steps a practitioner actually goes through:
//
//   #ivn/plan      module A/B/C, personalization, care intention → measures
//   #ivn/check     first-use screening (once per young person) + every-session check
//   #ivn/run       timer, before-measures, what to watch for, stop → distress steps
//   #ivn/debrief   the brief debrief + after-measures → saved as a session record
//
// plus #ivn/records (saved records: view, download, print, CSV), #ivn/measures
// (outcome and scale menu), #ivn/distress (always one tap away) and
// #ivn/young (the page for young people, printable).
//
// All content comes from GUIDE_IVN.tools (guide-ivn-data.js, generated from
// the IVN practical guide). Storage is this browser only, under a
// pseudonymous young-person ID — never a name:
//   f4y.ivn.current    the session in progress
//   f4y.ivn.records    saved session records
//   f4y.ivn.screening  first-use screening, keyed by young-person ID

const IVN_CUR_KEY = 'f4y.ivn.current';
const IVN_REC_KEY = 'f4y.ivn.records';
const IVN_SCR_KEY = 'f4y.ivn.screening';
const IVN = (typeof GUIDE_IVN !== 'undefined' && GUIDE_IVN.tools) || null;
let ivnCur = storageLoad(IVN_CUR_KEY, null);
let ivnTimer = null;
let ivnShowDistress = false;
let ivnConfirmDelete = '';

function ivnNewSession() {
  return { id: 'ivn-' + Date.now(), youngId: '', clinician: '', date: toolToday(), setting: '', module: '',
           perso: {}, intention: '', measures: [], every: [], run: { startedAt: null, elapsed: 0, start: '', ended: false },
           before: {}, after: {}, tolBefore: '', tolAfter: '', observations: '', incident: '',
           debrief: {}, summary: '', carry: '' };
}
function ivnEnsure() { if (!ivnCur) ivnCur = ivnNewSession(); return ivnCur; }
function ivnSave() { storageSave(IVN_CUR_KEY, ivnCur); }
function ivnRecords() { const r = storageLoad(IVN_REC_KEY, []); return Array.isArray(r) ? r : []; }
function ivnScreenings() { const s = storageLoad(IVN_SCR_KEY, {}); return s && typeof s === 'object' ? s : {}; }
function ivnModule(key) { return IVN.modules.find(m => m.key === key); }
function ivnScale(intention) { return IVN.scales.find(s => s.intention === intention); }

function ivnElapsed(run) {
  return (run.elapsed || 0) + (run.startedAt ? Date.now() - run.startedAt : 0);
}
function ivnClock(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ── Step bar shared by the four session steps ─────────────
function ivnSteps(active) {
  const c = ivnCur || {};
  const done = {
    plan: !!(c.module && c.youngId),
    check: !!(c.every && c.every.length && c.every.every(Boolean)),
    run: !!(c.run && c.run.ended),
    debrief: false,
  };
  return '<ol class="ivn-steps">' + ['plan', 'check', 'run', 'debrief'].map((s, i) =>
    '<li><a href="#ivn/' + s + '"' + (s === active ? ' aria-current="step"' : '') + (done[s] ? ' class="is-done"' : '') + '>' +
    '<span class="ivn-step-n">' + (done[s] ? '✓' : i + 1) + '</span>' + toolEsc(t('ivn.step.' + s)) + '</a></li>').join('') + '</ol>' +
    (c.youngId || c.module ? '<p class="ivn-current">' + toolEsc(t('ivn.current')) + ': <strong>' + toolEsc(c.youngId || '—') + '</strong>' +
      (c.module ? ' · ' + toolEsc(t('ivn.module')) + ' ' + toolEsc(c.module) + ' — ' + toolEsc(ivnModule(c.module).title) : '') + '</p>' : '');
}

function ivnPage(kicker, title, lead, body, step) {
  return toolPage({ hub: 'ivn', back: t('ivn.back'), kicker, title, lead, body: (step ? ivnSteps(step) : '') + body });
}

// ── Hub ───────────────────────────────────────────────────
function ivnHub() {
  const c = ivnCur;
  const inProgress = c && (c.youngId || c.module)
    ? '<div class="ivn-resume"><div><strong>' + toolEsc(t('ivn.resume.title')) + '</strong><span>' + toolEsc((c.youngId || '—') +
        (c.module ? ' · ' + t('ivn.module') + ' ' + c.module : '')) + '</span></div>' +
        '<a class="gd-button" href="#ivn/' + (c.run && c.run.ended ? 'debrief' : c.run && (c.run.startedAt || c.run.elapsed) ? 'run' : c.module ? 'check' : 'plan') + '">' +
        toolEsc(t('ivn.resume.go')) + ' →</a></div>' : '';
  const n = ivnRecords().length;
  return toolHub({
    badge: t('ivn.badge'), title: t('ivn.title'), sub: t('ivn.sub'), intro: inProgress,
    groups: [
      { label: t('ivn.group.session'), cards: [
        { href: '#ivn/plan', title: t('ivn.card.plan.title'), text: t('ivn.card.plan.text'), tone: 'main' },
        { href: '#ivn/check', title: t('ivn.card.check.title'), text: t('ivn.card.check.text') },
        { href: '#ivn/run', title: t('ivn.card.run.title'), text: t('ivn.card.run.text') },
        { href: '#ivn/debrief', title: t('ivn.card.debrief.title'), text: t('ivn.card.debrief.text') },
      ]},
      { label: t('ivn.group.safety'), cards: [
        { href: '#ivn/distress', title: t('ivn.card.distress.title'), text: t('ivn.card.distress.text'), tone: 'alert' },
      ]},
      { label: t('ivn.group.evaluate'), cards: [
        { href: '#ivn/measures', title: t('ivn.card.measures.title'), text: t('ivn.card.measures.text') },
        { href: '#ivn/records', title: t('ivn.card.records.title'), text: t('ivn.card.records.text').replace('{n}', n) },
      ]},
      { label: t('ivn.group.read'), cards: [
        { href: '#ivn/young', title: t('ivn.card.young.title'), text: t('ivn.card.young.text') },
        { href: '#guide/g-ivn-start', title: t('ivn.card.guide.title'), text: t('ivn.card.guide.text') },
        { href: '#fi', title: t('ivn.card.fi.title'), text: t('ivn.card.fi.text') },
      ]},
    ],
  });
}

// ── 1. Plan ───────────────────────────────────────────────
function ivnPlan() {
  const c = ivnEnsure();
  const mod = c.module && ivnModule(c.module);
  const menu = IVN.menu.map(g => {
    const opts = g.scale ? [g.scale[0], t('ivn.plan.between'), g.scale[1]] : g.options;
    const single = g.label !== 'Add-ons';
    return '<div class="gd-menu-row"><div class="gd-menu-label">' + toolEsc(g.label) + '</div>' +
      toolChips('perso:' + g.label, opts, c.perso[g.label] || [], single) + '</div>';
  }).join('');
  const intents = IVN.scales.filter(s => s.intention !== 'Tolerability').map(s => s.intention);
  const sc = c.intention && ivnScale(c.intention);
  const body =
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.plan.who')) + '</h3><div class="tool-grid">' +
      '<label class="tool-field"><span>' + toolEsc(t('tools.youngid')) + '</span><input type="text" data-f="youngId" autocomplete="off" value="' + toolEsc(c.youngId) + '" placeholder="' + toolEsc(t('tools.youngid.ph')) + '"></label>' +
      '<label class="tool-field"><span>' + toolEsc(t('ivn.f.clinician')) + '</span><input type="text" data-f="clinician" value="' + toolEsc(c.clinician) + '"></label>' +
      '<label class="tool-field"><span>' + toolEsc(t('ivn.f.date')) + '</span><input type="date" data-f="date" value="' + toolEsc(c.date) + '"></label>' +
      '<div class="tool-field"><span>' + toolEsc(t('ivn.f.setting')) + '</span>' + toolChips('setting', [t('ivn.setting.room'), t('ivn.setting.headset')], c.setting ? [c.setting] : [], true) + '</div>' +
    '</div></section>' +
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.plan.module')) + '</h3><div class="ivn-modules">' +
      IVN.modules.map(m => '<button type="button" class="ivn-module" data-module="' + m.key + '" aria-pressed="' + (c.module === m.key) + '">' +
        '<span class="gd-module-key">' + m.key + '</span><span class="ivn-module-title">' + toolEsc(m.title) + '</span>' +
        '<span class="ivn-module-purpose">' + toolEsc(m.purpose || '') + '</span><span class="ivn-module-time">' + toolEsc(m.params[0] || '') + '</span></button>').join('') +
      '</div>' + (mod ? '<div class="ivn-module-detail"><ul class="gd-params">' + mod.params.map(p => '<li>' + toolEsc(p) + '</li>').join('') + '</ul><dl>' +
        mod.details.map(d => '<dt>' + toolEsc(d.label) + '</dt><dd>' + toolEsc(d.text) + '</dd>').join('') + '</dl></div>' : '') +
    '</section>' +
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.plan.choices')) + '</h3><p class="tool-muted">' + toolEsc(IVN.menuPrompts) + '</p>' +
      '<div class="gd-menu">' + menu + '</div><p class="tool-muted">' + toolEsc(IVN.menuRealism) + '</p></section>' +
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.plan.intention')) + '</h3><p class="tool-muted">' + toolEsc(t('ivn.plan.intention.lead')) + '</p>' +
      toolChips('intention', intents, c.intention ? [c.intention] : [], true) +
      (sc ? ivnMeasurePicker(sc, c.measures) : '') +
      '<p class="tool-muted">' + toolEsc(t('ivn.plan.tolerability')) + '</p></section>' +
    '<div class="tool-actions"><a class="gd-button" href="#ivn/check">' + toolEsc(t('ivn.plan.next')) + ' →</a>' +
      '<button type="button" class="tool-btn tool-btn-quiet" onclick="ivnStartOver()">' + toolEsc(t('ivn.startover')) + '</button></div>' +
    '<p class="tool-muted">' + toolEsc(t('tools.stored')) + '</p>';
  return ivnPage(t('ivn.step.plan'), t('ivn.card.plan.title'), t('ivn.plan.lead'), body, 'plan');
}

function ivnMeasurePicker(sc, selected) {
  return '<div class="ivn-measures"><p class="ivn-domain">' + toolEsc(sc.domain) + '</p>' +
    (sc.quick.length ? '<div class="ivn-tier"><span>' + toolEsc(t('ivn.tier.quick')) + '</span>' + toolChips('measures', sc.quick, selected) + '</div>' : '') +
    '<div class="ivn-tier"><span>' + toolEsc(sc.quick.length ? t('ivn.tier.validated') : t('ivn.tier.suggested')) + '</span>' + toolChips('measures', sc.validated, selected) + '</div></div>';
}

function ivnStartOver() {
  ivnCur = ivnNewSession(); ivnSave(); ivnRender();
}

// ── 2. Check ──────────────────────────────────────────────
function ivnCheck() {
  const c = ivnEnsure();
  const scr = c.youngId ? ivnScreenings()[c.youngId] : null;
  const first = scr ? scr.items : [];
  const firstDone = scr && scr.items.length === IVN.checkFirst.length && scr.items.every(Boolean);
  const body =
    (c.youngId ? '' : '<p class="tool-warn">' + toolEsc(t('ivn.check.noid')) + ' <a href="#ivn/plan">' + toolEsc(t('ivn.step.plan')) + '</a></p>') +
    '<section class="tool-card"><div class="tool-card-head"><h3 class="tool-h">' + toolEsc(t('ivn.check.first')) + '</h3>' +
      toolProgress(IVN.checkFirst.map((_, i) => !!first[i])) + '</div>' +
      '<p class="tool-muted">' + toolEsc(firstDone ? t('ivn.check.first.done').replace('{date}', scr.date) : t('ivn.check.first.lead')) + '</p>' +
      toolChecklist('first', IVN.checkFirst, first) + '</section>' +
    '<section class="tool-card"><div class="tool-card-head"><h3 class="tool-h">' + toolEsc(t('ivn.check.every')) + '</h3>' +
      toolProgress(IVN.checkEvery.map((_, i) => !!c.every[i])) + '</div>' +
      toolChecklist('every', IVN.checkEvery, c.every) + '</section>' +
    '<div class="tool-actions"><a class="gd-button" href="#ivn/run">' + toolEsc(t('ivn.check.next')) + ' →</a></div>';
  return ivnPage(t('ivn.step.check'), t('ivn.card.check.title'), t('ivn.check.lead'), body, 'check');
}

// ── 3. Run ────────────────────────────────────────────────
function ivnRun() {
  const c = ivnEnsure();
  const mod = c.module && ivnModule(c.module);
  const running = !!c.run.startedAt;
  const measureRow = (m, when) => '<label class="tool-field tool-field-inline"><span>' + toolEsc(m) + '</span>' +
    '<input type="text" inputmode="decimal" data-m="' + toolEsc(m) + '" data-when="' + when + '" value="' + toolEsc((c[when] || {})[m] || '') + '"></label>';
  const body =
    '<section class="tool-card ivn-run">' +
      '<div class="ivn-clock" aria-live="off"><span id="ivn-clock">' + ivnClock(ivnElapsed(c.run)) + '</span>' +
        (mod ? '<small>' + toolEsc(t('ivn.run.suggested')) + ': ' + toolEsc(mod.params[0]) + '</small>' : '') + '</div>' +
      '<div class="tool-actions">' +
        (c.run.ended ? '<span class="tool-muted">' + toolEsc(t('ivn.run.ended')) + '</span>'
          : '<button type="button" class="gd-button" onclick="ivnToggleTimer()">' + toolEsc(running ? t('ivn.run.pause') : (c.run.elapsed ? t('ivn.run.resume') : t('ivn.run.start'))) + '</button>' +
            '<button type="button" class="tool-btn" onclick="ivnEnd()">' + toolEsc(t('ivn.run.end')) + '</button>') +
      '</div>' +
      '<button type="button" class="ivn-stop" onclick="ivnToggleDistress()" aria-expanded="' + ivnShowDistress + '">' + toolEsc(t('ivn.run.stop')) + '</button>' +
      (ivnShowDistress ? ivnDistressBlock() : '') +
    '</section>' +
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.run.before')) + '</h3>' +
      (c.measures.length ? c.measures.map(m => measureRow(m, 'before')).join('') : '<p class="tool-muted">' + toolEsc(t('ivn.run.nomeasure')) + '</p>') +
      '<label class="tool-field tool-field-inline"><span>' + toolEsc(t('ivn.f.tolerability')) + '</span><input type="text" data-f="tolBefore" value="' + toolEsc(c.tolBefore) + '"></label>' +
    '</section>' +
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.run.watch')) + '</h3><p>' + toolEsc(IVN.signs) + '</p>' +
      '<p class="tool-muted">' + toolEsc(t('ivn.run.exit')) + '</p>' +
      '<label class="tool-field"><span>' + toolEsc(t('ivn.f.observations')) + '</span><textarea data-f="observations" rows="3">' + toolEsc(c.observations) + '</textarea></label>' +
      '<label class="tool-field"><span>' + toolEsc(t('ivn.f.incident')) + '</span><textarea data-f="incident" rows="2">' + toolEsc(c.incident) + '</textarea></label>' +
    '</section>' +
    '<div class="tool-actions"><a class="gd-button" href="#ivn/debrief">' + toolEsc(t('ivn.run.next')) + ' →</a></div>';
  return ivnPage(t('ivn.step.run'), t('ivn.card.run.title'), mod ? mod.title + ' — ' + mod.sub : t('ivn.run.lead'), body, 'run');
}

function ivnToggleTimer() {
  const r = ivnEnsure().run;
  if (r.startedAt) { r.elapsed += Date.now() - r.startedAt; r.startedAt = null; }
  else { r.startedAt = Date.now(); if (!r.start) r.start = new Date().toTimeString().slice(0, 5); }
  ivnSave(); ivnRender(); ivnTick();
}
function ivnEnd() {
  const r = ivnEnsure().run;
  if (r.startedAt) { r.elapsed += Date.now() - r.startedAt; r.startedAt = null; }
  r.ended = true; ivnSave();
  window.location.hash = 'ivn/debrief';
}
function ivnTick() {
  clearInterval(ivnTimer);
  if (!ivnCur || !ivnCur.run.startedAt) return;
  ivnTimer = setInterval(() => {
    const el = document.getElementById('ivn-clock');
    if (!el || !ivnCur || !ivnCur.run.startedAt) { clearInterval(ivnTimer); return; }
    el.textContent = ivnClock(ivnElapsed(ivnCur.run));
  }, 1000);
}
function ivnToggleDistress() { ivnShowDistress = !ivnShowDistress; ivnRender(); }

// ── If a young person is overwhelmed ──────────────────────
function ivnDistressBlock() {
  const D = IVN.distress;
  return '<div class="ivn-distress">' +
    '<h4>' + toolEsc(t('ivn.distress.act')) + '</h4><ol class="ivn-act">' + D.act.map(a => '<li>' + toolEsc(a) + '</li>').join('') + '</ol>' +
    '<h4>' + toolEsc(t('ivn.distress.watch')) + '</h4><ul class="gd-list">' + D.watch.map(a => '<li>' + toolEsc(a) + '</li>').join('') + '</ul>' +
    '<h4>' + toolEsc(t('ivn.distress.after')) + '</h4><ul class="gd-list">' + D.after.map(a => '<li>' + toolEsc(a) + '</li>').join('') + '</ul></div>';
}
function ivnDistress() {
  return ivnPage(t('ivn.group.safety'), t('ivn.card.distress.title'), IVN.distress.intro,
    '<section class="tool-card tool-card-alert">' + ivnDistressBlock() + '</section>' +
    (ivnCur ? '<p><a href="#ivn/run">' + toolEsc(t('ivn.distress.back')) + '</a></p>' : ''));
}

// ── 4. Debrief ────────────────────────────────────────────
function ivnDebrief() {
  const c = ivnEnsure();
  const F = IVN.debriefFields;
  const byLabel = l => F.find(f => f.label.indexOf(l) === 0) || { label: l };
  const d = c.debrief;
  const text = (key, f, rows) => '<label class="tool-field"><span>' + toolEsc(f.label) + '</span><textarea data-d="' + key + '" rows="' + (rows || 2) + '">' + toolEsc(d[key] || '') + '</textarea></label>';
  const chips = (key, f) => '<div class="tool-field"><span>' + toolEsc(f.label) + '</span>' + toolChips('d:' + key, f.options, d[key] ? [d[key]] : [], true) + '</div>';
  const measureRow = m => '<label class="tool-field tool-field-inline"><span>' + toolEsc(m) +
    (c.before[m] ? ' <small>(' + toolEsc(t('ivn.before')) + ': ' + toolEsc(c.before[m]) + ')</small>' : '') + '</span>' +
    '<input type="text" inputmode="decimal" data-m="' + toolEsc(m) + '" data-when="after" value="' + toolEsc(c.after[m] || '') + '"></label>';
  const body =
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.debrief.talk')) + '</h3><p class="tool-muted">' + toolEsc(t('ivn.debrief.talk.lead')) + '</p>' +
      chips('overall', byLabel('Overall')) + text('like', byLabel('What was it like')) + text('stood', byLabel('Anything that stood out')) +
      text('change', byLabel("Anything you'd change")) + chips('discomfort', byLabel('Any discomfort')) +
      (c.module === 'A' ? chips('ready', byLabel('Module A')) : '') + (c.module === 'C' ? text('keep', byLabel('Module C')) : '') +
      text('word', byLabel('Optional close'), 1) +
    '</section>' +
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.debrief.after')) + '</h3>' +
      (c.measures.length ? c.measures.map(measureRow).join('') : '<p class="tool-muted">' + toolEsc(t('ivn.run.nomeasure')) + '</p>') +
      '<label class="tool-field tool-field-inline"><span>' + toolEsc(t('ivn.f.tolerability')) + (c.tolBefore ? ' <small>(' + toolEsc(t('ivn.before')) + ': ' + toolEsc(c.tolBefore) + ')</small>' : '') + '</span><input type="text" data-f="tolAfter" value="' + toolEsc(c.tolAfter) + '"></label>' +
      '<p class="tool-muted">' + toolEsc(IVN.scalesSafety) + '</p>' +
    '</section>' +
    '<section class="tool-card"><h3 class="tool-h">' + toolEsc(t('ivn.debrief.record')) + '</h3>' +
      '<label class="tool-field"><span>' + toolEsc(t('ivn.f.summary')) + '</span><textarea data-f="summary" rows="2">' + toolEsc(c.summary) + '</textarea></label>' +
      '<label class="tool-field"><span>' + toolEsc(t('ivn.f.carry')) + '</span><textarea data-f="carry" rows="2">' + toolEsc(c.carry) + '</textarea></label>' +
    '</section>' +
    '<div class="tool-actions"><button type="button" class="gd-button" onclick="ivnSaveRecord()">' + toolEsc(t('ivn.debrief.save')) + '</button></div>' +
    '<p class="tool-muted">' + toolEsc(t('tools.stored')) + '</p>';
  return ivnPage(t('ivn.step.debrief'), t('ivn.card.debrief.title'), t('ivn.debrief.lead'), body, 'debrief');
}

function ivnSaveRecord() {
  const c = ivnEnsure();
  if (c.run.startedAt) { c.run.elapsed += Date.now() - c.run.startedAt; c.run.startedAt = null; }
  const rec = JSON.parse(JSON.stringify(c));
  rec.saved = new Date().toISOString();
  const all = ivnRecords().filter(r => r.id !== rec.id);
  all.unshift(rec);
  storageSave(IVN_REC_KEY, all);
  ivnCur = null; storageSave(IVN_CUR_KEY, null);
  window.location.hash = 'ivn/records/' + rec.id;
}

// ── Records ───────────────────────────────────────────────
function ivnRecordRows(r) {
  const mod = r.module && ivnModule(r.module);
  const p = r.perso || {};
  const pj = k => (p[k] || []).join(', ') || '—';
  const measures = (r.measures || []).map(m => m + ': ' + ((r.before || {})[m] || '—') + ' → ' + ((r.after || {})[m] || '—')).join('; ') || '—';
  const d = r.debrief || {};
  const debrief = [d.overall, d.like, d.stood, d.change && (t('ivn.rec.change') + ': ' + d.change), d.discomfort && (t('ivn.rec.discomfort') + ': ' + d.discomfort),
    d.ready && (t('ivn.rec.ready') + ': ' + d.ready), d.keep && (t('ivn.rec.keep') + ': ' + d.keep), d.word && (t('ivn.rec.word') + ': ' + d.word)].filter(Boolean).join(' · ') || '—';
  return [
    [t('ivn.rec.when'), (r.date || '—') + (r.run && r.run.start ? ' · ' + r.run.start : '') + ' · ' + Math.round(((r.run && r.run.elapsed) || 0) / 60000) + ' min'],
    [t('ivn.f.clinician'), r.clinician || '—'],
    [t('tools.youngid'), r.youngId || '—'],
    [t('ivn.module'), mod ? r.module + ' — ' + mod.title : '—'],
    [t('ivn.f.setting'), r.setting || '—'],
    [t('ivn.plan.intention'), r.intention || '—'],
    [t('ivn.rec.perso'), ['Environment', 'Mode', 'Sensory level', 'Social format', 'Add-ons', 'Purpose'].map(k => k + ': ' + pj(k)).join(' · ')],
    [t('ivn.rec.measures'), measures],
    [t('ivn.f.tolerability'), (r.tolBefore || '—') + ' → ' + (r.tolAfter || '—')],
    [t('ivn.f.observations'), r.observations || '—'],
    [t('ivn.f.incident'), r.incident || '—'],
    [t('ivn.rec.debrief'), debrief],
    [t('ivn.f.summary'), r.summary || '—'],
    [t('ivn.f.carry'), r.carry || '—'],
  ];
}

function ivnRecordText(r) {
  return t('ivn.rec.title') + '\n\n' + ivnRecordRows(r).map(([k, v]) => k + ': ' + v).join('\n') + '\n';
}

function ivnRecords_view(arg) {
  const all = ivnRecords();
  const r = arg && all.find(x => x.id === arg);
  if (r) {
    const body = '<section class="tool-card" id="ivn-record-print"><h3 class="tool-h">' + toolEsc(t('ivn.rec.title')) + '</h3><dl class="ivn-record">' +
      ivnRecordRows(r).map(([k, v]) => '<dt>' + toolEsc(k) + '</dt><dd>' + toolEsc(v) + '</dd>').join('') + '</dl></section>' +
      '<div class="tool-actions">' +
        '<button type="button" class="gd-button" onclick="ivnDownloadOne(\'' + r.id + '\')">' + toolEsc(t('tools.download')) + '</button>' +
        '<button type="button" class="tool-btn" onclick="toolPrint(document.getElementById(\'ivn-record-print\'))">' + toolEsc(t('tools.print')) + '</button>' +
        '<button type="button" class="tool-btn tool-btn-quiet" onclick="ivnDelete(\'' + r.id + '\')">' + toolEsc(ivnConfirmDelete === r.id ? t('ivn.rec.confirm') : t('ivn.rec.delete')) + '</button>' +
        '<a class="tool-btn tool-btn-quiet" href="#ivn/records">' + toolEsc(t('ivn.rec.all')) + '</a>' +
      '</div>';
    return ivnPage(t('ivn.group.evaluate'), t('ivn.card.records.title'), '', body);
  }
  const list = all.length
    ? '<ul class="ivn-rec-list">' + all.map(x => '<li><a href="#ivn/records/' + x.id + '"><strong>' + toolEsc(x.youngId || '—') + '</strong>' +
        '<span>' + toolEsc((x.date || '') + (x.module ? ' · ' + t('ivn.module') + ' ' + x.module : '') + (x.intention ? ' · ' + x.intention : '')) + '</span></a></li>').join('') + '</ul>' +
      '<div class="tool-actions"><button type="button" class="gd-button" onclick="ivnDownloadCsv()">' + toolEsc(t('ivn.rec.csv')) + '</button></div>'
    : '<p class="tool-muted">' + toolEsc(t('ivn.rec.empty')) + '</p><a class="gd-button" href="#ivn/plan">' + toolEsc(t('ivn.card.plan.title')) + ' →</a>';
  return ivnPage(t('ivn.group.evaluate'), t('ivn.card.records.title'), t('ivn.rec.lead'), list + '<p class="tool-muted">' + toolEsc(t('tools.stored')) + '</p>');
}

function ivnDownloadOne(id) {
  const r = ivnRecords().find(x => x.id === id);
  if (r) toolDownload('ivn-session-' + (r.youngId || 'record') + '-' + (r.date || '') + '.txt', ivnRecordText(r));
}
function ivnDownloadCsv() {
  const all = ivnRecords();
  if (!all.length) return;
  const head = ivnRecordRows(all[0]).map(([k]) => k);
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const csv = [head.map(q).join(',')].concat(all.map(r => ivnRecordRows(r).map(([, v]) => q(v)).join(','))).join('\n');
  toolDownload('ivn-sessions-' + toolToday() + '.csv', csv, 'text/csv');
}
function ivnDelete(id) {
  if (ivnConfirmDelete !== id) { ivnConfirmDelete = id; ivnRender(); return; }
  storageSave(IVN_REC_KEY, ivnRecords().filter(r => r.id !== id));
  ivnConfirmDelete = '';
  window.location.hash = 'ivn/records';
}

// ── Choose a measure ──────────────────────────────────────
let ivnPickIntention = '';
function ivnMeasures() {
  const sc = ivnPickIntention && ivnScale(ivnPickIntention);
  const body =
    '<section class="tool-card"><p class="tool-muted">' + toolEsc(IVN.scalesHowTo) + '</p>' +
      toolChips('pick', IVN.scales.map(s => s.intention), ivnPickIntention ? [ivnPickIntention] : [], true) +
      (sc ? '<div class="ivn-measures"><p class="ivn-domain">' + toolEsc(sc.domain) + '</p>' +
        (sc.quick.length ? '<div class="ivn-tier"><span>' + toolEsc(t('ivn.tier.quick')) + '</span><ul class="gd-list">' + sc.quick.map(m => '<li>' + toolEsc(m) + '</li>').join('') + '</ul></div>' : '') +
        '<div class="ivn-tier"><span>' + toolEsc(sc.quick.length ? t('ivn.tier.validated') : t('ivn.tier.suggested')) + '</span><ul class="gd-list">' + sc.validated.map(m => '<li>' + toolEsc(m) + '</li>').join('') + '</ul></div>' +
        (sc.intention !== 'Tolerability' ? '<button type="button" class="gd-button" onclick="ivnUseIntention()">' + toolEsc(t('ivn.measures.use')) + '</button>' : '') + '</div>' : '') +
    '</section><p class="tool-muted">' + toolEsc(IVN.scalesSafety) + '</p>';
  return ivnPage(t('ivn.group.evaluate'), t('ivn.card.measures.title'), t('ivn.measures.lead'), body);
}
function ivnUseIntention() {
  const c = ivnEnsure(); c.intention = ivnPickIntention; c.measures = []; ivnSave();
  window.location.hash = 'ivn/plan';
}

// ── For young people ──────────────────────────────────────
function ivnYoung() {
  const sec = GUIDE_IVN.sections.find(s => s.id === 'ivn-young');
  const intro = sec.blocks.filter(b => b.t === 'p').map(b => '<p class="gd-lead-p">' + toolEsc(b.text) + '</p>').join('');
  const qa = (sec.blocks.find(b => b.t === 'qa') || { items: [] }).items;
  const body = '<div id="ivn-young-print" class="ivn-young">' + intro + '<div class="gd-qa">' +
    qa.map(i => '<div class="gd-qa-item"><h5>' + toolEsc(i.q) + '</h5><p>' + toolEsc(i.a) + '</p></div>').join('') + '</div></div>' +
    '<div class="tool-actions"><button type="button" class="gd-button" onclick="toolPrint(document.getElementById(\'ivn-young-print\'))">' + toolEsc(t('ivn.young.print')) + '</button></div>';
  return ivnPage(t('ivn.group.read'), t('ivn.card.young.title'), t('ivn.young.lead'), body);
}

// ── Render + routing ──────────────────────────────────────
const IVN_VIEWS = { plan: ivnPlan, check: ivnCheck, run: ivnRun, debrief: ivnDebrief, records: ivnRecords_view,
                    measures: ivnMeasures, distress: ivnDistress, young: ivnYoung };

function ivnRender() {
  const root = document.getElementById('ivn-root');
  if (!root || !IVN) return;
  const r = toolRoute();
  const view = r.hub === 'ivn' && IVN_VIEWS[r.tool];
  root.innerHTML = view ? view(r.arg) : ivnHub();
  ivnTick();
}

function ivnBind() {
  const root = document.getElementById('ivn-root');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  toolBindChips(root, (name, values) => {
    if (name === 'pick') { ivnPickIntention = values[0] || ''; ivnRender(); return; }
    const c = ivnEnsure();
    if (name === 'setting') c.setting = values[0] || '';
    else if (name === 'intention') { c.intention = values[0] || ''; c.measures = []; ivnSave(); ivnRender(); return; }
    else if (name === 'measures') {
      const wrap = root.querySelectorAll('.gd-chips[data-name="measures"]');
      c.measures = [].concat.apply([], Array.from(wrap).map(w => Array.from(w.querySelectorAll('.gd-chip[aria-pressed="true"]')).map(x => x.dataset.value)));
    }
    else if (name.indexOf('perso:') === 0) c.perso[name.slice(6)] = values;
    else if (name.indexOf('d:') === 0) c.debrief[name.slice(2)] = values[0] || '';
    ivnSave();
  });
  toolBindChecks(root, (name, values) => {
    const c = ivnEnsure();
    if (name === 'every') c.every = values;
    if (name === 'first' && c.youngId) {
      const all = ivnScreenings();
      all[c.youngId] = { date: toolToday(), items: values };
      storageSave(IVN_SCR_KEY, all);
    }
    ivnSave();
    const list = root.querySelector('.gd-check[data-name="' + name + '"]');
    const prog = list && list.closest('.tool-card').querySelector('.tool-progress');
    if (prog) prog.outerHTML = toolProgress(values);
  });
  root.addEventListener('click', e => {
    const m = e.target.closest('.ivn-module');
    if (!m) return;
    ivnEnsure().module = m.dataset.module; ivnSave(); ivnRender();
  });
  root.addEventListener('input', e => {
    const el = e.target, c = ivnEnsure();
    if (el.dataset.f) c[el.dataset.f] = el.value;
    else if (el.dataset.d) c.debrief[el.dataset.d] = el.value;
    else if (el.dataset.m) { c[el.dataset.when] = c[el.dataset.when] || {}; c[el.dataset.when][el.dataset.m] = el.value; }
    else return;
    ivnSave();
  });
}

function ivnSyncFromHash() {
  if (toolRoute().hub !== 'ivn') { clearInterval(ivnTimer); return; }
  ivnConfirmDelete = '';
  ivnRender();
  toolFocusTitle(document.getElementById('ivn-root'));
}

window.addEventListener('hashchange', ivnSyncFromHash);
ivnBind();
ivnRender();
