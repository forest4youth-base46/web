// ─────────────────────────────────────────
// TRANSLATIONS
// ─────────────────────────────────────────
// Each language's strings live in their own file — i18n-en.js, i18n-fr.js,
// i18n-de.js, loaded before this one — so adding a language or handing a
// single file to a translator doesn't mean touching this one or the other
// two. Keys must stay in sync across all three; see the header comment in
// any of those files for what "in sync" means in practice.
const T = { en: T_EN, fr: T_FR, de: T_DE };

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let currentLang = 'en';

// ─────────────────────────────────────────
// I18N
// ─────────────────────────────────────────
function t(key) {
  return (T[currentLang] && T[currentLang][key]) || (T['en'][key]) || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // Same idea as [data-i18n], but for the handful of strings that need
  // embedded markup (e.g. a <strong> around one word) — sets innerHTML
  // instead of textContent. Used sparingly and only where formatting
  // would otherwise be lost.
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    el.innerHTML = t(key);
  });
  // For translating an attribute (title, aria-label, ...) instead of the
  // element's own text. Format: "attr1,attr2:key", e.g.
  // data-i18n-attr="title,aria-label:pbui.export.pdf".
  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const [attrs, key] = el.getAttribute('data-i18n-attr').split(':');
    const value = t(key);
    attrs.split(',').forEach(attr => el.setAttribute(attr, value));
  });
  document.documentElement.lang = currentLang;
}

function setLang(lang) {
  currentLang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.textContent === lang.toUpperCase()));
  applyTranslations();
  // The Pocketbook is built via innerHTML from JS, not [data-i18n] markup,
  // so applyTranslations() above doesn't touch it — re-render it directly
  // if it's already been initialized, so switching language updates any
  // already-visible Pocketbook content immediately instead of only on
  // next reload.
  if (window.__pbInited) {
    pbRenderGroups();
    pbRenderFilters();
    pbRenderAdaptations();
    pbRenderBuilder();
    pbRenderReflectSummary();
  }
  // The focused-module back-link and Plan quick-links (Pre-Session
  // Checklist / Session Structure Guide) are injected once from t() when
  // a door module opens, not via [data-i18n] — refresh them in place if a
  // module is currently focused so they don't stay stuck in whatever
  // language was active when it was opened.
  if (typeof refreshFocusModeLabels === 'function') refreshFocusModeLabels();
  // Same idea for the Reference screen's type-filter chips + result count
  // — built via innerHTML/textContent from router.js, not [data-i18n], so
  // they need an explicit re-render too.
  if (typeof refRenderFilters === 'function') {
    refRenderFilters();
    refApplyFilter();
  }
}
