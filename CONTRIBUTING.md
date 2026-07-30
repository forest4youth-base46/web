# Contributing

The full picture of *why* this repo is structured the way it is lives in
`ARCHITECTURE.md` — read that before making a structural change. This file
is just the practical "clone to first commit" path.

## Getting started

The app itself needs nothing installed — it's plain HTML/CSS/JS with no
build step. To run it locally:

```
python3 -m http.server
```

(or any other static file server — `npx serve`, VS Code's Live Server,
etc.) then open the printed URL. You can also just open `index.html`
directly in a browser for most things, though the QR/share-link restore
and a few `fetch`-adjacent paths expect to be served over `http://`, not
`file://`.

## Dev tooling (only needed if you're testing your own changes)

```
npm install                    # installs Playwright, the only devDependency
```

- `npm run check:i18n` — verifies `i18n-en.js`/`i18n-fr.js`/`i18n-de.js`
  still declare the same key set.
- `npm run test:unit` — pure-Node unit tests, no browser, runs in well
  under a second.
- `npm test` — the full end-to-end smoke suite (Playwright + a real
  Chromium). Slower; covers accordion behavior, the QR share-link
  round-trip, and role/nav state surviving a refresh.

All three also run in CI on every push (`.github/workflows/smoke.yml`).

### Optional: enable the pre-commit hook

```
git config core.hooksPath .githooks
```

One-time, per clone. Runs the i18n sync check and unit tests (both fast,
no browser) before each commit — not the full smoke suite, which stays a
CI-only, push-time check.

## Before pushing

1. `npm run check:i18n && npm run test:unit && npm test` — or just commit
   with the hook enabled and let it run the fast half automatically.
2. If you touched anything in the mobile Pocketbook drawer, Run Mode, or
   cascade-order-sensitive CSS, a quick manual look in a real browser is
   worth it — the smoke suite covers a lot, but not everything visual.
3. Keep commits atomic and describe *why*, not just *what* — see the git
   log on `redesign-redesigned` for the convention this repo has been
   using.

## Splitting a file that's grown too large

`pocketbook.js` and `styles.css` were both split this way (see
`ARCHITECTURE.md`) — the pattern, if a file needs it again:

1. Identify contiguous line ranges by concern (section-header comments
   already mark most of these).
2. Extract with `sed -n 'START,ENDp' file > newfile.js` per range.
3. Concatenate the pieces back together and `diff` against the original
   to confirm the split was byte-for-byte lossless before deleting it.
4. Add the new `<script src>`/`<link>` tags to `index.html` in the same
   relative position, preserving load order.
5. Run the full test suite, plus a manual visual check if the split
   touched anything cascade-order-sensitive.
