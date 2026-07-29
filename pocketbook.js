// ─── App logic: render, accordion, timer, pbSession builder ───
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

// ───────── SESSION BUILDER ─────────
let pbSession = []; // array of activity ids in chosen order

// Optional session-level info for the plan export (start time, group/site,
// practitioner) — entirely additive, never required. Not persisted, same as
// pbSession itself: a returning visitor always starts from a clean plan.
let pbSessionMeta = { startTime: '', site: '', practitioner: '' };
function pbUpdateSessionMeta(field, value) {
  pbSessionMeta[field] = value;
}

// Per-item planned-minute overrides, keyed by activity id. An item not
// present here just uses the activity's own default (durMax, falling back
// to durAvg, falling back to 5 — matching the pre-existing fallback used
// for zero-duration "Throughout session"/"Multi-session" activities in the
// arc balance calculation below). Saved to localStorage like pb_session,
// but — matching pb_session's own documented choice — deliberately never
// auto-loaded, so a returning visitor always starts from a clean plan.
let pbSessionMins = {};
function pbGetItemMins(id) {
  if (typeof pbSessionMins[id] === 'number') return pbSessionMins[id];
  const a = ACTIVITIES.find(x => x.id === id);
  return a ? (a.durMax || a.durAvg || 5) : 5;
}
// Planned minutes per arc group (index 0 unused, groups are 1-5) for a given
// session — shared by the on-screen arc-balance bar (pbRenderBuilder) and the
// session-plan export's arc-distribution chart, so both read the same totals
// rather than each keeping its own copy of this reduce.
function pbComputeGroupTime(session) {
  const groupTime = [0, 0, 0, 0, 0, 0];
  session.forEach(id => {
    const a = ACTIVITIES.find(x => x.id === id);
    if (a) groupTime[a.group] += pbGetItemMins(id);
  });
  return groupTime;
}

// Each row's clock time in the session-plan export, walking the session in
// order from an optional start time ("HH:MM") and accumulating
// pbGetItemMins(id). Start time is entirely optional (see pbSessionMeta) —
// without one, every entry is null and the export simply omits that column
// rather than guessing or blocking.
function pbComputeClockTimes(startTime, session) {
  if (!startTime || !/^\d{1,2}:\d{2}$/.test(startTime)) return session.map(() => null);
  const [h, m] = startTime.split(':').map(Number);
  let mins = h * 60 + m;
  return session.map(id => {
    const hh = Math.floor((mins % 1440) / 60);
    const mm = mins % 60;
    mins += pbGetItemMins(id);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  });
}

// One bullet per activity's `materials` field for the session-plan export's
// "Materials & Site" list — skipping "nothing needed" placeholders (an
// activity that genuinely requires no materials says so in free text, e.g.
// "None — the forest provides.") and de-duplicating identical text.
// Materials are free-text prose per activity, not structured tags, so this
// lists distinct entries rather than trying to merge overlapping phrasing.
function pbAggregateMaterials(session) {
  const NONE_RE = /^(none|nothing|rien|aucun\w*|nichts|keins?)\b/i;
  const seen = new Set();
  const out = [];
  session.forEach(id => {
    const a = ACTIVITIES.find(x => x.id === id);
    if (!a) return;
    const m = (pbT(a, 'materials') || '').trim();
    if (!m || NONE_RE.test(m) || seen.has(m)) return;
    seen.add(m);
    out.push(m);
  });
  return out;
}

// ───────── SESSION-PLAN EXPORT: CHARTS ─────────
// Hand-rolled SVG (no chart library) — consistent with the rest of this
// codebase's SVG illustrations, and keeps these self-contained for
// html2canvas to rasterize regardless of where they're injected (they end
// up in #print-session, outside .pb-host — see the PB_GROUP_COLORS comment
// above on why the color values still resolve correctly there).

// Arc-distribution donut: one stroke-dasharray segment per non-empty group,
// colored with PB_GROUP_COLORS, rotated so the first segment starts at 12
// o'clock. Center text shows the total minutes + activity count.
function pbBuildArcDonutSVG(groupTime, activityCount) {
  const sumTime = groupTime.reduce((s, x) => s + x, 0) || 1;
  const cx = 100, cy = 100, r = 72, strokeWidth = 26;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;
  const segments = [];
  for (let g = 1; g <= 5; g++) {
    if (!groupTime[g]) continue;
    const frac = groupTime[g] / sumTime;
    const dash = frac * circumference;
    segments.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PB_GROUP_COLORS[g]}" ` +
      `stroke-width="${strokeWidth}" stroke-dasharray="${dash} ${circumference - dash}" ` +
      `stroke-dashoffset="${-cumulative}"/>`
    );
    cumulative += dash;
  }
  return (
    `<svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">` +
      `<g transform="rotate(-90 ${cx} ${cy})">${segments.join('')}</g>` +
      `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="'Montserrat', sans-serif" ` +
        `font-size="34" font-weight="600" fill="#14302A">${sumTime}</text>` +
      `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="'Open Sans', sans-serif" ` +
        `font-size="12" fill="#4D6359">${pbEscapeHtml(t('pbui.export.activitiesword').replace(/^/, activityCount + ' '))}</text>` +
    `</svg>`
  );
}

// Legend rows for the donut — one per non-empty group, colored dot + group
// title + share of total minutes as a percentage. Plain HTML (not SVG),
// meant to sit beside pbBuildArcDonutSVG's output.
function pbBuildArcLegendHTML(groupTime) {
  const sumTime = groupTime.reduce((s, x) => s + x, 0) || 1;
  const rows = [];
  for (let g = 1; g <= 5; g++) {
    if (!groupTime[g]) continue;
    const pct = Math.round((groupTime[g] / sumTime) * 100);
    const title = pbGroupT(GROUPS[g - 1], 'title');
    rows.push(
      `<div class="pexport-legend-row">` +
        `<span class="pexport-legend-dot" style="background:${PB_GROUP_COLORS[g]}"></span>` +
        `<span class="pexport-legend-label">${pbEscapeHtml(title)}</span>` +
        `<span class="pexport-legend-pct">${pct}%</span>` +
      `</div>`
    );
  }
  return rows.join('');
}

