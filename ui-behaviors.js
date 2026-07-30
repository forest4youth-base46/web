// Small, self-contained UI behaviors that don't belong to any single
// screen/module — currently just the mobile header hide-on-scroll-down /
// show-on-scroll-up. Nothing here is called from other files (this whole
// file is one self-invoking closure); add unrelated small behaviors here
// rather than bolting them onto router.js or a pocketbook-*.js file.
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
