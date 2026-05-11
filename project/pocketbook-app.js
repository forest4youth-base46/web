// ─── App logic: render, accordion, timer, session builder ───
'use strict';

// ───────── RENDER ─────────
function fmtDuration(a) {
  if (a.durLabel) return a.durLabel;
  if (a.durMin === a.durMax) return `${a.durMin} min`;
  return `${a.durMin}–${a.durMax} min`;
}

function renderGroups() {
  const root = document.getElementById('groups');
  const html = GROUPS.map(g => {
    const items = ACTIVITIES.filter(a => a.group === g.id);
    return `
      <section class="pocket-group">
        <header class="pocket-group-header">
          <div class="pocket-group-headline">
            <span class="pocket-group-num">${g.num}.</span>
            <h2 class="pocket-group-title">${g.title}</h2>
          </div>
          <span class="pocket-group-meta">${g.meta}</span>
        </header>
        <div class="activity-list">
          ${items.map(renderActivity).join('')}
        </div>
      </section>
    `;
  }).join('');
  root.innerHTML = html;
}

function renderActivity(a) {
  const dur = fmtDuration(a);
  const showTimer = a.durAvg > 0;
  return `
    <article class="activity-item" id="act-${a.id}" data-group="${a.group}">
      <div class="activity-trigger" onclick="toggleActivity('${a.id}')">
        <div class="activity-glyph">${GLYPH[a.glyph] || ''}</div>
        <div class="activity-name">${a.name}</div>
        <div class="activity-meta">
          <span class="activity-duration">${dur}</span>
          ${showTimer ? `<button class="timer-icon" title="Start timer" onclick="event.stopPropagation(); startTimer('${a.id}')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
              <circle cx="8" cy="9" r="5.5"/><path d="M8 9V6"/><path d="M6 2h4"/><path d="M8 2v1.5"/>
            </svg>
          </button>` : ''}
          <button class="add-icon" title="Add to session" onclick="event.stopPropagation(); toggleInSession('${a.id}')" data-add="${a.id}">+</button>
          <svg class="chevron" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>
        </div>
      </div>
      <div class="activity-detail">
        <div class="activity-visual">
          ${VISUAL[a.visual] || ''}
          <div class="visual-caption">${a.caption}</div>
        </div>
        <div class="detail-grid">
          <div class="detail-label">Purpose</div>
          <div class="detail-text">${a.purpose}</div>
          <div class="detail-label">Materials</div>
          <div class="detail-text">${a.materials}</div>
          <div class="detail-label">How to introduce</div>
          <div class="detail-text"><div class="detail-text--example">${a.intro}</div></div>
          <div class="detail-label">How to close</div>
          <div class="detail-text">${a.close || ''}</div>
          <div class="detail-label">Suitable for</div>
          <div class="detail-text"><div class="detail-tags">${a.tags.map(t => `<span class="detail-tag">${t}</span>`).join('')}</div></div>
        </div>
      </div>
    </article>
  `;
}

function renderAdaptations() {
  document.getElementById('adaptations-table').innerHTML = ADAPTATIONS.map(r => `
    <div class="adapt-row">
      <div class="adapt-label">${r.label}</div>
      <div class="adapt-text">${r.text}</div>
    </div>
  `).join('');
}

// ───────── ACCORDION ─────────
function toggleActivity(id) {
  const item = document.getElementById('act-' + id);
  const wasOpen = item.classList.contains('open');
  document.querySelectorAll('.activity-item').forEach(a => a.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
}

// ───────── SESSION BUILDER ─────────
let session = []; // array of activity ids in chosen order

function toggleInSession(id) {
  const idx = session.indexOf(id);
  if (idx >= 0) session.splice(idx, 1);
  else session.push(id);
  saveSession();
  renderBuilder();
  refreshAddButtons();
}

function refreshAddButtons() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    const id = btn.getAttribute('data-add');
    const inSession = session.includes(id);
    btn.classList.toggle('in-session', inSession);
    btn.textContent = inSession ? '✓' : '+';
    btn.title = inSession ? 'Remove from session' : 'Add to session';
  });
}

function removeFromSession(id) {
  session = session.filter(x => x !== id);
  saveSession();
  renderBuilder();
  refreshAddButtons();
}

function clearSession() {
  if (session.length && !confirm('Clear all activities from the session?')) return;
  session = [];
  saveSession();
  renderBuilder();
  refreshAddButtons();
}

function saveSession() {
  try { localStorage.setItem('pb_session', JSON.stringify(session)); } catch (e) {}
}
function loadSession() {
  try {
    const v = JSON.parse(localStorage.getItem('pb_session') || '[]');
    if (Array.isArray(v)) session = v.filter(id => ACTIVITIES.find(a => a.id === id));
  } catch (e) {}
}

