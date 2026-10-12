# showcase guide

showcase grades how demoable a project is, from D to S, and lists what the next tier needs. The grading is mechanical; your job is the part that needs taste: the pitch, the demo strategy, the sample data and the recording. Work one tier at a time and measure every step.

Run it as `showcase` if it is installed, otherwise `npx @soleone/showcase`. It needs Node 22 or later. This guide is the instructions for agents and people alike: read a topic only when a step needs it (`showcase guide <topic>`), and every failing check names the topic that helps.

## The loop

1. `showcase check <path> --verbose` and read what fails for the next tier. A failing check's hint says what to do and which topic to read.
2. Fix those, and nothing past the next tier unless asked.
3. Run `check` again. Report the tier before and after, and what is left.

Use `showcase check <a> <b> --matrix` to compare several projects, and `--json` to read the results from a script.

## The tiers

- **C, explained.** The README says what it is and how to run it: 80 or more words and a usage section or code block.
- **B, sells itself.** A pitch right under the title, a hero image or loop before the first `##`, at most 1,200 words of prose, no broken local links.
- **A, shows itself in motion.** A valid `showcase.json`, a looping WebP, GIF or video, and a one-command local demo (`demo.local`).
- **S, try it for real.** A `live` URL that responds.

If a tier is out of reach (nothing can be hosted, for example), set `ceiling` in showcase.json instead of forcing it, and say why.

## Order of work

1. **Pitch and hero (B).** See `pitch`.
2. **showcase.json (A, S).** Start from `showcase init <path> --dry-run`, then fix it by hand. See `manifest`.
3. **A first run that needs nothing (S).** This is most of the work for a web app. See `demo`.
4. **Motion (A).** Record it last, once what it shows is final, and script it so it can be redone. See `media`.
5. **Portfolio.** Regenerate the feed with `showcase collect` and redeploy the site. See `portfolio`.

## Ask first

- Anything bound to an account or that publishes: deploying, adding a domain, store listings, `npm publish`, posting anywhere. Prepare it, then hand over the exact commands.
- Renaming the project or changing how its name is written.
- Choosing content the person will be judged by, such as a song, a level or a dataset.
- Writing outside the project you were asked to work on.
- Committing, unless the person already asked you to.

## Report

End with the tier before and after, what changed, what is left for the next tier, and anything only the person can do.

## Topics

Read one with `showcase guide <topic>`.

{{topics}}
