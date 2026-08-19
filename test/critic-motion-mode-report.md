# Extending `critic` with a motion/environment review mode — proposal

Per instruction, the `critic` skill (`/root/.claude/skills/synced/critic`, outside
this repo) was not edited during this work. This is a report on what a motion mode
for it should contain, written after actually running the equivalent review by hand
against the idle-motion grammar work — so every criterion below is grounded in a
finding this session actually made, not a speculative rubric.

## Proposed "When invoked" addition

A fourth mode, alongside the existing three:

> **4. Motion/environment review**: Ivo gives a running scene or animated
> environment (a URL, a branch, or a description of what's moving) to review against
> the idle-motion mandate — every idle element on one shared timing grammar,
> background always subordinate to foreground, nothing that reads as unfinished,
> reduced-motion coverage complete. Fetch/run the target and review against
> `references/motion-checklist.md`, the same way a live-site audit reviews without a
> source draft to check fidelity against — focus on internal consistency
> (does the scene agree with itself) rather than fidelity to a spec.

## Proposed `references/motion-checklist.md`

Following `checklist.md`'s own shape exactly — numbered sections, Critical/Major/Minor
per item, "quote the exact rule" discipline:

```
# Motion review checklist

## 1. Shared grammar
- Does every idle (non-interactive, non-locomotion) animation's duration trace to
  one declared timing scale, or does it invent its own value? -> Major per
  off-scale duration found; Critical if the scale doesn't exist at all in the
  codebase's tokens.
- Where two elements deliberately differ in tempo, is the reason for that
  difference stated at the declaration (parallax depth, intentional counter-phase),
  or does it look indistinguishable from an unexamined default? -> Minor if
  plausible-but-unstated; Major if the difference reads as accidental drift.
- Is variety between repeated same-purpose elements (ten instances of one gesture,
  a forest of trees) achieved via phase (delay) or via tempo (duration)? Tempo
  variety across repeated elements -> Major, every time — this was the single most
  frequent finding in this session (10 gesture instances, 3 tree species, 2 light
  glows, all independently-durationed copies of the same motion).

## 2. Hierarchy
- Can any idle/ambient motion outcompete foreground text for attention — by speed,
  amplitude, or opacity swing, not just raw presence? Duration alone doesn't answer
  this: a slow loop with a large opacity delta can pull as hard as a fast one.
  -> Major.
- Is every exception to "background stays subordinate" named explicitly at its
  declaration (a ping meant to draw the eye, a chip meant to catch attention once),
  or does it just happen to be more noticeable with no stated reason? Unnamed
  exception -> Major. Named exception with a stated reason -> not a finding.

## 3. Finish and seams
- Does any looping animation show a visible seam, pop-in, or asymmetric ease at its
  wrap point? -> Critical (this is literally "reads as unfinished").
- Does any element's motion contradict what it's supposed to represent — the
  animation *type* correct, but its *meaning* wrong for the pose/object it's
  attached to (an arm-swing on a pose meant to read as "carrying," which reads as
  waving instead)? -> Major. This was found, not hypothesized, in this session
  (sofa/roles carry-pose figures) — it is a distinct failure from an off-grammar
  duration and needs its own line item, not just folded into "wrong timing."
- Under repeated/rapid state changes (fast navigation, repeated toggling), does
  any element's DOM identity get destroyed and recreated in a way that restarts
  its animation? This requires driving the actual code path (calling the real
  transition functions across simulated frames), not just reading the CSS — a
  static read of this codebase's stylesheet would not have found the
  camera-move-restart defect this session found; only sampling
  `Animation.currentTime` across real frames did.

## 4. Reduced motion / calm mode
- Does every animated class have a corresponding disable rule, verified by
  enumerating classes on both sides and diffing — not just eyeballing the CSS?
  Missing class -> Critical.
- Does the disable rule sit in cascade order after every rule it needs to
  override? (Placing an override before a later, more specific declaration of the
  same property silently loses the cascade — a real defect class, not
  hypothetical: this codebase's own comments record hitting it twice.) -> Critical
  if found live; not a finding if the codebase already documents having fixed it
  (don't re-flag a defect a comment shows was already caught and corrected).
- Does turning on reduced motion remove *reachability*, not just remove motion —
  i.e., does anything become impossible to reach or complete once animation stops?
  -> Critical. Verify this by actually driving navigation under reduced motion, not
  by inspecting the media query alone — a scene can correctly disable every
  `animation:` declaration and still leave a control unreachable for an unrelated
  reason (e.g. a key binding that was simply never added).
- Is the calm-mode resting frame for anything with a multi-phase sequence (a
  scripted interaction, an assembly animation) a deliberate choice — showing
  either the finished state or a sensible default — or is it whatever the code
  happens to fall into? -> Minor if plausible either way and undecided; Major if it
  strands the element mid-sequence.

## 5. Per-element meaning ("the bird test")
For any element under consideration for *addition*, not just review of what
exists: does it trace to the specific content/context it's attached to (not
generic decoration), fit inside the motion budget at its busiest moment, follow
the shared grammar, enter/exit cleanly, and leave a complete composition in its
absence? Missing any one of these -> the correct verdict is "don't add it," not
"add it and tune later." Absence of motion where the content itself is about
stillness (a grounding exercise, a closing ritual) is a correct outcome, not a
gap — flagging it as a gap is itself a finding against the *reviewer*, worth
naming as a failure mode: don't manufacture a "missing motion" finding for a
station whose entire point is quiet.
```

## Findings from this session that recurred 3+ times (systemic-report material)

Per `critic`'s own threshold ("three is a reasonable informal threshold before
calling something systemic"):

1. **Off-grammar duration on a repeated element** — 10 gesture instances (1.9s-4.2s),
   3 tree species (9-16.2s tempo-by-species), 2 light glows (12s/15.5s), the
   trail-tree pool (520 trees, each independently randomized 8.5-17.5s). Four
   independent occurrences of the identical pattern: duration used to encode
   per-instance variety instead of delay. This is the rule that most belongs in the
   skill verbatim (checklist §1's third bullet).
2. **A pose's canned motion misrepresenting the pose** — found once (carry+gesture
   reading as waving), at two stations (sofa, roles), three total figure instances.
   Below the "three occurrences" bar for a systemic *pattern* claim on its own, but
   worth carrying forward as a checklist line item (§3) since the *category* of
   defect — animation type technically fine, semantically wrong for what it's
   attached to — is exactly the kind of thing a static read misses and is cheap to
   check for once named.
3. **Silence flagged as a gap when it's actually correct** — this was a mistake
   *this reviewer* (not the codebase) made mid-session: an early, unread pass at
   this same plan asserted senses/soundscape/sitspot were "highest-value" targets
   for new motion, before actually reading their content, which is explicitly about
   stillness. Corrected after reading `pocketbook-data.js`'s own `intro` text. Worth
   encoding directly as a checklist rule (§5's closing line) precisely because it's
   an easy mistake to make from the outside — motion review has a bias toward
   finding motion to add, and needs an explicit counter-rule against it.
