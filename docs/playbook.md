# Playbook: taking a project to S

What worked, and what cost time, taking a CLI and a browser game from B to S. Read it before taking the next project up a tier. Run `showcase check <path> --matrix` before and after each step.

## Order of work

1. **Pitch and hero (B).** One or two sentences under the H1 that say what you can do with it, then a screenshot or loop above the first `##`.
2. **`showcase.json` (A, S).** Start from `showcase init <path> --dry-run`, then fix by hand:
   - `kind` describes what visitors get, not the stack. A web app with an optional desktop companion is still `web-app` if the hosted site is the product.
   - `live` is read from showcase.json only. A site that is up still fails the `live` check until showcase.json says where it is.
   - `demo.externals`: list everything the demo cannot reach and its stand-in, even when the answer is `bring-your-own` (an optional companion app, a user's own account).
3. **A first run that needs nothing (S).** See below. This is most of the work for a web app.
4. **Motion (A).** Record it last, once the content in it is final; re-recording is cheap only if it is scripted (see below).
5. **Portfolio.** Regenerate the feed with `showcase collect` and redeploy the site.

## Seeding a web app's first run

- **No demo mode.** Make the real app's first visit good instead: bundled content, selected by default, usable from the first screen in one click. A separate demo path drifts from the app.
- **Content needs a clear license.** Prefer CC0 (OpenGameArt, Freesound and similar). Finding content that is both free and good takes longer than expected; shortlist a few and let a person choose.
- **Let a person author taste-heavy content.** A generated level or map is usually poor. Have someone make it in the app, export it, and script merging the export into the published content. Check exported timing or geometry with a tool rather than by eye (onset analysis with librosa found a consistent 50 ms offset in one exported beatmap).
- **Saved state beats published content.** Anything the browser stored (IndexedDB copies, a remembered selection) wins over what you publish, so:
  - a remembered id that no longer exists must fall back to the built-in content, or the picker opens empty;
  - a saved copy of built-in content must still find its built-in assets;
  - you will not see your own published update in a browser that saved a copy. Test in a fresh profile (a new `agent-browser --session`).
- **Audio and media need a real user gesture.** Script clicks do not count; click through the accessibility tree.

## Scripted motion capture (web apps)

`@soleone/showcase/capture` does the generic part: a fresh browser session, stream frames with their real timestamps, retries, encoding and a frame sheet. The project supplies three functions:

```js
import { record } from "@soleone/showcase/capture";

await record({
  url: "https://example.com",
  out: "docs/media/demo.webp",
  crop: "iw:ih/2:0:ih/4",   // optional, the band where the action is
  attempts: 5,
  start: (page) => page.waitFor(`document.querySelector("main")`),   // ready; recording starts after
  async drive(page) {                                                  // the clip itself
    await page.click("Play");
    await page.sleep(10_000);
  },
  async verify(page) {                                                 // a reason to throw the take away
    if (!(await page.eval(`document.title.includes("Done")`))) return "did not finish";
  },
});
```

Set `media.capture` to the script (`npm run media:capture`), then `showcase capture` runs it and checks the result: animated, loops forever, at least 640 px wide, 3 to 30 s, under 3 MB. `showcase capture --no-record` checks the existing file only.

What the module already handles, and why:

- **The stream, not `agent-browser record`.** `record start` opens a fresh page (state is lost) and writes a fixed 10 fps without frame timestamps, so a busy page comes out sped up. The stream sends frames with `metadata.timestamp`; FFmpeg's concat demuxer gets each frame's real duration.
- **Lower load:** the stream is captured at the output width, with a 1280x800 viewport.
- **Encoding:** `fps=20`, `libwebp_anim -quality 75 -compression_level 6 -loop 0`, 960 px wide. An 18 s game clip came to about 700 KB. libwebp merges identical frames, so check the duration, not the frame count.
- **Still screens:** the stream only sends a frame when something changes, so a clip opens on the frame already on screen and its last frame lasts until the end of the take. A terminal demo is mostly still screens.
- **A frame sheet** of twelve frames is written to the temp directory. Look at it before committing; every bug below was visible in one.

What stays in the project:

- **Drive the app through its real inputs, timed from its own state.** In a recorded headless browser the audio clock jitters by up to 100 ms and `setTimeout` fires 40 to 70 ms late. Reading the scheduled events from the app (for React, state via the root fiber's `__reactContainer$` key) and acting on the nearest `requestAnimationFrame` landed every input within ±28 ms.
- **Verify the run.** Read the app's own result (a score, a status) and reject a wrong take. Frame hitches still cost a timing-sensitive take about half the time, so allow five attempts.
- **Frame for the card, not the screen.** Portfolio cards often crop with `object-fit: cover` from the top at roughly 3:1. Crop to the band where the action is, which also makes it larger in the README.
- **Loop seams:** start and end on a calm frame, and wait for dialogs to finish closing before the clip starts. Return `{ startAt }` from `drive` (the page's `Date.now()`) to trim the lead-in.

CLIs: build the in-browser terminal first (`showcase terminal`, see `recipes/browser-terminal/`), which runs the real CLI with sample data and stand-ins for anything external. It is the S tier, and recording it with `record` is the loop: click its hint buttons and press Ctrl-L between commands so each output starts at the top. showcase's own `scripts/capture-demo.mjs` does this.

## Hosting and the portfolio

- **One host project per demo**, on a subdomain (`<slug>.example.com`) through a wildcard DNS record, so adding a demo never touches DNS again.
- **Refresh after media changes:** run `showcase collect` again (it copies media next to `feed.json`), commit and redeploy the site.
- **New files can 404 for a few seconds** after a deploy reports ready. Re-check before debugging.
- **A wide lead card** reads better with its image beside the text than as a tall two-row card, which stretches to its neighbours and leaves empty space.
