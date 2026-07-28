// ─────────────────────────────────────────
// SEARCH DIALOG (⌘K / Ctrl+K)
// ─────────────────────────────────────────
// Indexes activities + a first pass of reference/guide content, all read
// live through t()/pbT() so results always match the active language and
// the DOM's current i18n state — nothing here duplicates English strings.
// A fuller reference index (dosage, integration, populations, glossary)
// is a follow-up task; this covers ACTIVITIES, the clinical-indications /
// contraindications tiers, and the guide's 14 chapter titles.
'use strict';

let searchOpen = false;
let searchTriggerEl = null;

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ───────── INDEX BUILDERS ─────────
// Each returns { category, title, sub, keywords, action() }. Built fresh
// every time the dialog opens/filters, so a language switch mid-session
// is always reflected.

function searchActivityEntries() {
  if (typeof ACTIVITIES === 'undefined') return [];
  return ACTIVITIES.map(function(a) {
    const name = pbT(a, 'name');
    const purpose = pbT(a, 'purpose') || '';
    return {
      category: t('search.cat.activities'),
      title: name,
      sub: purpose,
      keywords: (name + ' ' + purpose).toLowerCase(),
      action: function() { searchGoToActivity(a.id); }
    };
  });
}

function searchReferenceEntries() {
  const out = [];
  // ref.ind.*.name (wrapping span, first child of its <h4>) + ref.adj.*.name
  // and ref.flag.*.name (data-i18n directly on the <h4>) all live in
  // #mod-indications; ref.con.*.h entries (absolute/relative/competency)
  // live in #mod-contraindications, always as data-i18n directly on <h4>.
  const nodes = document.querySelectorAll(
    '#mod-indications h4[data-i18n], ' +
    '#mod-indications h4 > span[data-i18n]:first-child, ' +
    '#mod-contraindications h4[data-i18n]'
  );
  nodes.forEach(function(node) {
    const key = node.getAttribute('data-i18n');
    const title = t(key);
    if (!title) return;
    const block = node.closest('.indication-block, .warn-block') || node;
    out.push({
      category: t('search.cat.reference'),
      title: title,
      sub: t('ref.heading'),
      keywords: title.toLowerCase(),
      action: function() { searchNavigateToElement('reference', block); }
    });
  });
  return out;
}

function searchGuideEntries() {
  const out = [];
  document.querySelectorAll('.guide-chapter[data-chapter-id]').forEach(function(a) {
    const titleEl = a.querySelector('.guide-chapter-title span[data-i18n]');
    if (!titleEl) return;
    const title = t(titleEl.getAttribute('data-i18n'));
    const chapterId = a.getAttribute('data-chapter-id');
    const m = /openChapter\('([^']+)'\s*,\s*(\d+)\)/.exec(a.getAttribute('href') || '');
    const page = m ? parseInt(m[2], 10) : undefined;
    out.push({
      category: t('search.cat.guide'),
      title: title,
      sub: t('guide.heading'),
      keywords: title.toLowerCase(),
      action: function() {
        closeSearchDialog();
        if (currentRole !== 'practitioner') setRole('practitioner');
        openChapter(chapterId, page);
      }
    });
  });
  return out;
}

function searchCollectEntries() {
  return [].concat(searchActivityEntries(), searchReferenceEntries(), searchGuideEntries());
}

// ───────── NAVIGATION ─────────
function searchGoToActivity(id) {
  closeSearchDialog();
  if (currentRole !== 'practitioner') setRole('practitioner');
  const targetHash = 'implement/mod-pocket';
  if (window.location.hash.replace('#', '') !== targetHash) {
    window.location.hash = targetHash;
  }
  setTimeout(function() {
    if (typeof pbToggleActivity === 'function') pbToggleActivity(id);
    const el = document.getElementById('pb-act-' + id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('search-highlight');
      setTimeout(function() { el.classList.remove('search-highlight'); }, 2500);
    }
  }, 220);
}

function searchNavigateToElement(screenHash, el) {
  closeSearchDialog();
  if (currentRole !== 'practitioner') setRole('practitioner');
  if (window.location.hash.replace('#', '') !== screenHash) {
    window.location.hash = screenHash;
  }
  setTimeout(function() {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('search-highlight');
    setTimeout(function() { el.classList.remove('search-highlight'); }, 2500);
  }, 220);
}

