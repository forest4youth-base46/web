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

// ─────────────────────────────────────────
// ILLUSTRATION (badge icons + the per-phase forest scene)
// ─────────────────────────────────────────
// One small distinct icon per phase — reused at both badge size (24x24
// viewBox, in pvBadgeHTML) and scaled up as the scene's focal motif
// (pvSceneSVG) — so the badge a visitor collects is a miniature of the
// illustration they just saw, not an arbitrary token.
const PV_PHASE_ICONS = {
  1: '<ellipse cx="8" cy="8" rx="3.1" ry="4.6" transform="rotate(-18 8 8)"/><ellipse cx="16" cy="15" rx="3.1" ry="4.6" transform="rotate(18 16 15)"/><circle cx="6.3" cy="3" r="1" fill="currentColor" stroke="none"/><circle cx="17.7" cy="10" r="1" fill="currentColor" stroke="none"/>',
  2: '<path d="M12 3c-3 3-5 6-5 9a5 5 0 0 0 10 0c0-3-2-6-5-9z"/><path d="M12 12v9"/>',
  3: '<circle cx="12" cy="12" r="2.3"/><circle cx="12" cy="12" r="5.8" opacity="0.7"/><circle cx="12" cy="12" r="9.4" opacity="0.4"/>',
  4: '<path d="M3 18c5-7 13-7 18 0"/><circle cx="12" cy="9.5" r="2.8"/><path d="M2 18.5h20"/>',
};

// Same 4 motifs, scaled up and re-centered around (0,0) for use inside
// pvSceneSVG's transform="translate(...)" group.
const PV_PHASE_FOCAL = {
  1: '<g transform="translate(-14,4) rotate(-14)"><ellipse cx="0" cy="0" rx="8" ry="12"/><circle cx="-1" cy="-13" r="2.8" fill="currentColor" stroke="none"/></g>' +
     '<g transform="translate(12,-10) rotate(14)"><ellipse cx="0" cy="0" rx="8" ry="12"/><circle cx="1" cy="-13" r="2.8" fill="currentColor" stroke="none"/></g>',
  2: '<circle cx="0" cy="6" r="26" opacity="0.3"/>' +
     '<circle cx="-16" cy="-12" r="2.4" fill="currentColor" stroke="none"/>' +
     '<circle cx="12" cy="-18" r="1.8" fill="currentColor" stroke="none"/>' +
     '<circle cx="20" cy="-2" r="2.6" fill="currentColor" stroke="none"/>' +
     '<circle cx="-6" cy="-22" r="1.6" fill="currentColor" stroke="none"/>' +
     '<path d="M0 2c-3.4 3.4-5.6 6.8-5.6 10.2a5.6 5.6 0 0 0 11.2 0c0-3.4-2.2-6.8-5.6-10.2z"/>',
  3: '<ellipse cx="0" cy="14" rx="38" ry="9" opacity="0.22"/>' +
     '<circle cx="0" cy="14" r="4.5"/>' +
     '<circle cx="0" cy="14" r="12" opacity="0.7"/>' +
     '<circle cx="0" cy="14" r="21" opacity="0.4"/>',
  4: '<path d="M-34 16c9-11 18-15.5 34-15.5s25 4.5 34 15.5"/>' +
     '<circle cx="0" cy="-3" r="8"/>',
};

// Fixed tree-line silhouette, shared by every phase's scene — what changes
// per phase is the sky tint, the glow's position (drifting left-to-right
// like the sun crossing the sky as the session progresses) and the focal
// motif, not the forest itself.
// Two mirrored clusters bookending a 500-wide viewBox, leaving a wide
// x=98..402 gap in the middle for the focal motif to sit in without
// fighting the trees for space.
function pvTreesSVG() {
  return '<g class="pv-scene-trees">' +
    '<path class="pv-tree-far" d="M10 90 L21 60 L32 90 Z"/>' +
    '<path class="pv-tree-near" d="M40 96 L55 52 L70 96 Z"/>' +
    '<path class="pv-tree-far" d="M78 92 L88 66 L98 92 Z"/>' +
    '<path class="pv-tree-far" d="M402 92 L413 66 L424 92 Z"/>' +
    '<path class="pv-tree-near" d="M432 96 L447 52 L462 96 Z"/>' +
    '<path class="pv-tree-far" d="M470 90 L480 60 L490 90 Z"/>' +
    '</g>';
}

