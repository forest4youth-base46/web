// ─────────────────────────────────────────
// FAILURE LOGGING
// ─────────────────────────────────────────
// Most storage/history calls across this app are wrapped in try/catch and
// meant to degrade gracefully (private-browsing storage restrictions,
// quota limits, a browser without the History API) — the app keeps
// working without them. "Degrade gracefully" isn't the same as "hide
// completely", though: every one of those catches used to be silent
// (`catch(e){}`), which meant a real bug report ("my session didn't
// save") had nothing in the console to point at. This logs it instead —
// console.warn, not .error, since none of these are meant to be fatal.
function warnFailure(context, err) {
  console.warn('[Forest4Youth] ' + context + ':', err);
}

// ─────────────────────────────────────────
// LOCALSTORAGE (versioned)
// ─────────────────────────────────────────
// Every localStorage key this app writes (pb_session, pb_session_mins,
// f4y.reflect.*, f4y.sessions) used to be a bare, unversioned JSON value —
// fine until the shape of one of them ever needs to change, at which point
// a returning visitor's old data would either silently corrupt whatever
// reads it or need one-off defensive code at every read site. These two
// helpers wrap every key as { v: STORAGE_SCHEMA_VERSION, data } instead, so
// a future format change has one place to add a migration rather than
// needing to be threaded through every call site by hand.
//
// storageLoad() still reads a pre-existing bare (unwrapped) value once —
// that's what every key already in a real visitor's browser looks like
// today — the next storageSave() call wraps it going forward.
const STORAGE_SCHEMA_VERSION = 1;

function storageSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: STORAGE_SCHEMA_VERSION, data: value }));
  } catch (e) {
    warnFailure('saving ' + key + ' to localStorage', e);
  }
}

function storageLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'v' in parsed && 'data' in parsed) {
      if (parsed.v !== STORAGE_SCHEMA_VERSION) {
        // No migrations exist yet (v1 is the first version) — an unknown
        // version falls back rather than risk misreading a future shape.
        warnFailure('localStorage key "' + key + '" has schema version ' + parsed.v + ', expected ' + STORAGE_SCHEMA_VERSION + ' (no migration defined for it yet)', null);
        return fallback;
      }
      return parsed.data;
    }
    return parsed; // pre-versioning bare value
  } catch (e) {
    warnFailure('loading ' + key + ' from localStorage (corrupted or blocked)', e);
    return fallback;
  }
}

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
