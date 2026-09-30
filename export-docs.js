// ============================================================
// EXPORT DOCUMENTS — the branding every export carries, and the
// branded PDF/print documents for the Forest and IVN tools
// ============================================================
// Every PDF, PNG and print the app produces carries the same two things:
//   - the project logo (Interreg NWE lockup with the EU emblem and the
//     "Co-funded by the European Union" statement), top of every page, at
//     no less than the branding guide's A4 minimum (see .pexport-logo-img);
//   - a disclaimer block at the foot of every page: a note fitting the
//     document (PEXP_NOTES) and the project's funding statement.
//
// The session plan and the post-session report (pocketbook-export.js)
// build their own header and body but take their footer from
// pexpFooterHTML(). The tools (fi-tools.js, ivn-tools.js) describe a
// document as { kind, title, subtitle, meta, blocks, filename } and hand it
// to pexpDownloadPDF() (paginated A4 PDF, same html2canvas + jsPDF
// pipeline as the session plan) or pexpPrint() (the browser's print
// dialog, same template, header and footer repeated on every page).
// Loaded after pocketbook-export.js and tools-common.js, whose helpers it
// reuses (pbPackBlocks, pbSavePDFFromCanvases, toolEsc, ...).

const PEXP_LOGO_SRC = 'assets/logo-interreg-forest4youth.png';
const PEXP_LOGO_ALT = 'Interreg North-West Europe · Co-funded by the European Union · Forest4Youth';

// The note each kind of document carries above the funding statement.
const PEXP_NOTES = {
  plan: ['pbui.planexport.footer.disclaimer'],
  report: ['exp.note.report', 'exp.note.judgement'],
  record: ['exp.note.personal', 'exp.note.judgement'],
  screening: ['exp.note.personal', 'exp.note.screening'],
  guide: ['exp.note.guide'],
  young: ['exp.note.young'],
};

function pexpLang() {
  return typeof currentLang === 'string' ? currentLang : 'en';
}

function pexpLogoHTML() {
  return '<div class="pexport-logos"><img class="pexport-logo-img" src="' + PEXP_LOGO_SRC + '" alt="' + toolEsc(PEXP_LOGO_ALT) + '"></div>';
}

// Footer shared by every export. __PEXPORT_PAGE__ is filled in with
// "page/total" by the paginated PDF paths, or stripped (with its " · ")
// for single-image and printed output.
function pexpFooterHTML(kind) {
  const lang = pexpLang();
  const note = (PEXP_NOTES[kind] || []).map(k => t(k)).join(' ');
  const generated = t('pbui.planexport.footer.generated').replace('{date}', new Date().toLocaleDateString(lang));
  return '<div class="pexport-footer-bottom">' +
    '<div class="pexport-disclaimer">' +
      (note ? '<p class="pexport-disclaimer-note">' + toolEsc(note) + '</p>' : '') +
      '<p class="pexport-disclaimer-funding">' + toolEsc(t('exp.funding')) + '</p>' +
    '</div>' +
    '<div class="pexport-footer-line">' +
      '<span>Forest4Youth · Interreg North-West Europe · NWE0400643 · v' + APP_VERSION.number + '</span>' +
      '<span>' + toolEsc(generated) + ' · ' + lang.toUpperCase() + ' · __PEXPORT_PAGE__</span>' +
    '</div>' +
  '</div>';
}

// ── Content blocks for tool documents ─────────────────────
function pexpHeading(title, intro) {
  return '<div class="pexp-h">' + toolEsc(title) + '</div>' + (intro ? '<p class="pexp-muted">' + toolEsc(intro) + '</p>' : '');
}
function pexpPara(text) {
  return '<p class="pexp-p">' + toolEsc(text) + '</p>';
}
function pexpCheck(title, text, on) {
  return '<div class="pexp-check' + (on ? ' is-on' : '') + '"><span class="pexport-checkbox">' + (on ? '✓' : '') + '</span>' +
    '<div><div class="pexp-check-title">' + toolEsc(title) + '</div>' + (text ? '<div class="pexp-check-text">' + toolEsc(text) + '</div>' : '') + '</div></div>';
}
function pexpField(label, value) {
  return '<div class="pexp-field"><div class="pexp-field-k">' + toolEsc(label) + '</div><div class="pexp-field-v">' + toolEsc(value) + '</div></div>';
}
function pexpBullet(text) {
  return '<div class="pexp-li"><span aria-hidden="true">–</span><span>' + toolEsc(text) + '</span></div>';
}
function pexpQA(q, a) {
  return '<div class="pexport-qa-card"><div class="pexport-qa-q">' + toolEsc(q) + '</div><div class="pexport-qa-a">' + toolEsc(a) + '</div></div>';
}
// A heading glued to the first item after it, so a page break never
// leaves a heading alone at the foot of a page (same rule as the report).
function pexpSection(headingHTML, items) {
  const list = items.length ? items : ['<p class="pexp-muted">—</p>'];
  return [headingHTML + list[0]].concat(list.slice(1));
}

