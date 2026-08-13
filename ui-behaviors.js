// Small, self-contained UI behaviors that don't belong to any single
// screen/module — currently the mobile header hide-on-scroll-down /
// show-on-scroll-up, the viewport-height fix, and the keyboard-activation
// helper below. The two IIFEs are self-contained; add unrelated small
// behaviors as their own IIFE here rather than bolting them onto router.js
// or a pocketbook-*.js file.

// ───────── KEYBOARD ACTIVATION HELPER ─────────
// Shared by every div-based control styled/behaving like a button
// (role="button" tabindex="0" onclick="..." onkeydown="activateOnKey(event,
// () => ...)"). Kept as a bare global — same convention as navigate(),
// toggleModule(), etc. in router.js/content.js — since it's called from
// onclick/onkeydown attributes across index.html.
function activateOnKey(e, fn) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
}

// ───────── HEADER SCROLL HIDE/SHOW (≤768px) ─────────
(function () {
  const THRESHOLD = 50;
  const MOBILE_BP = 768;
  let lastY = window.scrollY || 0;
  let ticking = false;

  function update() {
    ticking = false;
    const header = document.getElementById('site-header');
    if (!header) return;
    if (window.innerWidth > MOBILE_BP) {
      header.classList.remove('header-hidden');
      lastY = window.scrollY || 0;
      return;
    }
    const y = window.scrollY || 0;
    const dy = y - lastY;
    if (y < THRESHOLD)        header.classList.remove('header-hidden');
    else if (dy >  4)         header.classList.add('header-hidden');
    else if (dy < -4)         header.classList.remove('header-hidden');
    lastY = y;
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (window.innerWidth > MOBILE_BP) {
      const h = document.getElementById('site-header');
      if (h) h.classList.remove('header-hidden');
    }
  });
})();

// ───────── VIEWPORT HEIGHT FIX ─────────
// Mobile browsers change the visible viewport height as their address
// bar/toolbar show or hide, but 100vh keeps using the *largest* height,
// leaving a gap under fixed/full-height elements. --vh tracks the real
// visible height so `calc(var(--vh, 1vh) * 100)` stays accurate.
(function () {
  function setVH() {
    document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', setVH);
})();

// ───────── SCROLLBAR WIDTH (--sbw) ─────────
// #site-header breaks out of .container to the full viewport width, and
// 100vw *includes* the vertical scrollbar — so a 100vw breakout is always
// scrollbar-width too wide for the space it is centred in, hanging off the
// right edge (body{overflow-x:hidden} was clipping it rather than showing
// a scrollbar, which is why it went unnoticed). --sbw is that difference,
// 0px on platforms with overlay scrollbars; styles-base.css subtracts it.
(function () {
  function setSBW() {
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--sbw', (sbw > 0 ? sbw : 0) + 'px');
  }
  setSBW();
  window.addEventListener('resize', setSBW);
  window.addEventListener('orientationchange', setSBW);
  // Content that arrives after first paint can add/remove the scrollbar
  // (screens render into #main-content, Run Mode toggles body.no-scroll).
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(setSBW);
    ro.observe(document.documentElement);
  }
})();
