# Plan

Where showcase is going, what is decided, and what to do next. Update this file as milestones land. Notes about any one maintainer's own projects, hosting or portfolio site belong outside the repo.

## Why it exists

A portfolio needs two things: deciding *which* projects to show, and making each one *demoable*. showcase does both, start to finish, in one terminal UI: it finds the candidates (folders and GitHub), lets you include or ignore each, grades the ones you keep from D to S and says what to do next. The decisions live in `portfolio.json`.

```
showcase manage         find → review (include / ignore) → grade → fix     → portfolio.json, showcase.json per project
showcase collect        the portfolio and its grades                       → feed.json
portfolio site          shows the result                                   ← reads feed.json through a thin adapter
```

## Decisions

- **Separate tool, shareable.** Anyone can run showcase on their own projects and feed their own portfolio site. No dependencies, Node 22+.
- **Selection lives in showcase too.** It used to sit in a separate review tool (a Python scan, a CSV and a web app). That was folded in: `showcase discover` and the review screen of `manage`. `portfolio.json` carries `roots` (what to scan) and `ignored` (ids decided against), so a rejected project stays rejected. The scan result is a cache in `~/.cache/showcase/`, never a source of truth. The score is a triage hint only.
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
- **Publishing:** `@soleone/showcase` on GitHub (`showcase` is taken on npm; the command stays `showcase`). releases run locally with release-it (`npm run release`): tests, Conventional Commits bump, `CHANGELOG.md`, tag, `npm publish`; `scripts/sync-plugin-version.js` keeps the plugin version in step. No release workflow, so GitHub Actions only runs CI on pull requests.  0.1.0 is published (Oct 11). Releases bump from Conventional Commits, so while pre-1.0 pick the version in the prompt rather than accepting a major bump.
- **`collect <config> --out <dir>`** writes `feed.json`: portfolio fields, showcase.json facts (or the init draft, `source: "draft"`), `tier`, `target` and `gap`. Local media is copied to `media/<slug>/`; remote URLs stay. Priority sets the target (high S, mid A, low C, capped by `ceiling`). Projects without a local path are listed ungraded.
- **`demo.externals`** declares what a demo cannot reach and its stand-in; demo pages write their disclosure from it.
- **`terminal`**: the S route for a CLI. Builds a static page from the project's `demo/browser/terminal.json` that runs the real CLI in WebContainers (assets in `recipes/browser-terminal/`, shipped in the package). About 1 s to a ready shell when cached.
- **`capture`**: runs `media.capture`, then checks `media.motion` (animated, loops, width, length, size). `@soleone/showcase/capture` records a web app as a looping WebP from agent-browser's stream; the project supplies `start`, `drive` and `verify`.
- **`showcase guide [topic]`**: the instructions for agents and people live in the CLI (`docs/guide/*.md`, plus the browser-terminal recipe), so they always match the installed version and need no skill. An index (loop, tiers, ask first) and topics read on demand: pitch, manifest, brand, demo, media, terminal, portfolio. Each failing `check` names its topic. It prints links as absolute paths. The old playbook is folded into the topics.
- **`brand` in showcase.json**: optional `icon`, `logo`, `wordmark` (images) and `colors` (#rrggbb, primary first). Not tied to a tier: `brand.icon` is an advice-only check at A, and only for web-app, local-web-app, desktop-app and browser-extension. `collect` copies the files to `brand/<slug>/` and the feed carries them. Open: init does not detect an existing favicon yet, and nothing generates icons.
- **`showcase` agent skill** (`skills/showcase/SKILL.md`): a stub that says "run `showcase guide`", kept for discovery (people hesitate to install skills, so the CLI works without it). Ships in the package for pi (`pi.skills`), as a Claude Code plugin (`.claude-plugin/`) and for `npx skills add`. It holds no instructions, so it cannot drift. Before the guide, an agent given a sample project with no mention of the skill found it on its own; check that a stub-only discovery still works.
- **`manage [config]`**: a dependency-free terminal UI over a portfolio.json, with no setup: finds the config (arg for one run, `$SHOWCASE_CONFIG`, nearest upwards, then `~/.config/showcase/`) and creates a starter one from the current folder. Lists every project with tier, goal and gap; adds and removes projects; edits portfolio fields and showcase.json facts in place (one-line diffs); drafts a missing showcase.json; sorts the view with `s` (priority then tier by default, tier, gap to target, or portfolio.json order, the one reordering works in: `m` picks a project up and moves it, `J`/`K` step). Two entries for the same folder (a project that moved and left a symlink) count as one: the real location is kept, the other is ignored by `manage` and `collect` (with a note), and `add` refuses a path that is already covered. The same portfolio is scriptable: `add`, `remove`, `set`, `list --json`, and `collect` with no path. Fields and limits come from the schemas. `src/manage.js` is the file model, `src/tui.js` the view, tested with fake keys.
- **Discover and review.** `showcase discover` scans the portfolio's `roots` (a project is a folder in a root or in a folder inside one, so `$SRC/category/project` works; a manifest at the first level makes a folder a project itself; a git repo that only holds projects is a category) and the user's repositories through `gh` when it is installed and logged in (else a note, never an error). Folders match repositories by origin, then by a unique name. Each candidate has a score from evidence (README, live URL, stars, activity), `status` (`review`, `included`, `ignored`) and the reasons. In `manage`, `tab` opens the review: `i` include, `1` `2` `3` include with a priority, `x` ignore or un-ignore, `u` undo, `f` filter, `r` rescan, `R` change roots. First run asks for the roots and goes straight there. Scriptable: `discover --json --status`, `ignore`, `unignore`. Adding a project un-ignores it and keeps its `repo`.
- **showcase shows itself (S).** Four sample projects in `demo/projects`, one per tier from D to A (`npm run demo`), a browser terminal demo of the CLI in `demo/browser`, and `npm run media:capture`, which records that demo with `@soleone/showcase/capture` into `docs/media`. `demo/browser` is hosted and `live` points at it, so it grades S. Rebuild with `showcase terminal` and redeploy `dist/browser` when the CLI changes. The browser terminal page has a theme picker (23 palettes in `recipes/browser-terminal/themes.json`) that recolors the page and the terminal's ANSI colors together; every project that builds a terminal page gets it on its next build.

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
