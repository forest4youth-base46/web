// ─────────────────────────────────────────
// HASH ROUTING
// ─────────────────────────────────────────
// Hash format: #section/module/activity
// e.g. #implement/mod-pocket/act-sitspot

function navigate(section) {
  if (!section) {
    window.location.hash = '';
  } else {
    window.location.hash = section;
  }
}

function applyRoute() {
  const hash = window.location.hash.replace('#', '');
  const parts = hash.split('/');
  const section = parts[0];   // e.g. 'implement' / 'reference' / 'pwhat'
  const moduleId = parts[1];  // e.g. 'mod-pocket'
  const activityId = parts[2]; // e.g. 'act-sitspot'

  // If no role is set, force the role screen.
  if (!currentRole) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('role-screen').classList.add('active');
    return;
  }

  // Explicit role-screen route (e.g. #role) reopens the landing.
  if (section === 'role') {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('role-screen').classList.add('active');
    return;
  }

  // Show the requested screen (or entry if hash is empty).
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (!section) {
    document.getElementById('entry-screen').classList.add('active');
    return;
  }
  const target = document.getElementById(section + '-screen');
  if (target) {
    // If the screen is restricted to the other role, redirect to entry
    // and show entry immediately (don't rely on hashchange firing).
    const screenRole = target.getAttribute('data-role-only');
    if (screenRole && screenRole !== currentRole) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch(e) {
        window.location.hash = '';
      }
      document.getElementById('entry-screen').classList.add('active');
      return;
    }
    target.classList.add('active');
  } else {
    // Unknown route — fall back to entry.
    document.getElementById('entry-screen').classList.add('active');
    return;
  }

  // Door modules: open the module as a focused page rather than inline
  const DOOR_MODULES = ['mod-pre','mod-plan','mod-reflect-self','mod-indicators','mod-glossary','mod-pocket','mod-adapt'];
  if (moduleId && DOOR_MODULES.indexOf(moduleId) !== -1) {
    applyFocusMode(target, moduleId);
  } else {
    // Clear any prior focus state
    applyFocusMode(null, null);
    // Open module if specified (legacy inline behavior)
    if (moduleId) {
      const mod = document.getElementById(moduleId);
      if (mod) mod.classList.add('open');
    }
  }

  // Open and highlight activity if specified
  if (activityId) {
    setTimeout(() => {
      const act = document.getElementById(activityId);
      if (act) {
        act.classList.add('open', 'highlight');
        act.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => act.classList.remove('highlight'), 2500);
      }
    }, 150);
  }
}

window.addEventListener('hashchange', applyRoute);

// ─────────────────────────────────────────
// MODULE & ACTIVITY TOGGLES
// ─────────────────────────────────────────
function toggleModule(id) {
  document.getElementById(id).classList.toggle('open');
}

// Open a module as its own "page" — focuses screen on that module only.
function openModulePage(modId, screenName) {
  window.location.hash = screenName + '/' + modId;
}

