// ============================================================
// FOREST-BASED INTERVENTIONS — hub and tools (#fi, #fi/<tool>)
// ============================================================
// Cards for everything the app offers for forest sessions. The Pocketbook,
// Session Builder and Run Mode are linked, not changed. The tools here are
// built from FI_TOOLS (fi-tools-data.js, generated from the project's
// guidance for professionals and the practical guide):
//
//   #fi/structure  — the session arc, session lengths, programme, container
//   #fi/prepare    — before the programme / before each session / joint briefing
//   #fi/screening  — contraindications + the six-area assessment
//   #fi/debrief    — closing circle with young people, then the adults
//
// Ticks on the preparation lists are kept in this browser only
// (f4y.fi.prepare) so a practitioner can prepare over several days; the
// screening notes are about a young person, so they are never stored —
// download or print them instead.

const FI_PREP_KEY = 'f4y.fi.prepare';
let fiScreen = { id: '', areas: {} };
let fiLength = 1;

function fiHub() {
  return toolHub({
    badge: t('fi.badge'), title: t('fi.title'), sub: t('fi.sub'),
    groups: [
      { label: t('fi.group.plan'), cards: [
        { href: '#implement/mod-pocket', title: t('fi.card.pocket.title'), text: t('fi.card.pocket.text'), tone: 'main' },
        { href: '#fi/structure', title: t('fi.card.structure.title'), text: t('fi.card.structure.text') },
      ]},
      { label: t('fi.group.prepare'), cards: [
        { href: '#fi/screening', title: t('fi.card.screening.title'), text: t('fi.card.screening.text') },
        { href: '#fi/prepare', title: t('fi.card.prepare.title'), text: t('fi.card.prepare.text') },
      ]},
      { label: t('fi.group.after'), cards: [
        { href: '#fi/debrief', title: t('fi.card.debrief.title'), text: t('fi.card.debrief.text') },
        { href: '#reflect', title: t('fi.card.reflect.title'), text: t('fi.card.reflect.text') },
      ]},
      { label: t('fi.group.read'), cards: [
        { href: '#guide/g-fi-start', title: t('fi.card.guide.title'), text: t('fi.card.guide.text') },
        { href: '#ivn', title: t('fi.card.ivn.title'), text: t('fi.card.ivn.text') },
      ]},
    ],
  });
}

// ── Session structure ─────────────────────────────────────
function fiStructure() {
  const S = FI_TOOLS.structure;
  const len = S.lengths[fiLength] || S.lengths[0];
  const body =
    '<ol class="fi-arc">' + S.arc.map((a, i) =>
      '<li class="fi-arc-step"><span class="fi-arc-n">' + (i + 1) + '</span><h4>' + toolEsc(a.stage) + '</h4><p>' + toolEsc(a.text) + '</p></li>').join('') + '</ol>' +
    toolQuote(S.arc_quote) +
    '<h3 class="tool-h">' + toolEsc(t('fi.structure.length')) + '</h3>' +
    '<div class="gd-body">' + S.evidence.map(p => '<p>' + toolEsc(p) + '</p>').join('') + '</div>' +
    '<div class="fi-lengths" role="tablist" aria-label="' + toolEsc(t('fi.structure.length')) + '">' + S.lengths.map((l, i) =>
      '<button type="button" role="tab" class="fi-length" aria-selected="' + (i === fiLength) + '" data-len="' + i + '">' + toolEsc(l.len) + '</button>').join('') + '</div>' +
    '<div class="fi-length-panel" role="tabpanel"><p>' + toolEsc(len.text) + '</p><p class="fi-note">' + toolEsc(S.lengths_note) + '</p></div>' +
    '<h3 class="tool-h">' + toolEsc(t('fi.structure.programme')) + '</h3>' +
    '<div class="gd-body"><p>' + toolEsc(S.programme.lead) + '</p></div>' +
    '<div class="gd-tips">' + S.programme.principles.map(p => '<div class="gd-tip"><h5>' + toolEsc(p.title) + '</h5><p>' + toolEsc(p.text) + '</p></div>').join('') + '</div>' +
    toolQuote(S.programme.quote) +
    '<h3 class="tool-h">' + toolEsc(t('fi.structure.container')) + '</h3>' +
    '<div class="gd-body"><p>' + toolEsc(t('fi.structure.container.lead')) + '</p></div>' +
    S.container.map(c => '<div class="fi-container"><h4>' + toolEsc(c.title) + '</h4><p>' + toolEsc(c.text) + '</p>' + toolQuote(c.quote) + '</div>').join('') +
    '<h3 class="tool-h">' + toolEsc(t('fi.structure.keypoints')) + '</h3>' +
    '<div class="gd-tips">' + S.keypoints.map(p => '<div class="gd-tip"><h5>' + toolEsc(p.title) + '</h5><p>' + toolEsc(p.text) + '</p></div>').join('') + '</div>' +
    '<p class="tool-next"><a class="gd-button" href="#implement/mod-pocket">' + toolEsc(t('fi.structure.cta')) + ' →</a></p>';
  return toolPage({ hub: 'fi', back: t('fi.back'), kicker: t('fi.group.plan'), title: t('fi.card.structure.title'), lead: S.intro, body });
}

