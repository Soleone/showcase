# Plan

Where showcase is going, what is decided, and what to do next. Update this file as milestones land.

## Why it exists

A portfolio needs two things: deciding *which* projects to show, and making each one *demoable*. Selection happens in the review desk (`~/src/js/portfolio-review`). showcase owns demoability: it grades a project from D to S and says what to do next.

```
portfolio-review   which projects, how much I care   → portfolio.config.json (planned)
showcase           how demoable each project is      → showcase.json per project, feed.json (planned)
portfolio site     shows the result                  ← reads feed.json through a thin adapter
```

## Decisions

- **Separate tool, shareable.** Others should be able to run showcase on their own projects and feed their own portfolio site. No dependencies, Node 22+.
- **`showcase.json` at the project root holds facts about the project only** (title, pitch, kind, media, live URL, demo). Importance and ordering belong to the portfolio, because two portfolios can feature the same project differently.
- **Tiers are cumulative and measured, never hand-set.** D nothing, C explained, B sells itself, A shows itself in motion, S one click to try it for real.
- **What "live" means depends on `kind`:** hosted demo with seeded data (web-app), in-browser terminal (cli), store listing (browser-extension), replay (agent-extension, local-web-app), playground (library).
- **`ceiling`** in showcase.json marks the highest reachable tier, so `check` stops nagging.
- **`local-web-app`** is the kind for a browser UI backed by a process on the user's machine (podcaster: local STT/TTS models plus a host process).
- **Media is generated, not hand-made.** `media.capture` names the command that regenerates it. Advice for now, not required for A.
- **Hosting:** S-tier demos live at `<slug>.soleone.xyz` on Vercel, one Vercel project per demo.
- **DNS** stays on Namecheap (it also carries Forward Email MX/SPF records). The plan is one manual wildcard record `* CNAME cname.vercel-dns.com`, then every subdomain is added from Vercel alone. Avoid the Namecheap API: it is gated, and its setHosts call replaces all records.

## Flagships

| Project | Path | Kind | Tier (Oct 9) | Target and route |
|---|---|---|---|---|
| logdig | `~/src/products/logdig` | cli | A | S. Already has animated WebP, MP4, hero PNG, `npm run demo`, `npm run demo:capture` (a browser replay). Fast S: host that replay. Real S: in-browser terminal. |
| vibestep | `~/src/products/vibestep` | desktop-app (has a web build) | B | S. Web build with a bundled CC0 song and a premade beatmap, landing in playtest. Needs a motion asset. |
| better-youtube | `~/src/products/better-youtube` | browser-extension | C | S. Fix the pitch (currently "Adds buttons on YouTube pages:"), before/after clip, Chrome Web Store listing. |
| podcaster | `~/src/products/podcaster` | local-web-app | C | A, maybe S as a replay with audio (MP4/WebM, WebP has no sound). Needs a hero visual first. |
| tasks (becoming taskdb) | `~/src/products/tasks` | desktop-app | C | Wait for the rename and M0 release. The README is 5,300 words and needs cutting to 1,200. |

## Milestones

### M1. Pilot logdig to A

- Done in showcase: `init` sorts what the README embeds or links into `hero` (first still above the first section), `motion` (first loop) and `video`, and takes `demo.local` / `media.capture` from the `demo` and `capture` / `demo:capture` / `media:capture` scripts, run with the `packageManager` from package.json.
- `init` on logdig prefills hero, motion, video, capture and local, and the unedited draft grades A (checked on a copy).
- No local-web-app detection: podcaster's deps (Vite + React web app, Fastify host) look like any full-stack web-app, and nothing generic marks "needs this machine". Set `kind` by hand.
- Done: logdig's `showcase.json` is committed in logdig (`e58c247`, not pushed).

### M2. Publish showcase