function renderBuilder() {
  const list = document.getElementById('builder-list');
  const totalMin = session.reduce((sum, id) => {
    const a = ACTIVITIES.find(x => x.id === id);
    return sum + (a ? a.durAvg : 0);
  }, 0);

  document.getElementById('stat-count').textContent = session.length;
  document.getElementById('stat-time').textContent = totalMin;

  // Arc balance bar
  const groupTime = [0, 0, 0, 0, 0, 0]; // index 0 unused
  session.forEach(id => {
    const a = ACTIVITIES.find(x => x.id === id);
    if (a) groupTime[a.group] += a.durAvg || 5; // roles/project as 5 for visualization
  });
  const sumTime = groupTime.reduce((s, x) => s + x, 0) || 1;
  const bar = document.getElementById('arc-bar');
  bar.innerHTML = '';
  const legendEntries = [];
  for (let g = 1; g <= 5; g++) {
    if (groupTime[g] > 0) {
      const seg = document.createElement('div');
      seg.className = 'arc-segment';
      seg.dataset.group = g;
      seg.style.flex = String(groupTime[g] / sumTime);
      bar.appendChild(seg);
      legendEntries.push(g);
    }
  }
  const legend = document.getElementById('arc-legend');
  legend.innerHTML = legendEntries.length === 0
    ? '<span style="opacity:0.5">All five themes will appear as you add.</span>'
    : legendEntries.map(g => {
        const grp = GROUPS.find(x => x.id === g);
        const colors = { 1:'var(--forest-soft)', 2:'var(--forest-mid)', 3:'var(--forest-deep)', 4:'var(--bark)', 5:'var(--ember)' };
        return `<span class="arc-legend-item"><span class="arc-dot" style="background:${colors[g]}"></span>${grp.title}</span>`;
      }).join('');

  // List
  if (session.length === 0) {
    list.innerHTML = `
      <div class="builder-empty">
        <svg class="builder-empty-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 8h24M6 14h24M6 20h16M6 26h12"/>
          <circle cx="28" cy="26" r="4"/>
          <path d="M28 24v4M26 26h4"/>
        </svg>
        <div>No activities yet.<br>Tap <strong>+</strong> next to any activity to begin.</div>
      </div>`;
  } else {
    const colors = { 1:'var(--forest-soft)', 2:'var(--forest-mid)', 3:'var(--forest-deep)', 4:'var(--bark)', 5:'var(--ember)' };
    list.innerHTML = session.map((id, i) => {
      const a = ACTIVITIES.find(x => x.id === id);
      if (!a) return '';
      return `
        <div class="builder-row" draggable="true" data-id="${id}" data-idx="${i}"
             ondragstart="onDragStart(event)" ondragover="onDragOver(event)"
             ondrop="onDrop(event)" ondragend="onDragEnd(event)">
          <span class="builder-row-handle">⋮⋮</span>
          <span class="builder-row-group" style="background:${colors[a.group]}" title="Group ${a.group}: ${GROUPS[a.group-1].title}"></span>
          <span class="builder-row-name">${a.name}</span>
          <span class="builder-row-dur">${a.durAvg ? a.durAvg + 'm' : '—'}</span>
          <button class="builder-row-remove" onclick="removeFromSession('${id}')" title="Remove">×</button>
        </div>`;
    }).join('');
  }

  document.getElementById('btn-clear').disabled = session.length === 0;
  document.getElementById('btn-export').disabled = session.length === 0;
}