// ── Before the session ────────────────────────────────────
function fiPrepState() {
  const s = storageLoad(FI_PREP_KEY, null);
  return s && typeof s === 'object' ? s : {};
}

function fiPrepare() {
  const P = FI_TOOLS.prepare;
  const st = fiPrepState();
  const block = (key, part) => {
    const vals = st[key] || [];
    return '<section class="tool-card"><div class="tool-card-head"><h3 class="tool-h">' + toolEsc(part.title) + '</h3>' +
      toolProgress(part.items.map((_, i) => !!vals[i])) + '</div>' +
      (part.intro ? '<p class="tool-muted">' + toolEsc(part.intro) + '</p>' : '') +
      toolChecklist(key, part.items, vals) + '</section>';
  };
  const body = '<div id="fi-prep-print">' + block('programme', P.programme) + block('before', P.before) + block('briefing', P.briefing) + '</div>' +
    '<div class="tool-actions">' +
      '<button type="button" class="tool-btn" onclick="toolPrint(document.getElementById(\'fi-prep-print\'))">' + toolEsc(t('tools.print')) + '</button>' +
      '<button type="button" class="tool-btn tool-btn-quiet" onclick="fiPrepReset()">' + toolEsc(t('tools.reset')) + '</button>' +
    '</div><p class="tool-muted">' + toolEsc(t('fi.prepare.stored')) + '</p>';
  return toolPage({ hub: 'fi', back: t('fi.back'), kicker: t('fi.group.prepare'), title: t('fi.card.prepare.title'), lead: t('fi.prepare.lead'), body });
}

function fiPrepReset() {
  storageSave(FI_PREP_KEY, {});
  fiRender();
}