// ───────── RENDER ─────────
function renderSearchResults(query) {
  const q = query.trim().toLowerCase();
  const entries = searchCollectEntries();
  const filtered = q ? entries.filter(function(e) { return e.keywords.indexOf(q) !== -1; }) : entries;
  const list = document.getElementById('search-results');
  const live = document.getElementById('search-live');
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = '<div class="search-empty">' + escapeHtml(t('search.empty')) + '</div>';
    if (live) live.textContent = t('search.count.zero');
    return;
  }

  const groups = [];
  filtered.forEach(function(e) {
    let g = groups[groups.length - 1];
    if (!g || g.category !== e.category) {
      g = { category: e.category, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  });

  let idx = 0;
  const indexed = [];
  list.innerHTML = groups.map(function(g) {
    return '<div class="search-group">' +
      '<div class="search-group-label">' + escapeHtml(g.category) + '</div>' +
      g.items.map(function(e) {
        indexed.push(e);
        const myIdx = idx++;
        return '<button type="button" class="search-result" data-idx="' + myIdx + '">' +
          '<div class="search-result-title">' + escapeHtml(e.title) + '</div>' +
          (e.sub ? '<div class="search-result-sub">' + escapeHtml(e.sub) + '</div>' : '') +
          '</button>';
      }).join('') +
      '</div>';
  }).join('');

  Array.prototype.forEach.call(list.querySelectorAll('.search-result'), function(btn) {
    const i = parseInt(btn.getAttribute('data-idx'), 10);
    btn.addEventListener('click', function() { indexed[i].action(); });
  });

  if (live) live.textContent = t('search.count').replace('{n}', String(filtered.length));
}

// ───────── OPEN / CLOSE ─────────
function openSearchDialog(trigger) {
  searchTriggerEl = trigger || document.activeElement;
  searchOpen = true;
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  if (!overlay || !input) return;
  overlay.classList.add('active');
  document.body.classList.add('no-scroll');
  input.value = '';
  renderSearchResults('');
  // rAF, not a plain synchronous focus() call, because the overlay just
  // switched from display:none to display:flex in this same tick — some
  // browsers won't accept a focus() on an element that was hidden a
  // moment ago until layout has actually happened.
  requestAnimationFrame(function() { input.focus(); });
}

function closeSearchDialog() {
  if (!searchOpen) return;
  searchOpen = false;
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.remove('active');
  document.body.classList.remove('no-scroll');
  const trigger = searchTriggerEl;
  searchTriggerEl = null;
  if (trigger && typeof trigger.focus === 'function') {
    trigger.focus();
    // Bounded one-shot retry: some browsers reset focus to <body> when an
    // overlay is hidden/removed, landing after this synchronous call.
    requestAnimationFrame(function() {
      if (document.activeElement !== trigger) trigger.focus();
    });
  }
}

// ───────── WIRING ─────────
(function() {
  const input = document.getElementById('search-input');
  if (input) {
    input.addEventListener('input', function(e) { renderSearchResults(e.target.value); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const first = document.querySelector('#search-results .search-result');
        if (first) { e.preventDefault(); first.click(); }
      }
    });
  }

  function getFocusable() {
    const dialog = document.getElementById('search-dialog');
    if (!dialog) return [];
    return Array.prototype.slice.call(
      dialog.querySelectorAll('input, button, [href], [tabindex]:not([tabindex="-1"])')
    ).filter(function(el) { return el.offsetParent !== null; });
  }

  // Global ⌘K / Ctrl+K toggle — router.js/pocketbook.js don't bind this
  // combination anywhere, so nothing to conflict with.
  document.addEventListener('keydown', function(e) {
    const isK = e.key === 'k' || e.key === 'K';
    if ((e.metaKey || e.ctrlKey) && isK) {
      e.preventDefault();
      if (searchOpen) closeSearchDialog();
      else openSearchDialog(document.activeElement);
      return;
    }
    if (!searchOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeSearchDialog();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
})();