// The scene's CSS box is given the exact same aspect ratio as this
// viewBox (see .pv-scene), so nothing is ever cropped or letterboxed
// regardless of how wide the panel renders — width and height always
// scale together, like a plain <img> would.
//
// complete=true reuses phase 4's "path to the horizon" motif tinted warm
// (--ember) as the finale scene, rather than inventing a 5th illustration.
function pvSceneSVG(n, complete) {
  const color = complete ? 'var(--ember)' : PV_PHASE_COLORS[n];
  const glowX = 60 + (Math.min(n, 4) - 1) * 126;
  const focal = PV_PHASE_FOCAL[complete ? 4 : n];
  return '<svg class="pv-scene" viewBox="0 0 500 110" aria-hidden="true">' +
    '<defs><linearGradient id="pvSkyGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="var(--paper-pure)"/>' +
    '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.18"/>' +
    '</linearGradient></defs>' +
    '<rect x="0" y="0" width="500" height="80" fill="url(#pvSkyGrad)"/>' +
    '<circle class="pv-scene-glow" cx="' + glowX + '" cy="24" r="28" fill="' + color + '"/>' +
    '<rect x="0" y="74" width="500" height="36" fill="var(--forest-mist)" opacity="0.55"/>' +
    pvTreesSVG() +
    // Positioning lives on this outer <g>'s SVG transform attribute; the
    // fade-in animation lives on the inner one instead of here, because a
    // CSS animation that touches `transform` replaces an element's SVG
    // transform attribute outright rather than composing with it — put
    // both on the same <g> and the fade wins, snapping the motif to (0,0).
    '<g transform="translate(250,58)"><g class="pv-scene-focal" style="color:' + color + '" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + focal + '</g></g>' +
    '</svg>';
}

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
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + PV_PHASE_ICONS[n] + '</svg>' +
    '<span class="pv-badge-num">' + n + '</span>' +
    '</div>';
}

// Nodes and connecting links are built separately so a link can be marked
// "done" (lit, phase-colored) once the phase to its left has been
// discovered — the path visibly fills in behind you as you go.
function pvTrailHTML() {
  const nodes = [1, 2, 3, 4].map(n => {
    const state = pvStep === n ? 'current' : (pvDiscovered.includes(n) ? 'done' : 'upcoming');
    return '<button type="button" class="pv-node pv-node-' + state + '" style="--pv-node-color:' + PV_PHASE_COLORS[n] + '" onclick="pvGoToStep(' + n + ')" aria-current="' + (pvStep === n ? 'step' : 'false') + '">' + n + '</button>';
  });
  const links = [1, 2, 3].map(n => {
    const done = pvDiscovered.includes(n);
    return '<div class="pv-node-link' + (done ? ' done' : '') + '" style="--pv-link-color:' + PV_PHASE_COLORS[n] + '"></div>';
  });
  return nodes[0] + links[0] + nodes[1] + links[1] + nodes[2] + links[2] + nodes[3];
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
      '<div class="sub-label">' + t('psession.t' + n + '.you.label') + ' <span class="pv-collected-tag"><svg class="pv-spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>' + t('psession.journey.collectedTag') + '</span></div>' +
      '<div class="sub-text">' + t('psession.t' + n + '.you.text') + '</div>' +
      '</div>'
    : '<div class="pv-choice">' +
      '<div class="pv-choice-prompt">' + t('psession.journey.choicePrompt') + '</div>' +
      '<div class="pv-choice-chips">' +
      '<button type="button" class="pv-chip" onclick="pvDiscoverPhase(' + n + ')">' + t('psession.journey.choiceA') + '</button>' +
      '<button type="button" class="pv-chip" onclick="pvDiscoverPhase(' + n + ')">' + t('psession.journey.choiceB') + '</button>' +
      '<button type="button" class="pv-chip" onclick="pvDiscoverPhase(' + n + ')">' + t('psession.journey.choiceC') + '</button>' +
      '</div></div>';

  return pvSceneSVG(n, false) +
    '<div class="pv-step-head"><h3>' + t('psession.t' + n + '.title') + '</h3><span class="pv-step-dur">' + t('psession.t' + n + '.dur') + '</span></div>' +
    '<div class="sub-section"><div class="sub-label">' + t('psession.t' + n + '.prac.label') + '</div><div class="sub-text">' + t('psession.t' + n + '.prac.text') + '</div></div>' +
    revealOrChoice + navHTML;
}

function pvCompletePanelHTML() {
  const all = pvDiscovered.length >= 4;
  return pvSceneSVG(4, true) +
    '<div class="pv-complete-body">' +
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