// ── Screening & contraindications ─────────────────────────
function fiScreening() {
  const S = FI_TOOLS.screening;
  const states = [t('fi.screen.ok'), t('fi.screen.plan'), t('fi.screen.notyet')];
  const body =
    '<section class="tool-card tool-card-alert"><h3 class="tool-h">' + toolEsc(t('fi.screen.contra')) + '</h3>' +
      '<p>' + toolEsc(S.contra_intro) + '</p><ul class="gd-list">' + S.contra.map(c => '<li>' + toolEsc(c) + '</li>').join('') + '</ul>' +
      '<p class="tool-muted">' + toolEsc(S.case_by_case) + '</p></section>' +
    '<div class="tool-card"><p>' + toolEsc(S.not_yet) + '</p>' + toolQuote(S.quote) +
      '<a class="gd-button" href="#ivn">' + toolEsc(t('fi.screen.ivn')) + ' →</a></div>' +
    '<section class="tool-card" id="fi-screen-print"><div class="tool-card-head"><h3 class="tool-h">' + toolEsc(t('fi.screen.assess')) + '</h3></div>' +
      '<p class="tool-muted">' + toolEsc(S.assessment_intro) + '</p>' +
      '<label class="tool-field"><span>' + toolEsc(t('tools.youngid')) + '</span><input type="text" id="fi-screen-id" autocomplete="off" value="' + toolEsc(fiScreen.id) + '" placeholder="' + toolEsc(t('tools.youngid.ph')) + '"></label>' +
      S.assessment.map((a, i) => {
        const cur = fiScreen.areas[i] || {};
        return '<div class="fi-assess"><h4>' + toolEsc(a.area) + '</h4><p>' + toolEsc(a.q) + '</p>' +
          toolChips('area-' + i, states, cur.state ? [cur.state] : [], true) +
          '<textarea class="tool-note" data-area="' + i + '" rows="2" placeholder="' + toolEsc(t('tools.notes')) + '">' + toolEsc(cur.note || '') + '</textarea></div>';
      }).join('') +
    '</section>' +
    '<div class="tool-actions">' +
      '<button type="button" class="tool-btn" onclick="fiScreenDownload()">' + toolEsc(t('tools.download')) + '</button>' +
      '<button type="button" class="tool-btn tool-btn-quiet" onclick="toolPrint(document.getElementById(\'fi-screen-print\'))">' + toolEsc(t('tools.print')) + '</button>' +
      '<button type="button" class="tool-btn tool-btn-quiet" onclick="fiScreen={id:\'\',areas:{}};fiRender()">' + toolEsc(t('tools.clear')) + '</button>' +
    '</div><p class="tool-muted">' + toolEsc(t('tools.notstored')) + '</p>';
  return toolPage({ hub: 'fi', back: t('fi.back'), kicker: t('fi.group.prepare'), title: t('fi.card.screening.title'), lead: S.intro, body });
}

function fiScreenDownload() {
  const S = FI_TOOLS.screening;
  const lines = [t('fi.screen.assess') + ' — ' + toolToday(), t('tools.youngid') + ': ' + (fiScreen.id || '—'), ''];
  S.assessment.forEach((a, i) => {
    const cur = fiScreen.areas[i] || {};
    lines.push(a.area + ': ' + (cur.state || '—'));
    if (cur.note) lines.push('  ' + cur.note);
  });
  toolDownload('screening-' + (fiScreen.id || 'young-person') + '-' + toolToday() + '.txt', lines.join('\n'));
}

// ── Debrief ───────────────────────────────────────────────
function fiDebrief() {
  const D = FI_TOOLS.debrief;
  const body =
    '<ol class="fi-arc fi-arc-3">' +
      '<li class="fi-arc-step"><span class="fi-arc-n">1</span><h4>' + toolEsc(t('fi.debrief.young')) + '</h4><p>' + toolEsc(D.where) + '</p></li>' +
      '<li class="fi-arc-step"><span class="fi-arc-n">2</span><h4>' + toolEsc(t('fi.debrief.adults')) + '</h4><p>' + toolEsc(D.adults) + '</p></li>' +
      '<li class="fi-arc-step"><span class="fi-arc-n">3</span><h4>' + toolEsc(t('fi.debrief.supervision')) + '</h4><p>' + toolEsc(D.supervision) + '</p></li>' +
    '</ol>' +
    '<h3 class="tool-h">' + toolEsc(t('fi.debrief.circle')) + '</h3>' +
    '<div class="gd-qa fi-prompts" id="fi-prompts-print">' + D.circle.map(g =>
      '<div class="gd-qa-item"><h5>' + toolEsc(g.title) + '</h5><ul class="gd-list">' + g.prompts.map(p => '<li>' + toolEsc(p) + '</li>').join('') + '</ul></div>').join('') + '</div>' +
    '<div class="tool-actions"><button type="button" class="tool-btn" onclick="toolPrint(document.getElementById(\'fi-prompts-print\'))">' + toolEsc(t('fi.debrief.print')) + '</button></div>';
  return toolPage({ hub: 'fi', back: t('fi.back'), kicker: t('fi.group.after'), title: t('fi.card.debrief.title'), lead: D.intro, body });
}

