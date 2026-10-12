// wf-bridge.js — joins the tree (entry-tree.js) and Walk the Forest
// (walk-forest*.js, unchanged from REVAMP). iframed-2.0.
//
// In: the walker steps onto the tree's footpath and the camera follows him
// into the trees (entry-tree.js); the fog closes (wfBridgeFog), then this
// starts Walk the Forest exactly as REVAMP does: walk-forest.js is loaded
// on demand, and its own last line (wfSetOn(true)) starts the scene, in its
// WebGL version (?wf=3d, the switch walk-forest.js already reads). The fog
// lifts once the 3D forest is up.
// Out: Walk the Forest's own toggle (#wf-toggle-btn) turns the scene off;
// that brings you back to the tree.
(function () {
  'use strict';
  var veil = document.createElement('div');
  veil.className = 'wf-veil';
  veil.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veil);

  window.wfBridgeFog = function () { veil.classList.add('on'); };

  function want3d() {
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('wf') !== '3d') { u.searchParams.set('wf', '3d'); history.replaceState(null, '', u.pathname + u.search); }
      else if (location.hash) history.replaceState(null, '', u.pathname + u.search);
    } catch (e) {}
  }
  function lift() {
    var t0 = performance.now();
    (function wait() {
      var ready = typeof WF3D !== 'undefined' && WF3D.state === 'ready';
      if (ready || performance.now() - t0 > 3000) {
        veil.classList.remove('on');
        if (window.F4Y_TREE) window.F4Y_TREE.reset();
      } else requestAnimationFrame(wait);
    })();
  }
  var loading = false;
  window.wfBridgeEnter = function () {
    veil.classList.add('on');
    want3d();
    document.body.classList.add('walking');
    // As on REVAMP, the forest view is "no screen open": the scene stays
    // crisp and the app floats over it only when you open something.
    var es = document.getElementById('entry-screen'); if (es) es.classList.remove('active');
    if (typeof wfSetOn === 'function') { wfSetOn(true); lift(); return; }
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = 'walk-forest.js';
    s.onload = function () { loading = false; lift(); };
    s.onerror = function () { loading = false; document.body.classList.remove('walking'); veil.classList.remove('on'); if (window.F4Y_TREE) window.F4Y_TREE.reset(); };
    document.body.appendChild(s);
  };

  // Leaving the forest with its own toggle returns to the tree.
  new MutationObserver(function () {
    var b = document.body;
    if (b.classList.contains('walking') && !b.classList.contains('wf-scene-on') && typeof WF !== 'undefined' && !loading) {
      b.classList.remove('walking', 'wf-scene-deep');
      // back on the tree: the start screen again
      if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
      if (typeof applyRoute === 'function') applyRoute();
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
