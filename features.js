// features.js — switches for parts of the tool that are parked, not deleted.
// A parked feature keeps its markup, styles, router code and search entries;
// it is only taken out of the page at load, so bringing it back is one flag.
//
//   reference: the Clinical Reference screen (contraindications and screening,
//   verbatim from the Guidance for Professionals §7 and the IVN guide §4.1),
//   its nav link and its entries in the search dialog. Parked 2026-10-12 —
//   Ivo: "remove it from the tool, leave it as something useful to bring
//   back, because we worked a bit on the search bar". Set to true to restore.
window.F4Y_FEATURES = { reference: false };

function featureOn(name) { return !!(window.F4Y_FEATURES && window.F4Y_FEATURES[name]); }

// Elements tagged data-feature="<name>" are removed while <name> is off
// (removing #<x>-screen also makes its route fall back to the entry).
(function () {
  function prune() {
    document.querySelectorAll('[data-feature]').forEach(function (el) {
      if (!featureOn(el.getAttribute('data-feature'))) el.remove();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prune);
  else prune();
})();
