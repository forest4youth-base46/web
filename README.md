# Forest-Based Therapy · Practitioner Tool

An interactive web tool for forest therapy practitioners — session planning, activity reference, and guided run mode. Built for the [Forest4Youth NWEurope](https://forest4youth.nweurope.eu) project.

---

## What the app does

The tool supports practitioners through three pathways:

**Practitioner pathways**
- **Learn** — foundational knowledge: what forest-based therapy is, the evidence base, contraindications, and dosage guidelines. Includes the full Companion Guide.
- **Implement in Practice** — session tools: a 17-activity Pocketbook (5 therapeutic groups), Session Builder with arc-balance visualisation, guided Run Mode with per-activity countdown timers, and a Pre-Session Checklist.
- **Reflect & Evaluate** — post-session tools: observation templates, outcome indicators, and progress tracking.

**Participant pathway**
- What is this? / Is it for me? / Before your session — orientation screens tailored to participants.

**Features**
- Language toggle (EN / FR / DE)
- Role-aware content (Practitioner / Participant)
- Session Builder: drag-to-reorder activities, live arc-balance bar, localStorage persistence
- Run Mode: full-screen guided walkthrough, per-activity inline timer (auto-starts at the upper duration threshold), keyboard navigation (← → Esc)
- Responsive — works on desktop and tablet

---

## Running locally

No build step required. Open `index.html` directly, or serve the folder with any static file server (e.g. `python3 -m http.server`).

---

## Project structure

```
.
├── index.html            # HTML shell: page structure, markup for every screen
├── tokens.css            # design tokens (colors, spacing, radii, shadows)
├── styles.css            # everything else: layout, components, responsive rules
├── content.js            # translation dictionary (EN/FR/DE) + i18n helpers
├── modules-data.js       # header data (icon/title/tag/badge) for every module-card
├── render.js             # renders a module-card header from modules-data.js
├── router.js             # hash-based routing, role selection, focus-mode navigation
├── pocketbook-data.js    # activity/group/adaptation data for the Pocketbook (English)
├── pocketbook-i18n.js    # Pocketbook FR/DE translations, grouped by activity/group id
├── pocketbook.js         # Pocketbook rendering, Session Builder, Run Mode, export
├── ui-behaviors.js       # header scroll hide/show
├── iframe-bridge.js      # iframe embed: reports document height, requests parent scroll
├── vendor/               # vendored html2canvas + qrcodejs (no CDN at runtime)
├── _headers              # Netlify headers (allows iframe embedding)
├── .gitignore
└── README.md
```

The app is still plain HTML/CSS/JS with no build step or bundler. It used to be a single 7,600-line `index.html`; the split above is purely organizational (classic `<script src>`/`<link>` tags, same load order as before), not a framework adoption, so it deploys exactly the same way.

---

## Embedding on the Odoo site

This app is designed to sit in an auto-sizing `<iframe>` on the Odoo-based
forest4youth.nweurope.eu site, not a fixed-height one. `_headers` sets
`X-Frame-Options: ALLOWALL` and `Content-Security-Policy: frame-ancestors *`
so the browser allows the embed from that origin. The rest of the contract
lives in `iframe-bridge.js`, and the host page needs to implement both
sides of it:

**1. Height reporting (child → parent).** On load and on every height
change, the app posts:

```js
{ type: 'resize', height: <number> } // px, the document's full scrollHeight
```

The host page needs a listener that sets the iframe's height from this,
for example:

```js
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'resize') {
    document.getElementById('fbt-iframe').style.height = e.data.height + 'px';
  }
});
```

**2. Scroll-to-top requests (child → parent).** Opening a module (e.g. the
Pocketbook, a checklist) scrolls the app back to its own top, but since the
iframe is auto-height with no scrollbar of its own, that alone doesn't move
the outer page — the visible iframe content can still be scrolled out of
view. The app also posts:

```js
{ type: 'scrollToTop' }
```

The host page should react by scrolling the iframe element into view, for
example:

```js
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'scrollToTop') {
    document.getElementById('fbt-iframe').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
```

Without this listener the request is simply inert — the app degrades
gracefully, it just won't realign the outer page.

**3. Deep links (parent → child, via the iframe `src` URL).** The app reads
its own hash and query string on load, so the host page can link straight
into a specific screen or role by setting the iframe's `src`:

- `?role=participant` / `?role=practitioner` — pre-select a role, skipping
  the role-picker screen.
- `?reset` — clear any stored role and show the role-picker screen.
- `#section/module` — open a specific pathway/module, e.g.
  `#implement/mod-pocket` for the Pocketbook. Combine with a hash and a
  query string in the usual way, e.g. `index.html?role=practitioner#implement/mod-pocket`.

**Older WebView note.** The production embed has been tested against an
older/non-evergreen WebView (see the comments in `styles.css` and
`router.js` around `data-focused`), so avoid relying on very recent CSS/JS
features (e.g. `:has()`) anywhere in this app without checking that
context first.

---

## Tech stack

Vanilla HTML / CSS / JavaScript — no build toolchain, no framework dependencies. Google Fonts loaded from CDN (requires internet on first load; cached thereafter).
