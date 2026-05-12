# Forest4Youth — Content & Pathways Documentation

These files are a snapshot of every screen, module, and visible string
in the Forest4Youth Practice Guide as of the current commit. They are
intended for **collaborative review and rewriting** with non-technical
contributors — therapists, educators, translators — without anyone
needing to open `index.html`.

## What's in here

| File | Format | What it contains | Best for |
|------|--------|------------------|----------|
| `pathways.md` | Markdown + Mermaid | Visual map of every navigation route + per-screen outline | Discussing structure, reorganising flow |
| `content.md` | Markdown | Every visible string in the app, grouped by screen | Reading top-to-bottom; spotting inconsistencies |
| `activities.md` | Markdown | The 17 pocketbook activities + adaptations, in readable form | Reviewing activity content, facilitator scripts |
| `translations.csv` | CSV | All 595 i18n keys with their English values | Bulk editing in Google Sheets / Excel |
| `activities.csv` | CSV | The 17 activities × 15 columns | Bulk editing activity metadata |
| `adaptations.csv` | CSV | The 5 adaptation presets | Editing the per-presentation adaptation copy |

## How to collaborate

1. **Upload these files to SharePoint** so collaborators can read/comment.
2. **Suggest text changes** directly in the markdown files (track changes / comments).
3. **For bulk text/translation work**, edit `translations.csv` in Google Sheets or Excel — the `key` column is the contract, the `en` column is the editable text.
4. **For activity rewrites**, edit `activities.csv` (or `activities.md` for prose-style review).
5. When you're ready to push changes back into the app, hand the edited files to a developer; they'll apply the changes to `index.html` (the source of truth) and rerun the generator to keep these docs in sync.

## Regenerating these files

All six files are produced by `tools/generate-docs.js` from `index.html`:

```
node tools/generate-docs.js
```

Requires Node ≥ 18. No npm packages needed.

## Source-of-truth note

`index.html` is the source of truth for what actually ships. These docs are derived from it and may drift if `index.html` changes without rerunning the generator. Treat them as a working copy for discussion, not a parallel implementation.