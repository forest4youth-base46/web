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
- Language toggle (EN / FR / ES)
- Role-aware content (Practitioner / Participant)
- Session Builder: drag-to-reorder activities, live arc-balance bar, localStorage persistence
- Run Mode: full-screen guided walkthrough, per-activity inline timer (auto-starts at the upper duration threshold), keyboard navigation (← → Esc)
- Responsive — works on desktop and tablet

---

## Running locally

No build step required. The app is a single self-contained HTML file.

---

## Project structure

```
.
├── index.html   # entire app — HTML, CSS, and JS in one file
├── _headers     # Netlify headers (allows iframe embedding)
├── .gitignore
└── README.md
```

---

## Tech stack

Vanilla HTML / CSS / JavaScript — no build toolchain, no framework dependencies. Google Fonts loaded from CDN (requires internet on first load; cached thereafter).
