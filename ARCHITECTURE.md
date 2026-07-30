# Architecture notes

This complements `README.md`'s project structure with the *why* behind it,
and the conventions this branch established while paying down some of the
codebase's technical debt. Read this before reaching for a bundler,
framework, or module system — the reasoning below is why none of those are
here, and what to do instead.

---

## Why zero build step

The app has to work two ways with no code difference between them:

1. Opened directly (`index.html` served by any static host).
2. Embedded in an auto-height `<iframe>` on the Odoo-based
   `forest4youth.nweurope.eu` site, with no scrollbar of its own — see
   `iframe-bridge.js` and `_headers`.

Both are just "serve some static files." A build step (bundler, transpiler,
framework CLI) would add a deploy artifact to manage for zero functional
benefit here — there's no server, no API, nothing a build step would
actually be doing. Every file is plain, unbundled HTML/CSS/JS, loaded via
ordinary `<script src>` / `<link>` tags, and that's a deliberate constraint
to keep, not a gap to eventually close.

`package.json` (added this session) does **not** change this. It exists
solely to give `test/smoke.js` a place to get its one dependency
(Playwright) from `npm install`. Nothing in it builds, bundles, or
transpiles the app. `npm test` / `npm run check:i18n` are dev-time checks
you run before pushing; the deployed files are exactly what's in the repo.

## Why not ES modules

This was evaluated directly on this branch and rejected with a concrete
reason, not just a preference. Converting `<script>` tags to
`<script type="module">` would give real encapsulation (module-scoped
state instead of bare globals), which sounds like the obvious next step for
the "everything is a bare global mutated from anywhere" problem described
below. Two things make it a bad trade here:

1. **The dependency graph is genuinely circular**, not a layered pyramid.
   `content.js` calls into `pocketbook-activities.js` (via `setLang()`'s
   re-render hooks), which needs `content.js`'s `t()`/`currentLang` right
   back. `router.js` needs the `pocketbook-*.js` files, which need
   `router.js`'s `currentRole`. `search.js` needs both directions. ES
   modules *can* handle circular imports, but only safely if nothing is
   read before the whole graph finishes evaluating — verifying that across
   ~18 files and ~100 cross-file references isn't something that can be
   confirmed by testing alone the way the file splits below could (those
   were verified by literally diffing bytes and running the full app).
2. **Import bindings are read-only from the importing side.** Several
   functions reassign state declared in a different file (e.g.
   `pocketbook-init.js`'s QR/share-link restore reassigns `pbSession`,
   which is declared in `pocketbook-builder.js`). That's fine for plain
   shared-global-scope scripts; it's simply illegal for a module importing
   a `let` binding it doesn't own. Fixing every instance of this is the
   real work of a module migration — the module *syntax* is the easy part.

If this ever gets revisited, start by finding every cross-file
reassignment of a `let`-declared global (not just reads) — that's the part
that actually determines the size of the change, not the `<script>` tag
edits.

## What actually happened instead: file splits + one invariant fix

Two large files were split into smaller ones, purely organizationally —
same shared global scope, same synchronous load order, just smaller files
with a clearer single concern each:

- `pocketbook.js` (2,087 lines / 98 functions covering four unrelated
  concerns) → `pocketbook-activities.js`, `pocketbook-builder.js`,
  `pocketbook-export.js`, `pocketbook-run.js`, `pocketbook-reflect.js`,
  `pocketbook-init.js` (load order matters — `pocketbook-init.js` calls
  into all the others via `pbInit()`, so it loads last).
