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

```bash
# Option 1 — open directly in browser (some localStorage features may be limited on file://)
open index.html

# Option 2 — serve with any static server
npx serve .
# or
python3 -m http.server 8080
# then open http://localhost:8080
```

---

## Deploying

### GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Set source to **main branch / root**.
4. The app will be live at `https://<your-org>.github.io/<repo-name>/`.

### Netlify

1. Connect the repository in the Netlify dashboard (or drag-and-drop the folder).
2. No build command needed. Publish directory: `.` (root).
3. The `_headers` file sets permissive frame options so the app can be embedded via `<iframe>`.

### Embedding via iframe (Odoo / CMS)

Upload `index.html` as a static attachment and embed it with:

```html
<iframe
  src="https://your-domain.com/path/to/index.html"
  style="width: 100%; height: 90vh; border: none;"
  allow="clipboard-write"
  loading="lazy"
></iframe>
```

The page automatically posts its scroll-height to the parent via `postMessage` so you can auto-size the iframe:

```html
<script>
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'resize') {
    document.querySelector('iframe').style.height = e.data.height + 'px';
  }
});
</script>
```

> **Odoo note:** Upload the file via *Settings → Technical → Attachments*, mark it public, and embed the `/web/content/<id>` URL in an iframe snippet. Avoid pasting the HTML directly into a CMS text block — Odoo's sanitiser strips inline `<script>` tags.

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
