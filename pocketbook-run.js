// ─── Pocketbook: Run Mode — the full-screen step-through-a-session state
//     machine (pbRunIndex/pbRunLog), its keyboard handling, its own timer,
//     and session-record persistence to localStorage on completion. ───
'use strict';

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