function applyFocusMode(screenEl, modId) {
  // Clear any previous focus
  document.querySelectorAll('.screen.focus-mode').forEach(s => s.classList.remove('focus-mode'));
  document.querySelectorAll('.module-card.is-focused').forEach(m => m.classList.remove('is-focused'));
  // Also collapse any door module that was left .open from a previous focus
  document.querySelectorAll('.module-card.is-door.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.module-back-link.injected').forEach(b => b.remove());
  document.body.classList.remove('module-focus');
  delete document.body.dataset.focused;

  if (!screenEl || !modId) return;
  const mod = screenEl.querySelector('#' + modId);
  if (!mod) return;
  screenEl.classList.add('focus-mode');
  mod.classList.add('is-focused', 'open');
  document.body.classList.add('module-focus');
  // FAB / builder visibility is driven by this attribute (not :has()),
  // which works on every WebView including the Odoo embed test path.
  document.body.dataset.focused = modId;

  // Inject a back link at the top of the focused module
  const back = document.createElement('button');
  back.className = 'module-back-link injected';
  back.type = 'button';
  const screenHash = screenEl.id.replace('-screen','');
  back.textContent = t('nav.back') || 'Back';
  back.onclick = () => { window.location.hash = screenHash; };
  mod.insertBefore(back, mod.firstChild);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function toggleActivity(id) {
  const item = document.getElementById(id);
  item.closest('.activities-list').querySelectorAll('.activity-item').forEach(a => {
    if (a !== item) a.classList.remove('open');
  });
  item.classList.toggle('open');
}

function toggleCheck(el) {
  const cb = el.querySelector('input[type="checkbox"]');
  cb.checked = !cb.checked;
}

function toggleCheckV2(el) {
  el.classList.toggle('checked');
}

// ─────────────────────────────────────────
// DEEP LINK COPY
// ─────────────────────────────────────────
function copyDeepLink(section, moduleId, activityId, btn) {
  const url = window.location.href.split('#')[0] + '#' + [section, moduleId, activityId].join('/');
  navigator.clipboard.writeText(url).then(() => {
    btn.classList.add('copied');
    const span = btn.querySelector('[data-i18n]');
    const orig = span.textContent;
    span.textContent = '✓ Copied';
    setTimeout(() => {
      btn.classList.remove('copied');
      span.textContent = orig;
    }, 2000);
  });
}

// ─────────────────────────────────────────
// GUIDE INTEGRATION
// ─────────────────────────────────────────
// When the PDF has a stable URL, set GUIDE_PDF_URL to it.
// Named destinations in the PDF can be used for chapter jumps: set
// GUIDE_USE_PAGE_ANCHORS = true and the tool will append #page=N.
const GUIDE_PDF_URL = '';  // e.g. 'https://forest4youth.nweurope.eu/guide.pdf'
const GUIDE_USE_PAGE_ANCHORS = true;

function openGuide() {
  if (!GUIDE_PDF_URL) {
    alert(t('guide.pdf.unavailable') || 'The PDF link is not yet available. Once the guide is hosted, this button will open it.');
    return;
  }
  window.open(GUIDE_PDF_URL, '_blank', 'noopener');
}

function openChapter(chapterId, page) {
  if (!GUIDE_PDF_URL) {
    // No URL yet — surface the chapter in the guide-screen instead and tell the user.
    const el = document.querySelector('[data-chapter-id="' + chapterId + '"]');
    if (el) {
      document.querySelectorAll('[data-chapter-id].guide-chapter-highlight')
        .forEach(e => e.classList.remove('guide-chapter-highlight'));
      // Navigate to guide screen if not already there
      if (window.location.hash !== '#guide') {
        window.location.hash = 'guide';
        setTimeout(() => {
          el.classList.add('guide-chapter-highlight');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => el.classList.remove('guide-chapter-highlight'), 2500);
        }, 200);
      } else {
        el.classList.add('guide-chapter-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.classList.remove('guide-chapter-highlight'), 2500);
      }
    }
    return;
  }
  const url = GUIDE_USE_PAGE_ANCHORS && page
    ? GUIDE_PDF_URL + '#page=' + encodeURIComponent(page)
    : GUIDE_PDF_URL;
  window.open(url, '_blank', 'noopener');
}

// ─────────────────────────────────────────
// VISUAL SWAP API
// ─────────────────────────────────────────
// Replace any SVG with a real image or GIF:
// swapVisual('sitspot', 'https://your-cdn.com/sitspot.gif', 'Alt text')
// IDs: sitspot, map, walk, council, breath, bark, deadwood, mandala, track, weather, roots, pairwalk
function swapVisual(visualId, src, altText) {
  const container = document.querySelector('.activity-visual[data-visual-id="' + visualId + '"]');
  if (!container) return;
  const caption = container.querySelector('.visual-caption');
  const captionHTML = caption ? caption.outerHTML : '';
  container.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = altText || visualId;
  img.style.cssText = 'width:100%;display:block;';
  container.appendChild(img);
  if (captionHTML) container.insertAdjacentHTML('beforeend', captionHTML);
}

// ─────────────────────────────────────────
// PARTICIPANT-SCREEN TOGGLES
// ─────────────────────────────────────────
function toggleTimeline(id) {
  document.getElementById(id).classList.toggle('open');
}
function toggleExp(id) {
  document.getElementById(id).classList.toggle('open');
}

// ─────────────────────────────────────────
// ROLE STATE & TOGGLE
// ─────────────────────────────────────────
let currentRole = null;
try { currentRole = sessionStorage.getItem('fbt.role'); } catch(e) { currentRole = null; }

function setRole(role, fromRoleScreen) {
  currentRole = role;
  try { sessionStorage.setItem('fbt.role', role); } catch(e) {}
  document.body.setAttribute('data-role', role);

  // If coming from the role-screen choice, land on the entry screen.
  // If switching role mid-session, also return to entry if stranded
  // on a screen the new role cannot see.
  if (fromRoleScreen) {
    // Clear hash without triggering hashchange side effects, then route.
    if (window.location.hash) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch(e) {
        window.location.hash = '';
      }
    }
    applyRoute();
  } else {
    // Mid-session toggle: if current hash points to a role-exclusive screen,
    // reset to entry. Otherwise keep the hash.
    const activeScreen = document.querySelector('.screen.active');
    const needsReset = activeScreen && activeScreen.getAttribute('data-role-only') &&
        activeScreen.getAttribute('data-role-only') !== role;
    if (needsReset && window.location.hash) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch(e) {
        window.location.hash = '';
      }
    }
    applyRoute();
  }
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
renderModuleHeaders();
applyTranslations();

