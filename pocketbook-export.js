// ─── Pocketbook: export — the session-plan/report PDF+PNG pipeline
//     (html2canvas + jsPDF), the QR share-link builder, and the standalone
//     pre-session timer modal. Reads pbSession/pbSessionMins from
//     pocketbook-builder.js. ───
'use strict';

// ───────── EXPORT (PDF / PNG with QR) ─────────
// Encodes activities by their index into ACTIVITIES rather than by id
// string, and uses a plain delimited query string instead of a base64 JSON
// blob — a full 17-activity session (the entire library, the practical
// ceiling) stays well under 200 characters this way instead of ~500+, so
// the printed QR (see exportGenerateSessionQRNode below) never needs more
// modules than a small, reliably scannable canvas can render crisply.
function exportBuildSessionURL() {
  const idIndex = id => ACTIVITIES.findIndex(a => a.id === id);
  const order = pbSession.map(idIndex).filter(i => i !== -1);
  const mins = Object.keys(pbSessionMins)
    .map(id => [idIndex(id), pbSessionMins[id]])
    .filter(pair => pair[0] !== -1 && typeof pair[1] === 'number');
  const params = new URLSearchParams();
  params.set('s', order.join('.'));
  if (mins.length) params.set('m', mins.map(pair => pair[0] + ':' + pair[1]).join('.'));
  params.set('l', typeof currentLang === 'string' ? currentLang : 'en');
  return window.location.origin + window.location.pathname + '?' + params.toString() + '#implement/mod-pocket';
}
function exportGenerateSessionQRNode() {
  if (typeof QRCode === 'undefined') return null;
  const wrap = document.createElement('div');
  try {
    new QRCode(wrap, {
      text: exportBuildSessionURL(),
      // 2x the old 52px raster — at the worst case (all 17 activities, still
      // well under version 9/53 modules thanks to the compact encoding above)
      // this keeps comfortably above 1.5px per module; real sessions (a
      // handful of activities) land closer to 4-6px per module.
      width: 104, height: 104,
      colorDark: '#3d5a3e', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (e) {
    // exportRenderPrintSession() (called from exportRunPNG before its own
    // try/catch starts) relies on this failing soft rather than throwing —
    // a QR-less export is a fine degradation, an uncaught exception here
    // is not.
    warnFailure('generating session QR code (payload may exceed the QR capacity)', e);
    return null;
  }
  return wrap.querySelector('canvas') || wrap.querySelector('img');
}

// Builds every HTML piece of the session-plan export (header, title, row
// timeline, sidebar charts, tail checklist, repeating footer) without
// touching the DOM — shared by the continuous single-page render below
// (used for on-screen/PNG output) and the paginated PDF path
// (pbBuildSessionPaginatedCanvases), so the two can never drift apart.
function pbBuildSessionExportData() {
  const lang = typeof currentLang === 'string' ? currentLang : 'en';
  const items = pbSession.map(id => ACTIVITIES.find(a => a.id === id)).filter(Boolean);
  const totalMin = pbSession.reduce((s, id) => s + pbGetItemMins(id), 0);
  const groupsUsed = new Set(items.map(a => a.group)).size;
  const date = new Date().toLocaleDateString(lang);

  const clockTimes = pbComputeClockTimes(pbSessionMeta.startTime, pbSession);
  const hasClock = clockTimes.some(c => c != null);
  const endTime = hasClock ? (() => {
    const [h, m] = clockTimes[clockTimes.length - 1].split(':').map(Number);
    const total = h * 60 + m + pbGetItemMins(pbSession[pbSession.length - 1]);
    return String(Math.floor((total % 1440) / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  })() : '';

  const groupTime = pbComputeGroupTime(pbSession);

  const rowBlocks = items.map((a, i) => {
    const durText = a.durMax ? pbGetItemMins(a.id) + ' min' : (pbT(a, 'durLabel') || pbFmtDuration(a));
    const clock = clockTimes[i];
    const grp = GROUPS[a.group - 1];
    return (
      '<div class="pexport-row">' +
        '<div class="pexport-row-clock">' +
          (clock ? '<div class="pexport-row-clock-time">' + clock + '</div>' : '') +
          '<div class="pexport-row-clock-dur">' + pbEscapeHtml(durText) + '</div>' +
        '</div>' +
        '<div class="pexport-row-bar" style="background:' + PB_GROUP_COLORS[a.group] + '"></div>' +
        '<div class="pexport-row-main">' +
          '<div class="pexport-row-heading">' +
            '<span class="pexport-row-num">' + String(i + 1).padStart(2, '0') + '</span> ' +
            pbEscapeHtml(pbT(a, 'name')) +
          '</div>' +
          '<div class="pexport-row-group">' + pbEscapeHtml(grp.num) + ' · ' + pbEscapeHtml(pbGroupT(grp, 'title')) + '</div>' +
          '<div class="pexport-row-purpose">' + pbEscapeHtml(pbT(a, 'purpose')) + '</div>' +
          '<div class="pexport-row-quote">' + pbEscapeHtml(pbT(a, 'intro')) + '</div>' +
        '</div>' +
      '</div>'
    );
  });

  // Checkbox markup, not <ul>/<li> — html2canvas doesn't reliably render
  // native list markers (missing/misaligned bullet glyphs), so this avoids
  // that entirely; also matches the Canva concept's checklist treatment.
  const materialsHTML = pbAggregateMaterials(pbSession)
    .map(m => '<div class="pexport-materials-row"><span class="pexport-checkbox"></span>' + pbEscapeHtml(m) + '</div>').join('');

  const checklistHTML = [1, 2, 3, 4, 5, 6].map(i =>
    '<div class="pexport-check-item"><span class="pexport-checkbox"></span>' +
      pbEscapeHtml(t('check.pre.' + i)) +
    '</div>'
  ).join('');

  const subtitle = t('pbui.planexport.subtitle')
    .replace('{groups}', String(groupsUsed))
    .replace('{n}', String(items.length))
    .replace('{mins}', String(totalMin));
  const generated = t('pbui.planexport.footer.generated').replace('{date}', date);

  const headerHTML =
    '<div class="pexport-topbar">' +
      '<div class="pexport-topbar-fields">' +
        '<div class="pexport-meta-row">' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.date')) + '</div><div class="pexport-value">' + pbEscapeHtml(date) + '</div></div>' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.time')) + '</div><div class="pexport-value">' + (hasClock ? pbEscapeHtml(clockTimes[0] + ' – ' + endTime) : '—') + '</div></div>' +
        '</div>' +
        '<div class="pexport-meta-row">' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.groupsite')) + '</div><div class="pexport-value">' + pbEscapeHtml(pbSessionMeta.site || '—') + '</div></div>' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.practitioner')) + '</div><div class="pexport-value">' + pbEscapeHtml(pbSessionMeta.practitioner || '—') + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="pexport-logos">' +
        '<img class="pexport-logo-img" src="assets/logo-interreg-forest4youth.png" alt="Interreg North-West Europe · Forest4Youth">' +
      '</div>' +
    '</div>';

  const titleHTML =
    '<div class="pexport-title-block">' +
      '<h1 class="pexport-title">' + pbEscapeHtml(t('pbui.planexport.title')) + '</h1>' +
      '<div class="pexport-subtitle">' + pbEscapeHtml(subtitle) + '</div>' +
    '</div>';

  const colHeadersHTML =
    '<div class="pexport-col-headers"><span>' + pbEscapeHtml(t('pbui.planexport.col.clock')) + '</span><span>' + pbEscapeHtml(t('pbui.planexport.col.activity')) + '</span></div>';

  const sidebarHTML =
    '<div class="pexport-sidebar">' +
      '<div class="pexport-stats-eyebrow">' + pbEscapeHtml(t('pbui.planexport.stats.eyebrow')) + '</div>' +
      '<div class="pexport-arc-block">' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.planexport.arc.title')) + ' · ' + pbEscapeHtml(t('pbui.planexport.arc.sub')) + '</div>' +
        '<div class="pexport-arc-row">' +
          '<div class="pexport-arc-donut">' + pbBuildArcDonutSVG(groupTime, items.length) + '</div>' +
          '<div class="pexport-arc-legend">' + pbBuildArcLegendHTML(groupTime) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pexport-shape-block">' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.planexport.shape.title')) + ' · ' + pbEscapeHtml(t('pbui.planexport.shape.sub')) + '</div>' +
        pbBuildSessionShapeSVG(pbSession, clockTimes) +
      '</div>' +
      '<div class="pexport-materials-block">' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.planexport.materials.title')) + '</div>' +
        '<div class="pexport-materials-list">' + materialsHTML + '</div>' +
      '</div>' +
      '<div class="pexport-qr-block">' +
        '<div id="print-qr-slot"></div>' +
        '<div class="pexport-qr-caption">' + pbEscapeHtml(t('pbui.planexport.qr.caption')) + '</div>' +
      '</div>' +
    '</div>';

  const totalLine = t('pbui.planexport.total').replace('{mins}', String(totalMin)).replace('{n}', String(items.length));
  const tailBlockHTML =
    '<div class="pexport-banner">' +
      '<span>' + pbEscapeHtml(t('pbui.planexport.banner')) + '</span>' +
      '<span class="pexport-banner-total">' + pbEscapeHtml(totalLine) + '</span>' +
    '</div>' +
    '<div class="pexport-footer">' +
      '<div class="pexport-footer-title">' + pbEscapeHtml(t('pbui.planexport.beforeyougo')) + '</div>' +
      '<div class="pexport-checklist">' + checklistHTML + '</div>' +
    '</div>';

  // No parent-dependent styling on .pexport-footer-bottom, so it renders
  // identically whether nested inside .pexport-footer (continuous version,
  // right after the checklist) or standalone, repeating on its own at the
  // bottom of every page (paginated version).
  // __PEXPORT_PAGE__ is a placeholder: the paginated PDF path fills it in
  // with "current/total" once the real page count is known (only after
  // packing); the continuous on-screen/PNG render has no page concept, so
  // it strips the " · __PEXPORT_PAGE__" chunk entirely.
  const footerBottomHTML =
    '<div class="pexport-footer-bottom">' +
      '<span>Forest4Youth · Interreg North-West Europe</span>' +
      '<span>' + pbEscapeHtml(t('pbui.planexport.footer.disclaimer')) + '</span>' +
      '<span>' + pbEscapeHtml(generated) + ' · ' + lang.toUpperCase() + ' · __PEXPORT_PAGE__</span>' +
    '</div>';

  return { headerHTML, titleHTML, colHeadersHTML, rowBlocks, sidebarHTML, tailBlockHTML, footerBottomHTML };
}

// Builds the session-plan export — a two-column A4 page (activity timeline
// on the left, arc/shape charts + materials + QR in a sidebar on the
// right), matching the Canva-designed template. The post-session report
// (exportRenderPrintReport() below) reuses these same "pexport-*" classes
// for its shared visual language (colors, type, row/section styling) —
// only its own content-specific classes (.pexport-notes-card,
// .pexport-qa-*, .pexport-indicator-item) are report-only.
function exportRenderPrintSession() {
  const root = document.getElementById('print-session');
  if (!root) return;
  const d = pbBuildSessionExportData();

  root.innerHTML =
    '<div class="pexport">' +
      d.headerHTML +
      d.titleHTML +
      '<div class="pexport-body">' +
        '<div class="pexport-timeline">' +
          d.colHeadersHTML +
          d.rowBlocks.join('') +
        '</div>' +
        d.sidebarHTML +
      '</div>' +
      d.tailBlockHTML +
      d.footerBottomHTML.replace(' · __PEXPORT_PAGE__', '') +
    '</div>';

  const qrNode = exportGenerateSessionQRNode();
  const slot = root.querySelector('#print-qr-slot');
  if (qrNode && slot) slot.appendChild(qrNode);
}

// ───────── Shared multi-page export pipeline ─────────
// A real multi-page document repeats its header/footer on every page — the
// old approach (rasterize the whole continuous layout once, then slice
// that single tall canvas into equal page-height chunks) can't do that,
// since page 2+ would just show whatever content happened to fall in that
// pixel range with no header/logo/footer at all. Instead: measure each
// content block's real rendered height (respecting actual text wrapping —
// no guessing), greedily pack blocks into pages against a header/footer-
// aware budget, then rasterize each page separately so every page gets its
// own header + footer at the same margins as page 1.
const PEXPORT_PAGE_HEIGHT_CSS_PX = 297 * 96 / 25.4; // A4 height at 96dpi
const PEXPORT_PAGE_PAD_CSS_PX = 64; // #print-session/#print-report's own 32px top + 32px bottom padding
const PEXPORT_PAGE_INNER_HEIGHT_CSS_PX = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX;
const PEXPORT_PAGE_GAP_CSS_PX = 12; // safety margin between measurement (DOM layout) and rasterization (html2canvas)

function pbMeasureHeight(root, innerHTML) {
  root.innerHTML = '<div class="pexport">' + innerHTML + '</div>';
  return root.querySelector('.pexport').scrollHeight;
}

// blocks: array of HTML strings, each one atomic unit that must never be
// split across two pages (a row, a Q&A card, or a "section label + first
// item" pair glued together by the caller so a header never sits alone at
// the bottom of a page). Returns an array of pages, each an array of the
// original block strings that landed on that page.
//
// measureWrapPrefix/measureWrapSuffix (optional): the session-plan export
// needs its rows measured *inside* the same narrower .pexport-timeline
// column they actually render in on page 1 (which shares width with the
// 240px sidebar) — measuring them at the full page width instead
// understates how many lines the intro-quote text wraps to, which is
// exactly the gap that let content silently overflow past the fixed page
// height before this existed. Continuation pages have no sidebar (rows
// really are full-width there), so this measurement is conservative for
// them — a few bytes of unused space per continuation page, never
// overflow — rather than exact.
function pbPackBlocks(root, blocks, firstPageBudget, restPageBudget, measureWrapPrefix, measureWrapSuffix) {
  if (!blocks.length) return [[]];
  const unitsHTML = blocks.map(h => '<div class="pexport-unit">' + h + '</div>').join('');
  root.innerHTML = '<div class="pexport">' + (measureWrapPrefix || '') + unitsHTML + (measureWrapSuffix || '') + '</div>';
  const container = root.querySelector('.pexport-unit').parentElement;
  const children = Array.from(container.children);
  const tops = children.map(el => el.offsetTop);
  const total = container.scrollHeight;
  const heights = children.map((el, i) => (i + 1 < children.length ? tops[i + 1] : total) - tops[i]);

  const pages = [];
  let current = [];
  let used = 0;
  let budget = firstPageBudget;
  for (let i = 0; i < blocks.length; i++) {
    const h = heights[i];
    if (current.length && used + h > budget) {
      pages.push(current);
      current = [];
      used = 0;
      budget = restPageBudget;
    }
    current.push(blocks[i]);
    used += h;
  }
  pages.push(current);
  return pages;
}

// Shared by every html2canvas call in this file. Three of the five call
// sites (the two below plus exportRunPNG/exportSessionReportPNG) append a
// QR-code DOM node to `root` *after* their innerHTML is set and *before*
// rasterizing — routing them through pbRasterizePage() would re-assign
// innerHTML and silently wipe that node, so this constant exists to remove
// the literal duplication without touching that DOM-mutation order.
const PEXPORT_RASTER_OPTS = { width: 794, windowWidth: 794, scale: 2, backgroundColor: '#ffffff', useCORS: true };

async function pbRasterizePage(root, html) {
  root.innerHTML = html;
  return html2canvas(root, PEXPORT_RASTER_OPTS);
}

function pbSavePDFFromCanvases(canvases, filenamePrefix) {
  const { jsPDF } = jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    const heightMm = Math.min(pageHeightMm, canvas.height * (pageWidthMm / canvas.width));
    // JPEG, not PNG: this is a mostly-text/solid-fill document (not a
    // photo), but embedding it as an uncompressed PNG at 2x scale made a
    // typical one-page plan ~10MB — a real problem for practitioners
    // emailing/sharing it. High-quality JPEG (0.92) is visually
    // indistinguishable at any normal zoom level and ~20x smaller.
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidthMm, heightMm);
  });
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  pdf.save(filenamePrefix + '-' + ts + '.pdf');
}

