# Demos, sample data and the S tier

S means someone can try it for real with one click. What that means depends on `kind`, and it is set in `demo.strategy`:

- `cli`: `browser-terminal`. `showcase terminal` builds a static page that runs the real CLI in the browser. See `showcase guide terminal`.
- `web-app`: `hosted`, with the first visit already good (below).
- `browser-extension`: `store-listing`.
- `local-web-app`, `agent-extension`: `replay` of a real recorded session.
- `library`: `playground`.
- `desktop-app`: a web build, or `download`.
- `theme`: `hosted`, a preview page drawn from the theme's own colors and assets (a mock of what it themes), so it cannot drift from the theme.

Anything that needs an account, a domain or a deploy is the person's step: prepare it and hand over the exact commands. If nothing can be hosted, set `ceiling`.

## Sample data

Realistic and specific, never lorem ipsum, never the person's private data. Content you did not write needs a clear license; prefer CC0 (OpenGameArt, Freesound and similar). Finding content that is both free and good takes longer than expected. When the content is a matter of taste (a song, a level, a dataset), shortlist a few and let the person choose.

## Seeding a web app's first run

- **No demo mode.** Make the real app's first visit good instead: bundled content, selected by default, usable from the first screen in one click, no login wall. A separate demo path drifts from the app.
- **Let a person author taste-heavy content.** A generated level or map is usually poor. Have someone make it in the app, export it, and script merging the export into the published content. Check exported timing or geometry with a tool rather than by eye (onset analysis found a consistent 50 ms offset in one exported beatmap).
- **Saved state beats published content.** Anything the browser stored (IndexedDB copies, a remembered selection) wins over what you publish, so:
  - a remembered id that no longer exists must fall back to the built-in content, or the picker opens empty;
  - a saved copy of built-in content must still find its built-in assets;
  - you will not see your own published update in a browser that saved a copy. Test in a fresh profile (a new `agent-browser --session`).
- **Audio and media need a real user gesture.** Script clicks do not count; click through the accessibility tree.

## Hosting

- One host project per demo, on a subdomain (`<slug>.example.com`) through a wildcard DNS record, so adding a demo never touches DNS again.
- New files can 404 for a few seconds after a deploy reports ready. Re-check before debugging.
- After it is live, set `live` in showcase.json and run `showcase check` without `--offline`.
