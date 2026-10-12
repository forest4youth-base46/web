// ============================================================
// IMMERSIVE VIRTUAL NATURE — informational hub (#ivn, #ivn/<page>)
// ============================================================
// Informational only, drawn from the IVN guide — no interactive session
// tool, no timer, no "Run" step (removed 2026-10-12, Ivo: "no run for
// IVN, only informational and drawn from the guides"). The full guide
// (#guide/g-ivn-*, 8 sections: start, principles, modules, safety,
// measure, service, sheets, young) is the primary destination; this hub
// is a short landing page into it, plus the two pages worth a direct
// link — the safety/distress steps and the page for young people.
//
// All content comes from GUIDE_IVN (guide-ivn-data.js, generated from
// the IVN practical guide). No session state, no storage, no personal
// data collected anywhere in this file.

const IVN = (typeof GUIDE_IVN !== 'undefined' && GUIDE_IVN.tools) || null;

function ivnPage(kicker, title, lead, body) {
  return toolPage({ hub: 'ivn', back: t('ivn.back'), kicker, title, lead, body });
}

// ── Hub ───────────────────────────────────────────────────
function ivnHub() {
  return toolHub({
    badge: t('ivn.badge'), title: t('ivn.title'), sub: t('ivn.sub'),
    groups: [
      { label: t('ivn.group.read'), cards: [
        { href: '#guide/g-ivn-start', title: t('ivn.card.guide.title'), text: t('ivn.card.guide.text'), tone: 'main' },
        { href: '#ivn/young', title: t('ivn.card.young.title'), text: t('ivn.card.young.text') },
        { href: '#fi', title: t('ivn.card.fi.title'), text: t('ivn.card.fi.text') },
      ]},
      { label: t('ivn.group.safety'), cards: [
        { href: '#ivn/distress', title: t('ivn.card.distress.title'), text: t('ivn.card.distress.text'), tone: 'alert' },
      ]},
    ],
  });
}

// ── If a young person is overwhelmed (informational, no session gate) ──
function ivnDistressBlock() {
  const D = IVN.distress;
  return '<div class="ivn-distress">' +
    '<h4>' + toolEsc(t('ivn.distress.act')) + '</h4><ol class="ivn-act">' + D.act.map(a => '<li>' + toolEsc(a) + '</li>').join('') + '</ol>' +
    '<h4>' + toolEsc(t('ivn.distress.watch')) + '</h4><ul class="gd-list">' + D.watch.map(a => '<li>' + toolEsc(a) + '</li>').join('') + '</ul>' +
    '<h4>' + toolEsc(t('ivn.distress.after')) + '</h4><ul class="gd-list">' + D.after.map(a => '<li>' + toolEsc(a) + '</li>').join('') + '</ul></div>';
}
function ivnDistress() {
  return ivnPage(t('ivn.group.safety'), t('ivn.card.distress.title'), IVN.distress.intro,
    '<section class="tool-card tool-card-alert">' + ivnDistressBlock() + '</section>');
}

// ── For young people ──────────────────────────────────────
function ivnYoung() {
  const sec = GUIDE_IVN.sections.find(s => s.id === 'ivn-young');
  const intro = sec.blocks.filter(b => b.t === 'p').map(b => '<p class="gd-lead-p">' + toolEsc(b.text) + '</p>').join('');
  const qa = (sec.blocks.find(b => b.t === 'qa') || { items: [] }).items;
  const body = '<div id="ivn-young-print" class="ivn-young">' + intro + '<div class="gd-qa">' +
    qa.map(i => '<div class="gd-qa-item"><h5>' + toolEsc(i.q) + '</h5><p>' + toolEsc(i.a) + '</p></div>').join('') + '</div></div>' +
    '<div class="tool-actions"><button type="button" class="gd-button" onclick="toolPrint(document.getElementById(\'ivn-young-print\'))">' + toolEsc(t('ivn.young.print')) + '</button></div>';
  return ivnPage(t('ivn.group.read'), t('ivn.card.young.title'), t('ivn.young.lead'), body);
}

// ── Render + routing ──────────────────────────────────────
const IVN_VIEWS = { distress: ivnDistress, young: ivnYoung };

function ivnRender() {
  const root = document.getElementById('ivn-root');
  if (!root || !IVN) return;
  const r = toolRoute();
  const view = r.hub === 'ivn' && IVN_VIEWS[r.tool];
  root.innerHTML = view ? view(r.arg) : ivnHub();
}

function ivnSyncFromHash() {
  if (toolRoute().hub !== 'ivn') return;
  ivnRender();
  toolFocusTitle(document.getElementById('ivn-root'));
}

window.addEventListener('hashchange', ivnSyncFromHash);
ivnRender();