// Page 1 carries the title + column headers above its rows, plus the
// sidebar (charts/materials/QR) alongside them. Continuation pages repeat
// just the topbar + column headers (no title, no sidebar — a session long
// enough to spill onto more than one page always has far more row content
// than the sidebar is tall, so the sidebar never competes for page-2+
// space). Every page shares the same repeating footer.
//
// The trailing banner+checklist (tailBlockHTML) always renders full-width,
// as a sibling of .pexport-body — never squeezed into the narrower row
// column — and travels down to the bottom of the page together with the
// footer-bottom line as one connected .pexport-tail-anchor unit, rather
// than the footer-bottom line alone drifting away from it with a large
// gap in between.
async function pbBuildSessionPaginatedCanvases(root) {
  const d = pbBuildSessionExportData();

  const page1ChromeHeight = pbMeasureHeight(root, d.headerHTML + d.titleHTML + d.colHeadersHTML);
  const restChromeHeight = pbMeasureHeight(root, d.headerHTML + d.colHeadersHTML);
  const footerHeight = pbMeasureHeight(root, d.footerBottomHTML);
  const tailHeight = pbMeasureHeight(root, d.tailBlockHTML);

  const firstPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - page1ChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const restPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - restChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const rowPages = pbPackBlocks(
    root, d.rowBlocks, firstPageBudget, restPageBudget,
    '<div class="pexport-body"><div class="pexport-timeline">',
    '</div>' + d.sidebarHTML + '</div>'
  );

  // Does the tail block fit under whatever rows landed on the last page?
  // Measured at its real full-page width, not the narrower per-row
  // measurement context, since it renders as a full-width sibling.
  const lastIdx = rowPages.length - 1;
  const lastIsFirst = lastIdx === 0;
  const lastBudget = lastIsFirst ? firstPageBudget : restPageBudget;
  const lastRowsHeight = rowPages[lastIdx].length
    ? pbMeasureHeight(
        root,
        (lastIsFirst ? '<div class="pexport-body"><div class="pexport-timeline">' : '') +
        rowPages[lastIdx].join('') +
        (lastIsFirst ? ('</div>' + d.sidebarHTML + '</div>') : '')
      )
    : 0;
  const tailFitsOnLastPage = (lastRowsHeight + tailHeight) <= lastBudget;
  const totalPages = rowPages.length + (tailFitsOnLastPage ? 0 : 1);
  const footerForPage = pageNum => d.footerBottomHTML.replace('__PEXPORT_PAGE__', pageNum + '/' + totalPages);

  const canvases = [];
  for (let i = 0; i < rowPages.length; i++) {
    const isFirst = i === 0;
    const isLast = i === lastIdx;
    const hasRows = rowPages[i].length > 0;
    const colHeaders = hasRows ? d.colHeadersHTML : '';
    const bodyHTML = isFirst
      ? '<div class="pexport-body"><div class="pexport-timeline">' + colHeaders + rowPages[i].join('') + '</div>' + d.sidebarHTML + '</div>'
      : '<div class="pexport-body"><div class="pexport-timeline">' + colHeaders + rowPages[i].join('') + '</div></div>';
    const tailAnchorHTML = '<div class="pexport-tail-anchor">' + (isLast && tailFitsOnLastPage ? d.tailBlockHTML : '') + footerForPage(i + 1) + '</div>';
    root.innerHTML = '<div class="pexport pexport--paged" style="height:' + PEXPORT_PAGE_INNER_HEIGHT_CSS_PX + 'px;">' +
      d.headerHTML + (isFirst ? d.titleHTML : '') + bodyHTML + tailAnchorHTML +
    '</div>';
    if (isFirst) {
      const qrNode = exportGenerateSessionQRNode();
      const slot = root.querySelector('#print-qr-slot');
      if (qrNode && slot) slot.appendChild(qrNode);
    }
    canvases.push(await html2canvas(root, PEXPORT_RASTER_OPTS));
  }

  if (!tailFitsOnLastPage) {
    root.innerHTML = '<div class="pexport pexport--paged" style="height:' + PEXPORT_PAGE_INNER_HEIGHT_CSS_PX + 'px;">' +
      d.headerHTML +
      '<div class="pexport-tail-anchor">' + d.tailBlockHTML + footerForPage(totalPages) + '</div>' +
    '</div>';
    canvases.push(await html2canvas(root, PEXPORT_RASTER_OPTS));
  }
  return canvases;
}

