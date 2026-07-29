// ─────────────────────────────────────────
// HASH ROUTING
// ─────────────────────────────────────────
// Hash format: #section/module/activity
// e.g. #implement/mod-pocket/act-sitspot

function navigate(section) {
  if (!section) {
    window.location.hash = '';
  } else {
    window.location.hash = section;
  }
}

function applyRoute() {
  // The app never blocks rendering on a role choice — default silently
  // to practitioner if nothing is stored yet or the role was just
  // cleared (e.g. via goToRoleScreen()), then always render a real
  // screen. See ensureRole().
  ensureRole();

  const hash = window.location.hash.replace('#', '');
  const parts = hash.split('/');
  const section = parts[0];   // e.g. 'implement' / 'reference' / 'pwhat'
  const moduleId = parts[1];  // e.g. 'mod-pocket'
  const activityId = parts[2]; // e.g. 'act-sitspot'

  // Explicit role-screen route (e.g. #role, or the footer's "Change
  // perspective" link via goToRoleScreen()) — an optional side-by-side
  // comparison screen now, not a gate. Nothing routes here automatically.
  if (section === 'role') {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('role-screen').classList.add('active');
    updateHeaderChrome();
    return;
  }

  // Show the requested screen (or entry if hash is empty).
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (!section) {
    document.getElementById('entry-screen').classList.add('active');
    updateHeaderChrome();
    return;
  }
  const target = document.getElementById(section + '-screen');
  if (target) {
    // If the screen is restricted to the other role, redirect to entry
    // and show entry immediately (don't rely on hashchange firing).
    const screenRole = target.getAttribute('data-role-only');
    if (screenRole && screenRole !== currentRole) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch(e) {
        window.location.hash = '';
      }
      document.getElementById('entry-screen').classList.add('active');
      updateHeaderChrome();
      return;
    }
    target.classList.add('active');
  } else {
    // Unknown route — fall back to entry.
    document.getElementById('entry-screen').classList.add('active');
    updateHeaderChrome();
    return;
  }

  // Door modules: open the module as a focused page rather than inline
  // mod-reflect-self/mod-indicators/mod-glossary used to be door modules
  // too, but they were headerless cards with no toggle/entry-point ever
  // wired to focus them — meaning their content was permanently invisible
  // (module-body defaults to display:none; only .open or door-focus-mode
  // reveals it, and neither ever applied to them). Reflect is now one
  // continuous page instead, so they're plain always-visible cards — see
  // the :not(.is-door) rule in styles.css.
  const DOOR_MODULES = ['mod-pre','mod-plan','mod-pocket','mod-adapt'];
  if (moduleId && DOOR_MODULES.indexOf(moduleId) !== -1) {
    applyFocusMode(target, moduleId);
  } else {
    // Clear any prior focus state
    applyFocusMode(null, null);
    // Open module if specified (legacy inline behavior)
    if (moduleId) {
      const mod = document.getElementById(moduleId);
      if (mod) mod.classList.add('open');
    }
  }

  // Open and highlight activity if specified
  if (activityId) {
    setTimeout(() => {
      const act = document.getElementById(activityId);
      if (act) {
        act.classList.add('open', 'highlight');
        act.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => act.classList.remove('highlight'), 2500);
      }
    }, 150);
  }

  updateHeaderChrome();
}

window.addEventListener('hashchange', applyRoute);

