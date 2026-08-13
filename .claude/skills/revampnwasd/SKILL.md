---
name: revampnwasd
description: Audit and fix the physical realism of the forest trail world, its WASD locomotion, and the 17 activity illustrations. Use when adding or changing anything in trail-data.js, trail-engine.js, or the VISUAL illustrations in pocketbook-data.js — or whenever a scene "looks off", a figure looks non-proportional, a parallax layer pops, or feet appear to slide.
---

# /revampnwasd — the realism process

This app draws a side-on forest world in SVG. Things "look off" for reasons that
are almost always **measurable**, not matters of taste. This skill turns each of
those reasons into a number, so a scene either passes or it does not.

Run the whole loop. Skipping the linter and eyeballing the frames is exactly how
the original 17 illustrations drifted to between 2.4 and 3.8 heads tall.

## The one rule everything else follows

Every element in the world carries exactly one spatial number: **`depth`**.

- `depth = 1.0` is the character's plane.
- `depth > 1` is farther away. `depth < 1` is nearer than the character.

Scale, parallax speed, ground contact and haze are all **derived** from it:

```
scale(depth)   = 1 / depth
speed(depth)   = 1 / depth
groundY(depth) = horizonY + (baselineY - horizonY) / depth
haze(depth)    = decreasing opacity, blended toward --forest-mist
```

Never tune scale and scroll speed independently. Lateral apparent velocity is
proportional to `1/distance`, the same as apparent size — if the two disagree by
even a little, a layer reads as sliding against the world rather than sitting in
it. This is the single most common cause of "the parallax looks wrong" and the
reason `speed` and `scale` are the same function here.

## The laws

Each law maps to an assertion in `test/trail-lint.js`. If you add a law, add its
assertion in the same change.

| # | Law | How it is checked |
|---|-----|-------------------|
| D1 | One horizon for the whole world | every layer resolves the same `horizonY` |
| D2 | Parallax speed equals scale | `abs(speed(d) - scale(d)) < 1e-6` for every layer |
| D3 | Ground contact follows perspective | a grounded element's `y` equals `groundY(depth)` within tolerance |
| D4 | Atmospheric perspective is monotonic | `opacity` never increases as `depth` increases |
| D5 | Z-order equals depth order | render order is depth-descending; the `depth < 1` fringe occludes the character |
| D6 | Nothing floats | every grounded prop has a contact shadow at its `groundY`, scaled by `scale(depth)` |
| P1 | Figure proportion | total height / head diameter within **[6.0, 8.0]**, target **7.0** |
| P2 | Limb ratios | shoulder width, arm and leg lengths are fixed ratios of head diameter, identical for every figure |
| W1 | **No foot slide** | the planted foot has zero world-space velocity: `stride × cadence == groundSpeed` |
| W2 | Cadence tracks speed | cadence is derived from current speed, so W1 also holds mid-ramp |
| W3 | Vertical bob | 2 oscillations per gait cycle, amplitude 2–3% of figure height, peak at mid-stance |
| W4 | Counter-phase limbs | left arm shares phase with right leg; each pair is π apart |
| C1 | **Trail corridor is clear** | no station prop intrudes into the walkable corridor band |
| C2 | Station integrity | exactly 17 stations, ids match `ACTIVITIES`, spacing ≥ minimum separation |

### C1 has exactly one exception

`barefoot` — the Barefoot Trail — is the only activity whose content is
*supposed* to lie on the path. Its texture tiles (grass, soil, bark, moss,
stone) are the activity. Every other station's props stay clear of the corridor.

Do not add a second exception. If a new station seems to need one, it is
almost certainly placed wrong.

### W1 is the walk cycle's whole job

With world scroll speed `v`, stride length `S` and cadence `c` steps per second:

```
v = S × c        →       c = v / S       →       gaitCycle T = 2 / c
```

Derive `c` from `v`. Never hardcode a cycle duration. A fixed cadence looks
correct at exactly one speed and slides at every other one — including through
the entire acceleration ramp, which is where the eye notices it most.

## The rig

One figure spec, used by the trail character and by every figure in the 17
illustrations, so the same person appears throughout. All lengths are multiples
of head diameter `h`:

| Part | Ratio |
|------|-------|
| total height | 7.0 h |
| head diameter | 1.0 h |
| shoulder width | 1.6 h |
| torso length | 2.4 h |
| arm length | 3.0 h |
| leg length | 3.6 h |
| stride | 0.85 × leg length |

## The loop

Work in this order. Do not skip to the art.

1. **Write the criterion before the code.** A new behavior gets its linter
   assertion first, failing, then the implementation.
2. **`node test/trail-lint.js`** — pure math and data, no browser. Fast enough
   to run on every edit. It sweeps speeds from 0 to march speed for W1, which
   catches ramp-time slide that eyeballing never does.
3. **`node test/trail-frames.js`** — Playwright captures every station and the
   gait keyframes, and asserts planted-foot world X is unchanged between
   consecutive frames via `TrailDebug`.
4. **Look at every frame.** The linter cannot tell you whether a scene reads
   well. Open each PNG. One at a time.
5. **Fill in the table below** and report it. A scene with no row is a scene
   nobody checked.
6. **`npm test && npm run test:unit && npm run check:i18n`** — the Pocketbook
   screen is covered by the existing smoke suite; keep it green.

Chromium is preinstalled at `PLAYWRIGHT_BROWSERS_PATH`. Do not run
`playwright install`.

## Pass/fail table

Copy this per pass. Every station and every illustration gets a row; mark each
law pass or fail, and never mark a row complete from the linter alone — the
frame review is half the check.

| Scene | D1 | D2 | D3 | D4 | D5 | D6 | P1 | P2 | C1 | Frame reviewed |
|-------|----|----|----|----|----|----|----|----|----|----------------|
| introduce | | | | | | | | | | |
| soundscape | | | | | | | | | | |
| naming | | | | | | | | | | |
| hammock | | | | | | | | | | |
| barefoot | | | | | | | | | C1 exception | |
| palette | | | | | | | | | | |
| senses | | | | | | | | | | |
| tinyworld | | | | | | | | | | |
| sofa | | | | | | | | | | |
| fire | | | | | | | | | | |
| bivouac | | | | | | | | | | |
| sitspot | | | | | | | | | | |
| roles | | | | | | | | | | |
| project | | | | | | | | | | |
| object | | | | | | | | | | |
| checkin | | | | | | | | | | |
| campfire | | | | | | | | | | |

Locomotion is checked once per pass, not per scene:

| Check | W1 | W2 | W3 | W4 | Frames reviewed |
|-------|----|----|----|----|-----------------|
| march forward (W) | | | | | |
| walk back (S) | | | | | |
| acceleration ramp | | | | | |

## House constraints

- No build step, no bundler, no ES modules. Files are plain `<script>` tags in
  dependency order in `index.html`, sharing globals. See `ARCHITECTURE.md`.
- `styles-responsive.css` must stay the last stylesheet.
- SMIL `<animate>` inside the illustrations is unreachable from CSS, so
  `prefers-reduced-motion` has to be checked in JS as well — the existing
  `pbPrefersReducedMotion()` in `pocketbook-activities.js` is the pattern.
- Colors come from `tokens.css`. Do not introduce new hex values that duplicate
  an existing token.
