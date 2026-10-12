// features.js — switches for parts of the tool that are parked, not deleted.
// A parked feature keeps its markup, styles, router code and search entries;
// it is only taken out of the page at load, so bringing it back is one flag.
//
//   reference: the Clinical Reference screen (contraindications and screening,
//   verbatim from the Guidance for Professionals §7 and the IVN guide §4.1),
//   its nav link and its entries in the search dialog. Parked 2026-10-12 —
//   Ivo: "remove it from the tool, leave it as something useful to bring
//   back, because we worked a bit on the search bar". Set to true to restore.
//
//   participant: the Exploring role (participant · carer · referrer · curious
//   person): its entry doors, its nav, the header's Practitioner/Exploring
//   switch, the tree's switch and the #role comparison screen. Parked
//   2026-10-12 — Ivo: "take out the explorer for now, it's the only one that
//   bugs it completely, then I'll iframe it". Every visitor is a
//   practitioner while it is off (?role=participant and a remembered role
//   included). Set to true to restore.
window.F4Y_FEATURES = { reference: false, participant: false };

function featureOn(name) { return !!(window.F4Y_FEATURES && window.F4Y_FEATURES[name]); }

// A remembered or linked Exploring role must not stick while it is parked:
// router.js reads fbt.role / ?role= right after this file.
if (!featureOn('participant')) {
  try { if (sessionStorage.getItem('fbt.role') === 'participant') sessionStorage.setItem('fbt.role', 'practitioner'); } catch (e) {}
  try {
    var usp = new URLSearchParams(location.search);
    if (usp.get('role') === 'participant') { usp.delete('role'); var q = usp.toString(); history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); }
  } catch (e) {}
}
// …and nothing can switch to it afterwards.
document.addEventListener('DOMContentLoaded', function () {
  if (featureOn('participant') || typeof window.setRole !== 'function') return;
  var appSetRole = window.setRole;
  window.setRole = function (role, fromRoleScreen) { return appSetRole(role === 'participant' ? 'practitioner' : role, fromRoleScreen); };
  if (document.body.getAttribute('data-role') === 'participant') window.setRole('practitioner');
});

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
