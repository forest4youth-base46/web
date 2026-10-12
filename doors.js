// doors.js — the entry-screen "doors" (.pathway-card).
// Each door gets a small painted forest opening (canopy layers, framing
// trunks, fog, a path running in) using the WebGL Walk the Forest's own
// palette (branch REVAMP, walk-forest-3d.js), so the doors feel like the
// same forest without loading the scene itself. Two layouts while Ivo
// chooses (2026-10-12): ?doors=a "Thresholds" (default), ?doors=b
// "Clearings" (wide cards that lean toward the pointer).
(function () {
  var params = new URLSearchParams(window.location.search);
  var variant = params.get('doors') === 'b' ? 'b' : 'a';
  document.documentElement.setAttribute('data-doors', variant);

  var SCENE =
    '<svg class="door-scene-svg" viewBox="0 0 200 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="doorSky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#F4F7EF"/><stop offset="1" stop-color="#D6E3D9"/>' +
        '</linearGradient>' +
        '<radialGradient id="doorSun" cx="0.5" cy="0.5" r="0.5">' +
          '<stop offset="0" stop-color="#FFF3E0" stop-opacity="1"/><stop offset="1" stop-color="#FFF3E0" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<rect width="200" height="150" fill="url(#doorSky)"/>' +
      '<ellipse class="dr-glow" cx="100" cy="96" rx="62" ry="40" fill="url(#doorSun)"/>' +
      // far canopy in the fog
      '<path class="dr-far" d="M0 92 Q10 78 20 86 Q28 72 40 82 Q50 70 60 80 Q70 74 78 84 L122 84 Q130 74 140 80 Q150 70 160 82 Q172 72 180 86 Q190 78 200 92 L200 112 L0 112 Z" fill="#7FA396" opacity=".5"/>' +
      // mid trees: visible trunks under rounded crowns, either side of the opening
      '<g class="dr-mid">' +
        '<rect x="40" y="80" width="3" height="34" fill="#7E6654"/><rect x="64" y="90" width="2.2" height="22" fill="#6E5847"/>' +
        '<rect x="157" y="80" width="3" height="34" fill="#7E6654"/><rect x="133.8" y="90" width="2.2" height="22" fill="#6E5847"/>' +
        '<path d="M0 20 L0 96 Q12 100 24 92 Q36 98 46 88 Q58 96 70 90 Q82 92 82 80 Q90 72 82 62 Q86 48 72 44 Q70 30 54 30 Q46 16 30 22 Q16 10 0 20 Z" fill="#5B8872"/>' +
        '<path d="M200 20 L200 96 Q188 100 176 92 Q164 98 154 88 Q142 96 130 90 Q118 92 118 80 Q110 72 118 62 Q114 48 128 44 Q130 30 146 30 Q154 16 170 22 Q184 10 200 20 Z" fill="#5B8872"/>' +
        '<path d="M52 70 Q58 58 70 62 Q80 62 78 74 Q72 82 62 78 Q52 80 52 70 Z" fill="#6A957C"/>' +
        '<path d="M148 70 Q142 58 130 62 Q120 62 122 74 Q128 82 138 78 Q148 80 148 70 Z" fill="#6A957C"/>' +
      '</g>' +
      // ground and moss
      '<rect y="110" width="200" height="40" fill="#A7AC8E"/>' +
      '<path d="M0 112 Q50 106 90 111 L110 111 Q150 106 200 112 L200 120 L0 120 Z" fill="#86A07E"/>' +
      // a winding footpath into the opening
      '<g class="dr-pathwrap">' +
        '<path d="M44 150 C70 138 112 136 110 126 C108 118 96 116 98 111 L104 111 C106 116 120 120 122 128 C124 140 132 144 158 150 Z" fill="#C7BA98"/>' +
        '<path class="dr-path" d="M54 150 C76 140 114 137 112 127 C110 119 99 117 100 111 L103 111 C104 117 116 121 118 128 C120 140 126 145 148 150 Z" fill="#D8CDAF"/>' +
        '<path class="dr-path-light" d="M86 150 C96 142 114 138 113 128 C112 121 103 118 101.5 112 C104 118 112 122 114.5 129 C116 140 112 145 116 150 Z" fill="#E9E0C8"/>' +
      '</g>' +
      // near trees framing the doorway: tall trunks, canopy overhanging the top
      '<g class="dr-near-l"><rect x="10" y="22" width="9" height="130" fill="#6E5847"/>' +
        '<path d="M-20 34 Q-14 4 14 2 Q30 -14 52 0 Q76 4 70 26 Q66 44 44 42 Q26 54 8 44 Q-10 52 -20 34 Z" fill="#4E7A68"/></g>' +
      '<g class="dr-near-r"><rect x="181" y="22" width="9" height="130" fill="#7E6654"/>' +
        '<path d="M220 34 Q214 4 186 2 Q170 -14 148 0 Q124 4 130 26 Q134 44 156 42 Q174 54 192 44 Q210 52 220 34 Z" fill="#446F5E"/></g>' +
      '<path class="dr-leaf" d="M0 0 Q5 -5 10 0 Q5 5 0 0 Z" fill="#D87B4F"/>' +
    '</svg>';

  var doorCount = 0;
  function decorate(card) {
    if (card.querySelector('.door-scene')) return;
    var scene = document.createElement('div');
    scene.className = 'door-scene';
    scene.setAttribute('aria-hidden', 'true');
    var uid = 'd' + (++doorCount);
    scene.innerHTML = SCENE.replace(/doorSky/g, uid + 'Sky').replace(/doorSun/g, uid + 'Sun');
    if (doorCount % 2 === 0) scene.classList.add('door-scene--mirror');
    card.insertBefore(scene, card.firstChild);
    var body = document.createElement('div');
    body.className = 'door-body';
    while (scene.nextSibling) body.appendChild(scene.nextSibling);
    card.appendChild(body);
    // Doors were mouse-only divs: make them reachable and operable by keyboard.
    var h = card.querySelector('h2');
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    if (h) {
      if (!h.id) h.id = 'door-' + Math.random().toString(36).slice(2, 8);
      card.setAttribute('aria-labelledby', h.id);
    }
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
    if (variant === 'b') lean(card);
  }

  // Variant b: the card leans toward the pointer and the light follows it,
  // the UI cousin of the 3D scene's pointer gust. Off for reduced motion.
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function lean(card) {
    if (still) return;
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--tilt-x', ((0.5 - y) * 4).toFixed(2) + 'deg');
      card.style.setProperty('--tilt-y', ((x - 0.5) * 5).toFixed(2) + 'deg');
      card.style.setProperty('--glow-x', (x * 100).toFixed(1) + '%');
      card.style.setProperty('--glow-y', (y * 100).toFixed(1) + '%');
    });
    card.addEventListener('pointerleave', function () {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  }

  function init() {
    document.querySelectorAll('#entry-screen .pathway-card').forEach(decorate);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
