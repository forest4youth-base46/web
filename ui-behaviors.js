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