- Done: `Soleone/showcase` is on GitHub and the `$schema` URL resolves.
- `showcase` is taken on npm, so the package is `@soleone/showcase` (the command stays `showcase`).
- Releases: release-please on `main` opens a release PR from Conventional Commits; merging it tags, writes `CHANGELOG.md` and publishes with npm trusted publishing (no token). Mirrors staffed.
- Left: the first `npm publish` by hand (the user), then add the trusted publisher on npmjs.com (Soleone/showcase, `release.yml`).

### M3. Portfolio config and `showcase collect`

- Done: the review desk already writes `portfolio.config.json` (`{ projects: [{ id, title, priority, type, path, repo }] }`, in portfolio order); `schema/portfolio.schema.json` now pins it, with nullable fields.
- `showcase collect <config> --out <dir>` writes `feed.json`: portfolio fields, then showcase.json facts (or the init draft, `source: "draft"`), `tier`, `target` and `gap`. Local media is copied to `media/<slug>/hero.png` etc.; remote URLs stay.
- Priority → target: high S, mid A, low C, capped by `ceiling`. collect's summary shows a TARGET column.
- Projects with no local path (GitHub-only) are listed ungraded; cloning them is out of scope.
- Not yet: optimizing media (needs ffmpeg, see Later), per-site overrides (wait for a second site), `check --config` for the gap outside collect.
- Run on the real config: 29 projects, 21 graded. No priorities are set in the desk yet, so every target is empty.

### M4. Wire the portfolio site

- Done and live on soleone.xyz (Oct 10): `lib/showcase.ts` types the feed and `withShowcase()` enriches the curated list by repo URL (image from motion or hero, `live` → a "Try it" button) and appends feed projects that have a priority. `pnpm showcase` regenerates `public/showcase/`, which is committed so Vercel builds need no local checkouts.
- LogDig added to the site's curated list.
- The Vercel project is not connected to git: deploy with `vercel deploy --prod` after pushing.
- Left: priorities in the review desk (all null as of Oct 10, so feed targets are empty). Ship TypeScript types for other sites later; `lib/showcase.ts` is the first draft.

### M5. DNS and the first S

- Done: logdig is S. https://logdig-demo.vercel.app runs the real CLI in a WebContainers sandbox (`recipes/browser-terminal/`, Gilt theme, WebGL, about 1 s to a ready shell when cached, about 3 s on a first visit while the runtime downloads).
- `demo.externals` in showcase.json declares what a demo cannot reach and its stand-in; the page's disclosure is written from it.
- Done (Oct 10): wildcard `*` CNAME to `cname.vercel-dns.com` at Namecheap; each subdomain is attached to its Vercel project (`vercel domains add <host> <project>`). logdig.soleone.xyz serves `logdig-demo`, vibestep.soleone.xyz serves `vibestep` (renamed from `beatfiend`).
- Later: move logdig's seed and Pi stand-in into the logdig repo (`demo/browser/`), so the project owns its fakes; showcase keeps the generic page and builder.

### M6. The other flagships

- vibestep (Oct 10): vibestep.vercel.app is live, but a new visitor lands in Play with no song and no beatmap. The R2 built-in song catalog (SHA-256 verified, session memory only) is built and empty; choosing the songs is vibestep task `eax`, waiting on the user's audition. Route: one cleared song through `song:intake`, a published map, first-visit auto-select into Play, then a gameplay loop for motion.

Follow the routes in the table. Each one gives showcase a reusable recipe: seeded web build (vibestep), store listing (better-youtube), replay with audio (podcaster). Declare each project's `demo.externals` first: podcaster's STT/TTS models and microphone are the hard ones (likely `replay`).

### M7. `/showcase` Claude skill

A skill in `~/src/skills` for the parts that need taste: rewriting the README pitch, choosing a demo strategy, writing seed data. It runs `showcase check` before and after so the improvement is measured.

## Later

- LLM-judged README quality for C and B, beyond word counts.
- `showcase capture` scaffolds: a VHS `.tape` for CLIs, a Playwright flow for web apps, ffmpeg to a looping WebP.
- `showcase deploy` for the Vercel and subdomain step.
- `collect --optimize`: resize and re-encode media with ffmpeg when it is on the PATH.
