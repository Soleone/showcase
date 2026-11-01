# Pitch, README and visuals (C and B)

**Pitch.** One or two sentences under the H1 that say what someone can do with it, in plain words. Lead with the outcome, not the stack. Write two or three options when the project's purpose is unclear and let the person pick. Never claim what the project does not do. Put a screenshot or loop right after it, above the first `##`.

**Visuals are real.** The hero and the loop show the project actually running: a screenshot or a recording. Never draw a mockup, concept art or an "illustrative" image to pass a check; a portfolio visitor takes it as the real thing. If you cannot run the project here, leave that check failing and say what the person needs to capture.

**Running it.** Use what the README says. If it needs hardware, accounts, large models or a long install, do not set those up to get a screenshot; report it instead.

**README.** Cut before adding. Keep install, the first command and the one thing that makes it worth trying. Move reference material to `docs/`. The B tier allows 1,200 words of prose; shorter is better.

**Users first.** Write the README for someone who wants to use the project, in the order they need it: what it does, how to try or get it, how to use it, what to know about their data. Cloning, building, testing, dev servers and contributing come last, in one Development section near the end or in `docs/development.md`. B fails when a section that clones, tests or runs a dev server comes before a section for users. License, documentation and credits can follow it.

**C needs** 80 or more words and a Quick start section or code block that says how to install and run it.

The pitch in README and the `pitch` in showcase.json should agree, but the README can say more. See `manifest` for the showcase.json side.