async function exportRunPDF() {
  if (!pbSession.length) return;
  if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  const root = document.getElementById('print-session');
  if (!root) return;
  document.body.classList.add('is-exporting-png');
  try {
    const canvases = await pbBuildSessionPaginatedCanvases(root);
    pbSavePDFFromCanvases(canvases, 'forest4youth-session');
  } catch (err) {
    console.error('PDF export failed', err);
    alert('PDF export failed. Try Export to PNG instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
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
    const canvas = await html2canvas(node, PEXPORT_RASTER_OPTS);
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const link = document.createElement('a');
    link.download = 'forest4youth-session-' + ts + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('PNG export failed', err);
    alert('PNG export failed. Try Export to PDF instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

// ───────── EXPORT: POST-SESSION REPORT ─────────
// Builds from #print-report (the most recent run's record, the
// self-reflection answers, and the outcome indicators) instead of
// #print-session (the session plan).
// Same .pexport visual language as exportRenderPrintSession() (colors,
// type, .pexport-row/-section-label/-footer-bottom etc.) but single-column
// — no chart sidebar, since the report's job is giving session notes and
// free-text reflection room to breathe, not at-a-glance stats.
// Same split as pbBuildSessionExportData() above: every HTML piece built
// without touching the DOM, shared by the continuous render below (on-
// screen/PNG) and the paginated PDF path (pbBuildReportPaginatedCanvases).
// Returns null if there's no session record yet (nothing to export).
function pbBuildReportExportData() {
  const lang = typeof currentLang === 'string' ? currentLang : 'en';
  const records = pbLoadSessionRecords();
  if (!records.length) return null;
  const record = records[0];
  const meta = pbLoadReflectMeta();
  const date = pbFormatWhen(record.when);

  const groupIds = new Set();
  let actualMinsTotal = 0, anyActual = false;
  record.items.forEach(it => {
    const a = ACTIVITIES.find(x => x.id === it.id);
    if (a) groupIds.add(a.group);
    if (it.actualSecs != null) { anyActual = true; actualMinsTotal += it.actualSecs / 60; }
  });
  const totalMins = Math.round(anyActual ? actualMinsTotal : (record.target || 0));

  const rowBlocks = record.items.map((it, i) => {
    const a = ACTIVITIES.find(x => x.id === it.id);
    const name = a ? pbT(a, 'name') : it.id;
    const actual = it.actualSecs != null ? pbFmtMinSec(it.actualSecs) : '—';
    const grp = a ? GROUPS[a.group - 1] : null;
    const groupHTML = grp ? '<div class="pexport-row-group">' + pbEscapeHtml(grp.num) + ' · ' + pbEscapeHtml(pbGroupT(grp, 'title')) + '</div>' : '';
    const noteHTML = it.note ? '<div class="pexport-row-note">' + pbEscapeHtml(it.note) + '</div>' : '';
    return '<div class="pexport-row">' +
      '<div class="pexport-row-clock">' +
        '<div class="pexport-row-clock-time">' + pbEscapeHtml(actual) + '</div>' +
        '<div class="pexport-row-clock-dur">' + it.plannedMins + ' min ' + pbEscapeHtml(t('pbui.reflect.planned')) + '</div>' +
      '</div>' +
      '<div class="pexport-row-bar" style="background:' + (a ? PB_GROUP_COLORS[a.group] : '#ccc') + '"></div>' +
      '<div class="pexport-row-main">' +
        '<div class="pexport-row-heading"><span class="pexport-row-num">' + String(i + 1).padStart(2, '0') + '</span> ' + pbEscapeHtml(name) + '</div>' +
        groupHTML +
        noteHTML +
      '</div>' +
    '</div>';
  });

  const answerBlocks = Array.prototype.map.call(
    document.querySelectorAll('#mod-reflect-self .reflect-prompt'), p => {
      const qEl = p.querySelector('h4');
      const q = qEl ? qEl.textContent : '';
      const ta = p.querySelector('.reflect-answer');
      const val = ta ? ta.value.trim() : '';
      const ans = val ? pbEscapeHtml(val) : '—';
      return '<div class="pexport-qa-card"><div class="pexport-qa-q">' + pbEscapeHtml(q) + '</div>' +
        '<div class="pexport-qa-a">' + ans + '</div></div>';
    }
  );

  const indicatorBlocks = Array.prototype.map.call(
    document.querySelectorAll('#mod-indicators .check-item-v2'), el => {
      const labelEl = el.querySelector('label');
      const label = labelEl ? labelEl.textContent : '';
      const on = el.classList.contains('checked');
      return '<div class="pexport-indicator-item' + (on ? ' is-checked' : '') + '">' + (on ? '☑' : '☐') + ' ' + pbEscapeHtml(label) + '</div>';
    }
  );

  // The free-text "other notes" field is the one thing worth its own
  // highlighted card — everything else in pbLoadReflectMeta() moves up
  // into the header fields below. Omitted entirely if never filled in.
  const notesBlock = (meta.other || '').trim()
    ? '<div class="pexport-notes-card">' +
        '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.meta.title')) + '</div>' +
        '<div class="pexport-notes-text">' + pbEscapeHtml(meta.other.trim()) + '</div>' +
      '</div>'
    : null;

  const placeInst = [meta.place, meta.institution].filter(v => (v || '').trim()).join(' · ');
  const subtitle = t('pbui.reflect.report.subtitle')
    .replace('{groups}', String(groupIds.size))
    .replace('{n}', String(record.items.length))
    .replace('{mins}', String(totalMins));

  const headerHTML =
    '<div class="pexport-topbar">' +
      '<div class="pexport-topbar-fields">' +
        '<div class="pexport-meta-row">' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.planexport.label.date')) + '</div><div class="pexport-value">' + pbEscapeHtml(date) + '</div></div>' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.reflect.meta.start')) + '</div><div class="pexport-value">' + pbEscapeHtml(meta.start || '—') + '</div></div>' +
        '</div>' +
        '<div class="pexport-meta-row">' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.reflect.report.label.participants')) + '</div><div class="pexport-value">' + pbEscapeHtml(meta.participants || '—') + '</div></div>' +
          '<div class="pexport-meta-block"><div class="pexport-label">' + pbEscapeHtml(t('pbui.reflect.report.label.placeinst')) + '</div><div class="pexport-value">' + pbEscapeHtml(placeInst || '—') + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="pexport-logos">' +
        '<img class="pexport-logo-img" src="assets/logo-interreg-forest4youth.png" alt="Interreg North-West Europe · Forest4Youth">' +
      '</div>' +
    '</div>';

  const titleHTML =
    '<div class="pexport-title-block">' +
      '<h1 class="pexport-title">' + pbEscapeHtml(t('pbui.reflect.report.title')) + '</h1>' +
      '<div class="pexport-subtitle">' + pbEscapeHtml(subtitle) + '</div>' +
    '</div>';

  const footerBottomHTML =
    '<div class="pexport-footer-bottom">' +
      '<span>Forest4Youth · Interreg North-West Europe</span>' +
      '<span>' + pbEscapeHtml(t('pbui.planexport.footer.generated').replace('{date}', new Date().toLocaleDateString(lang))) + ' · ' + lang.toUpperCase() + ' · __PEXPORT_PAGE__</span>' +
    '</div>';

  const sessionLabelHTML = '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.report.session')) + '</div>';
  const reflectionLabelHTML = '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.report.selfreflection')) + '</div>';
  const indicatorsLabelHTML = '<div class="pexport-section-label">' + pbEscapeHtml(t('pbui.reflect.report.indicators')) + '</div>';

  // Blocks flow in document order, one atomic unit each. Each section's
  // label is glued to the item right after it (merged into a single block
  // string) so a page break can never leave a header alone at the bottom.
  const blocks = [];
  if (notesBlock) blocks.push(notesBlock);
  const sessionItems = rowBlocks.length ? rowBlocks : ['—'];
  blocks.push(sessionLabelHTML + sessionItems[0], ...sessionItems.slice(1));
  const reflectItems = answerBlocks.length ? answerBlocks : ['—'];
  blocks.push(reflectionLabelHTML + reflectItems[0], ...reflectItems.slice(1));
  const indicatorItems = indicatorBlocks.length ? indicatorBlocks : ['—'];
  blocks.push(indicatorsLabelHTML + indicatorItems[0], ...indicatorItems.slice(1));

  return { headerHTML, titleHTML, footerBottomHTML, blocks };
}