- `styles.css` (3,479 lines) → `styles-base.css`, `styles-screens.css`,
  `styles-pocketbook.css`, `styles-export.css`, `styles-responsive.css`
  (also order-sensitive — several rules, including the mobile Pocketbook
  drawer's `!important` overrides, depend on cascade position).
- `styles-screens.css` (1,639 lines, still covering entry/reference/
  participant/reflect screens as one file) was later split further into
  `styles-screens-entry.css`, `styles-screens-reflect.css`,
  `styles-screens-reference.css` — same mechanical pattern, same
  cascade-order preservation (three sequential `<link>` tags in the
  original file's rule order, not reorganized by topic, since CSS source
  order can decide specificity ties).

Both splits were verified byte-for-byte lossless before deleting the
originals (`cat` the pieces back together, diff against the original), then
verified functionally with the full smoke suite plus a manual visual pass
of the most cascade/timing-sensitive parts (the mobile drawer's
collapsed↔expanded transition, Run Mode).

Adding another file the same way, later, is cheap and safe — it's the same
mechanical pattern (`sed -n` a line range out, diff the reassembly, add a
`<script>`/`<link>` tag in the same relative position, preserving order for
CSS).
That's the lever to pull for "this file's too big again," not a module
system.

The one genuine state-management bug found this session —
`ensureRole()`'s "already resolved, skip re-applying the DOM attribute"
branch, which left `body[data-role]` unset after any refresh past the
first page load — got fixed by always re-applying the invariant instead of
assuming a prior code path already established it. That's the template for
any future state-invariant bug in this codebase: don't add a module system
to prevent it, make the function that owns the invariant re-assert it
unconditionally at every call, not just on the "first time" path.

## Global state: what's here and how to treat it

State is bare module-level `let`s shared across files via the classic
`<script>` global scope — no accessors, no namespace object. The groups
that matter:

| State | Declared in | Rule |
|---|---|---|
| `currentRole` | `router.js` | Only ever reassigned via `setRole()`/`ensureRole()` — both keep `document.body[data-role]` in sync on every call, not just when the value changes. |
| `currentLang` | `content.js` | Only ever reassigned via `setLang()`, which also re-renders everything not driven by `[data-i18n]`. |
| `pbSession` / `pbSessionMins` / `pbSessionMeta` | `pocketbook-builder.js` | Read from several files; reassigned from `pocketbook-builder.js` (user edits) and `pocketbook-init.js` (`pbRestoreSharedSession()`, the QR/share-link restore). |

If you add a new piece of cross-file state, follow the `currentRole`
pattern: one function owns reassigning it, and that function re-establishes
every invariant the rest of the app depends on (a DOM attribute, a
`localStorage` write, a re-render) unconditionally — never gated behind "if
this is the first time we're setting it."

## Tunable constants: deliberately not consolidated

Every named `const` tunable in the app (`PB_ARC_TARGET_MIN`,
`PB_RING_CIRCUM`, `PB_SESSIONS_MAX`, `GUIDE_PDF_URL`, the `PEXPORT_PAGE_*`
group, `STORAGE_SCHEMA_VERSION`, etc.) already has a comment explaining
*why* that value, sitting right next to the code that gives that comment
its context — e.g. `PB_ARC_TARGET_MIN = 60` sits under a comment about the
Structure Guide's Opening/Core/Integration/Transition timing that only
makes sense read together. Collecting these into one shared "config"
block was considered and rejected: it would separate each value from the
context that explains it, trading real clarity for the appearance of
organization. If a file's tunables are genuinely scattered *and*
unexplained, group and comment them — but check whether they're already
adequately placed first, since most of this codebase's are.

## Dev tooling (new this session)

- `scripts/check-i18n-sync.js` — verifies `i18n-en.js`/`i18n-fr.js`/
  `i18n-de.js` still declare the exact same key set. Run via
  `npm run check:i18n`.
- `test/smoke.js` — end-to-end Playwright checks for this branch's actual
  regressions (role/nav state surviving a refresh, accordion behavior, the
  QR share-link round-trip, footer absence). Run via `npm test`.
- `.github/workflows/smoke.yml` — runs both on every push.

All three are dev-only. None of them run in production, and none of them
require or add a build step to the deployed app.
