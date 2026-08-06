// ─── Participant Session Preview — the gamified "walk the session before
//     you attend" journey shown on #psession-screen for the Exploring/
//     participant role (pvStep/pvDiscovered/pvViewMode state). Reuses the
//     screen's existing psession.tN.* copy rather than duplicating it; the
//     original static accordion stays in the DOM untouched as the "List
//     view" fallback (#pv-list), so nothing here is required reading —
//     only an alternative way to explore the same content. ───
'use strict';

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
// pvStep: 1-4 is a phase panel, 5 is the completion panel. pvDiscovered is
// the only piece that's persisted (so a returning visitor sees their
// collected badges again) — pvStep/pvViewMode are session-only and always
// start fresh, the same way Run Mode's pbRunIndex does.
let pvStep = 1;
let pvDiscovered = [];
let pvViewMode = 'journey';

// Reuses the exact palette already used by the arc-balance bar/builder
// rows/Reflect history bars (pocketbook-activities.js) so this screen
// feels visually related to the practitioner tools — not because the 4
// session phases are the same thing as the 5 activity groups, they aren't,
// just borrowing the same progression of shades.
const PV_PHASE_COLORS = { 1: PB_GROUP_COLORS[1], 2: PB_GROUP_COLORS[2], 3: PB_GROUP_COLORS[3], 4: PB_GROUP_COLORS[4] };

function pvInit() {
  pvDiscovered = storageLoad('f4y.preview.discovered', []);
  pvSetViewMode('journey');
  pvRenderJourney(null);
}

// ─────────────────────────────────────────
// STATE-OWNING FUNCTIONS
// ─────────────────────────────────────────
// Trail nodes and the panel's own Back button both call this directly —
// navigation is always free, never gated on having discovered anything.
// The only thing that's gated is revealing a phase's "what you might
// feel" text, via pvDiscoverPhase() below.
function pvGoToStep(n) {
  pvStep = Math.max(1, Math.min(5, n));
  pvRenderJourney(null);
}

function pvDiscoverPhase(n) {
  let justCollected = null;
  if (!pvDiscovered.includes(n)) {
    pvDiscovered.push(n);
    storageSave('f4y.preview.discovered', pvDiscovered);
    justCollected = n;
  }
  pvRenderJourney(justCollected);
}

function pvSetViewMode(mode) {
  pvViewMode = mode === 'list' ? 'list' : 'journey';
  const journeyEl = document.getElementById('pv-journey');
  const listEl = document.getElementById('pv-list');
  const journeyTab = document.getElementById('pv-tab-journey');
  const listTab = document.getElementById('pv-tab-list');
  if (!journeyEl || !listEl || !journeyTab || !listTab) return;
  journeyEl.hidden = pvViewMode !== 'journey';
  listEl.hidden = pvViewMode !== 'list';
  journeyTab.classList.toggle('active', pvViewMode === 'journey');
  listTab.classList.toggle('active', pvViewMode === 'list');
  journeyTab.setAttribute('aria-selected', String(pvViewMode === 'journey'));
  listTab.setAttribute('aria-selected', String(pvViewMode === 'list'));
}

// ─────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────
// justId: the phase number just discovered this render (gets the
// "just-collected" bump animation), or null for a plain navigation
// re-render (e.g. moving between steps) where nothing new happened.
function pvBadgeHTML(n, justId) {
  const collected = pvDiscovered.includes(n);
  const cls = 'pv-badge' + (collected ? ' collected' : '') + (collected && n === justId ? ' just-collected' : '');
  const style = collected ? ' style="--pv-badge-color:' + PV_PHASE_COLORS[n] + '"' : '';
  return '<div class="' + cls + '"' + style + '>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 3-5 6-5 9a5 5 0 0 0 10 0c0-3-2-6-5-9z"/><path d="M12 12v9"/></svg>' +
    '<span class="pv-badge-num">' + n + '</span>' +
    '</div>';
}

function pvTrailHTML() {
  return [1, 2, 3, 4].map(n => {
    const state = pvStep === n ? 'current' : (pvDiscovered.includes(n) ? 'done' : 'upcoming');
    return '<button type="button" class="pv-node pv-node-' + state + '" style="--pv-node-color:' + PV_PHASE_COLORS[n] + '" onclick="pvGoToStep(' + n + ')" aria-current="' + (pvStep === n ? 'step' : 'false') + '">' + n + '</button>';
  }).join('<div class="pv-node-link"></div>');
}

