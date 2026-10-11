# Plan

Where showcase is going, what is decided, and what to do next. Update this file as milestones land. Notes about any one maintainer's own projects, hosting or portfolio site belong outside the repo.

## Why it exists

A portfolio needs two things: deciding *which* projects to show, and making each one *demoable*. showcase owns demoability: it grades a project from D to S and says what to do next. Selection happens wherever the portfolio is curated, written out as `portfolio.json`.

```
portfolio.json          which projects, how much the portfolio cares
showcase                how demoable each project is      → showcase.json per project, feed.json
portfolio site          shows the result                  ← reads feed.json through a thin adapter
```

## Decisions

- **Separate tool, shareable.** Anyone can run showcase on their own projects and feed their own portfolio site. No dependencies, Node 22+.
- **`showcase.json` at the project root holds facts about the project only** (title, pitch, kind, media, live URL, demo). Importance and ordering belong to the portfolio, because two portfolios can feature the same project differently.
- **Tiers are cumulative and measured, never hand-set.** D nothing, C explained, B sells itself, A shows itself in motion, S one click to try it for real.
- **What "live" means depends on `kind`:** hosted demo with seeded data (web-app), in-browser terminal (cli), store listing (browser-extension), replay (agent-extension, local-web-app), playground (library).
- **`ceiling`** in showcase.json marks the highest reachable tier, so `check` stops nagging.
- **`local-web-app`** is the kind for a browser UI backed by a process on the user's machine (for example local speech models plus a host process). It is not detected: such a project looks like any full-stack web app, so set `kind` by hand.
- **Media is generated, not hand-made.** `media.capture` names the command that regenerates it, and `showcase capture` runs it and checks the result. Advice, not required for A.
- **Recording tools are external.** The core stays dependency-free; `@soleone/showcase/capture` drives agent-browser and FFmpeg from the PATH.

## Done

- **`check`** grades D to S with next steps; `--json`, `--verbose`, `--matrix`, `--min` for CI, `--offline`.
- **`init`** drafts showcase.json from the README (hero, motion, video) and package.json scripts (`demo`, `capture`, `demo:capture`, `media:capture`, run with the declared package manager).
- **Publishing:** `@soleone/showcase` on GitHub (`showcase` is taken on npm; the command stays `showcase`). release-please on `main` opens a release PR from Conventional Commits; merging it tags, writes `CHANGELOG.md` and publishes with npm trusted publishing. Left: the first `npm publish` by hand, then the trusted publisher on npmjs.com.
- **`collect <config> --out <dir>`** writes `feed.json`: portfolio fields, showcase.json facts (or the init draft, `source: "draft"`), `tier`, `target` and `gap`. Local media is copied to `media/<slug>/`; remote URLs stay. Priority sets the target (high S, mid A, low C, capped by `ceiling`). Projects without a local path are listed ungraded.
- **`demo.externals`** declares what a demo cannot reach and its stand-in; demo pages write their disclosure from it.
- **`terminal`**: the S route for a CLI. Builds a static page from the project's `demo/browser/terminal.json` that runs the real CLI in WebContainers (assets in `recipes/browser-terminal/`, shipped in the package). About 1 s to a ready shell when cached.
- **`capture`**: runs `media.capture`, then checks `media.motion` (animated, loops, width, length, size). `@soleone/showcase/capture` records a web app as a looping WebP from agent-browser's stream; the project supplies `start`, `drive` and `verify`.
- **[docs/playbook.md](docs/playbook.md)**: what worked taking a CLI and a web app to S.
- **`showcase` agent skill** (`skills/showcase/SKILL.md`): the taste parts (pitch, demo strategy, sample data, recording), measured with `check` before and after, asking before anything that publishes. Ships in the package for pi (`pi.skills`), as a Claude Code plugin (`.claude-plugin/`) and for `npx skills add`. Tested by giving an agent a sample project with no mention of the skill; it found it on its own.
- **`manage [config]`**: a dependency-free terminal UI over a portfolio.json, with no setup: finds the config (arg for one run, `$SHOWCASE_CONFIG`, nearest upwards, then `~/.config/showcase/`) and creates a starter one from the current folder. Lists every project with tier, goal and gap; adds and removes projects; edits portfolio fields and showcase.json facts in place (one-line diffs); drafts a missing showcase.json; reorders. The same portfolio is scriptable: `add`, `remove`, `set`, `list --json`, and `collect` with no path. Fields and limits come from the schemas. `src/manage.js` is the file model, `src/tui.js` the view, tested with fake keys.
- **showcase shows itself (A).** Four sample projects in `demo/projects`, one per tier from D to A (`npm run demo`), a browser terminal demo of the CLI in `demo/browser`, and `npm run media:capture`, which records that demo with `@soleone/showcase/capture` into `docs/media`. S is hosting `demo/browser` and setting `live`.

## Next

### More recipes, one per route

Each new kind taken to S should leave a reusable recipe behind: store listing (browser-extension), replay with audio (local-web-app; WebP has no sound, so MP4 or WebM), playground (library).

## Later

- LLM-judged README quality for C and B, beyond word counts.
- `capture` for CLIs: a VHS `.tape` or a browser replay, through the same checks.
- A declarative `drive` (a list of open, click and wait steps in showcase.json) for web apps simple enough not to need a script. Wait for a second web app to need it.
- `showcase deploy` for the hosting step.
- `collect --optimize`: resize and re-encode media with FFmpeg when it is on the PATH.
- Per-site overrides in the feed (wait for a second site); `check --config` for the gap outside collect.
- TypeScript types for the feed, for portfolio sites to import.
