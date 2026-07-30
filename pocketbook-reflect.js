// ─── Pocketbook: Reflect — post-session recap/history rendering,
//     self-reflection answers, observable-indicator checkboxes, and the
//     extra report metadata (site/practitioner/etc.) feeding the report
//     export in pocketbook-export.js. ───
'use strict';

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
  } catch (e) { warnFailure('formatting a session timestamp, showing the raw value instead', e); return iso; }
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
  } catch (e) { warnFailure('saving f4y.reflect.answers to localStorage', e); }
  pbUpdateReflectExportGate();
}
// Keyboard equivalent for the indicator rows' role="checkbox" (plain divs,
// same reasoning as pbActivityTriggerKeydown() above — no nested
// interactive elements here, but they weren't focusable or operable by
// keyboard at all before this pass, since the toggle only ever wired a
// click handler).
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
  } catch (e) { warnFailure('saving f4y.reflect.indicators to localStorage', e); }
  pbUpdateReflectExportGate();
}
function pbRestoreReflectState() {
  try {
    const answers = JSON.parse(localStorage.getItem('f4y.reflect.answers') || '[]');
    document.querySelectorAll('.reflect-answer').forEach((ta, i) => {
      if (typeof answers[i] === 'string') ta.value = answers[i];
    });
  } catch (e) { warnFailure('restoring f4y.reflect.answers from localStorage (corrupted or blocked)', e); }
  try {
    const flags = JSON.parse(localStorage.getItem('f4y.reflect.indicators') || '[]');
    document.querySelectorAll('#mod-indicators .check-item-v2').forEach((el, i) => {
      if (flags[i]) {
        el.classList.add('checked');
        el.setAttribute('aria-checked', 'true');
      }
    });
  } catch (e) { warnFailure('restoring f4y.reflect.indicators from localStorage (corrupted or blocked)', e); }
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
  try { localStorage.setItem('f4y.reflect.meta', JSON.stringify(meta)); } catch (e) { warnFailure('saving f4y.reflect.meta to localStorage', e); }
}
function pbRestoreReflectMeta() {
  let meta = {};
  try { meta = JSON.parse(localStorage.getItem('f4y.reflect.meta') || '{}') || {}; } catch (e) { warnFailure('restoring f4y.reflect.meta from localStorage (corrupted or blocked)', e); }
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
