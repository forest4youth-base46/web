# Per-activity integration dossier

Phase 2a of the idle-motion-grammar work. Cross-references each station's own
`intro`/`purpose` text (`pocketbook-data.js:699`) against what's actually staged in
`WF_CAST`/`wfBuildCast()` (`walk-forest.js`), to decide — per station — whether the
walker's passivity and the cast's motion (or its absence) is correct as-is, needs
retiming, needs replacing, or is a real gap.

Cast gesture durations as declared in `WF_CAST` today (the `c[6]` tuple):
fire 1.9s · palette 2.8s · sofa 3.0s · roles 3.0s/3.0s · bivouac 3.2s · introduce
3.4s · tinyworld 3.6s · object 3.8s · project 4.0s · naming 4.2s — **ten different
durations for the exact same shared `wfGesture` animation class.** This is Phase 3's
"variety from tempo, not phase" finding, now with full station-level evidence: the
fix there (one duration, phase offset by delay) resolves all ten at once.

## Verdicts

| Station | What the text asks for | Cast/walker today | Verdict |
|---|---|---|---|
| introduce | kneel, place materials to spell a name | kneel + gesture (3.4s) | **Revise** — shape is right, retime only |
| soundscape | sit still, mark what you hear | sit ×2, no gesture; walker `poseSeated` | **Keep as-is** — stillness is the instruction itself; a gesture here would work against the content |
| naming | walker points things out while walking | reach + gesture (4.2s), stand | **Revise** — retime only |
| hammock | lie down, notice, do nothing | cast `lie` pose (own hammock geometry), no gesture; walker's own figure `hidden` at this stop | **Keep as-is** — already the cleverer design: the walker *becomes* the hammock occupant via the cast/prop system rather than needing a separate scripted pose |
| barefoot | walker takes shoes off, feels the ground | **the one scripted walker interaction in the whole scene** (crouch/shoe-off/stand, `:1130-1148`); cast stand ×2, no gesture | **Revise** (retime only) + one open question carried to Phase 4: should calm mode's static frame show the *finished* shoe-off state instead of a generic stand? |
| palette | reach for/point at a colour match | reach + gesture (2.8s), stand | **Revise** — retime only |
| senses | stand still, notice five things | stand, no gesture | **Keep as-is** — same reasoning as soundscape: stillness is the content |
| tinyworld | kneel and build with found materials | kneel + gesture (3.6s), kneel (static) | **Revise** — retime only |
| sofa | carry branches/logs back to build a seat | sit ×2 (static); **carry + gesture (3.0s)** | **Replace** — see kinematic mismatch below |
| fire | kneel, strike/tend a flame | kneel + gesture (1.9s, the fastest of all ten), kneel (static), sit (static) | **Revise** — retime; shape (kneeling, working motion) is plausible for striking/feeding a fire |
| bivouac | gather materials, build a shelter | reach + gesture (3.2s); carry (static, no gesture) | **Revise** — retime the reach only; the static carry is already correct (no mismatch, because it isn't gesturing) |
| sitspot | sit, no need to explain why | sit ×2, no gesture; walker `poseSeated` | **Keep as-is** — stillness |
| roles | carry responsibility/tasks | **carry + gesture ×2** (3.0s / 3.0s), stand (static) | **Replace** — same mismatch as sofa, twice here |
| project | plant/build/create over weeks | kneel + gesture (4.0s) | **Revise** — retime only |
| object | find something small to take | kneel + gesture (3.8s) | **Revise** — retime only |
| checkin | fill in a short form before leaving | reach (static — **no gesture wired**), stand | **Promote** — "fill this in" is exactly the kind of specific action the existing reach+gesture pattern already represents elsewhere (palette, bivouac); this is a one-line data addition (`c[6]` on the existing reach entry), not new code |
| campfire | sit with the fire, shared stillness, closing ritual | sit ×4, no gesture; walker `poseSeated` | **Keep as-is** — the most textually explicit stillness station in the scene, and the scene's emotional bookend; motion here is the clearest case in the whole dossier that silence is correct, not a gap |

## Tally

- **Keep as-is (5):** soundscape, hammock, senses, sitspot, campfire — all either
  textually about stillness, or already using a cleverer mechanism than a gesture
  would be. This directly overturns my own earlier, unread guess (in an initial pass
  of the plan) that these "silent" stations were gaps and specifically that
  senses/soundscape/sitspot were "highest-value" targets for *new* walker motion —
  they're the opposite: the stations where adding motion would be the mistake.
- **Revise, retime only (9):** introduce, naming, barefoot, palette, tinyworld, fire,
  bivouac, project, object — gesture shape already matches its station; only the
  duration is wrong, and Phase 3's grammar fixes all nine in one pass.
- **Replace (2 stations, 3 gesture instances):** sofa, roles — see below.
- **Promote (1):** checkin — add a gesture to the existing reach pose.

## The carry+gesture kinematic mismatch (sofa, roles ×2)

`wfBuildCast()`'s `armLimb()` helper: when a cast entry carries a `c[6]` duration/delay
pair, the pose's arm is wrapped in a `wfGesture`-classed `<g>` that rotates about the
shoulder joint (`walk-forest.js:429-441`) — a symmetric ±9° swing, the same treatment
used for every gestured pose regardless of what pose it's attached to.

For `reach`/`kneel` poses this reads correctly: a rhythmic swing at a fixed point is a
plausible working motion (reaching for, placing, striking). For `carry`
(`sofa`, `roles` ×2) it does not: the `carry` pose's arm is drawn forward and roughly
horizontal specifically to read as *resting on a held load* (`walk-forest.js`'s own
`pose === 'carry'` branch draws it at a fixed forward angle for exactly this reason).
Setting that same arm swinging ±9° on a loop reads as waving, not carrying — the
motion contradicts the pose's own reason for existing.

**Fix, staying inside the existing vocabulary rather than adding new geometry**
(per `ARCHITECTURE.md`'s "extend the existing pattern" ethos): give `carry` a
different idle tell than an arm swing — a small periodic **weight-shift** (a few
degrees of whole-figure lean, alternating, on the shared beat) reads as "this load has
some heft," is legible at the scene's scale, and doesn't fight the pose's own
silhouette. Implementation: reuse the shared `wfSettle`/`wfBreath`-style small-rotation
keyframe already in the grammar rather than inventing a new one — apply it to the
whole cast `<g>` instead of just the arm.

## Feeds into

- Phase 3 (grammar): all 9 "revise" stations' durations collapse onto the beat scale;
  phase varies by `animation-delay`, not duration.
- Phase 4 (calm mode): the barefoot open question above.
