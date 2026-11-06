# Motion and recording (A)

The A tier wants a looping WebP, GIF or video, and S wants it as the README hero, right under the pitch and above the first `##`. Record last, once what it shows is final, and script it so it can be redone: set `media.capture` to the command and run `showcase capture`, which records and then checks the loop (animated, loops forever, at least 640 px wide, 3 to 30 s, under 3 MB). `showcase capture --no-record` checks the existing file only. Look at a sheet of frames from each take before keeping it, and show it to the person. Never fake a take (see `pitch`).

## Web apps

Any recorder works as long as `media.capture` runs it. [showcase-capture](https://github.com/Soleone/showcase-capture) is one: `import { record } from "@soleone/showcase-capture"` does the generic part (a fresh browser session through [agent-browser](https://github.com/vercel-labs/agent-browser), frames with their real timestamps, retries, FFmpeg encoding and a sheet of frames to review), and the project supplies `start`, `drive` and `verify`. Its README has the options and why each default is what it is.

Whatever records it, the project owns these:

- **Drive the app through its real inputs, timed from its own state.** In a recorded headless browser the audio clock jitters by up to 100 ms and `setTimeout` fires 40 to 70 ms late. Reading the scheduled events from the app (for React, state via the root fiber's `__reactContainer$` key) and acting on the nearest `requestAnimationFrame` landed every input within 28 ms.
- **Verify the run.** Read the app's own result (a score, a status) and reject a wrong take. Frame hitches still cost a timing-sensitive take about half the time, so allow five attempts.
- **Frame for the card, not the screen.** Portfolio cards often crop with `object-fit: cover` from the top at roughly 3:1. Crop to the band where the action is, which also makes it larger in the README.
- **Loop seams:** start and end on a calm frame, and wait for dialogs to finish closing before the clip starts. Trim the lead-in (with showcase-capture, return `{ startAt }` from `drive`, the page's `Date.now()`).

## CLIs

Build the in-browser terminal first (`showcase guide demo`). It is the S tier, and recording it in a browser is the loop: click its hint buttons and press Ctrl-L between commands so each output starts at the top. showcase's own `scripts/capture-demo.mjs` does this.