// Implement → "Session structure guide" (door module #mod-plan): the arc
// and the session lengths, compactly, with a link to the full tool.
function fiRenderPlanModule() {
  const el = document.getElementById('fi-plan-summary');
  if (!el || typeof FI_TOOLS === 'undefined') return;
  const S = FI_TOOLS.structure;
  el.innerHTML = '<p class="tool-lead">' + toolEsc(S.intro) + '</p>' +
    '<ol class="fi-arc">' + S.arc.map((a, i) => '<li class="fi-arc-step"><span class="fi-arc-n">' + (i + 1) + '</span><h4>' + toolEsc(a.stage) + '</h4><p>' + toolEsc(a.text) + '</p></li>').join('') + '</ol>' +
    '<div class="fi-len-list">' + S.lengths.map(l => '<div class="gd-tip"><h5>' + toolEsc(l.len) + '</h5><p>' + toolEsc(l.text) + '</p></div>').join('') + '</div>' +
    '<p class="fi-note">' + toolEsc(S.lengths_note) + '</p>' +
    '<p class="tool-next"><a class="gd-button" href="#fi/structure">' + toolEsc(t('fi.plan.more')) + ' →</a></p>';
}

// ── Render + routing ──────────────────────────────────────
const FI_VIEWS = { structure: fiStructure, prepare: fiPrepare, screening: fiScreening, debrief: fiDebrief };

function fiRender() {
  const root = document.getElementById('fi-root');
  if (!root || typeof FI_TOOLS === 'undefined') return;
  const r = toolRoute();
  const view = r.hub === 'fi' && FI_VIEWS[r.tool];
  root.innerHTML = view ? view() : fiHub();
  fiRenderPlanModule();
}

function fiBind() {
  const root = document.getElementById('fi-root');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  toolBindChecks(root, (name, values) => {
    const st = fiPrepState(); st[name] = values; storageSave(FI_PREP_KEY, st);
    const card = root.querySelector('.gd-check[data-name="' + name + '"]').closest('.tool-card');
    const prog = card && card.querySelector('.tool-progress');
    if (prog) prog.outerHTML = toolProgress(values);
  });
  toolBindChips(root, (name, values) => {
    if (name.indexOf('area-') === 0) {
      const i = name.slice(5);
      fiScreen.areas[i] = Object.assign({}, fiScreen.areas[i], { state: values[0] || '' });
    }
  });
  root.addEventListener('input', e => {
    if (e.target.id === 'fi-screen-id') fiScreen.id = e.target.value.trim();
    if (e.target.dataset && e.target.dataset.area !== undefined) {
      const i = e.target.dataset.area;
      fiScreen.areas[i] = Object.assign({}, fiScreen.areas[i], { note: e.target.value });
    }
  });
  root.addEventListener('click', e => {
    const tab = e.target.closest('.fi-length');
    if (!tab) return;
    fiLength = +tab.dataset.len;
    root.querySelectorAll('.fi-length').forEach(b => b.setAttribute('aria-selected', String(b === tab)));
    const len = FI_TOOLS.structure.lengths[fiLength];
    root.querySelector('.fi-length-panel p').textContent = len.text;
  });
}

function fiSyncFromHash() {
  if (toolRoute().hub !== 'fi') return;
  fiRender();
  toolFocusTitle(document.getElementById('fi-root'));
}

window.addEventListener('hashchange', fiSyncFromHash);
fiBind();
fiRender();