function exportRenderPrintReport() {
  const root = document.getElementById('print-report');
  if (!root) return;
  const d = pbBuildReportExportData();
  if (!d) { root.innerHTML = ''; return; }
  root.innerHTML = '<div class="pexport">' + d.headerHTML + d.titleHTML + d.blocks.join('') + d.footerBottomHTML.replace(' · __PEXPORT_PAGE__', '') + '</div>';
}

// Report pages are single-column (no sidebar) — the topbar repeats on
// every page, the title only on page 1, and every section's blocks flow
// across pages just like the plan's rows do.
async function pbBuildReportPaginatedCanvases(root) {
  const d = pbBuildReportExportData();
  if (!d) return [];

  const page1ChromeHeight = pbMeasureHeight(root, d.headerHTML + d.titleHTML);
  const restChromeHeight = pbMeasureHeight(root, d.headerHTML);
  const footerHeight = pbMeasureHeight(root, d.footerBottomHTML);

  const firstPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - page1ChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const restPageBudget = PEXPORT_PAGE_HEIGHT_CSS_PX - PEXPORT_PAGE_PAD_CSS_PX - restChromeHeight - footerHeight - PEXPORT_PAGE_GAP_CSS_PX;
  const pages = pbPackBlocks(root, d.blocks, firstPageBudget, restPageBudget);

  const canvases = [];
  for (let i = 0; i < pages.length; i++) {
    const isFirst = i === 0;
    const footer = d.footerBottomHTML.replace('__PEXPORT_PAGE__', (i + 1) + '/' + pages.length);
    const pageHTML = '<div class="pexport pexport--paged" style="height:' + PEXPORT_PAGE_INNER_HEIGHT_CSS_PX + 'px;">' +
      d.headerHTML + (isFirst ? d.titleHTML : '') + pages[i].join('') + footer +
    '</div>';
    canvases.push(await pbRasterizePage(root, pageHTML));
  }
  return canvases;
}

