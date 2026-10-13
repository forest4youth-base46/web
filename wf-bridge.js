// wf-bridge.js — joins the tree (entry-tree.js) and Walk the Forest
// (walk-forest*.js, unchanged from REVAMP). iframed-2.0.
//
// In: the walker comes in from the right and steps onto the path behind the
// tree (entry-tree.js). Meanwhile Walk the Forest loads exactly as on REVAMP
// (walk-forest.js on demand; its last line, wfSetOn(true), starts it in its
// WebGL version, ?wf=3d). The tree stands in Walk the Forest's world too,
// so the view carries on there and he walks on to activity 1 (below).
// Out: "Back to the tree" (or Walk the Forest's own toggle) turns the scene
// off, and that brings you back to the tree.
(function () {
  'use strict';
  function want3d() {
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('wf') !== '3d') { u.searchParams.set('wf', '3d'); history.replaceState(null, '', u.pathname + u.search); }
      else if (location.hash) history.replaceState(null, '', u.pathname + u.search);
    } catch (e) {}
  }
  // One world, two points of view. The tree stands in Walk the Forest's own
  // landscape, on the meadow 84 m before activity 1 (6 stops of trail, as
  // far as from activity 17 to the IVN room): call it activity 0. Home
  // looks at it with the tree screen's camera; once the walker is on the
  // path behind it, Walk the Forest's camera starts from that very view
  // (the same tree, copied into its scene) and settles behind him as he
  // walks the path to activity 1 at Walk the Forest's own pace. Walk the
  // Forest's files are untouched: the tree and the start of the path are
  // added to its scene from here, and its camera function is wrapped only
  // for the first seconds of the walk.
  var AT0 = -6, placed = null;
  function place(W) {
    if (placed) return placed;
    var T = THREE, S = WF3D.scene, jx = wf3dX(AT0, 0), jz = wf3dZ(AT0);
    var off = new T.Vector3(jx - W.join.x, wf3dGround(jx, jz) - W.join.y, jz - W.join.z);
    var g = new T.Group(); g.position.copy(off);
    W.objects.forEach(function (o) { if (o) g.add(o.clone()); });
    S.add(g);
    // The tree's two halves meet on a clipping plane, in the tree screen's
    // coordinates: move it into this world for Walk the Forest's renders.
    WF3D.renderer.localClippingEnabled = true;
    var plane = null;
    g.traverse(function (o) { if (!plane && o.material && o.material.clippingPlanes && o.material.clippingPlanes.length) plane = o.material.clippingPlanes[0]; });
    if (plane) {
      var neg = off.clone().negate();
      S.onBeforeRender = function () { plane.translate(off); };
      S.onAfterRender = function () { plane.translate(neg); };
    }
    // Walk the Forest's path starts 3 stops before activity 1; continue it
    // back to the tree, with its own ribbon (wf3dBuildTrail's colours).
    var across = [-2.9, -2.2, -1.75, -1.2, -0.4, 0.4, 1.2, 1.75, 2.2, 2.9], alpha = [0, 0.55, 1, 1, 1, 1, 1, 1, 0.55, 0];
    var base = new T.Color(0xD8CDAF), light = new T.Color(0xE9E0C8), worn = new T.Color(0xC7BA98), tmp = new T.Color();
    var pos = [], col = [], idx = [], steps = Math.ceil((AT0 - 0.6 - -2.9) / -0.04) + 1;
    for (var s = 0; s < steps; s++) {
      var at = AT0 - 0.6 + s * 0.04, z = wf3dZ(at), cx = wfPathLat(at) * WF3D_LAT;
      var d1 = wfPathLat(at + 0.01) * WF3D_LAT - cx, nz = d1 / (0.01 * WF3D_ALONG), nl = Math.sqrt(1 + nz * nz);
      for (var k = 0; k < across.length; k++) {
        var x = cx + across[k] / nl, zz = z + across[k] * nz / nl;
        pos.push(x, wf3dGround(x, zz) + 0.035, zz);
        var dap = Math.max(0, Math.sin(at * 7.3 + across[k] * 1.9) * Math.sin(at * 3.1 - across[k] * 0.7));
        tmp.copy(base).lerp(light, dap * dap * 0.9).lerp(worn, Math.abs(across[k]) < 0.8 ? 0.18 : 0);
        col.push(tmp.r, tmp.g, tmp.b, alpha[k] * Math.min(1, (at - (AT0 - 0.6)) / 0.3));
      }
      if (s) for (k = 0; k < across.length - 1; k++) { var A = (s - 1) * across.length + k, B = s * across.length + k; idx.push(A, B, A + 1, A + 1, B, B + 1); }
    }
    var pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    pg.setAttribute('color', new T.Float32BufferAttribute(col, 4));
    pg.setIndex(idx); pg.computeVertexNormals();
    var pm = new T.Mesh(pg, new T.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    pm.receiveShadow = true; pm.renderOrder = 1; S.add(pm);
    placed = { off: off };
    return placed;
  }
  // Walk the Forest's camera, starting from the tree screen's view.
  var orig = null;
  function settleCamera(W, off) {
    var T = THREE, hc = W.camera, v = hc.view;
    var from = { p: hc.position.clone().add(off), q: hc.quaternion.clone(), fov: hc.fov,
      ox: v && v.enabled ? v.offsetX : 0, oy: v && v.enabled ? v.offsetY : 0 };
    var t0 = performance.now(), DUR = 5200;
    orig = orig || window.wf3dPlaceCamera;
    window.wf3dPlaceCamera = function (dt) {
      orig(dt);
      var cam = WF3D.camera, k = Math.min(1, (performance.now() - t0) / DUR);
      k = k * k * (3 - 2 * k);
      if (k >= 1) { cam.clearViewOffset(); window.wf3dPlaceCamera = orig; document.body.classList.add('walking'); return; }
      cam.position.lerpVectors(from.p, cam.position, k);
      cam.quaternion.copy(from.q).slerp(cam.quaternion, k);
      cam.fov = from.fov + (cam.fov - from.fov) * k;
      cam.setViewOffset(WF.w, WF.h, from.ox * (1 - k), from.oy * (1 - k), WF.w, WF.h);
      cam.updateMatrixWorld();
    };
  }
  function lift() {
    var t0 = performance.now(), tree = document.getElementById('tree-entry');
    (function wait() {
      var ready = typeof WF3D !== 'undefined' && WF3D.state === 'ready' && WF3D.camera;
      var W = window.F4Y_TREE && window.F4Y_TREE.world();
      if (ready && W) {
        var P = place(W);
        // He is where the tree screen shows him: AT0, plus what he has walked
        // past the join while Walk the Forest was loading.
        var at = Math.min(-1, AT0 + W.past / WF3D_ALONG), now = performance.now();
        WF.cam = at; WF.from = at; WF.to = 0; WF.mode = 'move'; WF.moveStart = now;
        WF.manual = false; WF.engaged = true; WF.paused = false; WF.openId = null;   // engaged: he arrives at activity 1 and joins it
        WF3D.cs.x = at; WF3D.cs.v = 1.6 / WF3D_ALONG; WF3D.arrive = 0; WF3D.leaving = false;
        settleCamera(W, P.off);
        // Its stop interface (title, rail, pins) comes up as he nears
        // activity 1; before that it would count stops below 1.
        (function ui() {
          if (!document.body.classList.contains('wf-scene-on')) return;
          if (WF.cam > -0.6) document.body.classList.add('wf-ui-on'); else requestAnimationFrame(ui);
        })();
        if (tree) tree.classList.add('dissolve');
        setTimeout(function () {
          if (tree) tree.classList.remove('dissolve');
          if (window.F4Y_TREE) window.F4Y_TREE.reset();
        }, 900);
      } else if (performance.now() - t0 > 8000 && !ready) {
        // no WebGL forest: straight in
        document.body.classList.add('walking');
        if (window.F4Y_TREE) window.F4Y_TREE.reset();
      } else requestAnimationFrame(wait);
    })();
  }
  var loading = false;
  window.wfBridgeEnter = function () {
    want3d();
    document.body.classList.add('walk-arriving');
    // As on REVAMP, the forest view is "no screen open": the scene stays
    // crisp and the app floats over it only when you open something.
    var es = document.getElementById('entry-screen'); if (es) es.classList.remove('active');
    if (typeof wfSetOn === 'function') { wfSetOn(true); lift(); return; }
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = 'walk-forest.js';
    s.onload = function () { loading = false; lift(); };
    s.onerror = function () { loading = false; document.body.classList.remove('walking', 'walk-arriving'); if (window.F4Y_TREE) window.F4Y_TREE.reset(); };
    document.body.appendChild(s);
  };

  // Home (top left while walking): back to the tree.
  var home = document.getElementById('wf-home-tree');
  if (home) home.addEventListener('click', function () { if (typeof wfSetOn === 'function') wfSetOn(false); });
  function syncOpen() { document.body.classList.toggle('wf-screen-open', !!document.querySelector('.screen.active:not(#entry-screen)')); }
  addEventListener('hashchange', function () { setTimeout(syncOpen, 0); });

  // The rail under the forest: each segment walks to its activity
  // (wfGoTo). Walk the Forest rebuilds that rail whenever what it shows
  // changes (on the plain, non-WebGL scene, every 32 ms while walking), so a
  // press could land on one segment and the release on its replacement, and
  // no click happens. Here the segment acts on the press itself; the click
  // that may follow is swallowed so it doesn't act twice. Keyboard (Enter,
  // Space) still goes through the segment's own click.
  var railPress = 0;
  document.addEventListener('pointerdown', function (e) {
    if (e.button || !document.body.classList.contains('wf-scene-on') || typeof wfGoTo !== 'function') return;
    var b = e.target.closest && e.target.closest('.wf-rail-btn');
    var m = b && /wfGoTo\((\d+)\)/.exec(b.getAttribute('onclick') || '');
    if (!m) return;
    railPress = performance.now();
    wfGoTo(+m[1]);
  }, true);
  document.addEventListener('click', function (e) {
    if (!railPress || performance.now() - railPress > 1500) return;
    if (e.target.closest && e.target.closest('#wf-scene')) { railPress = 0; e.stopPropagation(); e.preventDefault(); }
  }, true);

  // Leaving the forest (home button, or its own toggle) returns to the tree.
  new MutationObserver(function () {
    var b = document.body;
    if ((b.classList.contains('walking') || b.classList.contains('walk-arriving')) && !b.classList.contains('wf-scene-on') && typeof WF !== 'undefined' && !loading) {
      b.classList.remove('walking', 'walk-arriving', 'wf-scene-deep', 'wf-ui-on');
      if (orig) window.wf3dPlaceCamera = orig;
      // back on the tree: the start screen again
      if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
      if (typeof applyRoute === 'function') applyRoute();
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
