# Branding (not graded)

`brand` in showcase.json says how the project looks as itself, so a portfolio can show a favicon, tint a card or build a project page. Every field is optional and none of it changes the tier. A web app, local web app, desktop app or browser extension without `brand.icon` gets an advice line from `check`, because it needs one for a favicon or a store listing. Other kinds are never nagged.

- `icon`: a square mark that still reads at 16 px and holds up at 512 px. SVG if you can, otherwise a PNG of at least 512 px. This is the favicon source.
- `logo`: the full lockup (icon and name) for wide spots such as a page header. Leave it out when the icon is the whole identity.
- `wordmark`: the name set in its own lettering, without the icon.
- `colors`: the brand colors as `#rrggbb`, taken from the icon, primary first. A portfolio tints a card with the first. One is fine; list a second only when the identity really has one.

Paths are relative to the project root, or a URL. `collect` copies local files to `brand/<slug>/` and the feed points at the copies.

## Finding or making one

1. Look first: the repo's existing favicon, `public/`, `assets/`, the store listing, the README header. Use what the project already has.
2. If there is none, ask before inventing an identity. A name's lettering and a mark are part of how the person is judged (see the ask-first list in `showcase guide`). Offer a simple SVG draft instead of silently committing one.
3. Check it at 16 px and on both a light and a dark background before setting it.
4. Wire it up: for a web app, link the icon from the page head (`<link rel="icon" href="/icon.svg">`) so the favicon matches what the manifest says.
