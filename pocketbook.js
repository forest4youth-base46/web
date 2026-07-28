// ─── App logic: render, accordion, timer, pbSession builder ───
'use strict';

// ───────── RENDER ─────────
function pbFmtDuration(a) {
  if (a.durLabel) return a.durLabel;
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
const PB_LABELS_EN = {
  purpose: 'Purpose', materials: 'Materials', introduce: 'How to introduce',
  close: 'How to close', suitable: 'Suitable for',
};

function pbRenderGroups() {
  const root = document.getElementById('pb-groups');
  const html = GROUPS.map(g => {
    const items = ACTIVITIES.filter(a => a.group === g.id);
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
  root.innerHTML = html;
}

function pbRenderActivity(a) {
  const dur = pbFmtDuration(a);
  const showTimer = a.durAvg > 0;
  return `
    <article class="pb-activity-item" id="pb-act-${a.id}" data-group="${a.group}">
      <div class="pb-activity-trigger" onclick="pbToggleActivity('${a.id}')">
        <div class="pb-activity-glyph">${GLYPH[a.glyph] || ''}</div>
        <div class="pb-activity-name">${pbT(a, 'name')}</div>
        <div class="pb-activity-meta">
          <span class="pb-activity-duration">${dur}</span>
          ${showTimer ? `<button class="pb-timer-icon" title="Start timer" onclick="event.stopPropagation(); pbStartTimer('${a.id}')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
              <circle cx="8" cy="9" r="5.5"/><path d="M8 9V6"/><path d="M6 2h4"/><path d="M8 2v1.5"/>
            </svg>
          </button>` : ''}
          <button class="pb-add-icon" title="Add to pbSession" onclick="event.stopPropagation(); pbToggleInSession('${a.id}')" data-add="${a.id}">+</button>
          <svg class="pb-chevron" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>
        </div>
      </div>
      <div class="pb-activity-detail">
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
          <div class="pb-detail-text"><div class="pb-detail-tags">${a.tags.map(t => `<span class="pb-detail-tag">${pbTagT(t)}</span>`).join('')}</div></div>
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

// ───────── ACCORDION ─────────
function pbToggleActivity(id) {
  const item = document.getElementById('pb-act-' + id);
  const wasOpen = item.classList.contains('open');
  document.querySelectorAll('.pb-activity-item').forEach(a => a.classList.remove('open'));
  if (!wasOpen) {
    item.classList.add('open');
    // Re-inject SVG fresh so SMIL animations start from zero on each open
    const visualEl = item.querySelector('.pb-activity-visual[data-visual]');
    if (visualEl) {
      const key = visualEl.dataset.visual;
      const captionEl = visualEl.querySelector('.pb-visual-caption');
      const captionHTML = captionEl ? captionEl.outerHTML : '';
      visualEl.innerHTML = (VISUAL[key] || '') + captionHTML;
    }
  }
}

// ───────── SESSION BUILDER ─────────
let pbSession = []; // array of activity ids in chosen order

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
    btn.title = inSession ? 'Remove from pbSession' : 'Add to pbSession';
  });
}

function pbRemoveFromSession(id) {
  pbSession = pbSession.filter(x => x !== id);
  pbSaveSession();
  pbRenderBuilder();
  pbRefreshAddButtons();
}

function pbClearSession() {
  if (pbSession.length && !confirm('Clear all activities from the pbSession?')) return;
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
  const totalMin = pbSession.reduce((sum, id) => {
    const a = ACTIVITIES.find(x => x.id === id);
    return sum + (a ? a.durMax : 0);
  }, 0);

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

  // Toggle PDF / PNG export buttons alongside Clear / Run mode.
  const empty = pbSession.length === 0;
  const pdfBtn = document.getElementById('pb-export-pdf');
  const pngBtn = document.getElementById('pb-export-png');
  if (pdfBtn) pdfBtn.disabled = empty;
  if (pngBtn) pngBtn.disabled = empty;

  // Arc balance bar
  const groupTime = [0, 0, 0, 0, 0, 0]; // index 0 unused
  pbSession.forEach(id => {
    const a = ACTIVITIES.find(x => x.id === id);
    if (a) groupTime[a.group] += a.durMax || 5; // roles/project as 5 for visualization
  });
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
    ? '<span style="opacity:0.5">All five themes will appear as you add.</span>'
    : legendEntries.map(g => {
        const grp = GROUPS.find(x => x.id === g);
        const colors = { 1:'var(--forest-soft)', 2:'var(--forest-mid)', 3:'var(--forest-deep)', 4:'var(--bark)', 5:'var(--ember)' };
        return `<span class="pb-arc-legend-item"><span class="pb-arc-dot" style="background:${colors[g]}"></span>${pbGroupT(grp, 'title')}</span>`;
      }).join('');

  // List
  if (pbSession.length === 0) {
    list.innerHTML = `
      <div class="pb-builder-empty">
        <svg class="pb-builder-empty-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 8h24M6 14h24M6 20h16M6 26h12"/>
          <circle cx="28" cy="26" r="4"/>
          <path d="M28 24v4M26 26h4"/>
        </svg>
        <div>No activities yet.<br>Tap <strong>+</strong> next to any activity to begin.</div>
      </div>`;
  } else {
    const colors = { 1:'var(--forest-soft)', 2:'var(--forest-mid)', 3:'var(--forest-deep)', 4:'var(--bark)', 5:'var(--ember)' };
    list.innerHTML = pbSession.map((id, i) => {
      const a = ACTIVITIES.find(x => x.id === id);
      if (!a) return '';
      return `
        <div class="pb-builder-row" draggable="true" data-id="${id}" data-idx="${i}"
             ondragstart="pbOnDragStart(event)" ondragover="pbOnDragOver(event)"
             ondrop="pbOnDrop(event)" ondragend="pbOnDragEnd(event)">
          <span class="pb-builder-row-handle">⋮⋮</span>
          <span class="pb-builder-row-group" style="background:${colors[a.group]}" title="Group ${a.group}: ${pbGroupT(GROUPS[a.group-1], 'title')}"></span>
          <span class="pb-builder-row-name">${pbT(a, 'name')}</span>
          <span class="pb-builder-row-dur">${a.durMax ? a.durMax + 'm' : '—'}</span>
          <span class="pb-builder-row-move">
            <button class="pb-move-btn" onclick="pbMoveUp(${i})" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move ${pbT(a, 'name')} up">▲</button>
            <button class="pb-move-btn" onclick="pbMoveDown(${i})" ${i === pbSession.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move ${pbT(a, 'name')} down">▼</button>
          </span>
          <button class="pb-builder-row-remove" onclick="pbRemoveFromSession('${id}')" title="Remove">×</button>
        </div>`;
    }).join('');
  }

  document.getElementById('pb-btn-clear').disabled = pbSession.length === 0;
  document.getElementById('pb-btn-export').disabled = pbSession.length === 0;
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
  const lines = ['SESSION PLAN', '='.repeat(40), ''];
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
  lines.push(`Total: ${pbSession.length} activities · ${total} min`);
  const txt = lines.join('\n');

  navigator.clipboard?.writeText(txt).then(() => {
    pbShowToast('Session plan copied to clipboard');
  }).catch(() => {
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pbSession-plan.txt';
    a.click();
    URL.revokeObjectURL(url);
    pbShowToast('Session plan downloaded');
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
  pauseBtn.textContent = 'Pause';
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
  document.getElementById('pb-pauseBtn').textContent = pbTimerPaused ? 'Resume' : 'Pause';
}

function pbCloseTimer() {
  document.getElementById('pb-timerModal').classList.remove('active');
  if (pbTimerInterval) clearInterval(pbTimerInterval);
  document.getElementById('pb-pauseBtn').textContent = 'Pause';
  document.getElementById('pb-timerProgress').style.stroke = '';
}

// ───────── MOBILE BUILDER ─────────
function pbToggleBuilderMobile() {
  if (window.innerWidth > 1100) return;          // align with CSS breakpoint
  const builder = document.getElementById('pb-builder');
  const fab = document.getElementById('pb-fab');
  const isOpen = builder.classList.toggle('expanded');
  if (fab) fab.classList.toggle('open', isOpen);
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

function exportRenderPrintSession() {
  const root = document.getElementById('print-session');
  if (!root) return;
  const lang = typeof currentLang === 'string' ? currentLang : 'en';
  const items = pbSession.map(id => ACTIVITIES.find(a => a.id === id)).filter(Boolean);
  const totalMin = items.reduce((s, a) => s + (a.durAvg || 0), 0);
  const date = new Date().toLocaleDateString(lang);
  const tHead = (T[lang] && T[lang]['header.title']) || 'Forest4Youth Practice Guide';
  const tQrLabel = (T[lang] && T[lang]['export.qr.label']) || 'Scan to reopen';

  root.innerHTML =
    '<div class="print-header">' +
      '<div style="font-size:18px;font-weight:700;">' + tHead + '</div>' +
      '<div style="font-size:13px;color:#555;margin-top:4px;">' +
        date + ' · ' + items.length + ' activities · ~' + totalMin + ' min' +
      '</div>' +
    '</div>' +
    items.map((a, i) =>
      '<div class="print-row">' +
        '<div style="width:28px;font-weight:700;color:#666;">' + (i + 1) + '.</div>' +
        '<div style="flex:1;">' +
          '<div class="print-row-name">' + pbT(a, 'name') + '</div>' +
          '<div class="print-row-meta">Group ' + a.group + ' · ' +
            a.durMin + '–' + a.durMax + ' min · ' + pbT(a, 'caption') + '</div>' +
        '</div>' +
      '</div>'
    ).join('') +
    '<div class="print-footer">' +
      '<div>' +
        '<div>Forest4Youth Practice Guide</div>' +
        '<div style="margin-top:4px;">' + tQrLabel + '</div>' +
      '</div>' +
      '<div id="print-qr-slot"></div>' +
    '</div>';

  const qrNode = exportGenerateSessionQRNode();
  const slot = root.querySelector('#print-qr-slot');
  if (qrNode && slot) slot.appendChild(qrNode);
}

function exportRunPDF() {
  if (!pbSession.length) return;
  exportRenderPrintSession();
  // Brief defer so any pending re-renders settle before the print dialog blocks.
  setTimeout(() => { window.print(); }, 50);
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
    alert('PNG export failed. Try Print to PDF instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

// ───────── KEY HANDLERS ─────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('pb-timerModal');
    if (modal.classList.contains('active')) pbCloseTimer();
    else if (document.getElementById('pb-runMode').classList.contains('active')) pbCloseRunMode();
  }
  if (document.getElementById('pb-runMode').classList.contains('active')) {
    if (e.key === 'ArrowLeft') pbRunPrev();
    else if (e.key === 'ArrowRight') pbRunNext();
  }
});

// ───────── RUN MODE ─────────
let pbRunIndex = 0;
function pbStartRunMode() {
  if (!pbSession.length) return;
  pbRunIndex = 0;
  document.getElementById('pb-runMode').classList.add('active');
  document.body.classList.add('pb-run-active');
  pbRenderRunStep();
}
function pbCloseRunMode() {
  document.getElementById('pb-runMode').classList.remove('active');
  document.body.classList.remove('pb-run-active');
  if (document.getElementById('pb-timerModal').classList.contains('active')) pbCloseTimer();
  pbRunTimerStop();
}
function pbRunPrev() { if (pbRunIndex > 0) { pbRunIndex--; pbRenderRunStep(); } }
function pbRunNext() {
  if (pbRunIndex < pbSession.length - 1) { pbRunIndex++; pbRenderRunStep(); }
  else pbCloseRunMode();
}

// ── Inline run-mode timer (continuous, top-threshold) ──
let pbRunTimerInterval = null;
let pbRunTimerTotal = 0;
let pbRunTimerSeconds = 0;
let pbRunTimerPaused = false;

function pbRunTimerStart(minutes) {
  pbRunTimerStop();
  pbRunTimerTotal = minutes * 60;
  pbRunTimerSeconds = pbRunTimerTotal;
  pbRunTimerPaused = false;
  const wrap = document.getElementById('pb-runTimer');
  wrap.classList.remove('done','paused');
  document.getElementById('pb-runTimerPause').textContent = 'Pause';
  pbRunTimerRender();
  pbRunTimerInterval = setInterval(() => {
    if (pbRunTimerPaused) return;
    pbRunTimerSeconds--;
    pbRunTimerRender();
    if (pbRunTimerSeconds <= 0) {
      clearInterval(pbRunTimerInterval);
      pbRunTimerInterval = null;
      document.getElementById('pb-runTimer').classList.add('done');
      document.getElementById('pb-runTimerHint').textContent = 'Time complete · move when ready.';
    }
  }, 1000);
}
function pbRunTimerStop() {
  if (pbRunTimerInterval) { clearInterval(pbRunTimerInterval); pbRunTimerInterval = null; }
}
function pbRunTimerRender() {
  const s = Math.max(0, pbRunTimerSeconds);
  const mm = String(Math.floor(s / 60)).padStart(2,'0');
  const ss = String(s % 60).padStart(2,'0');
  document.getElementById('pb-runTimerDisplay').textContent = `${mm}:${ss}`;
  const pct = pbRunTimerTotal > 0 ? (s / pbRunTimerTotal) * 100 : 0;
  document.getElementById('pb-runTimerFill').style.width = pct + '%';
}
function pbRunTimerPause() {
  if (!pbRunTimerInterval && pbRunTimerSeconds <= 0) return;
  pbRunTimerPaused = !pbRunTimerPaused;
  document.getElementById('pb-runTimerPause').textContent = pbRunTimerPaused ? 'Resume' : 'Pause';
  document.getElementById('pb-runTimer').classList.toggle('paused', pbRunTimerPaused);
}
function pbRunTimerReset() {
  const id = pbSession[pbRunIndex];
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a) return;
  const mins = a.durMax || a.durAvg;
  if (!mins) return;
  pbRunTimerStart(mins);
}

function pbRenderRunStep() {
  const id = pbSession[pbRunIndex];
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a) return;
  const grp = GROUPS[a.group - 1];
  document.getElementById('pb-runStep').textContent = `${pbRunIndex+1} / ${pbSession.length}`;
  document.getElementById('pb-runGroup').textContent = grp ? pbGroupT(grp, 'title') : '';
  document.getElementById('pb-runName').textContent = pbT(a, 'name');
  document.getElementById('pb-runDuration').textContent = pbFmtDuration(a);
  document.getElementById('pb-runPurpose').textContent = pbT(a, 'purpose') || '';
  document.getElementById('pb-runIntro').textContent = pbT(a, 'intro') || '';
  document.getElementById('pb-runMaterials').textContent = pbT(a, 'materials') || '';
  document.getElementById('pb-runClose').textContent = pbT(a, 'close') || '';
  document.getElementById('pb-runPrev').disabled = (pbRunIndex === 0);
  document.getElementById('pb-runNext').textContent = (pbRunIndex === pbSession.length - 1) ? 'Finish' : 'Next →';
  // Auto-start the inline timer for this step using the top duration threshold
  const timerWrap = document.getElementById('pb-runTimer');
  const mins = a.durMax || a.durAvg;
  if (mins && mins > 0) {
    timerWrap.classList.remove('untimed');
    document.getElementById('pb-runTimerHint').textContent = `Counts down ${mins} min · advance when ready.`;
    pbRunTimerStart(mins);
  } else {
    timerWrap.classList.add('untimed');
    pbRunTimerStop();
  }
}

// (init invoked by pbInit() in main script)
function pbInit() {
  if (window.__pbInited) return;
  window.__pbInited = true;
  // pbLoadSession() intentionally NOT called: count always starts at 0
  // on page load so a returning user is never shown a stale count.
  pbRenderGroups();
  pbRenderAdaptations();
  pbRenderBuilder();
  pbRefreshAddButtons();
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
