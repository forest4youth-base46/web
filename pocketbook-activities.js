// ─── Pocketbook: activity library — rendering, filters, i18n lookups,
//     and the inline detail-disclosure accordion. One of six files split
//     out of the original monolithic pocketbook.js; see pocketbook-init.js
//     for load order and pbInit(). ───
'use strict';

// ───────── RENDER ─────────
function pbFmtDuration(a) {
  if (a.durLabel) return pbT(a, 'durLabel');
  if (a.durMin === a.durMax) return `${a.durMin} min`;
  return `${a.durMin}–${a.durMax} min`;
}

// ───────── i18n lookups (fall back to the English literal in
// pocketbook-data.js if no translation exists for the current language,
// or if PB_I18N itself has no entry for that field) ─────────
function pbT(a, field) {
  const entry = PB_I18N[currentLang] && PB_I18N[currentLang].activities[a.id];
  return (entry && entry[field]) || a[field];
}
function pbGroupT(g, field) {
  const entry = PB_I18N[currentLang] && PB_I18N[currentLang].groups[g.id];
  return (entry && entry[field]) || g[field];
}
function pbAdaptT(r, field) {
  const entry = PB_I18N[currentLang] && PB_I18N[currentLang].adaptations[r.label];
  return (entry && entry[field]) || r[field];
}
function pbTagT(tag) {
  const dict = PB_I18N[currentLang] && PB_I18N[currentLang].tags;
  return (dict && dict[tag]) || tag;
}
function pbLabel(key) {
  const dict = PB_I18N[currentLang] && PB_I18N[currentLang].labels;
  return (dict && dict[key]) || PB_LABELS_EN[key];
}
// The larger in-detail illustrations (VISUAL in pocketbook-data.js) bake
// their word/phrase labels directly into <text> elements rather than
// exposing them as data, since each one is a bespoke hand-built SVG. To
// avoid duplicating every illustration per language, this replaces each
// non-empty <text> node's content in document order with the matching
// entry from PB_I18N[lang].visuals[activityId] (see pocketbook-i18n.js).
// Falls back to the original (English) text past the end of that list,
// or if there's no translated list at all for this activity/language.
function pbLocalizeVisual(svg, activityId) {
  const strings = PB_I18N[currentLang] && PB_I18N[currentLang].visuals && PB_I18N[currentLang].visuals[activityId];
  if (!strings || !svg) return svg;
  let i = 0;
  return svg.replace(/(<text[^>]*>(?:<animate[^>]*\/>)?)([^<]*)(<\/text>)/g, (match, open, text, close) => {
    if (!text.trim()) return match;
    const replacement = strings[i++];
    return replacement === undefined ? match : open + replacement + close;
  });
}

// ───────── RUN MODE VISUAL (looping) ─────────
// Each illustration's SMIL <animate> elements are one-shot and freeze on
// their last frame (see the Pocketbook detail view, which re-injects the
// same markup on every open just to restart them from zero). A Run Mode
// step can stay on screen for many minutes, so a single ~2-6s playthrough
// would sit frozen for almost all of that time. This re-injects the same
// markup on a timer instead, so the illustration keeps gently replaying
// for as long as the step is showing.
let pbRunVisualTimer = null;
function pbClearRunVisual() {
  if (pbRunVisualTimer) { clearTimeout(pbRunVisualTimer); pbRunVisualTimer = null; }
  const el = document.getElementById('pb-runVisual');
  if (el) el.innerHTML = '';
}
function pbSetRunVisual(svg) {
  const el = document.getElementById('pb-runVisual');
  if (pbRunVisualTimer) { clearTimeout(pbRunVisualTimer); pbRunVisualTimer = null; }
  if (!el) return;
  el.innerHTML = svg || '';
  if (!svg) return;
  // Longest (begin + dur) across every <animate>, in document order or
  // not — order doesn't matter, only the latest finish time does — plus
  // a short pause so the settled illustration reads as "arrived"
  // before looping back to its start.
  let latestEnd = 0;
  const re = /<animate\b[^>]*>/g;
  let m;
  while ((m = re.exec(svg))) {
    const tag = m[0];
    const beginMatch = tag.match(/begin="([\d.]+)s"/);
    const durMatch = tag.match(/dur="([\d.]+)s"/);
    if (!beginMatch || !durMatch) continue;
    const end = parseFloat(beginMatch[1]) + parseFloat(durMatch[1]);
    if (end > latestEnd) latestEnd = end;
  }
  if (latestEnd <= 0) return; // static illustration — nothing to loop
  const cycleMs = (latestEnd + 1.8) * 1000;
  pbRunVisualTimer = setTimeout(function loop() {
    el.innerHTML = svg;
    pbRunVisualTimer = setTimeout(loop, cycleMs);
  }, cycleMs);
}

const PB_LABELS_EN = {
  purpose: 'Purpose', materials: 'Materials', introduce: 'How to introduce',
  close: 'How to close', suitable: 'Suitable for',
};

