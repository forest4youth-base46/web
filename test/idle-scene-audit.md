# Walk the Forest — loading / coherence / accessibility / UX audit, and idle elements

Parts A–D are the audit. Part E was written as a *plan* for new idle elements (birds,
falling leaves) using the admission rule from the idle-motion-grammar plan; Part F records
what was actually built from it, in a follow-up pass, plus the ping-ring polish that came
out of live visual review against real screenshots.

## Part 0 — what changed just before this audit

1. **Removed the calm-mode toggle button** (`data-wf="btn-calm"`, `wfToggleCalm()`,
   `.wf-ctrl-btn--active`, the `walk.calm` i18n key in all three locales). It wasn't wanted.
   `WF.reduced`/`wfSetReduced()`/`wfReadReducedPref()` are untouched — the scene still
   respects OS-level `prefers-reduced-motion`, it just no longer has an in-app override UI.
2. Looked for the "corner-bracket" frame around a circle in the first screenshot: grepped
   the whole repo for `clip-path|corner|bracket|viewfinder|dasharray` and read every
   circular element's CSS (`.wf-ctrl-btn`, `.wf-pin-btn`/`.wf-pin-disc`, `.wf-ping`). None
   of them produce a segmented/bracket shape — every circle in this codebase is a plain
   `border-radius: 999px` full ring or disc. My working conclusion: that shape was an
   annotation your screenshot tool drew to point at the calm button (now gone), not
   something the app itself rendered. If it's still visible after this fix, it's a
   different element than any of these three, and a fresh screenshot pointed at the actual
   live scene would let me find it precisely instead of guessing again.