function pvPhasePanelHTML(n) {
  const discovered = pvDiscovered.includes(n);
  const navHTML =
    '<div class="pv-step-nav">' +
    '<button type="button" class="pv-btn pv-btn-ghost" ' + (n === 1 ? 'disabled' : '') + ' onclick="pvGoToStep(' + (n - 1) + ')">' + t('psession.journey.back') + '</button>' +
    '<button type="button" class="pv-btn pv-btn-primary" ' + (discovered ? '' : 'disabled aria-disabled="true"') + ' onclick="pvGoToStep(' + (n + 1) + ')">' + t(n === 4 ? 'psession.journey.finish' : 'psession.journey.continue') + '</button>' +
    '</div>' +
    '<button type="button" class="pv-skip-link" onclick="pvSetViewMode(\'list\')">' + t('psession.journey.viewListLink') + '</button>';

  const revealOrChoice = discovered
    ? '<div class="sub-section pv-reveal">' +
      '<div class="sub-label">' + t('psession.t' + n + '.you.label') + ' <span class="pv-collected-tag">' + t('psession.journey.collectedTag') + '</span></div>' +
      '<div class="sub-text">' + t('psession.t' + n + '.you.text') + '</div>' +
      '</div>'
    : '<div class="pv-choice">' +
      '<div class="pv-choice-prompt">' + t('psession.journey.choicePrompt') + '</div>' +
      '<div class="pv-choice-chips">' +
      '<button type="button" class="pv-chip" onclick="pvDiscoverPhase(' + n + ')">' + t('psession.journey.choiceA') + '</button>' +
      '<button type="button" class="pv-chip" onclick="pvDiscoverPhase(' + n + ')">' + t('psession.journey.choiceB') + '</button>' +
      '<button type="button" class="pv-chip" onclick="pvDiscoverPhase(' + n + ')">' + t('psession.journey.choiceC') + '</button>' +
      '</div></div>';

  return '<div class="pv-step-head"><h3>' + t('psession.t' + n + '.title') + '</h3><span class="pv-step-dur">' + t('psession.t' + n + '.dur') + '</span></div>' +
    '<div class="sub-section"><div class="sub-label">' + t('psession.t' + n + '.prac.label') + '</div><div class="sub-text">' + t('psession.t' + n + '.prac.text') + '</div></div>' +
    revealOrChoice + navHTML;
}

function pvCompletePanelHTML() {
  const all = pvDiscovered.length >= 4;
  return '<div class="pv-complete-body">' +
    '<h3>' + t(all ? 'psession.journey.complete.title' : 'psession.journey.partial.title') + '</h3>' +
    '<p>' + t(all ? 'psession.journey.complete.body' : 'psession.journey.partial.body') + '</p>' +
    '<div class="pv-complete-actions">' +
    (all ? '<button type="button" class="pv-btn pv-btn-primary" onclick="navigate(\'pforme\')">' + t('psession.journey.complete.cta') + '</button>' : '') +
    '<button type="button" class="pv-btn pv-btn-ghost" onclick="pvGoToStep(1)">' + t('psession.journey.replay') + '</button>' +
    '</div></div>';
}

function pvRenderJourney(justId) {
  const badgesEl = document.getElementById('pv-badges');
  const countEl = document.getElementById('pv-progress-count');
  const trailEl = document.getElementById('pv-trail');
  const panelEl = document.getElementById('pv-panel');
  if (!badgesEl || !countEl || !trailEl || !panelEl) return;
  badgesEl.innerHTML = [1, 2, 3, 4].map(n => pvBadgeHTML(n, justId)).join('');
  countEl.textContent = pvDiscovered.length + ' / 4';
  trailEl.innerHTML = pvTrailHTML();
  panelEl.innerHTML = pvStep <= 4 ? pvPhasePanelHTML(pvStep) : pvCompletePanelHTML();
}

// ───────── KEY HANDLERS ─────────
// Mirrors pocketbook-run.js's own ←/→ handling: guarded to the screen
// actually being open, the journey (not list) view being active, and not
// stealing arrow keys from a focused form field (none exist here today,
// but the guard costs nothing and keeps the two implementations in step).
document.addEventListener('keydown', e => {
  const screenActive = document.getElementById('psession-screen') && document.getElementById('psession-screen').classList.contains('active');
  const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (!screenActive || pvViewMode !== 'journey' || inField) return;
  if (e.key === 'ArrowLeft') pvGoToStep(pvStep - 1);
  else if (e.key === 'ArrowRight' && (pvStep > 4 || pvDiscovered.includes(pvStep))) pvGoToStep(pvStep + 1);
});

document.addEventListener('DOMContentLoaded', pvInit);