// URL overrides for recoverability:
//   ?reset  → clear role, show role-screen
//   ?role=participant / ?role=practitioner → set role without touching role-screen
try {
  const usp = new URLSearchParams(window.location.search);
  if (usp.has('reset')) {
    try { sessionStorage.removeItem('fbt.role'); } catch(e) {}
    currentRole = null;
    // Strip the query string so reload doesn't keep resetting.
    try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch(e) {}
  }
  const rq = usp.get('role');
  if (rq === 'participant' || rq === 'practitioner') {
    currentRole = rq;
    try { sessionStorage.setItem('fbt.role', rq); } catch(e) {}
    try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch(e) {}
  }
} catch(e) {}

// Defensive: bind role-card clicks programmatically in addition to inline onclick.
// If inline handlers are blocked (strict CSP) or the onclick attribute is somehow
// stripped, these listeners still work.
document.querySelectorAll('.role-card').forEach(card => {
  card.addEventListener('click', function(ev) {
    // Only act if no inline handler already did. We detect by checking the
    // state change that setRole would have caused.
    if (document.body.getAttribute('data-role')) return;
    const txt = card.querySelector('h2');
    const isPrac = txt && /practit|praktik|pratici/i.test(txt.textContent);
    setRole(isPrac ? 'practitioner' : 'participant', true);
  }, { capture: false });
});

// Always-accessible path back to the role-screen via hash.
// Triggered by footer "Change perspective" link.
function goToRoleScreen() {
  try { sessionStorage.removeItem('fbt.role'); } catch(e) {}
  currentRole = null;
  document.body.removeAttribute('data-role');
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch(e) {
    window.location.hash = '';
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('role-screen').classList.add('active');
}

if (currentRole) {
  // Returning visitor with a stored role — apply it and route normally.
  document.body.setAttribute('data-role', currentRole);
  document.querySelectorAll('.role-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.role === currentRole));
  applyRoute();
} else {
  // First visit — show the role screen and hide the chrome.
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('role-screen').classList.add('active');
}