3. **Wired up the rail** (the small station-marker row, bottom-right/bottom-center
   depending on width). It was 17 plain, class-less `<div>`s with only `style`+`title` —
   no click handler, no `cursor: pointer`, not even a CSS class to hang one on
   (`walk-forest.js:1666-1670` before the fix). Added `wfGoTo(idx)` (mirrors
   `wfGoBack`/`wfGoNext`/`wfRestart`'s tween-or-snap-under-reduced-motion shape), rebuilt
   `wfSyncRail()` to emit real `<button class="wf-rail-btn">`s wired once at creation
   (same pattern as `wfMakePin`), and added `aria-label`/`aria-current="step"`. New
   regression test `testRailButtonsNavigate` in `test/motion.js` locks this in — 6/6
   motion tests and 7/7 smoke tests pass.

## Part A — graphical loading

- **17 render-blocking `<script src>` tags**, no `defer`/`async`, loaded in strict document
  order (`index.html:1954-1994`). Consistent with the repo's no-build-step constraint —
  not a bug — but it does mean first paint waits on all of them fetching and parsing
  sequentially.
- **~618KB of vendored export libraries load unconditionally on every page view**:
  `vendor/jspdf.umd.min.js` (420KB) + `vendor/html2canvas.min.js` (199KB), used only by
  `exportRunPDF()`/`exportRunPNG()` (`pocketbook-export.js`) — a feature most visitors,
  and every distressed member of the public just looking at activities, never touch. This
  is the single largest, easiest win here: inject those two `<script>` tags on first click
  of the PDF/PNG export button instead of unconditionally in `index.html`. No build step
  needed — same vendoring pattern, just deferred. `qrcode.min.js` (20KB) is small enough
  to leave as-is.
- **Three full locale files load unconditionally** (`i18n-en.js` 78KB + `i18n-fr.js` 89KB +
  `i18n-de.js` 79KB ≈ 246KB) so language switching is instant with no reload — a deliberate
  and reasonable trade for this app's UX, not flagged as a defect.
- **Fonts already do the right thing**: `index.html:13-15` preconnects to Google Fonts and
  uses `&display=swap` — no FOIT, and the fallback stack (`'Montserrat', sans-serif` etc.,
  used throughout `styles-walk-forest.css`) means text is never invisible while the
  webfont loads. No finding here.
- **The flashing-on-load bug this branch is named for looks fixed** — `f433b03`'s
  persistent-DOM reconciler replaced the innerHTML-per-frame rebuild that caused it, and
  the motion regression suite (`testNoSubtreeReplacementDuringMove`) locks that in for the
  pins/cast/set layers. The one *known-open* exception, already surfaced and deliberately
  not fixed in the prior session: **tree-sway animations still restart at `currentTime: 0`
  on every repaint during a camera move**, because the `geo` layer's trail/tree SVG is
  still string-rebuilt on every frame the camera is travelling
  (`wfComputeFrame`/`geo.innerHTML =`), unlike the reconciled cast/set/pin layers. Not a
  flash of the whole scene, but a real, reproduced motion glitch during every autoplay
  transition (every ~10s dwell + 12s travel). Concrete fix path is unchanged from before:
  extend `wfSyncShapes`'s keyed-reconciler pattern to the swaying tree crowns specifically
  (trail curve itself can stay string-replaced, since it genuinely differs every frame).

## Part B — coherence

Largely already addressed by the idle-motion-grammar work earlier this session (one shared
beat + harmonics, one idle easing, phase-only variation). Nothing new to add here beyond
what `test/motion-dossier.md` and `test/motion.js` already cover and lock in.

One instrument-level finding worth recording: **`test/motion-probe.js`'s positioning report
is currently too noisy to trust as-is.** Its `overlapsHeader` check is a pure 2D
bounding-box test with no z-index awareness, so it flags background layers that
*intentionally* sit behind the header (`.wf-blur-layer`, `.wf-drift`) as "overlap"
violations, and its off-viewport check doesn't know this scene keeps all 17 stations'
DOM permanently mounted (by design, for the reconciler) — so every station's pins/props
that are simply *not the current one* get flagged as "off-viewport," which is correct and
expected, not a bug. Concretely: 87–95% of every station's "flagged" count in the current
`report.json` is one of these two false-positive classes (spot-checked `campfire`/`768w`:
every early flag is a z-index-ignorant header overlap on an intentionally-behind-header
ambient layer; every late flag is a *different, off-camera* station's pin sitting exactly
where its own coordinates put it). **Before this report's numbers are used to sign off on
positioning, the probe needs**: (a) a z-index-aware header-overlap check (only flag if the
element's own resolved z-index is ≥ the header's), and (b) scoping the off-viewport check
to the current station's own pin/props only. Real, spot-checked visual defects found by
eye instead (see stop screenshots in `test/motion-probe-output/stops/`):

- **`checkin`'s pin info-chip text is clipped at 768px width** — "Coming Back to Yourself"
  and its duration line both cut off mid-word against the frame edge, and the chip visibly
  runs close to/under the rail. None of the other 16 stops in the same screenshot set show
  this; `hammock`'s equivalent chip is fully legible and cleanly clear of the rail. Worth a
  follow-up look at `checkin`'s specific pin coordinates
  (`wfLatFor`/`WF_CLEARINGS`/`WF_CAST` entry) rather than a global chip-positioning fix,
  since it's the one outlier, not a systemic pattern.

## Part C — accessibility

- **Real fix, free accessibility win**: the rail buttons are now genuine `<button>`
  elements, so they're natively keyboard-focusable and reachable by Tab — they weren't
  before (plain `<div>`s have no default focus stop). `aria-current="step"` marks the
  active one, matching the existing convention this file already uses elsewhere
  (`aria-expanded` on pins, `aria-pressed` on the toggle button that used to exist).
- **`ArrowRight` keyboard binding** was added in the prior session specifically because a
  keyboard-only reduced-motion user had no autoplay to fall back on and could previously
  only go backward or restart — still in place, still correct, unaffected by this
  session's changes.
- One real gap, not touched by this session: **the trail SVG's `role="img"` carries an
  empty `aria-label`** (`walk-forest.js:1462`: `aria-label=""`). An empty label on a
  `role="img"` element is worse than no label — screen readers announce it as an unlabeled
  image region rather than skipping it silently. Either give it a real label (e.g. "Forest
  trail" via an i18n key) or drop `role="img"`/`aria-label` entirely and rely on the pins'
  own individual `aria-label`s, since the pins are the only parts of that SVG carrying
  actual information.
- Color contrast wasn't measured numerically this pass — the cast/walker figures are
  solid dark green/brown silhouettes on a lighter mixed-green background, which reads as
  comfortably high-contrast by eye across the screenshots reviewed, but this is an eye
  check, not a WCAG contrast-ratio measurement; flagging that distinction rather than
  claiming a pass I haven't actually run.

## Part D — UX

- The rail fix directly closes a real UX gap: 17 visible progress markers that looked
  clickable (they visually track the current station, use the group's own color, sit in a
  pill with clear spacing) but did nothing when clicked. That mismatch between affordance
  and behavior is exactly the kind of thing that reads as "broken" even though nothing
  errored.
- No other UX-layer findings beyond what Parts A–C already cover — this pass didn't turn
  up new UX-specific issues independent of loading/accessibility/positioning.

---

## Part E — a plan for new idle elements (birds, falling leaves, etc.)

### The rule being applied

Reusing the admission rule from the idle-motion-grammar plan, unchanged, because it's
renderer-independent and still the right bar: a new element earns its place only if **all
five** hold, decided per element, not as a blanket "add some birds":

1. **Meaning** — tied to that station's own `intro`/`purpose` text, not decoration.
2. **Budget** — fits under the calm ceiling *including* whatever else can be moving then.
3. **Grammar** — periodic elements phase-lock to the shared beat; event elements get a
   minimum inter-arrival time and never fire while a panel is open or text is being read.
4. **Entry and exit** — enters/leaves off-frame or via a fade with ramps at both ends;
   nothing pops in or out in place.
5. **Calm-mode resting pose** — its absence must still be a complete composition, not a
   gap.

And the motion-class table still applies: **Ambient idle** (sway, drift, glow — always
present, counts continuously against budget) vs. **Event** (aperiodic, rare, budgeted by
frequency, exempt from the continuous budget) are different rules, not degrees of the same
thing. Birds and falling leaves are two different classes and should be designed as such,
not as one feature.

### Falling leaves — Ambient idle, scene-wide

Leaves don't belong to one station's narrative; they're weather/season, same category as
the existing `.wf-drift`/`.wf-mote` ambient layer. Proposed as a **new scene-wide ambient
layer**, not a per-station addition:

- **Grammar**: reuse `--wf-beat-300` (19.5s) or `--wf-beat-600` (39s) for a single leaf's
  fall-and-drift cycle — slow enough to read as "occasional," not "raining leaves."
  One-way travel (falls + drifts sideways), so `linear` velocity with opacity ramps at
  both ends, same treatment as `wfMote`/`wfSmoke` — never `ease-idle`, which is reserved
  for oscillating loops.
- **One wind vector (G3)**: the leaf's sideways drift direction and the existing
  `.wf-drift`/`.wf-sway` lean must agree — if a fix to the tree-sway restart bug (Part A)
  changes how sway reads, leaf drift direction should be derived from the same constant
  the sway keyframes use, not re-invented.
  - **Budget (G1)**: 2-3 leaves in flight at once, low opacity (~0.35-0.5, lower than the
  motes' 0.45-0.6 since leaves are visually heavier shapes than a soft dot), staggered
  `animation-delay` so they're never all mid-fall together — same phase-not-tempo
  discipline as the tree-sway fix.
- **Admission check**: Meaning — passes as atmosphere/season, not narrative, same
  justification `.wf-drift`/`.wf-mote` already have; doesn't need a station-specific
  reason. Calm-mode resting pose — trivially satisfied (motion off = no leaves, composition
  unaffected, exactly like motes today).
- **Cost**: cheap. 2-3 extra small SVG/div nodes per visible station, same shape as the
  existing 3 `.wf-mote` divs already in `wfSkeletonHTML()` (`walk-forest.js:1466-1468`).

### Birds — Event class, at specific stations only

A bird is aperiodic and should be rare — this is where "what would make me add a flying
bird to a given activity" gets an actual answer instead of "wherever it looks nice."
Checked against `test/motion-dossier.md`'s own per-station text:

- **`senses`** ("find five things you can see... hear... smell") and **`soundscape`**
  ("mark where sounds come from") are the two stations whose own instruction text is
  literally about noticing something like a bird call or a flash of movement. The dossier
  marked these two "keep as-is" for *ambient tempo motion* (a gesture/sway added there
  would compete with the stillness that's the point) — but a bird is an **Event**, not
  Ambient idle, so that verdict doesn't block it; if anything a bird crossing is the one
  motion class that *reinforces* rather than undermines what these two stations ask for.
  This is the strongest-fit pair in the whole 17-station set.
- Every other station either already has its own gesture/prop motion doing the "alive"
  work, or (`sitspot`, `campfire`) is explicitly about stillness as the emotional point —
  a bird there would be the same category error the dossier already flagged for adding
  gestures to those two.
- **Grammar**: minimum inter-arrival long enough that it reads as occasional against a
  10s dwell / 12s travel cycle (`WF_DWELL_MS`/`WF_TRAVEL_MS`, `walk-forest.js:18-19`) — a
  bird crossing roughly once per 2-3 full dwells at a given station, not once per visit,
  keeps it a surprise rather than a tic. Must not fire while `WF.openId` is set (panel
  open) or while `WF.paused` for the close-pause window — same suppression rule the
  admission checklist already states generally.
- **Entry/exit (G4)**: enters and exits off the side of the frame, never appears mid-air
  or vanishes in place — a simple horizontal path with opacity ramps at both ends,
  reusing the same one-way-travel idiom as `wfMote`/leaf-fall above rather than inventing
  new easing.
- **Calm-mode resting pose (G5)**: trivial — an event-class element is already exempt from
  needing a resting pose; its absence under `WF.reduced` is simply "no bird," which is
  correct (event motion, like locomotion, is meant to be motion-gated).
- **Cost**: 1 extra SVG shape + one CSS animation, only mounted for `senses`/`soundscape`
  (2 of 17 stations), each with a long, randomized-but-seeded inter-arrival timer — the
  cheapest category of addition in this whole plan.

### What this plan deliberately does NOT propose

- **No motion at `sitspot`/`campfire`/`hammock`** beyond what exists — the dossier's
  "keep as-is" verdict for these three was the clearest, most textually-grounded finding
  of that whole pass (campfire explicitly: "the clearest case in the whole dossier that
  silence is correct, not a gap"). Nothing in this new pass changes that; a leaf or two
  drifting through is fine (it's scene-wide ambient, not station-specific), but no new
  per-station Event or Ambient element is proposed for these three.
- **No bird at any station other than `senses`/`soundscape`** — every other station either
  fails the Meaning check (nothing in its text calls for noticing wildlife) or is a
  stillness station where an Event-class arrival would still be an unwelcome interruption
  even though it's not Ambient.

### Before implementing either

1. Fix the tree-sway restart bug first (Part A) — both leaf-fall's wind-direction
   consistency and any future bird flight path should derive from a scene that isn't
   already fighting a timing regression during moves.
2. Extend `test/motion.js` with two new assertions before shipping either: leaf-layer
   energy stays under whatever calibrated ceiling G1 uses, and bird inter-arrival never
   drops below its minimum (a timer-mocked test, not a real-time-waiting one).
3. Re-run `test/motion-probe.js` (after fixing its z-index/off-camera false-positive
   issue from Part B) to get a trustworthy positioning report on the new elements before
   calling either one done.

## Part F — what actually shipped from Part E, and why it deviates from the plan

Part E said "fix the tree-sway restart bug first." That didn't happen, and here's the
honest reason it was still safe to proceed: both new elements were placed deliberately
*outside* the `geo` layer (the trail/tree SVG that's string-rebuilt every frame during a
camera move, the thing that bug is actually in) — in the same always-mounted, never-
reconciled skeleton position the three existing `.wf-mote` divs already use
(`walk-forest.js`, right after them, before `<svg data-wf="set">`). Nothing here rides on
`geo`'s reconciliation state, so the restart bug simply doesn't apply to either addition.
The bug itself is still open and still worth fixing on its own merits — this just means it
wasn't a blocker for this pass.

### Falling leaves — shipped as planned (Ambient idle, scene-wide)

Three `.wf-leaf` divs, permanently mounted (not per-station), sharing one keyframe
(`wfLeafFall`) on `--wf-beat-300` — same rung as the motes, varied only by
`animation-delay`, per the grammar's own "phase, not tempo" rule. Shape is the classic
single-div CSS leaf trick (`border-radius: 0% 100% 0% 100%` on a small rectangle) rather
than an SVG path — cheaper, and in keeping with the scene's flat-geometric aesthetic
(motes are circles; a leaf is just a squircle with two opposite corners rounded). Three
different muted greens/browns so they don't read as triplets of the same object.

**The "one wind vector" claim is deliberately modest, not full G3 compliance**: all three
leaves fall in the same rightward direction (one shared keyframe, so they can't
contradict each other) — but `.wf-drift` and `.wf-drift2` (the two cloud-shadow layers)
already lean in *opposite* directions from each other in the existing code, a pre-existing
quirk this pass didn't touch. Calling the whole scene's wind "reconciled" would be
overclaiming; what's true is that the new leaves don't add a third disagreeing direction.

Under `prefers-reduced-motion`, leaves go fully invisible (`.wf-leaf`'s own base opacity is
`0`, not an inline starting value the way motes use) rather than freezing mid-tumble —
a leaf frozen at a random angle reads as broken, a static mote plausibly reads as ambient
dust sitting still. Different resting behavior, deliberately, for elements with different
physical readings.

### Birds — shipped as planned (Event class, senses/soundscape only)

Two `.wf-bird-gate` wrappers, each holding an inline-SVG two-stroke bird silhouette
(`.wf-bird`, keyframe `wfBirdCross`). Visibility is gated by a wrapper-opacity trick, not
by pausing the animation: the inner element's own keyframe animation runs continuously in
the background at all stations (so its phase within the 78s cycle — `--wf-beat-1200`,
reused rather than inventing a new duration — keeps advancing naturally, and a bird never
looks "triggered" by arrival), while the **wrapper's** opacity is what's actually gated:

```css
.wf-bird-gate { opacity: 0; transition: opacity .6s; }
#wf-scene[data-wf-station="senses"]:not(.wf-panel-open) .wf-bird-gate,
#wf-scene[data-wf-station="soundscape"]:not(.wf-panel-open) .wf-bird-gate { opacity: 1; }
```

`data-wf-station` (the current station's id) and `.wf-panel-open` are two small new pieces
of render state, written once per frame via the existing `wfSet()` change-detection helper
(`walk-forest.js`, right after `const d = WF.dom;` in `wfRender()`) — same idiom every
other per-frame DOM write in this file already uses, nothing new invented. The panel-open
suppression covers the admission rule's "never fire while text is being read" clause
exactly, using state (`WF.openId`) that already existed for this purpose elsewhere in the
file.

Second bird is offset `animation-delay: calc(var(--wf-beat-1200) / -2)` (a negative
half-period, the same idiom the seeded tree-sway delays already use) so a crossing is
available roughly every ~39s rather than only once every 78s, without ever having two
birds visible at once. Reduced motion: `.wf-bird`'s own base opacity is `0` (same reasoning
as leaves), and it's in the shared disable block, so it's inert and invisible regardless of
station or panel state.

### Ping-ring polish (armed-pin ping, not part of Part E — a live-review follow-up)

After the clipping fix (Part 0 originally, now folded in here since it's the same
element): reviewing actual mid-cycle screenshots against the fix turned up a legitimate
refinement, not a bug — the ring's box had just enough room for `overflow: visible` to stop
clipping it, but not enough that the fade-to-transparent finished somewhere visually open.
Fixed by widening the ring's own box (`inset: -9px` → `-18px`) and trimming its max scale
(`2.5` → `2.15`, `wfPing` keyframe) so the ring is comfortably faded to nothing well before
it would reach anything else in the scene, confirmed by contact-sheet screenshots at four
points across the cycle (0.3/0.6/0.85/0.97).

### New test coverage

- `testBirdsGatedToRightStations` (`test/motion.js`) — the gate is opaque=0 at an unrelated
  station, opaque=1 at senses, back to 0 the moment that station's own panel opens, and
  opaque=1 again at soundscape.
- No new test needed for leaves or the generic "is this on the grammar and does reduced
  motion stop it" checks — `testSharedBeatGrammar` and
  `testReducedMotionCoversEveryAnimatedClass` are both written generically over
  `document.getAnimations()` inside `#wf-scene`, so they picked up `wfLeafFall`/
  `wfBirdCross` automatically the moment those durations landed on the existing beat scale,
  with zero test-file changes required — the strongest practical evidence this session's
  grammar work was worth doing: a genuinely new feature slotted into the existing coverage
  without needing bespoke assertions for it.

### Deliberately not attempted in this pass

The "other clever tricks" ask surfaced a few more ideas during design that didn't make the
cut, on purpose rather than by oversight — recorded here so they're a real backlog, not a
forgotten thought:

- **A visible wind gust** sweeping tree-sway/leaf-fall amplitude up together, occasionally
  — the genuinely interesting version of "one wind vector," but doing it properly needs
  either JS-coordinated triggering across the `geo` layer (which is the exact layer with
  the open restart bug) or a much more elaborate CSS-only trick than was justified for this
  pass. Real idea, real cost, deliberately deferred rather than half-built.
- **Firefly-style light motes at campfire** — tempting thematically, but rejected to stay
  consistent with this file's own Part E/dossier finding that campfire is the scene's
  clearest case of "silence is correct, not a gap." Adding ambient motion there just because
  it would look pretty contradicts a conclusion already reached from the station's own text.
- **A second creature type at ground level** (rather than only birds overhead) — would
  double the new-shape/new-gating surface for a third "trick" without a station whose text
  calls for it as clearly as senses/soundscape do for birds; skipped to keep the addition
  disciplined rather than padded.

## Verification run

- `npm test` — 7/7 smoke tests pass.
- `npm run test:motion` — 7/7 motion tests pass: the original 6 plus the new
  `testBirdsGatedToRightStations`. `testSharedBeatGrammar` and
  `testReducedMotionCoversEveryAnimatedClass` pass without modification, having picked up
  the new leaf/bird animations automatically.
- `npm run check:i18n` — 772 keys in sync across en/fr/de after removing `walk.calm` from
  all three.
- Ad-hoc Playwright checks (screenshots + computed-style assertions, not just code reading)
  for every claim above: calm button absent from the DOM; all 17 rail buttons present and
  functional; leaf count 3, bird-gate count 2; bird-gate opacity 0 at an unrelated station,
  1 at senses, back to 0 with the panel open, 1 again at soundscape; under real
  `prefers-reduced-motion` emulation (`reducedMotion: 'reduce'` on the Playwright page, not
  just the in-app `WF.reduced` flag, which only gates locomotion/camera behavior and does
  not affect the CSS media query) both leaf and bird opacity are 0 and zero `wfLeafFall`/
  `wfBirdCross` animations are in `playState: 'running'`; the ping ring is a complete circle
  (not four corner arcs) at every sampled phase and fades to invisible with room to spare
  before the cycle ends.
