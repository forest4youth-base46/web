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
├── router.js             # hash-based routing, role selection, focus-mode navigation
├── pocketbook-data.js    # activity/group/adaptation data for the Pocketbook
├── pocketbook.js         # Pocketbook rendering, Session Builder, Run Mode, export
├── ui-behaviors.js       # header scroll hide/show
├── iframe-bridge.js      # reports document height to the parent page (iframe embed)
├── vendor/               # vendored html2canvas + qrcodejs (no CDN at runtime)
├── _headers              # Netlify headers (allows iframe embedding)
├── .gitignore
└── README.md
```

The app is still plain HTML/CSS/JS with no build step or bundler. It used to be a single 7,600-line `index.html`; the split above is purely organizational (classic `<script src>`/`<link>` tags, same load order as before), not a framework adoption, so it deploys exactly the same way.

---

## Tech stack

Vanilla HTML / CSS / JavaScript — no build toolchain, no framework dependencies. Google Fonts loaded from CDN (requires internet on first load; cached thereafter).
