// ============================================================
// GUIDES — the forest and immersive-virtual-nature practical guides
// ============================================================
// Renders #guide-screen from two generated data files:
//
//   GUIDE_FI  (guide-fi-data.js)  — Forest-Based Interventions
//   GUIDE_IVN (guide-ivn-data.js) — Immersive Virtual Nature
//
// Both are built from the project's practical guides by
// admin/projects/forest4youth/web-app/scripts/build_guide_data.py — change
// the text there, not here. The data is already organised for reading
// (sections named for the reader, lists turned into tips, cards, checklists
// and menus); this file only lays it out.
//
// Layout: a switch between the two guides, a short lead, then a section
// menu beside one readable column (one section at a time, previous/next at
// the bottom). The Pocketbook is its own feature and is not repeated here.
//
// Routing: #guide/g-<sectionId> (e.g. #guide/g-ivn-sheets) opens that
// section of that guide. router.js handles the screen; guideSyncFromHash()
// (hashchange, registered after router.js's own listener) does the rest.

const GUIDES = { fi: typeof GUIDE_FI !== 'undefined' ? GUIDE_FI : null,
                 ivn: typeof GUIDE_IVN !== 'undefined' ? GUIDE_IVN : null };
let guideActive = 'fi';
const guideSection = { fi: 'fi-start', ivn: 'ivn-start' };

function guideEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Paragraph text, with its lead-in in bold when the source set one in bold
// (e.g. "Inform and consent." — recorded by the generator as b.label).
function guideInline(text, label) {
  const html = guideEsc(text).replace(/\n/g, '<br>');
  if (label && text.indexOf(label) === 0) {
    const l = guideEsc(label);
    return '<strong>' + l + '</strong>' + html.slice(l.length);
  }
  return html;
}

function guideFindSection(id) {
  for (const key of ['fi', 'ivn']) {
    const g = GUIDES[key];
    if (!g) continue;
    const s = g.sections.find(x => x.id === id);
    if (s) return { key, section: s };
  }
  return null;
}

// ── Blocks ────────────────────────────────────────────────
let guideUid = 0;

function guideChips(options, single) {
  return '<div class="gd-chips"' + (single ? ' data-single="1"' : '') + '>' + options.map(o =>
    '<button type="button" class="gd-chip" aria-pressed="false" onclick="guideToggleChip(this)">' + guideEsc(o) + '</button>').join('') + '</div>';
}

