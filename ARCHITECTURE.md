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

## Naming convention for cross-file functions

Two feature areas use a name prefix to mark "this is that feature's
cross-file API, don't mistake it for a private helper": `pb` for the
Pocketbook module (`pbSaveSession`, `pbRestoreSharedSession`, ...) and `ref`
for the Reference screen (`refSetKind`, `refApplyFilter`, ...). Both were
introduced with those files, so every function in them already follows the
pattern.

`router.js` and `content.js` predate that convention, and their
cross-file-called functions — `navigate`, `applyRoute`, `ensureRole`,
`setRole`, `toggleModule`, `toggleCheck`, `toggleExp`/`toggleTimeline`,
`openChapter`, `openGuide`, `swapVisual`, `t`, `setLang`, `applyTranslations`
— stay bare rather than being retrofitted with a prefix. This is a
deliberate choice, not an oversight: these are exactly the functions
`index.html` calls directly from `onclick="..."` attributes, in some cases
a very large number of times (`openChapter` 136 call sites, `navigate` 97,
`toggleModule` 88, `toggleCheck` 59, `setRole` 42, at last count). Renaming
any of them means finding and updating every one of those attribute strings
across a 2,000+ line HTML file with no compiler to catch a missed site — a
typo there fails silently as a broken button, not a build error. That's a
large, error-prone, low-value change for a cosmetic naming preference, so
it's left as-is rather than forced through for consistency's sake.

Going forward: any *new* function meant to be called across files (from
another `<script>` file or from an `onclick` attribute) should get a short
prefix tied to its owning file, the same way `pb`/`ref` do — it's cheap to
do at creation time and expensive to retrofit later, which is exactly the
situation `router.js`/`content.js` are in now.

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

## Walk the Forest renderer layers

The animated backdrop (`#wf-scene`) has **two interchangeable painters**
behind **one interactive overlay**:

```
WF state machine (walk-forest.js)   WF.cam, WF.openId, stop timing: the single source of truth
  ├── overlay (DOM, identical in both modes): pins, arrival chip, title chip, controls, rail, list link, panel
  └── backdrop painter, one of:
        wfSvg*   painted SVG scene (walk-forest.js), the default and the fallback
        wf3d*    WebGL scene (walk-forest-3d.js + walk-forest-physics.js), opt-in via ?wf=3d
```

`#wf-scene` holds four stacked wrappers built once by `wfEnsureLayers()`:
`sky`, `gl` (the canvas), `scene` (SVG), `ui`. They're positioned with no
z-index, so they form no stacking contexts, and paint order is exactly what
it was when all of this was one `innerHTML` string. This was verified
pixel-identical against the pre-split version at 1280×800 and 390×844.

**The contract the 3D painter keeps:**

- It owns no state and no UI. Pins stay real `<button class="wf-pin-btn">`
  with the same aria labels and `onclick="wfOpenStop(...)"`. Only their
  screen positions come from a different projection (`wfStopProject()` →
  `wf3dProject()`).
- Per frame it only *moves* existing pins (`wfPlacePins()`, style writes).
  The overlay's `innerHTML` is rebuilt only when `wfOverlayKey()` changes
  (stop, armed stop, open panel, status text, language, size), never per
  frame. That's the same lesson as the comment in `wfStep()` about
  rebuilding under the pointer.
- `wfRender()` is still the one public entry (router.js and content.js
  unchanged). In 3D mode it also calls `wf3dSync()` (pose, in-world words
  for the current language).
- A **drag** across the scene (moved >6px or held >250ms) is a physics
  gesture (pointer wind). It sets `WF.suppressClick`, so `wfOnSceneClick()`
  doesn't also treat it as a click on open space. A plain click still
  reaches `appEscapeAction()` as before. Nothing calls `preventDefault`, so
  page scrolling on touch is untouched.
- In 3D mode the funder credit sits *above* the canvas, not behind the
  canopy, because real perspective trees would hide it for most of the walk.
  A paper-toned haze (`.wf3d-haze`) keeps the site header legible over the
  trees.

**Fallback ladder** (automatic; each rung lands on the SVG painter, pins and
all):

1. `prefers-reduced-motion`: 3D never boots.
2. No WebGL: never boots, and Three.js is never downloaded (it's
   lazy-injected only after the capability check).
3. `vendor/three.min.js` fails to load, or scene init throws.
4. WebGL context lost and not restored within 3s.
5. The governor (`wf3dGovern`) measures the median frame interval every ~2.5s,
   outside deep/hidden states. Above 28ms it steps the tier down
   (high → med → low: shadows, DPR, grass, particles). Still slow at `low`,
   it gives up.

**Query switches** (for testing and device checks): `?wf=3d`, `?wf=svg`,
`?wf=debug` (3d plus an fps/tier/draw-call readout), `&wftier=low|med|high`,
`&wfgov=0` (governor off; the smoke tests use it because SwiftShader is slow).

**Why the default is still SVG:** `WF_3D_DEFAULT` in walk-forest.js stays
`false` until the 3D scene has been checked on the real Odoo-embedded page
and the older WebView (README "Older WebView note"). Flipping it is a
one-line change. Everything else, including the fallbacks, already runs.

**Why Three.js r147 specifically:** it's the last release that still ships
a classic-script UMD build (`build/three.min.js`) *and* `examples/js/*`
(the classic GLTFLoader), and it still supports WebGL1. Later versions are
ES-module only, which this app doesn't use (see "Why not ES modules").
The vendored files are unmodified apart from a license header on the loader.

**Why hand-rolled physics:** the scene needs springs, a wind field, falling
particles and a couple of verlet ropes, not rigid bodies. The engines that
exist (rapier, cannon-es) are ES-module/WASM only. `walk-forest-physics.js`
is plain functions over typed arrays, with no DOM and no THREE, which is
why `test/unit.js` can pin its behaviour down in Node (terminal velocity of
a leaf, spring overshoot, rope length).

**Depth of field / bloom were deliberately left out.** Post-processing
needs the whole frame in WebGL render targets. That would pull the sky and
funder logo into WebGL and roughly double GPU cost behind every screen of
the site. Depth comes from real perspective, fog, soft shadows and the
existing CSS blur in deep mode. Revisit only if the device check shows
headroom.

**Layout in 3D (REVAMP):**
- Each activity is moved off the path into its own clearing, centred ~5.6m to one side (`wf3dStopOff()`/`wf3dStopCenter()`). The walker keeps the trail. Pins stand over the clearing; their `d`, and so "armed" and the arrival chip, is unchanged. Trees, shrubs, stones and grass are left out inside clearings (`wf3dInClearing()`).
- A second, cheaper tree set (`wf3dBuildFarForest()`) thickens and deepens the green from ~13m out.
- People are the prototype's silhouette: the SVG walker's outline lathed into a solid, all in one green.
- Look-around follows the pointer only over open scene. It holds still over pins and controls, so a pin never slides out from under the cursor.

**glTF drop-in:** see `assets/wf/README.md`. Add an id→path entry to
`WF3D_GLTF` and that stop's procedural set piece is replaced by the model.

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
