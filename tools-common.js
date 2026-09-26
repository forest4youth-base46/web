// ============================================================
// TOOLS — shared helpers for the Forest and IVN tool hubs
// ============================================================
// Used by fi-tools.js (#fi-screen) and ivn-tools.js (#ivn-screen).
// Each hub is a screen with tool cards; a tool opens at #fi/<tool> or
// #ivn/<tool> inside the same screen. Tool content comes from generated
// data (fi-tools-data.js, guide-ivn-data.js → GUIDE_IVN.tools); the UI
// chrome strings come from the i18n packs via t().

function toolEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Route helper: '#ivn/plan' → { hub: 'ivn', tool: 'plan', arg: undefined }.
function toolRoute() {
  const parts = window.location.hash.replace('#', '').split('/');
  return { hub: parts[0], tool: parts[1] || '', arg: parts[2] };
}

// Hub page: header + cards grouped by phase.
//   groups: [{ label, cards: [{ href, title, text, tone }] }]
function toolHub(opts) {
  return '<button class="back-btn" onclick="navigate(\'\')">← ' + toolEsc(t('nav.back')) + '</button>' +
    '<div class="section-header">' +
      '<div class="badge">' + toolEsc(opts.badge) + '</div>' +
      '<h2>' + toolEsc(opts.title) + '</h2>' +
      '<p class="section-sub">' + toolEsc(opts.sub) + '</p>' +
    '</div>' + (opts.intro || '') +
    opts.groups.map(g =>
      '<section class="hub-group"><h3 class="hub-group-label">' + toolEsc(g.label) + '</h3><div class="hub-grid">' +
      g.cards.map(c =>
        '<a class="hub-card' + (c.tone ? ' hub-card-' + c.tone : '') + '" href="' + c.href + '">' +
          '<span class="hub-card-title">' + toolEsc(c.title) + '</span>' +
          '<span class="hub-card-text">' + toolEsc(c.text) + '</span>' +
          '<span class="hub-card-go" aria-hidden="true">→</span></a>').join('') +
      '</div></section>').join('');
}

// Tool page frame: back link to the hub, title, lead, body.
function toolPage(opts) {
  return '<a class="hub-back" href="#' + opts.hub + '">← ' + toolEsc(opts.back) + '</a>' +
    '<div class="tool-head"><div class="badge">' + toolEsc(opts.kicker) + '</div>' +
    '<h2 class="tool-title" tabindex="-1">' + toolEsc(opts.title) + '</h2>' +
    (opts.lead ? '<p class="tool-lead">' + toolEsc(opts.lead) + '</p>' : '') + '</div>' +
    '<div class="tool-body">' + opts.body + '</div>';
}

function toolQuote(q) {
  return q ? '<figure class="gd-quote"><blockquote>' + toolEsc(q.text) + '</blockquote><figcaption>' + toolEsc(q.by) + '</figcaption></figure>' : '';
}

// Chip group. single: one choice at a time. Calls onchange(name, values[]).
function toolChips(name, options, selected, single) {
  const sel = [].concat(selected || []);
  return '<div class="gd-chips" role="group" data-name="' + toolEsc(name) + '"' + (single ? ' data-single="1"' : '') + '>' +
    options.map(o => '<button type="button" class="gd-chip" data-value="' + toolEsc(o) + '" aria-pressed="' + (sel.indexOf(o) !== -1) + '">' + toolEsc(o) + '</button>').join('') +
    '</div>';
}

// Delegated chip handling for a root element; calls cb(name, values).
function toolBindChips(root, cb) {
  root.addEventListener('click', function(e) {
    const chip = e.target.closest('.gd-chip');
    if (!chip || !root.contains(chip)) return;
    const wrap = chip.parentElement;
    const on = chip.getAttribute('aria-pressed') !== 'true';
    if (on && wrap.dataset.single) wrap.querySelectorAll('.gd-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', String(on));
    const values = Array.from(wrap.querySelectorAll('.gd-chip[aria-pressed="true"]')).map(c => c.dataset.value);
    if (cb && wrap.dataset.name) cb(wrap.dataset.name, values);
  });
}

// Tickable list; checked: array of booleans.
function toolChecklist(name, items, checked) {
  return '<ul class="gd-check" data-name="' + toolEsc(name) + '">' + items.map((it, i) => {
    const title = typeof it === 'string' ? it : it.title;
    const text = typeof it === 'string' ? '' : it.text;
    return '<li><button type="button" role="checkbox" data-i="' + i + '" aria-checked="' + !!(checked && checked[i]) + '">' +
      '<span class="gd-box" aria-hidden="true"></span><span>' +
      (text ? '<strong>' + toolEsc(title) + '</strong><span class="gd-check-sub">' + toolEsc(text) + '</span>' : toolEsc(title)) +
      '</span></button></li>';
  }).join('') + '</ul>';
}

function toolBindChecks(root, cb) {
  root.addEventListener('click', function(e) {
    const btn = e.target.closest('.gd-check button[role="checkbox"]');
    if (!btn || !root.contains(btn)) return;
    const on = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(on));
    const list = btn.closest('.gd-check');
    const values = Array.from(list.querySelectorAll('button[role="checkbox"]')).map(b => b.getAttribute('aria-checked') === 'true');
    if (cb) cb(list.dataset.name, values);
  });
}

function toolProgress(values) {
  const done = values.filter(Boolean).length;
  return '<span class="tool-progress">' + done + ' / ' + values.length + '</span>';
}

// Save a text file on the user's device (plain Blob download; nothing is
// uploaded anywhere).
function toolDownload(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  } catch (e) { warnFailure('downloading ' + filename, e); }
}

// Print just one element (styles-print rules in styles-tools.css show only
// .print-target while body.printing-tool is set).
function toolPrint(el) {
  if (!el) return;
  el.classList.add('print-target');
  document.body.classList.add('printing-tool');
  const done = () => {
    el.classList.remove('print-target');
    document.body.classList.remove('printing-tool');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1000);
}

function toolFocusTitle(root) {
  requestAnimationFrame(() => {
    const h = root.querySelector('.tool-title') || root.querySelector('h2');
    window.scrollToViewTop ? window.scrollToViewTop() : window.scrollTo(0, 0);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  });
}

function toolToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
