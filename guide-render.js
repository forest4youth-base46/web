// ============================================================
// PRACTICAL GUIDES — renders the full WP1 practical guides
// ============================================================
// Replaces the old "Companion Guide" screen, which listed a 14-chapter,
// 108-page handbook that was never written. #guide-screen now shows the two
// real deliverables in full:
//
//   GUIDE_FI  (guide-fi-data.js)  — D1.2.1, Forest-Based Interventions
//   GUIDE_IVN (guide-ivn-data.js) — D1.3.2, Immersive Virtual Nature
//
// Both data files are generated from the deliverables by
// admin/projects/forest4youth/web-app/scripts/build_guide_data.py — change
// the text there, not here. The Pocketbook chapter (D1.2.1 ch.8) doesn't
// repeat the 17 activity pages: {t:'acts'} blocks list them from ACTIVITIES
// (pocketbook-data.js) and link into the Pocketbook, so each activity has
// one copy.
//
// Routing: #guide shows FI; #guide/g-<chapterId> (e.g. #guide/g-ivn-app-a)
// switches to that guide, opens the chapter and scrolls to it. router.js's
// applyRouteOpenModule() already adds .open to the element with that id;
// guideSyncFromHash() below (on hashchange, registered after router.js's
// own listener) does the rest — tab, aria-expanded, scroll.
//
// Chapters use the existing .exp-card accordion + toggleExp() (router.js),
// per CONTRIBUTING.md's accordion pattern. Guide text is English only for
// now; FR/DE editions exist for D1.2.1 (older than v2.2) and not at all for
// D1.3.2 — see admin/.../web-app/PLAN.md, phase 4.

const GUIDES = { fi: typeof GUIDE_FI !== 'undefined' ? GUIDE_FI : null,
                 ivn: typeof GUIDE_IVN !== 'undefined' ? GUIDE_IVN : null };
let guideActive = 'fi';

function guideEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "Purpose. To familiarize…" → bold lead-in. Only short, capitalised
// labels ending in a full stop at the very start of a paragraph.
function guideInline(text) {
  const esc = guideEsc(text).replace(/\n/g, '<br>');
  return esc.replace(/^([A-Z][A-Za-z ,/()–-]{1,38}\.)(\s)/, '<strong>$1</strong>$2');
}

function guideActsBlock(groupNum) {
  if (typeof ACTIVITIES === 'undefined' || typeof GROUPS === 'undefined') return '';
  const g = GROUPS.find(x => x.id === groupNum);
  const acts = ACTIVITIES.filter(a => a.group === groupNum);
  const title = typeof pbGroupT === 'function' ? pbGroupT(g, 'title') : g.title;
  const name = a => (typeof pbT === 'function' ? pbT(a, 'name') : a.name);
  const purpose = a => (typeof pbT === 'function' ? pbT(a, 'purpose') : a.purpose);
  return '<div class="guide-acts"><div class="guide-acts-title">' + guideEsc(g.num + '. ' + title) +
    ' <span class="guide-acts-count">· ' + acts.length + '</span></div><ul>' +
    acts.map(a => '<li><a href="#implement/mod-pocket/pb-act-' + a.id + '">' + guideEsc(name(a)) +
      '</a><span> — ' + guideEsc(purpose(a)) + '</span></li>').join('') + '</ul></div>';
}