// ───────── DRAG REORDER ─────────
let dragSrcIdx = null;
function onDragStart(e) {
  dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onDrop(e) {
  e.preventDefault();
  const tgtIdx = parseInt(e.currentTarget.dataset.idx);
  if (dragSrcIdx === null || dragSrcIdx === tgtIdx) return;
  const moved = session.splice(dragSrcIdx, 1)[0];
  session.splice(tgtIdx, 0, moved);
  saveSession();
  renderBuilder();
}
function onDragEnd(e) { e.currentTarget.style.opacity = ''; dragSrcIdx = null; }

// ───────── EXPORT ─────────
function exportSession() {
  const lines = ['SESSION PLAN', '='.repeat(40), ''];
  let total = 0;
  session.forEach((id, i) => {
    const a = ACTIVITIES.find(x => x.id === id);
    if (!a) return;
    const grp = GROUPS[a.group - 1];
    lines.push(`${i+1}. ${a.name}  (${fmtDuration(a)})`);
    lines.push(`   ${grp.title}`);
    lines.push(`   ${a.purpose}`);
    lines.push('');
    total += a.durAvg || 0;
  });
  lines.push('-'.repeat(40));
  lines.push(`Total: ${session.length} activities · ${total} min`);
  const txt = lines.join('\n');

  navigator.clipboard?.writeText(txt).then(() => {
    showToast('Session plan copied to clipboard');
  }).catch(() => {
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'session-plan.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Session plan downloaded');
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ───────── TIMER ─────────
let timerInterval = null;
let timerTotal = 0;
let timerSeconds = 0;
let timerPaused = false;
const RING_CIRCUM = 2 * Math.PI * 82; // ≈515.22

function startTimer(id) {
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a || !a.durAvg) return;
  // Use the highest threshold of the activity's duration range
  const minutes = a.durMax || a.durAvg;
  const modal = document.getElementById('timerModal');
  const nameEl = document.getElementById('timerActivityName');
  const pauseBtn = document.getElementById('pauseBtn');

  timerTotal = minutes * 60;
  timerSeconds = timerTotal;
  timerPaused = false;
  nameEl.textContent = a.name;
  pauseBtn.textContent = 'Pause';
  modal.classList.add('active');

  updateTimerDisplay();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (timerPaused) return;
    timerSeconds--;
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      const ring = document.getElementById('timerProgress');
      ring.style.stroke = 'var(--ember)';
    }
  }, 1000);
}

function updateTimerDisplay() {
  const display = document.getElementById('timerDisplay');
  const ring = document.getElementById('timerProgress');
  const mins = Math.floor(Math.max(0, timerSeconds) / 60);
  const secs = Math.max(0, timerSeconds) % 60;
  display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const pct = timerTotal > 0 ? Math.max(0, timerSeconds / timerTotal) : 0;
  ring.style.strokeDashoffset = String(RING_CIRCUM * (1 - pct));
}

function pauseTimer() {
  timerPaused = !timerPaused;
  document.getElementById('pauseBtn').textContent = timerPaused ? 'Resume' : 'Pause';
}

function closeTimer() {
  document.getElementById('timerModal').classList.remove('active');
  if (timerInterval) clearInterval(timerInterval);
  document.getElementById('pauseBtn').textContent = 'Pause';
  document.getElementById('timerProgress').style.stroke = '';
}

// ───────── MOBILE BUILDER ─────────
function toggleBuilderMobile() {
  if (window.innerWidth > 1080) return;
  document.getElementById('builder').classList.toggle('expanded');
}

// ───────── KEY HANDLERS ─────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('timerModal');
    if (modal.classList.contains('active')) closeTimer();
    else if (document.getElementById('runMode').classList.contains('active')) closeRunMode();
  }
  if (document.getElementById('runMode').classList.contains('active')) {
    if (e.key === 'ArrowLeft') runPrev();
    else if (e.key === 'ArrowRight') runNext();
  }
});

// ───────── RUN MODE ─────────
let runIndex = 0;
function startRunMode() {
  if (!session.length) return;
  runIndex = 0;
  document.getElementById('runMode').classList.add('active');
  renderRunStep();
}
function closeRunMode() {
  document.getElementById('runMode').classList.remove('active');
  if (document.getElementById('timerModal').classList.contains('active')) closeTimer();
}
function runPrev() { if (runIndex > 0) { runIndex--; renderRunStep(); } }
function runNext() {
  if (runIndex < session.length - 1) { runIndex++; renderRunStep(); }
  else closeRunMode();
}
function runTimer() {
  const id = session[runIndex];
  if (id) startTimer(id);
}
function renderRunStep() {
  const id = session[runIndex];
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a) return;
  const grp = GROUPS[a.group - 1];
  document.getElementById('runStep').textContent = `${runIndex+1} / ${session.length}`;
  document.getElementById('runGroup').textContent = grp ? grp.title : '';
  document.getElementById('runName').textContent = a.name;
  document.getElementById('runDuration').textContent = fmtDuration(a);
  document.getElementById('runPurpose').textContent = a.purpose || '';
  document.getElementById('runIntro').textContent = a.intro || '';
  document.getElementById('runMaterials').textContent = a.materials || '';
  document.getElementById('runClose').textContent = a.close || '';
  document.getElementById('runPrev').disabled = (runIndex === 0);
  document.getElementById('runNext').textContent = (runIndex === session.length - 1) ? 'Finish' : 'Next →';
  const hasTimer = !!(a.durMax || a.durAvg);
  document.getElementById('runTimerBtn').style.display = hasTimer ? '' : 'none';
}

// ───────── INIT ─────────
loadSession();
renderGroups();
renderAdaptations();
renderBuilder();
refreshAddButtons();
