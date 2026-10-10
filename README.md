# showcase

Grade how demoable a project is, from D to S, and get the exact next steps to raise it.

```
$ showcase check ~/src/products/*
TIER  PROJECT         KIND               NEXT
B     vibestep        desktop-app        A needs manifest, media.motion, demo.local
B     logdig          cli                A needs manifest, demo.local
C     podcaster       other              B needs readme.hero
```

## Quick start

```sh
npm link                      # once, from this directory
showcase check                # grade the project in the current directory
showcase check ~/src/a ~/src/b --verbose
showcase init                 # draft showcase.json from the README and package.json
```

No dependencies; needs Node 22 or later.

## Tiers

Each tier includes everything below it.

| Tier | Means | Checked by |
|---|---|---|
| **D** | Nothing to show yet | |
| **C** | The README says what it is and how to run it | README present, 80+ words, a usage section or code block |
| **B** | The README sells it | Pitch right under the title, hero visual before the first section, 1,200 words or fewer, no broken local links |
| **A** | It shows itself in motion | Valid `showcase.json`, a looping WebP, GIF or video, a one-command local demo |
| **S** | One click to try it for real | `live` URL that responds |

What "live" means depends on the kind of project: a hosted demo with sample data for a web app, an in-browser terminal for a CLI, a store listing for a browser extension, a replay for an agent. Set `ceiling` when a tier is out of reach, for example `"A"` for something that cannot be hosted, and `check` stops suggesting it.

## showcase.json

The project's facts for any portfolio to use. How much a portfolio cares about the project (featured, order) lives in the portfolio, not here.

```json
{
  "$schema": "https://raw.githubusercontent.com/Soleone/showcase/main/schema/showcase.schema.json",
  "title": "LogDig",
  "pitch": "Your Pi history. A journal you can read.",
  "kind": "cli",
  "year": 2026,
  "tech": ["Node.js"],
  "repo": "https://github.com/Soleone/logdig",
  "live": "https://logdig.soleone.xyz",
  "media": {
    "hero": "docs/launch/assets/hero.png",
    "motion": "docs/launch/assets/demo.webp",
    "video": "docs/launch/assets/demo.mp4",
    "capture": "npm run demo:capture"
  },
  "demo": { "strategy": "browser-terminal", "local": "npm run demo" }
}
```

The full contract is [schema/showcase.schema.json](schema/showcase.schema.json). Fields starting with `x-` are allowed for your own extensions.

## Scripting

`showcase check --json` prints every check with its status, detail and hint. `--min B` exits with status 1 when any project is below B, which is handy in CI. `--offline` skips requesting live URLs.

## Development

```sh
npm test
```