// Session-shape chart: each session activity's group-intensity value
// (GROUPS[].intensity, see pocketbook-data.js) plotted in session order, an
// area+line chart. X positions use real elapsed time when clockTimes has
// values (see pbComputeClockTimes), falling back to even spacing across the
// session when there's no start time — the chart works either way.
function pbBuildSessionShapeSVG(session, clockTimes) {
  const w = 460, h = 130, padX = 8, padY = 14;
  const activities = session.map(id => ACTIVITIES.find(a => a.id === id)).filter(Boolean);
  if (!activities.length) return '';

  const hasClock = clockTimes.every(c => c != null);
  let xPositions;
  if (hasClock) {
    const toMins = (hhmm) => { const [h2, m2] = hhmm.split(':').map(Number); return h2 * 60 + m2; };
    const starts = clockTimes.map(toMins);
    const ends = activities.map((a, i) => starts[i] + pbGetItemMins(a.id));
    const totalSpan = Math.max(1, ends[ends.length - 1] - starts[0]);
    xPositions = starts.map(s => padX + ((s - starts[0]) / totalSpan) * (w - padX * 2));
  } else {
    xPositions = activities.map((_, i) =>
      activities.length === 1 ? w / 2 : padX + (i / (activities.length - 1)) * (w - padX * 2)
    );
  }

  const yFor = (intensity) => padY + (1 - intensity) * (h - padY * 2);
  const points = activities.map((a, i) => {
    const grp = GROUPS[a.group - 1];
    return { x: xPositions[i], y: yFor(grp ? grp.intensity : 0.5) };
  });

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const areaPath =
    'M' + points[0].x.toFixed(1) + ',' + (h - padY).toFixed(1) + ' ' +
    points.map(p => 'L' + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') +
    ' L' + points[points.length - 1].x.toFixed(1) + ',' + (h - padY).toFixed(1) + ' Z';

  const dots = points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#234A3E"/>`
  ).join('');

  return (
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="${areaPath}" fill="#7FA396" fill-opacity="0.25" stroke="none"/>` +
      `<path d="${linePath}" fill="none" stroke="#234A3E" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` +
      dots +
    `</svg>`
  );
}

function pbAdjustItemMins(id, delta) {
  const next = Math.max(5, Math.min(120, pbGetItemMins(id) + delta));
  pbSessionMins[id] = next;
  try { localStorage.setItem('pb_session_mins', JSON.stringify(pbSessionMins)); } catch (e) {}
  pbRenderBuilder();
}

function pbToggleInSession(id) {
  const idx = pbSession.indexOf(id);
  if (idx >= 0) pbSession.splice(idx, 1);
  else pbSession.push(id);
  pbSaveSession();
  pbRenderBuilder();
  pbRefreshAddButtons();
}

function pbRefreshAddButtons() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    const id = btn.getAttribute('data-add');
    const inSession = pbSession.includes(id);
    btn.classList.toggle('in-pbSession', inSession);
    btn.textContent = inSession ? '✓' : '+';
    btn.title = inSession ? t('pbui.export.removetitle') : t('pbui.export.addtitle');
  });
}

function pbRemoveFromSession(id) {
  pbSession = pbSession.filter(x => x !== id);
  pbSaveSession();
  pbRenderBuilder();
  pbRefreshAddButtons();
}

function pbClearSession() {
  if (pbSession.length && !confirm(t('pbui.export.clearconfirm'))) return;
  pbSession = [];
  pbSaveSession();
  pbRenderBuilder();
  pbRefreshAddButtons();
}

function pbSaveSession() {
  try { localStorage.setItem('pb_session', JSON.stringify(pbSession)); } catch (e) {}
}
function pbLoadSession() {
  try {
    const v = JSON.parse(localStorage.getItem('pb_session') || '[]');
    if (Array.isArray(v)) pbSession = v.filter(id => ACTIVITIES.find(a => a.id === id));
  } catch (e) {}
}

function pbRenderBuilder() {
  const list = document.getElementById('pb-builder-list');
  const totalMin = pbSession.reduce((sum, id) => sum + pbGetItemMins(id), 0);

  document.getElementById('pb-stat-count').textContent = pbSession.length;
  document.getElementById('pb-stat-time').textContent = totalMin;

  // Mirror count onto the mobile FAB; bump animation when count rises.
  const fabCountEl = document.getElementById('pb-fab-count');
  const fabEl = document.getElementById('pb-fab');
  if (fabCountEl && fabEl) {
    const prev = parseInt(fabCountEl.textContent, 10) || 0;
    fabCountEl.textContent = String(pbSession.length);
    if (pbSession.length > prev) {
      fabCountEl.classList.remove('bump');
      fabEl.classList.remove('bump');
      void fabCountEl.offsetWidth;          // reflow to restart animation
      fabCountEl.classList.add('bump');
      fabEl.classList.add('bump');
      setTimeout(() => {
        fabCountEl.classList.remove('bump');
        fabEl.classList.remove('bump');
      }, 360);
    }
  }

  // Toggle PDF / PNG export buttons alongside Clear / Run mode. Disabled
  // (never hidden) when the plan is empty — a disabled button with a
  // visible reason is more discoverable than a button that isn't there.
  // aria-label/title double as that reason while disabled, and the hint
  // paragraph below the actions row states it in plain text too.
  const empty = pbSession.length === 0;
  const pdfBtn = document.getElementById('pb-export-pdf');
  const pngBtn = document.getElementById('pb-export-png');
  [[pdfBtn, 'export.pdf'], [pngBtn, 'export.png']].forEach(([btn, labelKey]) => {
    if (!btn) return;
    btn.disabled = empty;
    btn.setAttribute('aria-disabled', String(empty));
    const label = empty ? t('pbui.export.disabled.hint') : t(labelKey);
    btn.title = label;
    btn.setAttribute('aria-label', label);
  });
  const builderHint = document.getElementById('pb-builder-export-hint');
  if (builderHint) builderHint.textContent = empty ? t('pbui.export.disabled.hint') : '';

  // Arc balance bar
  const groupTime = pbComputeGroupTime(pbSession);
  const sumTime = groupTime.reduce((s, x) => s + x, 0) || 1;
  const bar = document.getElementById('pb-arc-bar');
  bar.innerHTML = '';
  const legendEntries = [];
  for (let g = 1; g <= 5; g++) {
    if (groupTime[g] > 0) {
      const seg = document.createElement('div');
      seg.className = 'pb-arc-segment';
      seg.dataset.group = g;
      seg.style.flex = String(groupTime[g] / sumTime);
      bar.appendChild(seg);
      legendEntries.push(g);
    }
  }
  const legend = document.getElementById('pb-arc-legend');
  legend.innerHTML = legendEntries.length === 0
    ? `<span style="opacity:0.5">${t('pbui.arc.empty')}</span>`
    : legendEntries.map(g => {
        const grp = GROUPS.find(x => x.id === g);
        return `<span class="pb-arc-legend-item"><span class="pb-arc-dot" style="background:${PB_GROUP_COLORS[g]}"></span>${pbGroupT(grp, 'title')}</span>`;
      }).join('');

  const adviceEl = document.getElementById('pb-arc-advice');
  if (adviceEl) adviceEl.textContent = pbComputeArcAdvice(groupTime, sumTime, pbSession.length);

  // List
  if (pbSession.length === 0) {
    list.innerHTML = `
      <div class="pb-builder-empty">
        <svg class="pb-builder-empty-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 8h24M6 14h24M6 20h16M6 26h12"/>
          <circle cx="28" cy="26" r="4"/>
          <path d="M28 24v4M26 26h4"/>
        </svg>
        <div>${t('pbui.builder.empty')}</div>
      </div>`;
  } else {
    list.innerHTML = pbSession.map((id, i) => {
      const a = ACTIVITIES.find(x => x.id === id);
      if (!a) return '';
      const mins = pbGetItemMins(id);
      const durHTML = a.durMax
        ? `<span class="pb-stepper">
             <button type="button" class="pb-stepper-btn" onclick="pbAdjustItemMins('${id}',-5)" aria-label="${t('pbui.stepper.minus')}" title="${t('pbui.stepper.minus')}">−</button>
             <span class="pb-stepper-val">${mins}m</span>
             <button type="button" class="pb-stepper-btn" onclick="pbAdjustItemMins('${id}',5)" aria-label="${t('pbui.stepper.plus')}" title="${t('pbui.stepper.plus')}">+</button>
           </span>`
        : `<span class="pb-builder-row-dur-label">${a.durLabel ? pbT(a, 'durLabel') : '—'}</span>`;
      return `
        <div class="pb-builder-row" draggable="true" data-id="${id}" data-idx="${i}"
             ondragstart="pbOnDragStart(event)" ondragover="pbOnDragOver(event)"
             ondrop="pbOnDrop(event)" ondragend="pbOnDragEnd(event)">
          <span class="pb-builder-row-handle">⋮⋮</span>
          <span class="pb-builder-row-group" style="background:${PB_GROUP_COLORS[a.group]}" title="Group ${a.group}: ${pbGroupT(GROUPS[a.group-1], 'title')}"></span>
          <span class="pb-builder-row-name">${pbT(a, 'name')}</span>
          <span class="pb-builder-row-dur">${durHTML}</span>
          <span class="pb-builder-row-move">
            <button type="button" class="pb-move-btn" onclick="pbMoveUp(${i})" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move ${pbT(a, 'name')} up">▲</button>
            <button type="button" class="pb-move-btn" onclick="pbMoveDown(${i})" ${i === pbSession.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move ${pbT(a, 'name')} down">▼</button>
          </span>
          <button type="button" class="pb-builder-row-remove" onclick="pbRemoveFromSession('${id}')" title="Remove">×</button>
        </div>`;
    }).join('');
  }

  document.getElementById('pb-btn-clear').disabled = pbSession.length === 0;
  const runBtn = document.getElementById('pb-btn-export');
  runBtn.disabled = pbSession.length === 0;
  runBtn.setAttribute('aria-disabled', String(pbSession.length === 0));
}

// ───────── ARC ADVICE ─────────
// A round-number reference point, not a clinical rule: the Session
// Structure guide (mod-plan) sketches Opening 10–15 + Core 30–45 +
// Integration 10–15 + Transition 5–10, whose midpoint lands near an hour.
const PB_ARC_TARGET_MIN = 60;

function pbComputeArcAdvice(groupTime, sumTime, count) {
  if (!count) return '';
  if (groupTime[1] === 0) return t('pbui.arc.advice.noarrival');
  if (groupTime[5] === 0) return t('pbui.arc.advice.noclosing');
  if (sumTime < PB_ARC_TARGET_MIN * 0.6) return t('pbui.arc.advice.under');
  if (sumTime > PB_ARC_TARGET_MIN * 1.4) return t('pbui.arc.advice.over');
  if ([2, 3, 4].some(g => groupTime[g] === 0)) return t('pbui.arc.advice.gap');
  return t('pbui.arc.advice.balanced');
}

// ───────── SUGGEST AN ARC ─────────
// Fills in any group that has nothing in the plan yet with that group's
// shortest-average-duration activity that still matches the active
// filters (if any) — a starting point, not a wizard: everything it adds
// is a normal session-builder row afterward, reorderable/removable/
// re-timed like anything added by hand.
function pbSuggestArc() {
  let added = 0;
  for (let g = 1; g <= 5; g++) {
    const covered = pbSession.some(id => {
      const a = ACTIVITIES.find(x => x.id === id);
      return a && a.group === g;
    });
    if (covered) continue;
    const candidates = ACTIVITIES
      .filter(a => a.group === g && a.durAvg > 0 && pbActivityMatchesFilters(a))
      .sort((a, b) => a.durAvg - b.durAvg);
    if (candidates.length) {
      pbSession.push(candidates[0].id);
      added++;
    }
  }
  if (added) {
    pbSaveSession();
    pbRenderBuilder();
    pbRefreshAddButtons();
    pbShowToast(t('pbui.arc.suggest.added').replace('{n}', String(added)));
  } else {
    pbShowToast(t('pbui.arc.suggest.none'));
  }
}

// ───────── DRAG REORDER ─────────
let pbDragSrcIdx = null;
function pbOnDragStart(e) {
  pbDragSrcIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}
function pbOnDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function pbOnDrop(e) {
  e.preventDefault();
  const tgtIdx = parseInt(e.currentTarget.dataset.idx);
  if (pbDragSrcIdx === null || pbDragSrcIdx === tgtIdx) return;
  const moved = pbSession.splice(pbDragSrcIdx, 1)[0];
  pbSession.splice(tgtIdx, 0, moved);
  pbSaveSession();
  pbRenderBuilder();
}
function pbOnDragEnd(e) { e.currentTarget.style.opacity = ''; pbDragSrcIdx = null; }

// Touch/keyboard-friendly alternative to drag reordering: native HTML5
// drag-and-drop doesn't fire on touch devices and has no keyboard path,
// so these buttons give every input type a way to reorder. They run the
// same splice + pbSaveSession + pbRenderBuilder pipeline as the drag
// handlers above, so both input methods stay in sync by construction.
function pbMoveUp(idx) {
  if (idx <= 0 || idx >= pbSession.length) return;
  const moved = pbSession.splice(idx, 1)[0];
  pbSession.splice(idx - 1, 0, moved);
  pbSaveSession();
  pbRenderBuilder();
}
function pbMoveDown(idx) {
  if (idx < 0 || idx >= pbSession.length - 1) return;
  const moved = pbSession.splice(idx, 1)[0];
  pbSession.splice(idx + 1, 0, moved);
  pbSaveSession();
  pbRenderBuilder();
}

// ───────── EXPORT ─────────
function pbExportSession() {
  const lines = [t('pbui.export.sessionplan'), '='.repeat(40), ''];
  let total = 0;
  pbSession.forEach((id, i) => {
    const a = ACTIVITIES.find(x => x.id === id);
    if (!a) return;
    const grp = GROUPS[a.group - 1];
    lines.push(`${i+1}. ${pbT(a, 'name')}  (${pbFmtDuration(a)})`);
    lines.push(`   ${pbGroupT(grp, 'title')}`);
    lines.push(`   ${pbT(a, 'purpose')}`);
    lines.push('');
    total += a.durAvg || 0;
  });
  lines.push('-'.repeat(40));
  lines.push(`${t('pbui.export.total')}: ${pbSession.length} ${t('pbui.export.activitiesword')} · ${total} min`);
  const txt = lines.join('\n');

  navigator.clipboard?.writeText(txt).then(() => {
    pbShowToast(t('pbui.export.copied'));
  }).catch(() => {
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'session-plan.txt';
    a.click();
    URL.revokeObjectURL(url);
    pbShowToast(t('pbui.export.downloaded'));
  });
}

function pbShowToast(msg) {
  const t = document.getElementById('pb-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ───────── TIMER ─────────
let pbTimerInterval = null;
let pbTimerTotal = 0;
let pbTimerSeconds = 0;
let pbTimerPaused = false;
const PB_RING_CIRCUM = 2 * Math.PI * 82; // ≈515.22

function pbStartTimer(id) {
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a || !a.durAvg) return;
  // Use the highest threshold of the activity's duration range
  const minutes = a.durMax || a.durAvg;
  const modal = document.getElementById('pb-timerModal');
  const nameEl = document.getElementById('pb-timerActivityName');
  const pauseBtn = document.getElementById('pb-pauseBtn');

  pbTimerTotal = minutes * 60;
  pbTimerSeconds = pbTimerTotal;
  pbTimerPaused = false;
  nameEl.textContent = pbT(a, 'name');
  pauseBtn.textContent = t('pbui.timer.pause');
  modal.classList.add('active');

  pbUpdateTimerDisplay();

  if (pbTimerInterval) clearInterval(pbTimerInterval);
  pbTimerInterval = setInterval(() => {
    if (pbTimerPaused) return;
    pbTimerSeconds--;
    pbUpdateTimerDisplay();
    if (pbTimerSeconds <= 0) {
      clearInterval(pbTimerInterval);
      const ring = document.getElementById('pb-timerProgress');
      ring.style.stroke = 'var(--ember)';
    }
  }, 1000);
}

function pbUpdateTimerDisplay() {
  const display = document.getElementById('pb-timerDisplay');
  const ring = document.getElementById('pb-timerProgress');
  const mins = Math.floor(Math.max(0, pbTimerSeconds) / 60);
  const secs = Math.max(0, pbTimerSeconds) % 60;
  display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const pct = pbTimerTotal > 0 ? Math.max(0, pbTimerSeconds / pbTimerTotal) : 0;
  ring.style.strokeDashoffset = String(PB_RING_CIRCUM * (1 - pct));
}

function pbPauseTimer() {
  pbTimerPaused = !pbTimerPaused;
  document.getElementById('pb-pauseBtn').textContent = pbTimerPaused ? t('pbui.timer.resume') : t('pbui.timer.pause');
}

function pbCloseTimer() {
  document.getElementById('pb-timerModal').classList.remove('active');
  if (pbTimerInterval) clearInterval(pbTimerInterval);
  document.getElementById('pb-pauseBtn').textContent = t('pbui.timer.pause');
  document.getElementById('pb-timerProgress').style.stroke = '';
}

// ───────── MOBILE BUILDER ─────────
function pbToggleBuilderMobile() {
  if (window.innerWidth > 1100) return;          // align with CSS breakpoint
  const builder = document.getElementById('pb-builder');
  const fab = document.getElementById('pb-fab');
  const backdrop = document.getElementById('pb-builder-backdrop');
  const isOpen = builder.classList.toggle('expanded');
  if (fab) fab.classList.toggle('open', isOpen);
  if (backdrop) backdrop.classList.toggle('active', isOpen);
}

// ───────── EXPORT (PDF / PNG with QR) ─────────
function exportBuildSessionURL() {
  const state = {
    s: pbSession,
    l: typeof currentLang === 'string' ? currentLang : 'en',
    d: new Date().toISOString().slice(0, 10),
  };
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return window.location.origin + window.location.pathname + '?s=' + b64;
}
function exportGenerateSessionQRNode() {
  if (typeof QRCode === 'undefined') return null;
  const wrap = document.createElement('div');
  new QRCode(wrap, {
    text: exportBuildSessionURL(),
    width: 52, height: 52,
    colorDark: '#3d5a3e', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
  return wrap.querySelector('canvas') || wrap.querySelector('img');
}

// Builds every HTML piece of the session-plan export (header, title, row
// timeline, sidebar charts, tail checklist, repeating footer) without
// touching the DOM — shared by the continuous single-page render below
// (used for on-screen/PNG output) and the paginated PDF path
// (pbBuildSessionPaginatedCanvases), so the two can never drift apart.
function pbBuildSessionExportData() {
  const lang = typeof currentLang === 'string' ? currentLang : 'en';
  const items = pbSession.map(id => ACTIVITIES.find(a => a.id === id)).filter(Boolean);
  const totalMin = pbSession.reduce((s, id) => s + pbGetItemMins(id), 0);
  const groupsUsed = new Set(items.map(a => a.group)).size;
  const date = new Date().toLocaleDateString(lang);

  const clockTimes = pbComputeClockTimes(pbSessionMeta.startTime, pbSession);
  const hasClock = clockTimes.some(c => c != null);
  const endTime = hasClock ? (() => {
    const [h, m] = clockTimes[clockTimes.length - 1].split(':').map(Number);
    const total = h * 60 + m + pbGetItemMins(pbSession[pbSession.length - 1]);
    return String(Math.floor((total % 1440) / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  })() : '';

  const groupTime = pbComputeGroupTime(pbSession);

  const rowBlocks = items.map((a, i) => {
    const durText = a.durMax ? pbGetItemMins(a.id) + ' min' : (pbT(a, 'durLabel') || pbFmtDuration(a));
    const clock = clockTimes[i];
    return (
      '<div class="pexport-row">' +
        '<div class="pexport-row-clock">' +
          (clock ? '<div class="pexport-row-clock-time">' + clock + '</div>' : '') +
          '<div class="pexport-row-clock-dur">' + pbEscapeHtml(durText) + '</div>' +
        '</div>' +
        '<div class="pexport-row-main">' +
          '<div class="pexport-row-heading">' +
            '<span class="pexport-row-num">' + String(i + 1).padStart(2, '0') + '</span> ' +
            pbEscapeHtml(pbT(a, 'name')) +
          '</div>' +
          '<div class="pexport-row-group">' +
            '<span class="pexport-row-dot" style="background:' + PB_GROUP_COLORS[a.group] + '"></span>' +
            pbEscapeHtml(pbGroupT(GROUPS[a.group - 1], 'title')) +
          '</div>' +
          '<div class="pexport-row-quote">' + pbEscapeHtml(pbT(a, 'intro')) + '</div>' +
        '</div>' +
      '</div>'
    );
  });

  // Manual bullet markup, not <ul>/<li> — html2canvas doesn't reliably
  // render native list markers (missing/misaligned bullet glyphs), so this
  // avoids that entirely rather than fighting it with CSS.
  const materialsHTML = pbAggregateMaterials(pbSession)
    .map(m => '<div class="pexport-materials-row"><span class="pexport-bullet">•</span>' + pbEscapeHtml(m) + '</div>').join('');

  const checklistHTML = [1, 2, 3, 4, 5, 6].map(i =>
    '<div class="pexport-check-item"><span class="pexport-checkbox"></span>' +
      pbEscapeHtml(t('check.pre.' + i)) +
    '</div>'
  ).join('');

  const subtitle = t('pbui.planexport.subtitle')
    .replace('{groups}', String(groupsUsed))
    .replace('{n}', String(items.length))
    .replace('{mins}', String(totalMin));
  const generated = t('pbui.planexport.footer.generated').replace('{date}', date);

  const headerHTML =
    '<div class="pexport-topbar">' +
      '<div class="pexport-topbar-fields">' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.date')) + '</div><div class="pexport-value">' + pbEscapeHtml(date) + '</div></div>' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.time')) + '</div><div class="pexport-value">' + (hasClock ? pbEscapeHtml(clockTimes[0] + ' – ' + endTime) : '—') + '</div></div>' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.groupsite')) + '</div><div class="pexport-value">' + pbEscapeHtml(pbSessionMeta.site || '—') + '</div></div>' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.practitioner')) + '</div><div class="pexport-value">' + pbEscapeHtml(pbSessionMeta.practitioner || '—') + '</div></div>' +
      '</div>' +
      '<div class="pexport-logos">' +
        '<img class="pexport-logo-img" src="assets/logo-interreg-forest4youth.png" alt="Interreg North-West Europe · Forest4Youth">' +
      '</div>' +
    '</div>';

  const titleHTML =
    '<div class="pexport-title-block">' +
      '<h1 class="pexport-title">' + pbEscapeHtml(t('pbui.planexport.title')) + '</h1>' +
      '<div class="pexport-subtitle">' + pbEscapeHtml(subtitle) + '</div>' +
    '</div>';

  const colHeadersHTML =
    '<div class="pexport-col-headers"><span>' + pbEscapeHtml(t('pbui.planexport.col.clock')) + '</span><span>' + pbEscapeHtml(t('pbui.planexport.col.activity')) + '</span></div>';

  const sidebarHTML =
    '<div class="pexport-sidebar">' +
      '<div class="pexport-stats-eyebrow">' + pbEscapeHtml(t('pbui.planexport.stats.eyebrow')) + '</div>' +
      '<div class="pexport-arc-block">' +
        '<div class="pexport-arc-row">' +
          '<div class="pexport-arc-donut">' + pbBuildArcDonutSVG(groupTime, items.length) + '</div>' +
          '<div class="pexport-arc-legend">' + pbBuildArcLegendHTML(groupTime) + '</div>' +
        '</div>' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.planexport.arc.title')) + ' · ' + pbEscapeHtml(t('pbui.planexport.arc.sub')) + '</div>' +
      '</div>' +
      '<div class="pexport-shape-block">' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.planexport.shape.title')) + ' · ' + pbEscapeHtml(t('pbui.planexport.shape.sub')) + '</div>' +
        pbBuildSessionShapeSVG(pbSession, clockTimes) +
      '</div>' +
      '<div class="pexport-materials-block">' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.planexport.materials.title')) + '</div>' +
        '<div class="pexport-materials-list">' + materialsHTML + '</div>' +
      '</div>' +
      '<div class="pexport-qr-block">' +
        '<div id="print-qr-slot"></div>' +
        '<div class="pexport-qr-caption">' + pbEscapeHtml(t('pbui.planexport.qr.caption')) + '</div>' +
      '</div>' +
    '</div>';

  const tailBlockHTML =
    '<div class="pexport-banner">' + pbEscapeHtml(t('pbui.planexport.banner')) + '</div>' +
    '<div class="pexport-footer">' +
      '<div class="pexport-footer-title">' + pbEscapeHtml(t('pbui.planexport.beforeyougo')) + '</div>' +
      '<div class="pexport-checklist">' + checklistHTML + '</div>' +
    '</div>';

  // No parent-dependent styling on .pexport-footer-bottom, so it renders
  // identically whether nested inside .pexport-footer (continuous version,
  // right after the checklist) or standalone, repeating on its own at the
  // bottom of every page (paginated version).
  const footerBottomHTML =
    '<div class="pexport-footer-bottom">' +
      '<span>Forest4Youth · Interreg North-West Europe</span>' +
      '<span>' + pbEscapeHtml(t('pbui.planexport.footer.disclaimer')) + '</span>' +
      '<span>' + pbEscapeHtml(generated) + '</span>' +
    '</div>';

  return { headerHTML, titleHTML, colHeadersHTML, rowBlocks, sidebarHTML, tailBlockHTML, footerBottomHTML };
}

// Builds the session-plan export — a two-column A4 page (activity timeline
// on the left, arc/shape charts + materials + QR in a sidebar on the
// right), matching the Canva-designed template. The post-session report
// (exportRenderPrintReport() below) reuses these same "pexport-*" classes
// for its shared visual language (colors, type, row/section styling) —
// only its own content-specific classes (.pexport-notes-card,
// .pexport-qa-*, .pexport-indicator-item) are report-only.
function exportRenderPrintSession() {
  const root = document.getElementById('print-session');
  if (!root) return;
  const d = pbBuildSessionExportData();

  root.innerHTML =
    '<div class="pexport">' +
      d.headerHTML +
      d.titleHTML +
      '<div class="pexport-body">' +
        '<div class="pexport-timeline">' +
          d.colHeadersHTML +
          d.rowBlocks.join('') +
        '</div>' +
        d.sidebarHTML +
      '</div>' +
      d.tailBlockHTML +
      d.footerBottomHTML +
    '</div>';

  const qrNode = exportGenerateSessionQRNode();
  const slot = root.querySelector('#print-qr-slot');
  if (qrNode && slot) slot.appendChild(qrNode);
}

// ───────── Shared multi-page export pipeline ─────────
// A real multi-page document repeats its header/footer on every page — the
// old approach (rasterize the whole continuous layout once, then slice
// that single tall canvas into equal page-height chunks) can't do that,
// since page 2+ would just show whatever content happened to fall in that
// pixel range with no header/logo/footer at all. Instead: measure each
// content block's real rendered height (respecting actual text wrapping —
// no guessing), greedily pack blocks into pages against a header/footer-
// aware budget, then rasterize each page separately so every page gets its
// own header + footer at the same margins as page 1.
const PEXPORT_PAGE_HEIGHT_CSS_PX = 297 * 96 / 25.4; // A4 height at 96dpi
const PEXPORT_PAGE_PAD_CSS_PX = 64; // #print-session/#print-report's own 32px top + 32px bottom padding
const PEXPORT_PAGE_INNER_HEIGHT_CSS_PX = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX;
const PEXPORT_PAGE_GAP_CSS_PX = 12; // safety margin between measurement (DOM layout) and rasterization (html2canvas)

function pbMeasureHeight(root, innerHTML) {
  root.innerHTML = '<div class="pexport">' + innerHTML + '</div>';
  return root.querySelector('.pexport').scrollHeight;
}

// blocks: array of HTML strings, each one atomic unit that must never be
// split across two pages (a row, a Q&A card, or a "section label + first
// item" pair glued together by the caller so a header never sits alone at
// the bottom of a page). Returns an array of pages, each an array of the
// original block strings that landed on that page.
//
// measureWrapPrefix/measureWrapSuffix (optional): the session-plan export
// needs its rows measured *inside* the same narrower .pexport-timeline
// column they actually render in on page 1 (which shares width with the
// 240px sidebar) — measuring them at the full page width instead
// understates how many lines the intro-quote text wraps to, which is
// exactly the gap that let content silently overflow past the fixed page
// height before this existed. Continuation pages have no sidebar (rows
// really are full-width there), so this measurement is conservative for
// them — a few bytes of unused space per continuation page, never
// overflow — rather than exact.
function pbPackBlocks(root, blocks, firstPageBudget, restPageBudget, measureWrapPrefix, measureWrapSuffix) {
  if (!blocks.length) return [[]];
  const unitsHTML = blocks.map(h => '<div class="pexport-unit">' + h + '</div>').join('');
  root.innerHTML = '<div class="pexport">' + (measureWrapPrefix || '') + unitsHTML + (measureWrapSuffix || '') + '</div>';
  const container = root.querySelector('.pexport-unit').parentElement;
  const children = Array.from(container.children);
  const tops = children.map(el => el.offsetTop);
  const total = container.scrollHeight;
  const heights = children.map((el, i) => (i + 1 < children.length ? tops[i + 1] : total) - tops[i]);

  const pages = [];
  let current = [];
  let used = 0;
  let budget = firstPageBudget;
  for (let i = 0; i < blocks.length; i++) {
    const h = heights[i];
    if (current.length && used + h > budget) {
      pages.push(current);
      current = [];
      used = 0;
      budget = restPageBudget;
    }
    current.push(blocks[i]);
    used += h;
  }
  pages.push(current);
  return pages;
}

async function pbRasterizePage(root, html) {
  root.innerHTML = html;
  return html2canvas(root, { width: 794, windowWidth: 794, scale: 2, backgroundColor: '#ffffff', useCORS: true });
}

function pbSavePDFFromCanvases(canvases, filenamePrefix) {
  const { jsPDF } = jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    const heightMm = Math.min(pageHeightMm, canvas.height * (pageWidthMm / canvas.width));
    // JPEG, not PNG: this is a mostly-text/solid-fill document (not a
    // photo), but embedding it as an uncompressed PNG at 2x scale made a
    // typical one-page plan ~10MB — a real problem for practitioners
    // emailing/sharing it. High-quality JPEG (0.92) is visually
    // indistinguishable at any normal zoom level and ~20x smaller.
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidthMm, heightMm);
  });
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  pdf.save(filenamePrefix + '-' + ts + '.pdf');
}

// Page 1 carries the title + column headers above its rows, plus the
// sidebar (charts/materials/QR) alongside them. Continuation pages repeat
// just the topbar + column headers (no title, no sidebar — a session long
// enough to spill onto more than one page always has far more row content
// than the sidebar is tall, so the sidebar never competes for page-2+
// space). Every page shares the same repeating footer.
async function pbBuildSessionPaginatedCanvases(root) {
  const d = pbBuildSessionExportData();
  const blocks = d.rowBlocks.concat([d.tailBlockHTML]);

  const page1ChromeHeight = pbMeasureHeight(root, d.headerHTML + d.titleHTML + d.colHeadersHTML);
  const restChromeHeight = pbMeasureHeight(root, d.headerHTML + d.colHeadersHTML);
  const footerHeight = pbMeasureHeight(root, d.footerBottomHTML);

  const firstPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - page1ChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const restPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - restChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const pages = pbPackBlocks(
    root, blocks, firstPageBudget, restPageBudget,
    '<div class="pexport-body"><div class="pexport-timeline">',
    '</div>' + d.sidebarHTML + '</div>'
  );

  const canvases = [];
  for (let i = 0; i < pages.length; i++) {
    const isFirst = i === 0;
    // A page holding only the trailing banner+checklist block (no real
    // rows) doesn't need the CLOCK/ACTIVITY column headers above it.
    const hasRows = pages[i].some(b => b !== d.tailBlockHTML);
    const colHeaders = hasRows ? d.colHeadersHTML : '';
    const bodyHTML = isFirst
      ? '<div class="pexport-body"><div class="pexport-timeline">' + colHeaders + pages[i].join('') + '</div>' + d.sidebarHTML + '</div>'
      : '<div class="pexport-body"><div class="pexport-timeline">' + colHeaders + pages[i].join('') + '</div></div>';
    root.innerHTML = '<div class="pexport pexport--paged" style="height:' + PEXPORT_PAGE_INNER_HEIGHT_CSS_PX + 'px;">' +
      d.headerHTML + (isFirst ? d.titleHTML : '') + bodyHTML + d.footerBottomHTML +
    '</div>';
    if (isFirst) {
      const qrNode = exportGenerateSessionQRNode();
      const slot = root.querySelector('#print-qr-slot');
      if (qrNode && slot) slot.appendChild(qrNode);
    }
    canvases.push(await html2canvas(root, { width: 794, windowWidth: 794, scale: 2, backgroundColor: '#ffffff', useCORS: true }));
  }
  return canvases;
}

async function exportRunPDF() {
  if (!pbSession.length) return;
  if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  const root = document.getElementById('print-session');
  if (!root) return;
  document.body.classList.add('is-exporting-png');
  try {
    const canvases = await pbBuildSessionPaginatedCanvases(root);
    pbSavePDFFromCanvases(canvases, 'forest4youth-session');
  } catch (err) {
    console.error('PDF export failed', err);
    alert('PDF export failed. Try Export to PNG instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

async function exportRunPNG() {
  if (!pbSession.length) return;
  if (typeof html2canvas === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  exportRenderPrintSession();
  document.body.classList.add('is-exporting-png');
  try {
    const node = document.getElementById('print-session');
    const canvas = await html2canvas(node, {
      width: 794,
      windowWidth: 794,
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const link = document.createElement('a');
    link.download = 'forest4youth-session-' + ts + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('PNG export failed', err);
    alert('PNG export failed. Try Export to PDF instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

// ───────── EXPORT: POST-SESSION REPORT ─────────
// Builds from #print-report (the most recent run's record, the
// self-reflection answers, and the outcome indicators) instead of
// #print-session (the session plan).
// Same .pexport visual language as exportRenderPrintSession() (colors,
// type, .pexport-row/-section-label/-footer-bottom etc.) but single-column
// — no chart sidebar, since the report's job is giving session notes and
// free-text reflection room to breathe, not at-a-glance stats.
// Same split as pbBuildSessionExportData() above: every HTML piece built
// without touching the DOM, shared by the continuous render below (on-
// screen/PNG) and the paginated PDF path (pbBuildReportPaginatedCanvases).
// Returns null if there's no session record yet (nothing to export).
function pbBuildReportExportData() {
  const lang = typeof currentLang === 'string' ? currentLang : 'en';
  const records = pbLoadSessionRecords();
  if (!records.length) return null;
  const record = records[0];
  const meta = pbLoadReflectMeta();
  const date = pbFormatWhen(record.when);

  const groupIds = new Set();
  let actualMinsTotal = 0, anyActual = false;
  record.items.forEach(it => {
    const a = ACTIVITIES.find(x => x.id === it.id);
    if (a) groupIds.add(a.group);
    if (it.actualSecs != null) { anyActual = true; actualMinsTotal += it.actualSecs / 60; }
  });
  const totalMins = Math.round(anyActual ? actualMinsTotal : (record.target || 0));

  const rowBlocks = record.items.map((it, i) => {
    const a = ACTIVITIES.find(x => x.id === it.id);
    const name = a ? pbT(a, 'name') : it.id;
    const actual = it.actualSecs != null ? pbFmtMinSec(it.actualSecs) : '—';
    const groupHTML = a ?
      '<div class="pexport-row-group">' +
        '<span class="pexport-row-dot" style="background:' + PB_GROUP_COLORS[a.group] + '"></span>' +
        pbEscapeHtml(pbGroupT(GROUPS[a.group - 1], 'title')) +
      '</div>' : '';
    const noteHTML = it.note ? '<div class="pexport-row-quote">' + pbEscapeHtml(it.note) + '</div>' : '';
    return '<div class="pexport-row">' +
      '<div class="pexport-row-clock">' +
        '<div class="pexport-row-clock-time">' + pbEscapeHtml(actual) + '</div>' +
        '<div class="pexport-row-clock-dur">' + it.plannedMins + ' min ' + pbEscapeHtml(t('pbui.reflect.planned')) + '</div>' +
      '</div>' +
      '<div class="pexport-row-main">' +
        '<div class="pexport-row-heading"><span class="pexport-row-num">' + String(i + 1).padStart(2, '0') + '</span> ' + pbEscapeHtml(name) + '</div>' +
        groupHTML +
        noteHTML +
      '</div>' +
    '</div>';
  });

  const answerBlocks = Array.prototype.map.call(
    document.querySelectorAll('#mod-reflect-self .reflect-prompt'), p => {
      const qEl = p.querySelector('h4');
      const q = qEl ? qEl.textContent : '';
      const ta = p.querySelector('.reflect-answer');
      const val = ta ? ta.value.trim() : '';
      const ans = val ? pbEscapeHtml(val) : '—';
      return '<div class="pexport-qa-card"><div class="pexport-qa-q">' + pbEscapeHtml(q) + '</div>' +
        '<div class="pexport-qa-a">' + ans + '</div></div>';
    }
  );

  const indicatorBlocks = Array.prototype.map.call(
    document.querySelectorAll('#mod-indicators .check-item-v2'), el => {
      const labelEl = el.querySelector('label');
      const label = labelEl ? labelEl.textContent : '';
      const on = el.classList.contains('checked');
      return '<div class="pexport-indicator-item' + (on ? ' is-checked' : '') + '">' + (on ? '☑' : '☐') + ' ' + pbEscapeHtml(label) + '</div>';
    }
  );

  // The free-text "other notes" field is the one thing worth its own
  // highlighted card — everything else in pbLoadReflectMeta() moves up
  // into the header fields below. Omitted entirely if never filled in.
  const notesBlock = (meta.other || '').trim()
    ? '<div class="pexport-notes-card">' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.meta.title')) + '</div>' +
        '<div class="pexport-notes-text">' + pbEscapeHtml(meta.other.trim()) + '</div>' +
      '</div>'
    : null;

  const placeInst = [meta.place, meta.institution].filter(v => (v || '').trim()).join(' · ');
  const subtitle = t('pbui.reflect.report.subtitle')
    .replace('{groups}', String(groupIds.size))
    .replace('{n}', String(record.items.length))
    .replace('{mins}', String(totalMins));

  const headerHTML =
    '<div class="pexport-topbar">' +
      '<div class="pexport-topbar-fields">' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.date')) + '</div><div class="pexport-value">' + pbEscapeHtml(date) + '</div></div>' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.reflect.meta.start')) + '</div><div class="pexport-value">' + pbEscapeHtml(meta.start || '—') + '</div></div>' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.reflect.report.label.participants')) + '</div><div class="pexport-value">' + pbEscapeHtml(meta.participants || '—') + '</div></div>' +
        '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.reflect.report.label.placeinst')) + '</div><div class="pexport-value">' + pbEscapeHtml(placeInst || '—') + '</div></div>' +
      '</div>' +
      '<div class="pexport-logos">' +
        '<img class="pexport-logo-img" src="assets/logo-interreg-forest4youth.png" alt="Interreg North-West Europe · Forest4Youth">' +
      '</div>' +
    '</div>';

  const titleHTML =
    '<div class="pexport-title-block">' +
      '<h1 class="pexport-title">' + pbEscapeHtml(t('pbui.reflect.report.title')) + '</h1>' +
      '<div class="pexport-subtitle">' + pbEscapeHtml(subtitle) + '</div>' +
    '</div>';

  const footerBottomHTML =
    '<div class="pexport-footer-bottom">' +
      '<span>Forest4Youth · Interreg North-West Europe</span>' +
      '<span>' + pbEscapeHtml(t('pbui.planexport.footer.generated').replace('{date}', new Date().toLocaleDateString(lang))) + '</span>' +
    '</div>';

  const sessionLabelHTML = '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.report.session')) + '</div>';
  const reflectionLabelHTML = '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.report.selfreflection')) + '</div>';
  const indicatorsLabelHTML = '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.report.indicators')) + '</div>';

  // Blocks flow in document order, one atomic unit each. Each section's
  // label is glued to the item right after it (merged into a single block
  // string) so a page break can never leave a header alone at the bottom.
  const blocks = [];
  if (notesBlock) blocks.push(notesBlock);
  const sessionItems = rowBlocks.length ? rowBlocks : ['—'];
  blocks.push(sessionLabelHTML + sessionItems[0], ...sessionItems.slice(1));
  const reflectItems = answerBlocks.length ? answerBlocks : ['—'];
  blocks.push(reflectionLabelHTML + reflectItems[0], ...reflectItems.slice(1));
  const indicatorItems = indicatorBlocks.length ? indicatorBlocks : ['—'];
  blocks.push(indicatorsLabelHTML + indicatorItems[0], ...indicatorItems.slice(1));

  return { headerHTML, titleHTML, footerBottomHTML, blocks };
}

function exportRenderPrintReport() {
  const root = document.getElementById('print-report');
  if (!root) return;
  const d = pbBuildReportExportData();
  if (!d) { root.innerHTML = ''; return; }
  root.innerHTML = '<div class="pexport">' + d.headerHTML + d.titleHTML + d.blocks.join('') + d.footerBottomHTML + '</div>';
}

// Report pages are single-column (no sidebar) — the topbar repeats on
// every page, the title only on page 1, and every section's blocks flow
// across pages just like the plan's rows do.
async function pbBuildReportPaginatedCanvases(root) {
  const d = pbBuildReportExportData();
  if (!d) return [];

  const page1ChromeHeight = pbMeasureHeight(root, d.headerHTML + d.titleHTML);
  const restChromeHeight = pbMeasureHeight(root, d.headerHTML);
  const footerHeight = pbMeasureHeight(root, d.footerBottomHTML);

  const firstPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - page1ChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const restPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - restChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const pages = pbPackBlocks(root, d.blocks, firstPageBudget, restPageBudget);

  const canvases = [];
  for (let i = 0; i < pages.length; i++) {
    const isFirst = i === 0;
    const pageHTML = '<div class="pexport pexport--paged" style="height:' + PEXPORT_PAGE_INNER_HEIGHT_CSS_PX + 'px;">' +
      d.headerHTML + (isFirst ? d.titleHTML : '') + pages[i].join('') + d.footerBottomHTML +
    '</div>';
    canvases.push(await pbRasterizePage(root, pageHTML));
  }
  return canvases;
}

// Belt-and-suspenders alongside the button's own disabled state: same two
// conditions pbUpdateReflectExportGate() below uses to enable the button,
// checked again here so a somehow-triggered click (e.g. programmatically,
// or before the gate has re-rendered) still can't produce a report with
// nothing in it.
//
// Same html2canvas+jsPDF pipeline as exportRunPDF() (the plan export) —
// once the report picked up the same .pexport visual language, it needed
// the same rendering guarantee: the PDF has to match the on-screen/PNG
// version pixel-for-pixel, which print-CSS fidelity can't promise.
async function exportSessionReportPDF() {
  if (!pbLoadSessionRecords().length) return;
  if (!pbHasReflectionContent()) return;
  if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  const root = document.getElementById('print-report');
  if (!root) return;
  document.body.classList.add('is-exporting-png');
  try {
    const canvases = await pbBuildReportPaginatedCanvases(root);
    if (!canvases.length) return;
    pbSavePDFFromCanvases(canvases, 'forest4youth-reflection');
  } catch (err) {
    console.error('PDF export failed', err);
    alert('PDF export failed. Try Export to PNG instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

// Same html2canvas approach as exportRunPNG() above, pointed at
// #print-report (built by exportRenderPrintReport()) instead of
// #print-session. Kept as a near-duplicate of exportRunPNG() rather than a
// shared helper parameterized by target id, because the two already read
// different gate conditions (plan non-empty vs. record+content) and a
// shared helper would need to take the gate check as a parameter too,
// which ends up harder to follow than two short functions.
async function exportSessionReportPNG() {
  if (!pbLoadSessionRecords().length) return;
  if (!pbHasReflectionContent()) return;
  if (typeof html2canvas === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  exportRenderPrintReport();
  document.body.classList.add('is-exporting-png');
  try {
    const node = document.getElementById('print-report');
    const canvas = await html2canvas(node, {
      width: 794,
      windowWidth: 794,
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const link = document.createElement('a');
    link.download = 'forest4youth-reflection-' + ts + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('PNG export failed', err);
    alert('PNG export failed. Try Export to PDF instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

// True once the practitioner has written *something* in the reflection UI —
// at least one of the 4 self-reflection prompts, or at least one outcome
// indicator ticked. Read straight from the live DOM (values already restored
// by pbRestoreReflectState() on load, or just typed/toggled), same source
// exportRenderPrintReport() itself reads from — so "has content" and "what
// gets exported" can never disagree.
function pbHasReflectionContent() {
  const anyAnswer = Array.prototype.some.call(
    document.querySelectorAll('.reflect-answer'), ta => ta.value.trim().length > 0);
  if (anyAnswer) return true;
  return Array.prototype.some.call(
    document.querySelectorAll('#mod-indicators .check-item-v2'), el => el.classList.contains('checked'));
}

// Live-updates the Reflect screen's export button + its adjacent
// explanatory text against two conditions together: a session record must
// exist (pbLoadSessionRecords().length > 0) AND at least one reflection
// field must have content (pbHasReflectionContent()). Called whenever
// either side of that could have changed — a run finishes/closes
// (pbRenderReflectSummary), a reflection answer is typed
// (pbSaveReflectAnswer), an indicator is toggled (pbToggleIndicator), and
// once more on load after restoring saved reflection state — so the button
// is never stale relative to what's actually on screen.
// Two export buttons on the Reflect screen share this one gate: an early
// one right under the "session just run" recap for quick access, and the
// primary one at the end of the page (after prompts/indicators, before
// Session history) for the natural end-of-flow action. Both read/write the
// same underlying state, so keeping them in sync here (rather than two
// separate gate functions) means they can never disagree.
// One export panel (PDF button + PNG button + shared hint) — there used to
// be two (an early one under the recap, a second before Session history);
// consolidated back to a single instance positioned after everything that
// can feed the report, per product direction against having export UI
// interrupt the page in more than one place.
const PB_REFLECT_EXPORT_BTN_IDS = ['reflect-export-btn', 'reflect-export-png-btn'];
function pbUpdateReflectExportGate() {
  const hasRecord = pbLoadSessionRecords().length > 0;
  const hasContent = pbHasReflectionContent();
  const enabled = hasRecord && hasContent;
  const hintText = !hasRecord ? t('pbui.reflect.export.norecord')
    : !hasContent ? t('pbui.reflect.export.needcontent')
    : t('pbui.reflect.export.hint');
  PB_REFLECT_EXPORT_BTN_IDS.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.setAttribute('aria-disabled', String(!enabled));
  });
  const hint = document.getElementById('reflect-export-hint');
  if (hint) hint.textContent = hintText;
}

// ───────── KEY HANDLERS ─────────
document.addEventListener('keydown', e => {
  const runActive = document.getElementById('pb-runMode').classList.contains('active');
  // Run Mode's own notes field is a <textarea> inside the same overlay —
  // ← / → need to move the text cursor there like anywhere else, and Esc
  // shouldn't end the run out from under someone mid-sentence. Guarded to
  // input/textarea/select generally in case a future field needs the same
  // treatment.
  const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    const modal = document.getElementById('pb-timerModal');
    if (modal.classList.contains('active')) pbCloseTimer();
    else if (runActive && !inField) pbCloseRunMode();
  }
  if (runActive && !inField) {
    if (e.key === 'ArrowLeft') pbRunPrev();
    else if (e.key === 'ArrowRight') pbRunNext();
  }
});

// ───────── RUN MODE ─────────
let pbRunIndex = 0;
// Per-step note + actual elapsed seconds, keyed by index into pbSession
// at the moment the run started. Reset each time a run finishes/closes.
let pbRunLog = {};

function pbStartRunMode() {
  if (!pbSession.length) return;
  pbRunIndex = 0;
  pbRunLog = {};
  document.getElementById('pb-runMode').classList.add('active');
  document.body.classList.add('pb-run-active', 'no-scroll');
  pbRenderRunStep();
}

// Closing Run Mode — by the × button, Esc, or Next past the last activity
// (pbRunNext below) — always captures and saves whatever was recorded so
// far. Earlier versions of Run Mode discarded everything on close; this is
// the one behaviour change that actually closes the loop the rest of this
// task is built around, so an early close now keeps a partial record
// rather than silently losing it.
function pbCloseRunMode() {
  pbRunCaptureStep();
  const record = pbBuildSessionRecord();
  pbMaybeSaveSessionRecord(record);
  document.getElementById('pb-runMode').classList.remove('active');
  document.body.classList.remove('pb-run-active', 'no-scroll');
  if (document.getElementById('pb-timerModal').classList.contains('active')) pbCloseTimer();
  pbRunTimerStop();
  pbClearRunVisual();
  pbRunLog = {};
  pbRenderReflectSummary();
  // The whole point of "Finish & reflect" is to land on the Reflect screen
  // with the session that was just run already showing — this was
  // building the recap data (pbRenderReflectSummary above) but never
  // actually navigating there, leaving the practitioner on whatever screen
  // was behind the overlay (usually Plan).
  navigate('reflect');
}
function pbRunPrev() { if (pbRunIndex > 0) { pbRunCaptureStep(); pbRunIndex--; pbRenderRunStep(); } }
function pbRunNext() {
  if (pbRunIndex < pbSession.length - 1) { pbRunCaptureStep(); pbRunIndex++; pbRenderRunStep(); }
  else pbCloseRunMode();
}

// Saves the step currently on screen into pbRunLog before it's replaced —
// called on every navigation away from a step (Prev/Next) and once more
// from pbCloseRunMode() for whichever step is showing when the run ends.
function pbRunCaptureStep() {
  const notesEl = document.getElementById('pb-runNotes');
  pbRunLog[pbRunIndex] = pbRunLog[pbRunIndex] || {};
  if (notesEl) pbRunLog[pbRunIndex].note = notesEl.value;
  // Untimed activities (roles/project — "Throughout session"/"Multi-session")
  // never start pbRunElapsedSecs ticking, so recording 0 here would read as
  // "ran for zero seconds" instead of "no timer applies" — leave actualSecs
  // unset for them; pbBuildSessionRecord()'s null default then still shows
  // correctly in the recap/report even though the step was visited.
  const id = pbSession[pbRunIndex];
  const a = ACTIVITIES.find(x => x.id === id);
  if (a && (a.durMax || a.durAvg)) pbRunLog[pbRunIndex].actualSecs = pbRunElapsedSecs;
}

function pbRunNoteInput(e) {
  pbRunLog[pbRunIndex] = pbRunLog[pbRunIndex] || {};
  pbRunLog[pbRunIndex].note = e.target.value;
}

// Builds {when, target, items:[{id, plannedMins, actualSecs, note}]} from
// the plan as it stood when Run Mode was opened plus whatever pbRunLog
// picked up along the way. Items never reached keep actualSecs: null.
function pbBuildSessionRecord() {
  const items = pbSession.map((id, i) => {
    const log = pbRunLog[i] || {};
    return {
      id: id,
      plannedMins: pbGetItemMins(id),
      actualSecs: typeof log.actualSecs === 'number' ? log.actualSecs : null,
      note: (log.note || '').trim(),
    };
  });
  const target = items.reduce((s, it) => s + (it.plannedMins || 0), 0);
  return { when: new Date().toISOString(), target: target, items: items };
}

const PB_SESSIONS_KEY = 'f4y.sessions';
const PB_SESSIONS_MAX = 12;

function pbLoadSessionRecords() {
  try {
    const v = JSON.parse(localStorage.getItem(PB_SESSIONS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

// Skips writing a record if nothing actually happened (opened Run Mode
// and immediately closed it again) so a stray tap doesn't leave junk in
// the session history.
function pbMaybeSaveSessionRecord(record) {
  const meaningful = record.items.some(it => (it.actualSecs && it.actualSecs > 0) || it.note);
  if (!meaningful) return;
  try {
    const list = pbLoadSessionRecords();
    list.unshift(record);
    localStorage.setItem(PB_SESSIONS_KEY, JSON.stringify(list.slice(0, PB_SESSIONS_MAX)));
  } catch (e) {}
}

// ── Inline run-mode timer (continuous — counts past zero instead of
// stopping, so it never blocks or nags mid-activity) ──
let pbRunTimerInterval = null;
let pbRunTimerTotal = 0;
let pbRunTimerSeconds = 0;
let pbRunTimerPaused = false;
// True elapsed seconds for the step currently showing (excludes paused
// time). Tracked separately from pbRunTimerSeconds so +5/pause/over don't
// distort what actually gets recorded.
let pbRunElapsedSecs = 0;

function pbRunTimerStart(minutes) {
  pbRunTimerStop();
  pbRunTimerTotal = minutes * 60;
  pbRunTimerSeconds = pbRunTimerTotal;
  pbRunTimerPaused = false;
  pbRunElapsedSecs = 0;
  const wrap = document.getElementById('pb-runTimer');
  wrap.classList.remove('over','paused');
  document.getElementById('pb-runTimerPause').textContent = t('pbui.timer.pause');
  pbRunTimerRender(); // also sets the initial "counting down N min" hint
  pbRunTimerInterval = setInterval(() => {
    if (pbRunTimerPaused) return;
    pbRunTimerSeconds--;
    pbRunElapsedSecs++;
    pbRunTimerRender();
  }, 1000);
}
function pbRunTimerStop() {
  if (pbRunTimerInterval) { clearInterval(pbRunTimerInterval); pbRunTimerInterval = null; }
}
function pbRunTimerRender() {
  const s = pbRunTimerSeconds;
  const over = s < 0;
  const abs = Math.abs(s);
  const mm = String(Math.floor(abs / 60)).padStart(2, '0');
  const ss = String(abs % 60).padStart(2, '0');
  document.getElementById('pb-runTimerDisplay').textContent = (over ? '+' : '') + mm + ':' + ss;
  const pct = pbRunTimerTotal > 0 ? Math.min(100, Math.max(0, (s / pbRunTimerTotal) * 100)) : 0;
  document.getElementById('pb-runTimerFill').style.width = pct + '%';
  const wrap = document.getElementById('pb-runTimer');
  wrap.classList.toggle('over', over);
  // Recomputed every render (not just on the over/under transition) so
  // pressing +5 min while already over correctly reverts this back to the
  // counting-down phrasing instead of leaving a stale "over by" message.
  document.getElementById('pb-runTimerHint').textContent = over
    ? t('pbui.runtimer.hint.over').replace('{mmss}', mm + ':' + ss)
    : t('pbui.runtimer.hint.mins').replace('{mins}', String(Math.ceil(pbRunTimerTotal / 60)));
}
function pbRunTimerPause() {
  if (!pbRunTimerInterval) return;
  pbRunTimerPaused = !pbRunTimerPaused;
  document.getElementById('pb-runTimerPause').textContent = pbRunTimerPaused ? t('pbui.timer.resume') : t('pbui.timer.pause');
  document.getElementById('pb-runTimer').classList.toggle('paused', pbRunTimerPaused);
}
function pbRunTimerReset() {
  const id = pbSession[pbRunIndex];
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a || !(a.durMax || a.durAvg)) return; // untimed activity — nothing to reset
  pbRunTimerStart(pbGetItemMins(id));
}
// Extends both the remaining time and the original target together, so
// "actual elapsed" (tracked independently via pbRunElapsedSecs, not
// derived from this countdown) stays accurate regardless of how many
// times this gets pressed.
function pbRunTimerPlus5() {
  if (!pbRunTimerInterval) return; // no active countdown on this (untimed) step
  pbRunTimerSeconds += 300;
  pbRunTimerTotal += 300;
  pbRunTimerRender();
}

// One <li> per activity in the session, colored by state (done / current /
// upcoming) rather than by group — this is a progress indicator, not the
// group-color legend used elsewhere. A visually-hidden label per dot keeps
// it meaningful to screen readers, since the color coding alone isn't.
function pbRenderRunDots() {
  const wrap = document.getElementById('pb-runDots');
  if (!wrap) return;
  wrap.innerHTML = pbSession.map((id, i) => {
    const a = ACTIVITIES.find(x => x.id === id);
    const name = a ? pbT(a, 'name') : id;
    const state = i < pbRunIndex ? 'done' : i === pbRunIndex ? 'current' : '';
    const stateLabel = i < pbRunIndex ? t('pbui.run.dot.done') : i === pbRunIndex ? t('pbui.run.dot.current') : t('pbui.run.dot.upcoming');
    return `<li class="${state}"><span class="sr-only">${(i + 1) + '. ' + pbEscapeHtml(name) + ' — ' + stateLabel}</span></li>`;
  }).join('');
}

function pbRenderRunStep() {
  const id = pbSession[pbRunIndex];
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a) return;
  const grp = GROUPS[a.group - 1];
  document.getElementById('pb-runStep').textContent =
    t('pbui.run.step').replace('{n}', String(pbRunIndex + 1)).replace('{total}', String(pbSession.length));
  pbRenderRunDots();
  document.getElementById('pb-runGroup').textContent = grp ? pbGroupT(grp, 'title') : '';
  document.getElementById('pb-runName').textContent = pbT(a, 'name');
  document.getElementById('pb-runDuration').textContent = pbFmtDuration(a);
  pbSetRunVisual(pbLocalizeVisual(VISUAL[a.visual] || '', a.visual));
  document.getElementById('pb-runLabelPurpose').textContent = pbLabel('purpose');
  document.getElementById('pb-runPurpose').textContent = pbT(a, 'purpose') || '';
  document.getElementById('pb-runLabelIntro').textContent = pbLabel('introduce');
  document.getElementById('pb-runIntro').textContent = pbT(a, 'intro') || '';
  document.getElementById('pb-runLabelMaterials').textContent = pbLabel('materials');
  document.getElementById('pb-runMaterials').textContent = pbT(a, 'materials') || '';
  document.getElementById('pb-runLabelClose').textContent = pbLabel('close');
  document.getElementById('pb-runClose').textContent = pbT(a, 'close') || '';
  document.getElementById('pb-runPrev').disabled = (pbRunIndex === 0);
  // On the last step this button ends the run exactly like the persistent
  // "Finish & reflect" button in the head row above (both call
  // pbCloseRunMode()) — reusing that exact label here too, rather than the
  // old standalone "Finish" wording, so it's visibly the same action/path
  // rather than reading like a second, different kind of finish.
  document.getElementById('pb-runNext').textContent = (pbRunIndex === pbSession.length - 1) ? t('pbui.run.finishreflect') : t('pbui.run.next');

  const notesEl = document.getElementById('pb-runNotes');
  if (notesEl) notesEl.value = (pbRunLog[pbRunIndex] && pbRunLog[pbRunIndex].note) || '';

  // Auto-start the inline timer for this step using the planned minutes
  // (the session-builder stepper's override, if any, else the top duration
  // threshold). Whether the activity is timed at all is decided from its
  // own data (durMax/durAvg), not pbGetItemMins() — that helper's 5-minute
  // fallback for zero-duration activities ("Throughout session"/
  // "Multi-session" — roles/project) exists only so they still contribute
  // something visible to the arc balance bar, not to make Run Mode try to
  // put a countdown on them.
  const timerWrap = document.getElementById('pb-runTimer');
  const isTimed = !!(a.durMax || a.durAvg);
  if (isTimed) {
    timerWrap.classList.remove('untimed');
    pbRunTimerStart(pbGetItemMins(id));
  } else {
    timerWrap.classList.add('untimed');
    pbRunTimerStop();
    pbRunElapsedSecs = 0;
  }
}

// ───────── REFLECT: SESSION RECAP + HISTORY ─────────
function pbFmtMinSec(secs) {
  const s = Math.max(0, secs || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return mm + ':' + ss;
}
function pbFormatWhen(iso) {
  try {
    const lang = typeof currentLang === 'string' ? currentLang : 'en';
    return new Date(iso).toLocaleString(lang);
  } catch (e) { return iso; }
}
function pbFmtActualVsPlanned(plannedMins, actualSecs) {
  if (actualSecs == null) return t('pbui.reflect.notrun');
  const str = pbFmtMinSec(actualSecs);
  const overSecs = actualSecs - plannedMins * 60;
  if (overSecs > 30) return str + ' (' + t('pbui.reflect.over').replace('{m}', String(Math.round(overSecs / 60))) + ')';
  return str;
}

function pbRenderReflectRecapRow(it) {
  const a = ACTIVITIES.find(x => x.id === it.id);
  const name = a ? pbT(a, 'name') : it.id;
  const noteHTML = it.note ? `<div class="reflect-recap-note">${pbEscapeHtml(it.note)}</div>` : '';
  return `<div class="reflect-recap-row">
    <span class="reflect-recap-name">${pbEscapeHtml(name)}</span>
    <span class="reflect-recap-time">${it.plannedMins}m ${pbEscapeHtml(t('pbui.reflect.planned.vs'))} ${pbFmtActualVsPlanned(it.plannedMins, it.actualSecs)}</span>
    ${noteHTML}
  </div>`;
}

function pbRenderReflectHistoryRow(record) {
  const groupTime = [0, 0, 0, 0, 0, 0];
  record.items.forEach(it => {
    const a = ACTIVITIES.find(x => x.id === it.id);
    if (a) groupTime[a.group] += it.plannedMins || 0;
  });
  const sum = groupTime.reduce((s, x) => s + x, 0) || 1;
  const bar = [1, 2, 3, 4, 5].filter(g => groupTime[g] > 0).map(g =>
    `<span class="reflect-history-seg" style="flex:${groupTime[g] / sum};background:${PB_GROUP_COLORS[g]}"></span>`
  ).join('');
  const ranCount = record.items.filter(it => it.actualSecs != null).length;
  return `<div class="reflect-history-row">
    <div class="reflect-history-when">${pbEscapeHtml(pbFormatWhen(record.when))}</div>
    <div class="reflect-history-bar" role="img" aria-label="${pbEscapeHtml(t('pbui.builder.arcbalance'))}">${bar}</div>
    <div class="reflect-history-meta">${ranCount}/${record.items.length} · ${record.target}m ${pbEscapeHtml(t('pbui.reflect.planned'))}</div>
  </div>`;
}

// Re-renders the Reflect screen's "session just run" recap and session
// history regardless of which screen is currently visible — the same
// always-render-into-hidden-DOM approach pbRenderBuilder() already uses
// for the Pocketbook. Called from pbInit() (first load) and from the end
// of pbCloseRunMode() (a run just finished), so the Reflect screen is
// always current whenever it's actually navigated to.
function pbRenderReflectSummary() {
  const recap = document.getElementById('reflect-session-recap');
  const history = document.getElementById('reflect-history');
  if (!recap || !history) return;

  const records = pbLoadSessionRecords();
  if (!records.length) {
    recap.hidden = true;
    history.hidden = true;
    pbUpdateReflectExportGate();
    return;
  }

  const latest = records[0];
  recap.hidden = false;
  document.getElementById('reflect-recap-when').textContent = pbFormatWhen(latest.when);
  document.getElementById('reflect-recap-list').innerHTML = latest.items.map(pbRenderReflectRecapRow).join('');

  history.hidden = false;
  document.getElementById('reflect-history-list').innerHTML = records.map(pbRenderReflectHistoryRow).join('');

  pbUpdateReflectExportGate();
}

// ───────── REFLECT: SELF-REFLECTION ANSWERS + INDICATORS ─────────
// Both persist to localStorage so they (a) survive reload and (b) can be
// read straight out of the DOM by exportRenderPrintReport() at export
// time. Deliberately restored on load (pbRestoreReflectState(), called
// from pbInit()) — unlike pb_session/pb_session_mins, which intentionally
// never reload, these represent reflection already written down, not an
// in-progress plan, so losing them on refresh would be a regression.
function pbSaveReflectAnswer(idx, value) {
  try {
    const answers = JSON.parse(localStorage.getItem('f4y.reflect.answers') || '[]');
    answers[idx] = value;
    localStorage.setItem('f4y.reflect.answers', JSON.stringify(answers));
  } catch (e) {}
  pbUpdateReflectExportGate();
}
// Keyboard equivalent for the indicator rows' role="checkbox" (plain divs,
// same reasoning as pbActivityTriggerKeydown() above — no nested
// interactive elements here, but they weren't focusable or operable by
// keyboard at all before this pass, since toggleCheckV2() in router.js
// only ever wired a click handler).
function pbIndicatorKeydown(e, el, idx) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    pbToggleIndicator(el, idx);
  }
}
function pbToggleIndicator(el, idx) {
  const on = el.classList.toggle('checked');
  el.setAttribute('aria-checked', String(on));
  try {
    const flags = JSON.parse(localStorage.getItem('f4y.reflect.indicators') || '[]');
    flags[idx] = on;
    localStorage.setItem('f4y.reflect.indicators', JSON.stringify(flags));
  } catch (e) {}
  pbUpdateReflectExportGate();
}
function pbRestoreReflectState() {
  try {
    const answers = JSON.parse(localStorage.getItem('f4y.reflect.answers') || '[]');
    document.querySelectorAll('.reflect-answer').forEach((ta, i) => {
      if (typeof answers[i] === 'string') ta.value = answers[i];
    });
  } catch (e) {}
  try {
    const flags = JSON.parse(localStorage.getItem('f4y.reflect.indicators') || '[]');
    document.querySelectorAll('#mod-indicators .check-item-v2').forEach((el, i) => {
      if (flags[i]) {
        el.classList.add('checked');
        el.setAttribute('aria-checked', 'true');
      }
    });
  } catch (e) {}
  pbRestoreReflectMeta();
}

// ───────── REFLECT: EXTRA REPORT METADATA ─────────
// Free-form context (participant count, start time, place, institution,
// other notes) that isn't reflection content itself but is meant to appear
// in the exported report alongside it. Same persist-on-input /
// restore-on-load pattern as the reflection answers above, own
// localStorage key so it's independent of them.
const PB_REFLECT_META_FIELDS = [
  ['reflect-meta-participants', 'participants'],
  ['reflect-meta-start', 'start'],
  ['reflect-meta-place', 'place'],
  ['reflect-meta-institution', 'institution'],
  ['reflect-meta-other', 'other'],
];
function pbSaveReflectMeta() {
  const meta = {};
  PB_REFLECT_META_FIELDS.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) meta[key] = el.value;
  });
  try { localStorage.setItem('f4y.reflect.meta', JSON.stringify(meta)); } catch (e) {}
}
function pbRestoreReflectMeta() {
  let meta = {};
  try { meta = JSON.parse(localStorage.getItem('f4y.reflect.meta') || '{}') || {}; } catch (e) {}
  PB_REFLECT_META_FIELDS.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el && typeof meta[key] === 'string') el.value = meta[key];
  });
}
// Only fields with something actually typed, in report order — used by
// exportRenderPrintReport() so the "Session details" block is skipped
// entirely when nothing was filled in, rather than printing empty rows.
function pbLoadReflectMeta() {
  try { return JSON.parse(localStorage.getItem('f4y.reflect.meta') || '{}') || {}; } catch (e) { return {}; }
}

// (init invoked by pbInit() in main script)
function pbInit() {
  if (window.__pbInited) return;
  window.__pbInited = true;
  // pbLoadSession()/pbSessionMins intentionally NOT loaded from
  // localStorage: count always starts at 0 on page load so a returning
  // user is never shown a stale plan.
  pbRenderGroups();
  pbRenderFilters();
  pbRenderAdaptations();
  pbRenderBuilder();
  pbRefreshAddButtons();
  pbRestoreReflectState();
  pbRenderReflectSummary();
}


// ============================================================
// POCKETBOOK — init on DOM ready
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { pbInit(); } catch(e) { console.error('pbInit error', e); } });
} else {
  // Defer to next tick so pbInit definition lower in this script has been parsed
  Promise.resolve().then(() => { try { pbInit(); } catch(e) { console.error('pbInit error', e); } });
}