function guideBlock(b) {
  switch (b.t) {
    case 'h':  return '<h4 class="guide-h">' + guideEsc(b.text) + '</h4>';
    case 'h3': return '<h5 class="guide-h3">' + guideEsc(b.text) + '</h5>';
    case 'p':  return '<p class="guide-p">' + guideInline(b.text) + '</p>';
    case 'callout': return '<p class="guide-callout">' + guideInline(b.text) + '</p>';
    case 'ul': return '<ul class="guide-ul">' + b.items.map(i => '<li>' + guideInline(i) + '</li>').join('') + '</ul>';
    case 'ol': return '<ol class="guide-ol">' + b.items.map(i => '<li>' + guideInline(i) + '</li>').join('') + '</ol>';
    case 'check': return '<ul class="guide-check">' + b.items.map(i => '<li>' + guideInline(i) + '</li>').join('') + '</ul>';
    case 'form': return '<p class="guide-form">' + guideEsc(b.text) + '</p>';
    case 'quote': return '<blockquote class="guide-quote"><p>' + guideEsc(b.text) + '</p>' +
      (b.by ? '<cite>' + guideEsc(b.by) + '</cite>' : '') + '</blockquote>';
    case 'sheet': return '<div class="guide-sheet"><div class="guide-sheet-title">' + guideEsc(b.title) + '</div>' +
      b.lines.map(l => '<p class="guide-p">' + guideInline(l) + '</p>').join('') + '</div>';
    case 'table': return '<div class="guide-table-wrap"><table class="guide-table"><thead><tr>' +
      b.head.map(h => '<th scope="col">' + guideEsc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      b.rows.map(r => '<tr>' + r.map((c, i) => (i === 0 ? '<th scope="row">' : '<td>') +
        guideEsc(c).replace(/\n/g, '<br>') + (i === 0 ? '</th>' : '</td>')).join('') + '</tr>').join('') +
      '</tbody></table></div>';
    case 'acts': return guideActsBlock(b.group);
    case 'link': return '<p class="guide-link"><a href="' + guideEsc(b.href) + '">' + guideEsc(b.text) + '</a></p>';
    default: return '';
  }
}

function guideChapterLabel(c) {
  if (!c.num) return '';
  return /^[A-H]$/.test(c.num) ? t('guide.appendix') + ' ' + c.num : t('guide.chapter') + ' ' + c.num;
}

function guidePanel(g) {
  const toc = g.chapters.map(c =>
    '<a href="#guide/g-' + c.id + '" class="guide-chapter" data-chapter-id="' + c.id + '">' +
      '<div class="guide-chapter-num">' + guideEsc(c.num || '·') + '</div>' +
      '<div class="guide-chapter-body"><div class="guide-chapter-title"><span data-guide-title>' + guideEsc(c.title) + '</span></div>' +
      (c.sub ? '<div class="guide-chapter-desc">' + guideEsc(c.sub) + '</div>' : '') + '</div></a>').join('');
  const chapters = g.chapters.map(c => {
    const id = 'g-' + c.id;
    const label = guideChapterLabel(c);
    return '<section class="exp-card guide-ch" id="' + id + '">' +
      '<div class="exp-header" role="button" tabindex="0" aria-expanded="false" aria-controls="' + id + '-body" ' +
        'onclick="toggleExp(\'' + id + '\')" onkeydown="activateOnKey(event, () => toggleExp(\'' + id + '\'))">' +
        '<div class="exp-icon">' + guideEsc(c.num || '·') + '</div>' +
        '<div class="exp-title">' + (label ? '<span class="guide-ch-label">' + guideEsc(label) + '</span>' : '') +
          guideEsc(c.title) + '</div><div class="exp-toggle">+</div></div>' +
      '<div class="exp-body" id="' + id + '-body">' + c.blocks.map(guideBlock).join('') +
        '<p class="guide-source">' + guideEsc(g.code + ' · ' + g.edition) + '</p></div></section>';
  }).join('');
  return '<div class="guide-intro">' +
      '<p class="guide-meta"><strong>' + guideEsc(g.code) + '</strong> · ' + guideEsc(g.wp) + ' · ' + guideEsc(g.authors) + '</p>' +
      '<h3>' + guideEsc(g.title) + '</h3><p>' + guideEsc(g.audience) + '</p>' +
      '<p class="guide-meta">' + guideEsc(t('guide.edition')) + ': ' + guideEsc(g.edition) + '</p>' +
      (currentLang !== 'en' ? '<p class="guide-lang-note">' + guideEsc(t('guide.langnote')) + '</p>' : '') +
    '</div>' +
    '<nav class="guide-toc" aria-label="' + guideEsc(t('guide.contents')) + '">' + toc + '</nav>' +
    '<div class="guide-chapters">' + chapters + '</div>';
}

function guideRender() {
  const root = document.getElementById('guide-root');
  if (!root || !GUIDES.fi || !GUIDES.ivn) return;
  const open = new Set(Array.from(root.querySelectorAll('.guide-ch.open')).map(el => el.id));
  const tab = (key, g) =>
    '<button type="button" role="tab" class="guide-tab" id="guide-tab-' + key + '" aria-controls="guide-panel-' + key + '" ' +
      'aria-selected="' + (guideActive === key) + '" tabindex="' + (guideActive === key ? 0 : -1) + '" ' +
      'onclick="guideSelect(\'' + key + '\')" onkeydown="guideTabKey(event)">' +
      '<span class="guide-tab-code">' + guideEsc(g.short + ' · ' + g.code) + '</span>' +
      '<span class="guide-tab-title">' + guideEsc(t('guide.tab.' + key)) + '</span></button>';
  root.innerHTML =
    '<div class="guide-tabs" role="tablist" aria-label="' + guideEsc(t('guide.heading')) + '">' +
      tab('fi', GUIDES.fi) + tab('ivn', GUIDES.ivn) + '</div>' +
    ['fi', 'ivn'].map(key =>
      '<div class="guide-panel" role="tabpanel" id="guide-panel-' + key + '" aria-labelledby="guide-tab-' + key + '"' +
        (guideActive === key ? '' : ' hidden') + '>' + guidePanel(GUIDES[key]) + '</div>').join('');
  open.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('open'); el.querySelector('.exp-header').setAttribute('aria-expanded', 'true'); }
  });
}

function guideSelect(key, focusTab) {
  guideActive = key;
  ['fi', 'ivn'].forEach(k => {
    const tabEl = document.getElementById('guide-tab-' + k);
    const panel = document.getElementById('guide-panel-' + k);
    if (!tabEl || !panel) return;
    tabEl.setAttribute('aria-selected', String(k === key));
    tabEl.tabIndex = k === key ? 0 : -1;
    panel.hidden = k !== key;
  });
  if (focusTab) document.getElementById('guide-tab-' + key).focus();
}

// Arrow keys move between the two tabs (WAI-ARIA tabs pattern).
function guideTabKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  guideSelect(guideActive === 'fi' ? 'ivn' : 'fi', true);
}

function guideSyncFromHash() {
  const parts = window.location.hash.replace('#', '').split('/');
  if (parts[0] !== 'guide' || !parts[1] || parts[1].indexOf('g-') !== 0) return;
  const id = parts[1];
  guideSelect(id.indexOf('g-ivn') === 0 ? 'ivn' : 'fi');
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  const header = el.querySelector('.exp-header');
  if (header) header.setAttribute('aria-expanded', 'true');
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (header) header.focus({ preventScroll: true });
  }, 60);
}

window.addEventListener('hashchange', guideSyncFromHash);
guideRender();
guideSyncFromHash();
