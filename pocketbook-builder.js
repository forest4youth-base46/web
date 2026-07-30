// ─── Pocketbook: Session Builder — composing, timing, and reordering a
//     session (pbSession/pbSessionMins/pbSessionMeta state), plus the
//     arc-balance charts and mobile drawer. See pocketbook-activities.js
//     for the ACTIVITIES-rendering this reads from. ───
'use strict';

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
  try { localStorage.setItem('pb_session_mins', JSON.stringify(pbSessionMins)); } catch (e) { warnFailure('saving pb_session_mins to localStorage', e); }
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
  try { localStorage.setItem('pb_session', JSON.stringify(pbSession)); } catch (e) { warnFailure('saving pb_session to localStorage', e); }
}
function pbLoadSession() {
  try {
    const v = JSON.parse(localStorage.getItem('pb_session') || '[]');
    if (Array.isArray(v)) pbSession = v.filter(id => ACTIVITIES.find(a => a.id === id));
  } catch (e) { warnFailure('loading pb_session from localStorage (corrupted or blocked)', e); }
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

