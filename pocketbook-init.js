// ─── Pocketbook: bootstrap — restoring a QR/link-shared session, then
//     pbInit() itself, which wires together every other pocketbook-*.js
//     file on DOMContentLoaded. Load this one last. ───
'use strict';

// Restores a session shared via the plan-export QR code / link (the ?s=/
// ?m=/?l= params built by exportBuildSessionURL()) — order, per-item
// timing overrides, and language. Distinct from pbLoadSession()'s
// localStorage path above: this only ever runs when a share link was
// explicitly opened, so it doesn't conflict with "a returning visitor
// always starts clean". Deliberately does NOT strip the params afterward —
// the whole point of the link is that it stays live, so reopening it or
// simply refreshing the page reproduces the same session every time.
// Returns true when a shared session was actually restored, so pbInit()
// can tell a QR/link open apart from an ordinary page load.
function pbRestoreSharedSession() {
  try {
    const usp = new URLSearchParams(window.location.search);
    if (!usp.has('s')) return false;
    const order = usp.get('s').split('.').filter(Boolean).map(Number);
    pbSession = order.map(i => ACTIVITIES[i] && ACTIVITIES[i].id).filter(Boolean);
    const mins = {};
    const minsParam = usp.get('m');
    if (minsParam) {
      minsParam.split('.').filter(Boolean).forEach(pair => {
        const [iStr, mStr] = pair.split(':');
        const activity = ACTIVITIES[Number(iStr)];
        const m = Number(mStr);
        if (activity && pbSession.indexOf(activity.id) !== -1 && Number.isFinite(m)) {
          mins[activity.id] = m;
        }
      });
    }
    pbSessionMins = mins;
    const lang = usp.get('l');
    if (lang && T[lang]) setLang(lang);
    return pbSession.length > 0;
  } catch (e) { warnFailure('restoring shared session from ?s=/?m=/?l= (malformed share link?)', e); return false; }
}

// (init invoked by pbInit() in main script)
function pbInit() {
  if (window.__pbInited) return;
  window.__pbInited = true;
  // pbLoadSession()/pbSessionMins intentionally NOT loaded from
  // localStorage: count always starts at 0 on page load so a returning
  // user is never shown a stale plan. A shared session (?s= from a QR/
  // export link) is a separate, explicit path — restore that instead.
  const sharedSessionRestored = pbRestoreSharedSession();
  pbRenderGroups();
  pbRenderFilters();
  pbRenderAdaptations();
  pbRenderBuilder();
  pbRefreshAddButtons();
  pbRestoreReflectState();
  pbRenderReflectSummary();
  // A QR-scanned/shared-link open is meant to get the practitioner straight
  // into running the session, not leave them staring at the builder they'd
  // already finished composing — mirrors navGoRun()'s own
  // "session ready -> start Run Mode" guard (router.js).
  if (sharedSessionRestored && typeof pbStartRunMode === 'function') pbStartRunMode();
}


// ============================================================
// POCKETBOOK — init on DOM ready
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { pbInit(); } catch(e) { console.error('pbInit error', e); } });
} else {
  // Defer to next tick so pbInit definition lower in this script has been parsed
  Promise.resolve().then(() => { try { pbInit(); } catch(e) { console.error('pbInit error', e); } });
}