function guideBlock(b) {
  switch (b.t) {
    case 'lead': return '<p class="gd-lead-p">' + guideInline(b.text) + '</p>';
    case 'p':  return '<p>' + guideInline(b.text, b.label) + '</p>';
    case 'h':  return '<h4 class="gd-h">' + guideEsc(b.text) + '</h4>';
    case 'h3': return '<h5 class="gd-h3">' + guideEsc(b.text) + '</h5>';
    case 'callout': return '<p class="gd-callout">' + guideInline(b.text) + '</p>';
    case 'ul': return '<ul class="gd-list">' + b.items.map(i => '<li>' + guideInline(i) + '</li>').join('') + '</ul>';
    case 'ol': return '<ol class="gd-list gd-list-num">' + b.items.map(i => '<li>' + guideInline(i) + '</li>').join('') + '</ol>';
    case 'quote': return '<figure class="gd-quote"><blockquote>' + guideEsc(b.text) + '</blockquote>' +
      (b.by ? '<figcaption>' + guideEsc(b.by) + '</figcaption>' : '') + '</figure>';
    case 'tips': return '<div class="gd-tips">' + b.items.map(i =>
      '<div class="gd-tip"><h5>' + guideEsc(i.title) + '</h5><p>' + guideEsc(i.text) + '</p></div>').join('') + '</div>';
    case 'roles': return '<div class="gd-roles">' + b.items.map(i =>
      '<a class="gd-role" href="#guide/g-' + i.to + '"><span class="gd-role-title">' + guideEsc(i.title) +
      '</span><span class="gd-role-text">' + guideEsc(i.text) + '</span><span class="gd-role-go" aria-hidden="true">→</span></a>').join('') + '</div>';
    case 'bridge': return '<div class="gd-bridge"><p>' + guideEsc(b.text) + '</p><a class="gd-button" href="#guide/g-' +
      b.to + '">' + guideEsc(b.label) + ' →</a></div>';
    case 'check': return '<ul class="gd-check">' + b.items.map(i =>
      '<li><button type="button" role="checkbox" aria-checked="false" onclick="guideToggleCheck(this)">' +
      '<span class="gd-box" aria-hidden="true"></span><span>' + guideInline(i) + '</span></button></li>').join('') + '</ul>';
    case 'menu': return '<div class="gd-menu">' + b.groups.map(g => {
      const id = 'gd-m' + (++guideUid);
      return '<div class="gd-menu-row" role="group" aria-labelledby="' + id + '"><div class="gd-menu-label" id="' + id + '">' +
        guideEsc(g.label) + '</div>' + (g.scale
          ? '<div class="gd-scale"><span>' + guideEsc(g.scale[0]) + '</span>' + guideChips(['·', '··', '···'], true) + '<span>' + guideEsc(g.scale[1]) + '</span></div>'
          : guideChips(g.options)) + '</div>';
    }).join('') + '</div>';
    case 'fields': return '<div class="gd-fields">' + b.items.map(f =>
      '<div class="gd-field"><div class="gd-field-label">' + guideEsc(f.label) + '</div>' +
      (f.options ? guideChips(f.options, true) : '<div class="gd-field-line" aria-hidden="true"></div>') + '</div>').join('') + '</div>';
    case 'modules': return '<div class="gd-modules">' + b.items.map(m =>
      '<article class="gd-module"><div class="gd-module-key" aria-hidden="true">' + guideEsc(m.key) + '</div>' +
      '<h5>' + guideEsc(m.title) + '</h5><p class="gd-module-sub">' + guideEsc(m.sub) + '</p>' +
      (m.purpose ? '<p>' + guideEsc(m.purpose) + '</p>' : '') +
      '<ul class="gd-params">' + m.params.map(p => '<li>' + guideEsc(p) + '</li>').join('') + '</ul>' +
      '<details class="gd-more"><summary>' + guideEsc(t('guide.module.more')) + '</summary><dl>' +
      m.details.map(d => '<dt>' + guideEsc(d.label) + '</dt><dd>' + guideEsc(d.text) + '</dd>').join('') +
      '</dl></details></article>').join('') + '</div>';
    case 'panel': return '<section class="gd-panel-alert"><h4 class="gd-h">' + guideEsc(b.title) + '</h4>' +
      b.blocks.map(guideBlock).join('') + '</section>';
    case 'qa': return '<div class="gd-qa">' + b.items.map(i =>
      '<div class="gd-qa-item"><h5>' + guideEsc(i.q) + '</h5><p>' + guideEsc(i.a) + '</p></div>').join('') + '</div>';
    case 'table': return '<div class="gd-table-wrap"><table class="gd-table"><thead><tr>' +
      b.head.map(h => '<th scope="col">' + guideEsc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      b.rows.map(r => '<tr>' + r.map((c, i) => {
        const lines = String(c).split('\n');
        return i === 0 ? '<th scope="row">' + guideEsc(lines[0]) + (lines[1] ? '<span>' + guideEsc(lines.slice(1).join(' ')) + '</span>' : '') + '</th>'
                       : '<td>' + guideEsc(c).replace(/\n/g, '<br>') + '</td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div>';
    default: return '';
  }
}

function guideToggleCheck(btn) {
  btn.setAttribute('aria-checked', String(btn.getAttribute('aria-checked') !== 'true'));
}
function guideToggleChip(btn) {
  const wrap = btn.parentElement;
  const on = btn.getAttribute('aria-pressed') !== 'true';
  if (on && wrap.dataset.single) wrap.querySelectorAll('.gd-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', String(on));
}

// ── Layout ────────────────────────────────────────────────
function guideArticle(key) {
  const g = GUIDES[key];
  const idx = Math.max(0, g.sections.findIndex(s => s.id === guideSection[key]));
  const s = g.sections[idx];
  const prev = g.sections[idx - 1], next = g.sections[idx + 1];
  const pager = '<nav class="gd-pager" aria-label="' + guideEsc(t('guide.pager')) + '">' +
    (prev ? '<a class="gd-pager-prev" href="#guide/g-' + prev.id + '"><span>' + guideEsc(t('guide.prev')) + '</span>' + guideEsc(prev.title) + '</a>' : '<span></span>') +
    (next ? '<a class="gd-pager-next" href="#guide/g-' + next.id + '"><span>' + guideEsc(t('guide.next')) + '</span>' + guideEsc(next.title) + '</a>' : '<span></span>') +
    '</nav>';
  return '<h3 class="gd-title" tabindex="-1">' + guideEsc(s.title) + '</h3>' +
    '<div class="gd-body">' + s.blocks.map(guideBlock).join('') + '</div>' + pager;
}

function guideNav(key) {
  const g = GUIDES[key];
  return g.sections.map(s =>
    '<li><a href="#guide/g-' + s.id + '"' + (s.id === guideSection[key] ? ' aria-current="true"' : '') + '>' +
    '<span class="gd-nav-title">' + guideEsc(s.title) + '</span><span class="gd-nav-teaser">' + guideEsc(s.teaser || '') + '</span></a></li>').join('');
}

function guidePanel(key) {
  const g = GUIDES[key];
  return '<div class="gd-lead"><p class="gd-lead-quote">' + guideEsc(g.lead_quote) + '</p><p>' + guideEsc(g.lead) + '</p>' +
      (currentLang !== 'en' ? '<p class="gd-langnote">' + guideEsc(t('guide.langnote')) + '</p>' : '') + '</div>' +
    '<div class="gd-layout">' +
      '<nav class="gd-nav" aria-label="' + guideEsc(t('guide.sections')) + '"><ol id="gd-nav-' + key + '">' + guideNav(key) + '</ol></nav>' +
      '<article class="gd-article" id="gd-article-' + key + '">' + guideArticle(key) + '</article>' +
    '</div>' +
    '<details class="gd-about"><summary>' + guideEsc(t('guide.about')) + '</summary>' +
      g.about.map(p => '<p>' + guideEsc(p) + '</p>').join('') + '</details>';
}

function guideRender() {
  const root = document.getElementById('guide-root');
  if (!root || !GUIDES.fi || !GUIDES.ivn) return;
  guideUid = 0;
  const tab = key =>
    '<button type="button" role="tab" class="gd-tab" id="guide-tab-' + key + '" aria-controls="guide-panel-' + key + '" ' +
      'aria-selected="' + (guideActive === key) + '" tabindex="' + (guideActive === key ? 0 : -1) + '" ' +
      'onclick="guideOpen(\'' + key + '\')" onkeydown="guideTabKey(event)">' +
      '<span class="gd-tab-title">' + guideEsc(t('guide.tab.' + key)) + '</span>' +
      '<span class="gd-tab-desc">' + guideEsc(t('guide.tab.' + key + '.desc')) + '</span></button>';
  root.innerHTML =
    '<div class="gd-tabs" role="tablist" aria-label="' + guideEsc(t('guide.heading')) + '">' + tab('fi') + tab('ivn') + '</div>' +
    ['fi', 'ivn'].map(key => '<div class="gd-guide" role="tabpanel" id="guide-panel-' + key + '" aria-labelledby="guide-tab-' + key + '"' +
      (guideActive === key ? '' : ' hidden') + '>' + guidePanel(key) + '</div>').join('');
}

function guideShow(key, sectionId, focus) {
  guideActive = key;
  if (sectionId) guideSection[key] = sectionId;
  ['fi', 'ivn'].forEach(k => {
    const tabEl = document.getElementById('guide-tab-' + k);
    const panel = document.getElementById('guide-panel-' + k);
    if (!tabEl || !panel) return;
    tabEl.setAttribute('aria-selected', String(k === key));
    tabEl.tabIndex = k === key ? 0 : -1;
    panel.hidden = k !== key;
  });
  const art = document.getElementById('gd-article-' + key);
  const nav = document.getElementById('gd-nav-' + key);
  if (art) art.innerHTML = guideArticle(key);
  if (nav) {
    nav.innerHTML = guideNav(key);
    const cur = nav.querySelector('[aria-current]');
    if (cur && cur.scrollIntoView && window.matchMedia('(max-width: 820px)').matches) {
      cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }
  if (focus && art) {
    const title = art.querySelector('.gd-title');
    const top = document.getElementById('guide-panel-' + key).querySelector('.gd-layout');
    requestAnimationFrame(() => {
      if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (title) title.focus({ preventScroll: true });
    });
  }
}

// Tab click: go to that guide's current section (via the hash, so Back works).
function guideOpen(key) {
  window.location.hash = 'guide/g-' + guideSection[key];
}

function guideTabKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const key = guideActive === 'fi' ? 'ivn' : 'fi';
  guideOpen(key);
  requestAnimationFrame(() => document.getElementById('guide-tab-' + key).focus());
}

function guideSyncFromHash() {
  const parts = window.location.hash.replace('#', '').split('/');
  if (parts[0] !== 'guide') return;
  const found = parts[1] && parts[1].indexOf('g-') === 0 ? guideFindSection(parts[1].slice(2)) : null;
  if (found) guideShow(found.key, found.section.id, true);
}

window.addEventListener('hashchange', guideSyncFromHash);
guideRender();
guideSyncFromHash();