// Belt-and-suspenders alongside the button's own disabled state: same two
// conditions pbUpdateReflectExportGate() below uses to enable the button,
// checked again here so a somehow-triggered click (e.g. programmatically,
// or before the gate has re-rendered) still can't produce a report with
// nothing in it.
//
// Same html2canvas+jsPDF pipeline as exportRunPDF() (the plan export) —
// once the report picked up the same .pexport visual language, it needed
// the same rendering guarantee: the PDF has to match the on-screen/PNG
// version pixel-for-pixel, which print-CSS fidelity can't promise.
async function exportSessionReportPDF() {
  if (!pbLoadSessionRecords().length) return;
  if (!pbHasReflectionContent()) return;
  if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  const root = document.getElementById('print-report');
  if (!root) return;
  document.body.classList.add('is-exporting-png');
  try {
    const canvases = await pbBuildReportPaginatedCanvases(root);
    if (!canvases.length) return;
    pbSavePDFFromCanvases(canvases, 'forest4youth-reflection');
  } catch (err) {
    console.error('PDF export failed', err);
    alert('PDF export failed. Try Export to PNG instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

// Same html2canvas approach as exportRunPNG() above, pointed at
// #print-report (built by exportRenderPrintReport()) instead of
// #print-session. Kept as a near-duplicate of exportRunPNG() rather than a
// shared helper parameterized by target id, because the two already read
// different gate conditions (plan non-empty vs. record+content) and a
// shared helper would need to take the gate check as a parameter too,
// which ends up harder to follow than two short functions.
async function exportSessionReportPNG() {
  if (!pbLoadSessionRecords().length) return;
  if (!pbHasReflectionContent()) return;
  if (typeof html2canvas === 'undefined') {
    alert('Export library not loaded.');
    return;
  }
  exportRenderPrintReport();
  document.body.classList.add('is-exporting-png');
  try {
    const node = document.getElementById('print-report');
    const canvas = await html2canvas(node, PEXPORT_RASTER_OPTS);
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const link = document.createElement('a');
    link.download = 'forest4youth-reflection-' + ts + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('PNG export failed', err);
    alert('PNG export failed. Try Export to PDF instead.');
  } finally {
    document.body.classList.remove('is-exporting-png');
  }
}

// True once the practitioner has written *something* in the reflection UI —
// at least one of the 4 self-reflection prompts, or at least one outcome
// indicator ticked. Read straight from the live DOM (values already restored
// by pbRestoreReflectState() on load, or just typed/toggled), same source
// exportRenderPrintReport() itself reads from — so "has content" and "what
// gets exported" can never disagree.
function pbHasReflectionContent() {
  const anyAnswer = Array.prototype.some.call(
    document.querySelectorAll('.reflect-answer'), ta => ta.value.trim().length > 0);
  if (anyAnswer) return true;
  return Array.prototype.some.call(
    document.querySelectorAll('#mod-indicators .check-item-v2'), el => el.classList.contains('checked'));
}

// Live-updates the Reflect screen's export button + its adjacent
// explanatory text against two conditions together: a session record must
// exist (pbLoadSessionRecords().length > 0) AND at least one reflection
// field must have content (pbHasReflectionContent()). Called whenever
// either side of that could have changed — a run finishes/closes
// (pbRenderReflectSummary), a reflection answer is typed
// (pbSaveReflectAnswer), an indicator is toggled (pbToggleIndicator), and
// once more on load after restoring saved reflection state — so the button
// is never stale relative to what's actually on screen.
// Two export buttons on the Reflect screen share this one gate: an early
// one right under the "session just run" recap for quick access, and the
// primary one at the end of the page (after prompts/indicators, before
// Session history) for the natural end-of-flow action. Both read/write the
// same underlying state, so keeping them in sync here (rather than two
// separate gate functions) means they can never disagree.
// One export panel (PDF button + PNG button + shared hint) — there used to
// be two (an early one under the recap, a second before Session history);
// consolidated back to a single instance positioned after everything that
// can feed the report, per product direction against having export UI
// interrupt the page in more than one place.
const PB_REFLECT_EXPORT_BTN_IDS = ['reflect-export-btn', 'reflect-export-png-btn'];
function pbUpdateReflectExportGate() {
  const hasRecord = pbLoadSessionRecords().length > 0;
  const hasContent = pbHasReflectionContent();
  const enabled = hasRecord && hasContent;
  const hintText = !hasRecord ? t('pbui.reflect.export.norecord')
    : !hasContent ? t('pbui.reflect.export.needcontent')
    : t('pbui.reflect.export.hint');
  PB_REFLECT_EXPORT_BTN_IDS.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.setAttribute('aria-disabled', String(!enabled));
  });
  const hint = document.getElementById('reflect-export-hint');
  if (hint) hint.textContent = hintText;
}