// ─────────────────────────────────────────
// HEADER CHROME (persistent nav + mode switch state)
// ─────────────────────────────────────────
// Keeps the mode-switch buttons and the persistent nav's
// aria-current/.active in sync with currentRole and the current route.
// Called at the end of every applyRoute() and setRole(). Run Mode
// (#pb-runMode) is a fixed full-screen overlay that already covers the
// header entirely while active, so there's no separate "Run" state to
// track here — closing it reveals whatever the hash already says.
function updateHeaderChrome() {
  document.querySelectorAll('.mode-btn').forEach(function(b) {
    const isActive = b.getAttribute('data-role') === currentRole;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const section = window.location.hash.replace('#', '').split('/')[0];
  let navKey = null;
  if (section === 'implement') navKey = 'plan';
  else if (section === 'reflect') navKey = 'reflect';
  else if (section === 'reference') navKey = 'reference';
  else if (['pwhat', 'psession', 'pforme', 'pbefore'].indexOf(section) !== -1) navKey = section;

  document.querySelectorAll('.site-nav-link').forEach(function(a) {
    const match = navKey !== null && a.getAttribute('data-navkey') === navKey;
    a.classList.toggle('active', match);
    if (match) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// Nav entry point for "Run". Run Mode itself is unchanged (still the
// full-screen #pb-runMode overlay started by the Session Builder) — this
// just gives it a coherent, always-visible entry point that never
// dead-ends: if there's nothing in the plan yet, it sends the
// practitioner to Plan instead of opening an empty Run Mode.
function navGoRun() {
  if (typeof pbSession !== 'undefined' && pbSession.length && typeof pbStartRunMode === 'function') {
    pbStartRunMode();
    return;
  }
  if (currentRole !== 'practitioner') setRole('practitioner');
  window.location.hash = 'implement/mod-pocket';
  if (typeof pbShowToast === 'function') {
    setTimeout(function() { pbShowToast(t('nav.run.empty')); }, 350);
  }
}

// ─────────────────────────────────────────
// MODULE & ACTIVITY TOGGLES
// ─────────────────────────────────────────
function toggleModule(id) {
  const card = document.getElementById(id);
  if (!card) return;
  const grid = card.closest('.modules-grid');
  if (grid) {
    grid.querySelectorAll('.module-card').forEach(c => {
      if (c !== card) c.classList.remove('open');
    });
  }
  card.classList.toggle('open');
}

// ─────────────────────────────────────────
// REFERENCE PAGE: type filter + search (combined)
// ─────────────────────────────────────────
// The absolute contraindications (.ref-absolute in index.html) sit
// outside this entirely — never queried, never hidden — so the single
// most safety-critical content on the page can never be searched or
// filtered away by accident. Everything else is one flat list of
// independently-toggleable entries (#reference-screen .ref-entry),
// grouped only under .ref-group wrappers for the tier-header dividers
// (Tier 1/2/3, Relative/Practitioner-competency); refKind (the chip row)
// and the search box both narrow the same list together, replacing the
// page-search-only refApplyFilter() from the previous commit — one
// filter system, not two competing ones.
//
// Kind/evidence classification lives on the real DOM (data-kind on each
// .ref-entry, .ref-evidence--strong/moderate/emerging read off the
// existing entries) — same principle the old refApplyFilter() already
// followed (el.textContent, not a JS data array): nothing here duplicates
// the translated content, so there's nothing to drift out of sync with
// content.js.
const REF_KINDS = ['indication', 'adjunctive', 'competency', 'contraindication', 'population', 'dosage', 'integration'];
let refKind = 'all';

function refSetKind(kind) {
  refKind = kind;
  refRenderFilters();
  refApplyFilter();
}

function refRenderFilters() {
  const wrap = document.getElementById('ref-filters');
  if (!wrap) return;
  const kinds = ['all'].concat(REF_KINDS);
  wrap.innerHTML = kinds.map(function(k) {
    const active = refKind === k;
    return '<button type="button" class="ref-filter-chip" aria-pressed="' + active + '" onclick="refSetKind(\'' + k + '\')">' +
      t('ref.filter.' + k) + '</button>';
  }).join('');
}

function refApplyFilter() {
  const input = document.getElementById('reference-search-input');
  const q = (input && input.value || '').trim().toLowerCase();
  const groups = document.querySelectorAll('#reference-screen .ref-group');
  const total = document.querySelectorAll('#reference-screen .ref-entry').length;
  let shown = 0;

  groups.forEach(function(group) {
    let groupVisible = false;
    group.querySelectorAll('.ref-entry').forEach(function(entry) {
      const kindMatch = refKind === 'all' || entry.getAttribute('data-kind') === refKind;
      const textMatch = !q || entry.textContent.toLowerCase().indexOf(q) !== -1;
      const match = kindMatch && textMatch;
      entry.style.display = match ? '' : 'none';
      if (match) { groupVisible = true; shown++; }
    });
    // Hide the whole group (including its tier-header) when nothing
    // inside it matches — otherwise an orphaned "Tier 2 · Adjunctive"
    // divider would sit above an empty gap.
    group.style.display = groupVisible ? '' : 'none';
  });

  const empty = document.getElementById('reference-search-empty');
  if (empty) empty.hidden = shown > 0;

  const countEl = document.getElementById('ref-count');
  if (countEl) {
    countEl.textContent = refKind === 'all'
      ? t('ref.count.summary').replace('{n}', String(shown)).replace('{total}', String(total))
      : t('ref.count.summary.kind').replace('{n}', String(shown)).replace('{total}', String(total)).replace('{kind}', t('ref.filter.' + refKind));
  }
}

// Toggles one entry's disclosure panel. Independent, not an exclusive
// accordion — matching pbToggleActivity()'s reasoning in pocketbook.js,
// comparing two reference entries side by side shouldn't require
// re-opening one after the other closes it.
function refToggleEntry(btn) {
  const entry = btn.closest('.ref-entry');
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  const willOpen = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(willOpen));
  if (panel) panel.hidden = !willOpen;
  if (entry) entry.classList.toggle('open', willOpen);
}

function refClearSearch() {
  const input = document.getElementById('reference-search-input');
  if (input) { input.value = ''; input.focus(); }
  refApplyFilter();
}

// Open a module as its own "page" — focuses screen on that module only.
function openModulePage(modId, screenName) {
  window.location.hash = screenName + '/' + modId;
}

function applyFocusMode(screenEl, modId) {
  // Clear any previous focus
  document.querySelectorAll('.screen.focus-mode').forEach(s => s.classList.remove('focus-mode'));
  document.querySelectorAll('.module-card.is-focused').forEach(m => m.classList.remove('is-focused'));
  // Also collapse any door module that was left .open from a previous focus
  document.querySelectorAll('.module-card.is-door.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.injected').forEach(b => b.remove());
  document.body.classList.remove('module-focus');
  delete document.body.dataset.focused;

  if (!screenEl || !modId) return;
  const mod = screenEl.querySelector('#' + modId);
  if (!mod) return;
  screenEl.classList.add('focus-mode');
  mod.classList.add('is-focused', 'open');
  document.body.classList.add('module-focus');
  // FAB / builder visibility is driven by this attribute (not :has()),
  // which works on every WebView including the Odoo embed test path.
  document.body.dataset.focused = modId;

  // Inject a back link at the top of the focused module. Labeled with
  // the pathway it returns to (e.g. "Implement in Practice") rather than
  // a generic "Back", since the section header showing that context is
  // hidden while a module has focus.
  const back = document.createElement('button');
  back.className = 'module-back-link injected';
  back.type = 'button';
  const screenHash = screenEl.id.replace('-screen','');
  back.onclick = () => { window.location.hash = screenHash; };
  mod.insertBefore(back, mod.firstChild);

  // Plan is one screen: the Pocketbook already holds the activity picker
  // and the live Session Builder side-by-side, but the Pre-Session
  // Checklist (mod-pre) and the Session Structure Guide (mod-plan) are
  // separate door modules. Rather than send Plan-nav users on a second
  // trip through the header nav to reach them, surface them as one-click
  // quick links right here. (A fuller merge of these into a single Plan
  // panel is a separate, later task — this is the lightest change that
  // keeps everything reachable without leaving the screen you landed on.)
  if (modId === 'mod-pocket') {
    const quick = document.createElement('div');
    quick.className = 'plan-quicklinks injected';
    mod.insertBefore(quick, back.nextSibling);
  }

  refreshFocusModeLabels();
  window.scrollToViewTop();
}

// Fills in (or, on a later language switch, refreshes) the text of the
// injected back-link and quick-links above — pulled out of applyFocusMode()
// so setLang() can re-run just this part in place. Without this, switching
// language while a door module is focused left both stuck in whatever
// language was active when the module was opened, since they're built once
// from t()/the badge's text rather than via [data-i18n].
function refreshFocusModeLabels() {
  const modId = document.body.dataset.focused;
  if (!modId) return;
  const screenEl = document.querySelector('.screen.focus-mode');
  if (!screenEl) return;
  const back = screenEl.querySelector('.module-back-link.injected');
  if (back) {
    const pathwayBadge = screenEl.querySelector('.section-header .badge');
    const pathwayLabel = pathwayBadge && pathwayBadge.textContent.trim();
    back.textContent = pathwayLabel || t('nav.back') || 'Back';
  }
  const quick = screenEl.querySelector('.plan-quicklinks.injected');
  if (quick) {
    quick.innerHTML =
      '<a href="#implement/mod-pre">' + t('nav.plan.checklist') + '</a>' +
      '<a href="#implement/mod-plan">' + t('nav.plan.structure') + '</a>';
  }
}

function toggleCheck(el) {
  const cb = el.querySelector('input[type="checkbox"]');
  cb.checked = !cb.checked;
}

// ─────────────────────────────────────────
// DEEP LINK COPY
// ─────────────────────────────────────────
function copyDeepLink(section, moduleId, activityId, btn) {
  const url = window.location.href.split('#')[0] + '#' + [section, moduleId, activityId].join('/');
  navigator.clipboard.writeText(url).then(() => {
    btn.classList.add('copied');
    const span = btn.querySelector('[data-i18n]');
    const orig = span.textContent;
    span.textContent = '✓ Copied';
    setTimeout(() => {
      btn.classList.remove('copied');
      span.textContent = orig;
    }, 2000);
  });
}

// ─────────────────────────────────────────
// GUIDE INTEGRATION
// ─────────────────────────────────────────
// When the PDF has a stable URL, set GUIDE_PDF_URL to it.
// Named destinations in the PDF can be used for chapter jumps: set
// GUIDE_USE_PAGE_ANCHORS = true and the tool will append #page=N.
const GUIDE_PDF_URL = '';  // e.g. 'https://forest4youth.nweurope.eu/guide.pdf'
const GUIDE_USE_PAGE_ANCHORS = true;

function openGuide() {
  if (!GUIDE_PDF_URL) {
    alert(t('guide.pdf.unavailable') || 'The PDF link is not yet available. Once the guide is hosted, this button will open it.');
    return;
  }
  window.open(GUIDE_PDF_URL, '_blank', 'noopener');
}

function openChapter(chapterId, page) {
  if (!GUIDE_PDF_URL) {
    // No URL yet — surface the chapter in the guide-screen instead and tell the user.
    const el = document.querySelector('[data-chapter-id="' + chapterId + '"]');
    if (el) {
      document.querySelectorAll('[data-chapter-id].guide-chapter-highlight')
        .forEach(e => e.classList.remove('guide-chapter-highlight'));
      // Navigate to guide screen if not already there
      if (window.location.hash !== '#guide') {
        window.location.hash = 'guide';
        setTimeout(() => {
          el.classList.add('guide-chapter-highlight');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => el.classList.remove('guide-chapter-highlight'), 2500);
        }, 200);
      } else {
        el.classList.add('guide-chapter-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.classList.remove('guide-chapter-highlight'), 2500);
      }
    }
    return;
  }
  const url = GUIDE_USE_PAGE_ANCHORS && page
    ? GUIDE_PDF_URL + '#page=' + encodeURIComponent(page)
    : GUIDE_PDF_URL;
  window.open(url, '_blank', 'noopener');
}

// ─────────────────────────────────────────
// VISUAL SWAP API
// ─────────────────────────────────────────
// Replace any SVG with a real image or GIF:
// swapVisual('sitspot', 'https://your-cdn.com/sitspot.gif', 'Alt text')
// IDs: sitspot, map, walk, council, breath, bark, deadwood, mandala, track, weather, roots, pairwalk
function swapVisual(visualId, src, altText) {
  const container = document.querySelector('.activity-visual[data-visual-id="' + visualId + '"]');
  if (!container) return;
  const caption = container.querySelector('.visual-caption');
  const captionHTML = caption ? caption.outerHTML : '';
  container.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = altText || visualId;
  img.style.cssText = 'width:100%;display:block;';
  container.appendChild(img);
  if (captionHTML) container.insertAdjacentHTML('beforeend', captionHTML);
}

// ─────────────────────────────────────────
// PARTICIPANT-SCREEN TOGGLES
// ─────────────────────────────────────────
// toggleTimeline/toggleExp were identical copies of the same plain
// open/close toggle (one implementation each, kept in sync by hand) —
// now one shared implementation under both call-site names, so the two
// screens that use them (#psession-screen, #pforme-screen) can't drift.
function toggleExp(id) {
  document.getElementById(id).classList.toggle('open');
}
function toggleTimeline(id) {
  toggleExp(id);
}

// ─────────────────────────────────────────
// ROLE STATE & TOGGLE
// ─────────────────────────────────────────
let currentRole = null;
try { currentRole = sessionStorage.getItem('fbt.role'); } catch(e) { currentRole = null; }

// Guarantees currentRole is always 'practitioner' or 'participant' before
// a screen renders. The app used to force a blocking #role-screen instead
// whenever currentRole was falsy; now it silently defaults to
// practitioner so nothing ever blocks rendering. Called at the top of
// every applyRoute() (covers first visit, and recovery after
// goToRoleScreen() clears the role) and once at load.
function ensureRole() {
  if (currentRole !== 'practitioner' && currentRole !== 'participant') {
    currentRole = 'practitioner';
    try { sessionStorage.setItem('fbt.role', currentRole); } catch(e) {}
  }
  // Always (re)apply — currentRole can already be resolved from
  // sessionStorage before this runs (e.g. on a refresh), but the body
  // attribute lives on the DOM, which doesn't survive a reload the way
  // sessionStorage does. Skipping this on the "already resolved" path
  // left data-role unset after every refresh past the first page load,
  // silently hiding every [data-role-only] element (nav, entry tiles).
  document.body.setAttribute('data-role', currentRole);
}

function setRole(role, fromRoleScreen) {
  currentRole = role;
  try { sessionStorage.setItem('fbt.role', role); } catch(e) {}
  document.body.setAttribute('data-role', role);

  // If coming from the role-screen choice, land on the entry screen.
  // If switching role mid-session, also return to entry if stranded
  // on a screen the new role cannot see.
  if (fromRoleScreen) {
    // Clear hash without triggering hashchange side effects, then route.
    if (window.location.hash) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch(e) {
        window.location.hash = '';
      }
    }
    applyRoute();
  } else {
    // Mid-session toggle: if current hash points to a role-exclusive screen,
    // reset to entry. Otherwise keep the hash.
    const activeScreen = document.querySelector('.screen.active');
    const needsReset = activeScreen && activeScreen.getAttribute('data-role-only') &&
        activeScreen.getAttribute('data-role-only') !== role;
    if (needsReset && window.location.hash) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch(e) {
        window.location.hash = '';
      }
    }
    applyRoute();
  }
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
renderModuleHeaders();
applyTranslations();
refRenderFilters();
refApplyFilter();

// URL overrides for recoverability:
//   ?reset  → clear any stored role (ensureRole() then re-defaults to
//             practitioner on the render below — this no longer opens
//             the role-screen, it just resets which mode you land in)
//   ?role=participant / ?role=practitioner → set the default landing role
try {
  const usp = new URLSearchParams(window.location.search);
  if (usp.has('reset')) {
    try { sessionStorage.removeItem('fbt.role'); } catch(e) {}
    currentRole = null;
    // Strip the query string so reload doesn't keep resetting.
    try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch(e) {}
  }
  const rq = usp.get('role');
  if (rq === 'participant' || rq === 'practitioner') {
    currentRole = rq;
    try { sessionStorage.setItem('fbt.role', rq); } catch(e) {}
    try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch(e) {}
  }
} catch(e) {}

// Defensive: bind role-card clicks programmatically in addition to inline onclick.
// If inline handlers are blocked (strict CSP) or the onclick attribute is somehow
// stripped, these listeners still work.
document.querySelectorAll('.role-card').forEach(card => {
  card.addEventListener('click', function(ev) {
    // Only act if no inline handler already did. We detect by checking the
    // state change that setRole would have caused.
    if (document.body.getAttribute('data-role')) return;
    const txt = card.querySelector('h2');
    const isPrac = txt && /practit|praktik|pratici/i.test(txt.textContent);
    setRole(isPrac ? 'practitioner' : 'participant', true);
  }, { capture: false });
});

// Optional path to the role-screen (side-by-side mode comparison),
// e.g. the footer "Change perspective" link. Kept available per the
// redesign — clearing the role here is safe because ensureRole() will
// silently re-default to practitioner the moment any other route is
// applied, so this can never strand the app without a role.
function goToRoleScreen() {
  try { sessionStorage.removeItem('fbt.role'); } catch(e) {}
  currentRole = null;
  document.body.removeAttribute('data-role');
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch(e) {
    window.location.hash = '';
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('role-screen').classList.add('active');
  updateHeaderChrome();
}

// First visit or returning — either way, render immediately. Nothing
// blocks on a role choice: ensureRole() (called from inside applyRoute)
// defaults to practitioner if no role is stored yet.
applyRoute();
