# Motion and recording (A)

The A tier wants a looping WebP, GIF or video. Record last, once what it shows is final, and script it so it can be redone: set `media.capture` to the command and run `showcase capture`, which records and then checks the loop (animated, loops forever, at least 640 px wide, 3 to 30 s, under 3 MB). `showcase capture --no-record` checks the existing file only. Look at the frame sheet it writes before keeping a take, and show it to the person. Never fake a take (see `pitch`).

## Web apps

`@soleone/showcase/capture` does the generic part: a fresh browser session, stream frames with their real timestamps, retries, encoding and a frame sheet. It needs [agent-browser](https://github.com/vercel-labs/agent-browser) and FFmpeg on the PATH. The project supplies three functions:

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

Set `media.capture` to the script (for example `npm run media:capture`).

What the module already handles, and why:

- **The stream, not `agent-browser record`.** `record start` opens a fresh page (state is lost) and writes a fixed 10 fps without frame timestamps, so a busy page comes out sped up. The stream sends frames with `metadata.timestamp`; FFmpeg's concat demuxer gets each frame's real duration.
- **Lower load:** the stream is captured at the output width, with a 1280x800 viewport.
- **Encoding:** `fps=20`, `libwebp_anim -quality 75 -compression_level 6 -loop 0`, 960 px wide. An 18 s game clip came to about 700 KB. libwebp merges identical frames, so check the duration, not the frame count.
- **Still screens:** the stream only sends a frame when something changes, so a clip opens on the frame already on screen and its last frame lasts until the end of the take. A terminal demo is mostly still screens.
- **A frame sheet** of twelve frames is written to the temp directory. Every bug below was visible in one.

What stays in the project:

- **Drive the app through its real inputs, timed from its own state.** In a recorded headless browser the audio clock jitters by up to 100 ms and `setTimeout` fires 40 to 70 ms late. Reading the scheduled events from the app (for React, state via the root fiber's `__reactContainer$` key) and acting on the nearest `requestAnimationFrame` landed every input within 28 ms.
- **Verify the run.** Read the app's own result (a score, a status) and reject a wrong take. Frame hitches still cost a timing-sensitive take about half the time, so allow five attempts.
- **Frame for the card, not the screen.** Portfolio cards often crop with `object-fit: cover` from the top at roughly 3:1. Crop to the band where the action is, which also makes it larger in the README.
- **Loop seams:** start and end on a calm frame, and wait for dialogs to finish closing before the clip starts. Return `{ startAt }` from `drive` (the page's `Date.now()`) to trim the lead-in.

## CLIs

Build the in-browser terminal first (`showcase guide terminal`). It is the S tier, and recording it with `record` is the loop: click its hint buttons and press Ctrl-L between commands so each output starts at the top. showcase's own `scripts/capture-demo.mjs` does this.
