---
name: showcase
description: Make a software project demoable for a portfolio or launch, using the showcase CLI to grade it from D to S and fix what it reports. Use when asked to polish a README, write a project pitch, add a hero image or demo loop, create showcase.json, record a demo, set up a live or in-browser demo, or take a project up a tier.
---

# showcase

showcase grades how demoable a project is, from D to S, and lists what the next tier needs. The grading is mechanical; your job is the part that needs taste: the pitch, the demo strategy, the sample data and the recording. Work one tier at a time and measure every step.

Run it as `showcase` if it is installed, otherwise `npx @soleone/showcase`. It needs Node 22 or later.

## The loop

1. `showcase check <path> --verbose` and read what fails for the next tier. A failing check's hint says what to do.
2. Fix those, and nothing past the next tier unless asked.
3. Run `check` again. Report the tier before and after, and what is left.

Read the playbook before working on A or S: `../../docs/playbook.md` from this file when showcase is installed as a package, or https://github.com/Soleone/showcase/blob/main/docs/playbook.md. It has what worked and what cost time on real projects.

## The tiers

- **C, explained.** The README says what it is and how to run it: 80 or more words and a usage section or code block.
- **B, sells itself.** A pitch right under the title, a hero image or loop before the first `##`, at most 1,200 words of prose, no broken local links.
- **A, shows itself in motion.** A valid `showcase.json`, a looping WebP, GIF or video, and a one-command local demo (`demo.local`).
- **S, try it for real.** A `live` URL that responds.

If a tier is out of reach (nothing can be hosted, for example), set `ceiling` in showcase.json instead of forcing it, and say why.

## Taste

**Pitch.** One or two sentences under the H1 that say what someone can do with it, in plain words. Lead with the outcome, not the stack. Write two or three options when the project's purpose is unclear and let the person pick. Never claim what the project does not do. In showcase.json, `pitch` is one sentence. If a portfolio card needs more, write a `description` (required, up to 240 characters) that adds how it works or what sets it apart, and never restates the pitch.

**Visuals are real.** The hero and the loop show the project actually running: a screenshot or a recording. Never draw a mockup, concept art or an "illustrative" image to pass a check; a portfolio visitor takes it as the real thing. If you cannot run the project here, leave that check failing and say what the person needs to capture.

**Running it.** Use what the README says. If it needs hardware, accounts, large models or a long install, do not set those up to get a screenshot; report it instead.

**README.** Cut before adding. Keep install, the first command and the one thing that makes it worth trying. Move reference material to `docs/`.

**showcase.json.** Start from `showcase init <path> --dry-run`, then fix it by hand:
- `kind` is what visitors get, not the stack.
- `demo.externals` lists everything a demo cannot reach (a model, an account, hardware, a service, another app), the `seam` where a stand-in plugs in, and the `standIn` used. Use `[]` when there is nothing. Each `note` is shown to visitors, so make it say plainly what is not real.

**Demo strategy by kind** (`demo.strategy`):
- `cli`: `browser-terminal`. `showcase terminal` builds a static page that runs the real CLI in the browser from `demo/browser/terminal.json`. See the recipe README in `../../recipes/browser-terminal/` or on GitHub.
- `web-app`: `hosted`, with the first visit already good: bundled sample content, selected by default, usable in one click. No separate demo mode, no login wall.
- `browser-extension`: `store-listing`. `local-web-app`, `agent-extension`: `replay` of a real recorded session. `library`: `playground`. `desktop-app`: a web build or `download`.

**Sample data.** Realistic and specific, never lorem ipsum, never the person's private data. Content you did not write needs a clear license (prefer CC0). When the content is a matter of taste (a song, a level, a dataset), shortlist a few and let the person choose.

**Motion.** Record last, once what it shows is final, and script it so it can be redone: set `media.capture` to the command and run `showcase capture` to record and check the loop (animated, loops forever, at least 640 px wide, 3 to 30 s, under 3 MB). For a web app, write the script with `record` from `@soleone/showcase/capture`. Look at the frame sheet it writes before keeping a take, and show it to the person.

## Ask first

- Anything bound to an account or that publishes: deploying, adding a domain, store listings, `npm publish`, posting anywhere. Prepare it, then hand over the exact commands.
- Renaming the project or changing how its name is written.
- Choosing content the person will be judged by, such as a song, a level or a dataset.
- Writing outside the project you were asked to work on.
- Committing, unless the person already asked you to.

## Report

End with the tier before and after, what changed, what is left for the next tier, and anything only the person can do.
