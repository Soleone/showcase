# showcase

Grade how demoable a project is, from D to S, and get the exact next steps to raise it.

```
$ showcase check ~/src/products/*
TIER  PROJECT         KIND               NEXT
B     vibestep        desktop-app        A needs manifest, media.motion, demo.local
A     LogDig          cli                S needs live
C     podcaster       other              B needs readme.hero
```

## Quick start

```sh
npx @soleone/showcase check   # grade the project in the current directory, no install
npm i -g @soleone/showcase    # or install it to get the `showcase` command
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
  "demo": {
    "strategy": "browser-terminal",
    "local": "npm run demo",
    "externals": [
      { "name": "LLM summaries via Pi", "type": "model", "seam": "piCommand setting", "standIn": "canned",
        "note": "A stand-in for Pi returns canned summaries, so nothing is sent to a model." }
    ]
  }
}
```

`demo.externals` makes explicit what the project needs that a demo cannot reach (a model, an account, hardware, a service, another app), where a stand-in plugs in without changing the code (`seam`), and which stand-in the demo uses: `canned`, `replay`, `simulated`, `bring-your-own`, `real` or `omitted`. `[]` says there are none. Demo pages use each `note` to tell visitors what is not real.

The full contract is [schema/showcase.schema.json](schema/showcase.schema.json). Fields starting with `x-` are allowed for your own extensions.

## Feed a portfolio site

A portfolio picks its projects in `portfolio.config.json`, in the order it shows them ([schema](schema/portfolio.schema.json)):

```json
{
  "projects": [
    { "id": "local:products/logdig", "priority": "high", "type": "product", "path": "$SRC/products/logdig" },
    { "id": "github:Soleone/gamefaqs", "title": "gamefaqs", "priority": "low", "repo": "https://github.com/Soleone/gamefaqs" }
  ]
}
```

```sh
showcase collect portfolio.config.json --out public/showcase
```

This writes `feed.json` with one entry per project: its showcase.json facts (or a draft from the README when it has none), `tier`, `target` and `gap`, the required checks still failing up to the target. Priority sets the target: high S, mid A, low C, capped by `ceiling`. Local media is copied to `media/<slug>/` and the feed points at the copies. Projects without a local path are listed ungraded.

## Scripting

`showcase check --json` prints every check with its status, detail and hint. `--min B` exits with status 1 when any project is below B, which is handy in CI. `--offline` skips requesting live URLs.

## Development

```sh
npm test
```

Releases are automated with release-please. Commit with Conventional Commits (`feat:`, `fix:`); merging the release PR it opens tags the version, writes `CHANGELOG.md` and publishes to npm through trusted publishing.
