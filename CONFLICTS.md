# Content conflicts

Tracked discrepancies between `pocketbook-data.js` (the live source of
truth for the session builder) and copy shown elsewhere (e.g. exported
guide pages / PDFs), found while recreating two activity illustrations
in Canva. `pocketbook-data.js` was **not modified** — these are flagged
for review before the next deployment.

Canva file with the recreated illustrations (SVGs from `pocketbook-data.js`,
pasted in as native shapes/text, pixel-matched to the originals):
https://www.canva.com/d/zcjeIcHwpHG4DRn

## Activity `naming` (group 1, "First session")

| Field | `pocketbook-data.js` | Elsewhere |
|---|---|---|
| `name` | Naming the Forest | Getting to know the forest |
| `purpose` | Names reduce anxiety. Familiarity builds confidence. | matches |
| `materials` | Nothing, or a laminated sheet of local species. | matches |
| `intro` | "As we walk I'll point a few things out. You don't need to remember any of it. Everything here has a name." | matches |
| `close` | No formal close. Dissolves into the walk. | No formal close. It dissolves into the walk. (minor rewording) |

Illustration (`visuals.naming` SVG): unchanged, still accurate.

## Activity `checkin` (group 5)

| Field | `pocketbook-data.js` | Elsewhere |
|---|---|---|
| `name` | The Return Check-in | The silent self check-in |
| `purpose` | Brief self-assessment before leaving. Builds self-reflection as a habit. | matches |
| `materials` | A simple rating card: much better / a bit better / about the same / a bit worse. | To find a good place before the end of the forest paths. Ask everyone to think without need to share. |
| `intro` | "Fill this in before we get on the bus. You don't need to share it. Just take a moment to notice." | "Take a silent moment to check inside yourself for how you feel now. Much better? A bit worse? This is for you to note, no one else needs to know." |
| `close` | Collect cards quietly. Begin the walk back. Allow quiet on the return — don't process the session immediately. | Quietly be sure that the group has had enough time. Move on towards the end. |

Illustration (`visuals.checkin` SVG): unchanged, still accurate as a
private rating-scale visual — the "collect cards" implication in the box
icon is the one part worth a second look once the copy above is settled,
since the newer wording describes a silent, un-collected reflection
rather than a handed-in card.

## Next step

Reconcile which wording is current (code vs. exported guide) and update
`pocketbook-data.js` accordingly. Not done here per instruction — this
file only documents the conflict.
