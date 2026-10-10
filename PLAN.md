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
| logdig | `~/src/products/logdig` | cli | B | S. Already has animated WebP, MP4, hero PNG, `npm run demo`, `npm run demo:capture` (a browser replay). Fast S: host that replay. Real S: in-browser terminal. |
| vibestep | `~/src/products/vibestep` | desktop-app (has a web build) | B | S. Web build with a bundled CC0 song and a premade beatmap, landing in playtest. Needs a motion asset. |
| better-youtube | `~/src/products/better-youtube` | browser-extension | C | S. Fix the pitch (currently "Adds buttons on YouTube pages:"), before/after clip, Chrome Web Store listing. |
| podcaster | `~/src/products/podcaster` | local-web-app | C | A, maybe S as a replay with audio (MP4/WebM, WebP has no sound). Needs a hero visual first. |
| tasks (becoming taskdb) | `~/src/products/tasks` | desktop-app | C | Wait for the rename and M0 release. The README is 5,300 words and needs cutting to 1,200. |

## Milestones

### M1. Pilot logdig to A

- Done in showcase: `init` sorts what the README embeds or links into `hero` (first still above the first section), `motion` (first loop) and `video`, and takes `demo.local` / `media.capture` from the `demo` and `capture` / `demo:capture` / `media:capture` scripts, run with the `packageManager` from package.json.
- `init` on logdig prefills hero, motion, video, capture and local, and the unedited draft grades A (checked on a copy).
- No local-web-app detection: podcaster's deps (Vite + React web app, Fastify host) look like any full-stack web-app, and nothing generic marks "needs this machine". Set `kind` by hand.
- Left: run `showcase init ~/src/products/logdig` in logdig itself and commit it there. Ask first; it is its own repo.

### M2. Publish showcase

- Create `Soleone/showcase` on GitHub so the `$schema` URL resolves.
- Check the npm name; `showcase` is probably taken, so fall back to a scoped name.

### M3. Portfolio config and `showcase collect`

- Define `portfolio.config.json`: the list of projects (local path or repo), `priority` (`high | mid | low`, the vocabulary the site already uses), order, and per-site overrides.
- `showcase collect <config> --out <dir>` writes `feed.json` (manifests plus tier) and copies and optimizes media into `<dir>/media/`.
- Use priority to set target tiers: high → S, mid → A or B, low → C. `check` can then show the gap to the target, not just the next tier.
- The review desk will generate this config from its CSV (tracked in portfolio-review).

### M4. Wire the portfolio site

- `~/src/js/portfolio` (Next.js, live at https://soleone.xyz) hardcodes projects in `lib/portfolio.ts`.
- Add a small `feedToProjects()` adapter onto its `Project` type and render hero/motion plus a "Try it" link.
- Ship the schema plus TypeScript types for other sites. Build an adapter framework only when a second site needs it.

### M5. DNS and the first S

- The user adds the wildcard CNAME at Namecheap.
- Confirm Vercel verifies `logdig.soleone.xyz` through it.
- Host logdig's replay there, then decide on the browser terminal (xterm.js plus an in-memory filesystem with sample sessions; check what logdig touches: fs, child_process, pi).

### M6. The other flagships

Follow the routes in the table. Each one gives showcase a reusable recipe: seeded web build (vibestep), store listing (better-youtube), replay with audio (podcaster).

### M7. `/showcase` Claude skill

A skill in `~/src/skills` for the parts that need taste: rewriting the README pitch, choosing a demo strategy, writing seed data. It runs `showcase check` before and after so the improvement is measured.

## Later

- LLM-judged README quality for C and B, beyond word counts.
- `showcase capture` scaffolds: a VHS `.tape` for CLIs, a Playwright flow for web apps, ffmpeg to a looping WebP.
- `showcase deploy` for the Vercel and subdomain step.