// ── Document parts ────────────────────────────────────────
// opts.meta: [[label, value], ...], shown two per row beside the logo.
function pexpDocParts(opts) {
  const meta = [[t('pbui.planexport.label.date'), new Date().toLocaleDateString(pexpLang())]].concat(opts.meta || []);
  const rows = [];
  for (let i = 0; i < meta.length; i += 2) rows.push(meta.slice(i, i + 2));
  const headerHTML =
    '<div class="pexport-topbar">' +
      '<div class="pexport-topbar-fields">' + rows.map(r =>
        '<div class="pexport-meta-row">' + r.map(([k, v]) =>
          '<div class="pexport-meta-block"><div class="pexport-label">' + toolEsc(k) + '</div><div class="pexport-value">' + toolEsc(v || '—') + '</div></div>').join('') +
        '</div>').join('') +
      '</div>' + pexpLogoHTML() +
    '</div>';
  const titleHTML =
    '<div class="pexport-title-block">' +
      '<h1 class="pexport-title">' + toolEsc(opts.title) + '</h1>' +
      (opts.subtitle ? '<div class="pexport-subtitle">' + toolEsc(opts.subtitle) + '</div>' : '') +
    '</div>';
  return { headerHTML, titleHTML, footerBottomHTML: pexpFooterHTML(opts.kind), blocks: opts.blocks || [] };
}

// Paginates { headerHTML, titleHTML, footerBottomHTML, blocks } into A4
// canvases: header on every page, title on page 1, footer (with page x/y)
// pinned to the foot of every page. Shared with the post-session report.
async function pexpPaginate(root, d) {
  const page1ChromeHeight = pbMeasureHeight(root, d.headerHTML + d.titleHTML);
  const restChromeHeight = pbMeasureHeight(root, d.headerHTML);
  const footerHeight = pbMeasureHeight(root, d.footerBottomHTML);
  const firstPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - page1ChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const restPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - restChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const pages = pbPackBlocks(root, d.blocks, firstPageBudget, restPageBudget);

  const canvases = [];
  for (let i = 0; i < pages.length; i++) {
    const footer = d.footerBottomHTML.replace('__PEXPORT_PAGE__', (i + 1) + '/' + pages.length);
    const pageHTML = '<div class="pexport pexport--paged" style="height:' + PEXPORT_PAGE_INNER_HEIGHT_CSS_PX + 'px;">' +
      d.headerHTML + (i === 0 ? d.titleHTML : '') + pages[i].join('') + footer +
    '</div>';
    canvases.push(await pbRasterizePage(root, pageHTML));
  }
  return canvases;
}

function pexpFileSafe(s) {
  return String(s || '').trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

async function pexpDownloadPDF(opts) {
  if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  const root = document.getElementById('print-doc');
  if (!root) return;
  await pbWaitFontsReady();
  document.body.classList.add('is-exporting-png');
  const restoreZoom = pbResetBodyZoom();
  try {
    const canvases = await pexpPaginate(root, pexpDocParts(opts));
    pbSavePDFFromCanvases(canvases, opts.filename || 'forest4youth');
  } catch (err) {
    console.error('PDF export failed', err);
    alert('PDF export failed. Try Print instead.');
  } finally {
    restoreZoom();
    document.body.classList.remove('is-exporting-png');
    root.innerHTML = '';
  }
}

// Print the same document through the browser's print dialog. A table's
// <thead>/<tfoot> repeat on every printed page, which is what carries the
// logo and the disclaimer onto page 2 and beyond.
async function pexpPrint(opts) {
  const root = document.getElementById('print-doc');
  if (!root) return;
  const d = pexpDocParts(opts);
  root.innerHTML = '<table class="pexp-print"><thead><tr><td>' + d.headerHTML + '</td></tr></thead>' +
    '<tfoot><tr><td>' + d.footerBottomHTML.replace(' · __PEXPORT_PAGE__', '') + '</td></tr></tfoot>' +
    '<tbody><tr><td>' + d.titleHTML + d.blocks.join('') + '</td></tr></tbody></table>';
  root.classList.add('pexport');
  // The logo has to be decoded before the print snapshot, or page 1 prints
  // without it on a cold cache.
  await Promise.all(Array.from(root.querySelectorAll('img')).map(img =>
    img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
  document.body.classList.add('printing-doc');
  let cleaned = false;
  const done = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('printing-doc');
    root.classList.remove('pexport');
    root.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1000);
}

// An ordinary browser print of any page (Ctrl+P, or the browser menu)
// carries the disclaimer too: styles-export.css shows #print-brand-foot
// (and the logo above the header) only in print.
window.addEventListener('beforeprint', () => {
  const foot = document.getElementById('print-brand-foot');
  if (foot && !document.body.classList.contains('printing-doc')) foot.innerHTML = pexpFooterHTML('guide').replace(' · __PEXPORT_PAGE__', '');
});