// Shared group → color map (matches the swatches already used by the arc
// balance bar / builder rows). Kept as one constant so the Reflect screen's
// mini history bars can reuse exactly the same palette without redefining
// it. Uses the root-scoped tokens (--bark/--ember), not the .pb-host-scoped
// --pb-bark/--pb-ember aliases, so it also resolves outside .pb-host.
const PB_GROUP_COLORS = {
  1: 'var(--forest-soft)', 2: 'var(--forest-mid)', 3: 'var(--forest-deep)',
  4: 'var(--bark)', 5: 'var(--ember)',
};

function pbEscapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ───────── FILTERS (group + suitability/duration tags) ─────────
// Group filter and tag filter are independent multi-select sets (AND
// between the two facets, OR within each). The ≤15 min quick filter is a
// third, simpler facet. All three narrow pbRenderGroups() together.
let pbFilterGroups = new Set();
let pbFilterTags = new Set();
let pbFilterShort = false;

function pbAllTags() {
  const set = new Set();
  ACTIVITIES.forEach(a => (a.tags || []).forEach(tag => set.add(tag)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function pbActivityMatchesFilters(a) {
  if (pbFilterGroups.size && !pbFilterGroups.has(a.group)) return false;
  if (pbFilterTags.size && !(a.tags || []).some(tag => pbFilterTags.has(tag))) return false;
  if (pbFilterShort && !(a.durMax && a.durMax <= 15)) return false;
  return true;
}

function pbFiltersActive() {
  return pbFilterGroups.size > 0 || pbFilterTags.size > 0 || pbFilterShort;
}

function pbRenderFilters() {
  const groupWrap = document.getElementById('pb-filter-groups');
  if (groupWrap) {
    groupWrap.innerHTML = GROUPS.map(g => {
      const active = pbFilterGroups.has(g.id);
      return `<button type="button" class="pb-filter-chip" aria-pressed="${active}" onclick="pbToggleFilterGroup(${g.id})">
        <span class="pb-filter-dot" style="background:${PB_GROUP_COLORS[g.id]}"></span>${pbGroupT(g, 'title')}
      </button>`;
    }).join('');
  }

  const tagWrap = document.getElementById('pb-filter-tags');
  if (tagWrap) {
    const shortActive = pbFilterShort;
    tagWrap.innerHTML =
      `<button type="button" class="pb-filter-chip pb-filter-chip-quick" aria-pressed="${shortActive}" onclick="pbToggleFilterShort()">${pbEscapeHtml(t('pbui.filter.short'))}</button>` +
      pbAllTags().map(tag => {
        const active = pbFilterTags.has(tag);
        // Single-quoted like every other inline handler in this file (see
        // pbToggleActivity('${a.id}') etc.) — safe because none of the
        // tags in pocketbook-data.js contain an apostrophe; JSON.stringify
        // would have double-quoted the value and broken out of this
        // double-quoted onclick="..." attribute.
        return `<button type="button" class="pb-filter-chip" aria-pressed="${active}" onclick="pbToggleFilterTag('${tag}')">${pbEscapeHtml(pbTagT(tag))}</button>`;
      }).join('');
  }

  const clearBtn = document.getElementById('pb-filter-clear');
  if (clearBtn) clearBtn.disabled = !pbFiltersActive();
}

function pbToggleFilterGroup(g) {
  if (pbFilterGroups.has(g)) pbFilterGroups.delete(g); else pbFilterGroups.add(g);
  pbRenderFilters();
  pbRenderGroups();
}
function pbToggleFilterTag(tag) {
  if (pbFilterTags.has(tag)) pbFilterTags.delete(tag); else pbFilterTags.add(tag);
  pbRenderFilters();
  pbRenderGroups();
}
function pbToggleFilterShort() {
  pbFilterShort = !pbFilterShort;
  pbRenderFilters();
  pbRenderGroups();
}
function pbClearFilters() {
  pbFilterGroups.clear();
  pbFilterTags.clear();
  pbFilterShort = false;
  pbRenderFilters();
  pbRenderGroups();
}
function pbToggleFilterPanel() {
  const panel = document.getElementById('pb-filter-tags');
  const btn = document.getElementById('pb-filter-toggle');
  if (!panel || !btn) return;
  const willOpen = panel.hasAttribute('hidden');
  if (willOpen) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  btn.textContent = willOpen ? t('pbui.filter.toggle.close') : t('pbui.filter.toggle');
}

function pbRenderGroups() {
  const root = document.getElementById('pb-groups');
  let shown = 0;
  const html = GROUPS.map(g => {
    const items = ACTIVITIES.filter(a => a.group === g.id && pbActivityMatchesFilters(a));
    shown += items.length;
    if (!items.length) return '';
    return `
      <section class="pb-group">
        <header class="pb-group-header">
          <div class="pb-group-headline">
            <span class="pb-group-num">${g.num}.</span>
            <h2 class="pb-group-title">${pbGroupT(g, 'title')}</h2>
          </div>
          <span class="pb-group-meta">${pbGroupT(g, 'meta')}</span>
        </header>
        <div class="pb-activity-list">
          ${items.map(pbRenderActivity).join('')}
        </div>
      </section>
    `;
  }).join('');
  root.innerHTML = html || `<div class="pb-filter-empty">${pbEscapeHtml(t('pbui.filter.empty'))}</div>`;

  const summary = document.getElementById('pb-filter-summary');
  if (summary) {
    summary.textContent = pbFiltersActive()
      ? t('pbui.filter.summary').replace('{n}', String(shown)).replace('{total}', String(ACTIVITIES.length))
      : '';
  }
}

function pbRenderActivity(a) {
  const dur = pbFmtDuration(a);
  const showTimer = a.durAvg > 0;
  const detailId = 'pb-detail-' + a.id;
  return `
    <article class="pb-activity-item" id="pb-act-${a.id}" data-group="${a.group}">
      <div class="pb-activity-trigger" role="button" tabindex="0" aria-expanded="false" aria-controls="${detailId}"
           onclick="pbToggleActivity('${a.id}')" onkeydown="pbActivityTriggerKeydown(event, '${a.id}')">
        <div class="pb-activity-glyph">${GLYPH[a.glyph] || ''}</div>
        <div class="pb-activity-name">${pbT(a, 'name')}</div>
        <div class="pb-activity-meta">
          <span class="pb-activity-duration">${dur}</span>
          ${showTimer ? `<button type="button" class="pb-timer-icon" title="${t('pbui.activity.starttimer')}" onclick="event.stopPropagation(); pbStartTimer('${a.id}')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
              <circle cx="8" cy="9" r="5.5"/><path d="M8 9V6"/><path d="M6 2h4"/><path d="M8 2v1.5"/>
            </svg>
          </button>` : ''}
          <button type="button" class="pb-add-icon" title="${t('pbui.export.addtitle')}" onclick="event.stopPropagation(); pbToggleInSession('${a.id}')" data-add="${a.id}">+</button>
          <svg class="pb-chevron" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>
        </div>
      </div>
      <div class="pb-activity-detail" id="${detailId}">
        <div class="pb-activity-visual" data-visual="${a.visual || ''}">
          <div class="pb-visual-caption">${pbT(a, 'caption')}</div>
        </div>
        <div class="pb-detail-grid">
          <div class="pb-detail-label">${pbLabel('purpose')}</div>
          <div class="pb-detail-text">${pbT(a, 'purpose')}</div>
          <div class="pb-detail-label">${pbLabel('materials')}</div>
          <div class="pb-detail-text">${pbT(a, 'materials')}</div>
          <div class="pb-detail-label">${pbLabel('introduce')}</div>
          <div class="pb-detail-text"><div class="pb-detail-text-example">${pbT(a, 'intro')}</div></div>
          <div class="pb-detail-label">${pbLabel('close')}</div>
          <div class="pb-detail-text">${pbT(a, 'close') || ''}</div>
          <div class="pb-detail-label">${pbLabel('suitable')}</div>
          <div class="pb-detail-text"><div class="pb-detail-tags">${a.tags.map(tag => `<span class="pb-detail-tag">${pbTagT(tag)}</span>`).join('')}</div></div>
        </div>
      </div>
    </article>
  `;
}

function pbRenderAdaptations() {
  document.getElementById('pb-adaptations-table').innerHTML = ADAPTATIONS.map(r => `
    <div class="pb-adapt-row">
      <div class="pb-adapt-label">${pbAdaptT(r, 'label')}</div>
      <div class="pb-adapt-text">${pbAdaptT(r, 'text')}</div>
    </div>
  `).join('');
}

// ───────── ACTIVITY DETAIL DISCLOSURE ─────────
// Multiple activities can be expanded at once (not an exclusive accordion)
// so comparing two activities side by side doesn't require re-opening one
// after the other closes it.
function pbToggleActivity(id) {
  const item = document.getElementById('pb-act-' + id);
  if (!item) return;
  const wasOpen = item.classList.contains('open');
  item.classList.toggle('open', !wasOpen);
  const trigger = item.querySelector('.pb-activity-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', String(!wasOpen));
  if (!wasOpen) {
    // Re-inject SVG fresh so SMIL animations start from zero on each open
    const visualEl = item.querySelector('.pb-activity-visual[data-visual]');
    if (visualEl) {
      const key = visualEl.dataset.visual;
      const captionEl = visualEl.querySelector('.pb-visual-caption');
      const captionHTML = captionEl ? captionEl.outerHTML : '';
      visualEl.innerHTML = pbLocalizeVisual(VISUAL[key] || '', key) + captionHTML;
    }
  }
}

// Keyboard equivalent for the trigger's role="button" (a plain div, not a
// <button>, because it also hosts two nested real <button> elements —
// the timer and add-to-session actions — and <button> cannot contain
// <button>). Enter/Space activate it exactly like a native button would.
function pbActivityTriggerKeydown(e, id) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    pbToggleActivity(id);
  }
}

