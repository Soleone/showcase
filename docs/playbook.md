# Playbook: taking a project to S

What worked, and what cost time, taking logdig (cli) and vibestep (web-app) from B to S in October 2026. Read it before starting the next flagship. Run `showcase check <path> --matrix` before and after each step.

## Order of work

1. **Pitch and hero (B).** One or two sentences under the H1 that say what you can do with it, then a screenshot or loop above the first `##`.
2. **`showcase.json` (A, S).** Start from `showcase init <path> --dry-run`, then fix by hand:
   - `kind` describes what visitors get, not the stack. vibestep has an Electron companion but the product is the hosted site, so it is `web-app`.
   - `live` is read from showcase.json only. A site that is up still fails the `live` check until showcase.json says where it is.
   - `demo.externals`: list everything the demo cannot reach and its stand-in, even when the answer is "bring your own" (vibestep's YouTube companion).
3. **A first run that needs nothing (S).** See below. This is most of the work for a web-app.
4. **Motion (A).** Record it last, once the content in it is final; re-recording is cheap only if it is scripted (see below).
5. **Portfolio.** Regenerate the feed and deploy (see below).

## Seeding a web-app's first run

- **No demo mode.** Make the real app's first visit good instead: bundled content, selected by default, playable from the welcome dialog in one click. A separate demo path drifts from the app.
- **Content needs a clear license.** vibestep ships "Bouncer" by Of Far Different Nature (CC0, OpenGameArt). Searching CC0 music took longer than expected; audition a shortlist with the user rather than picking alone.
- **Let the user author taste-heavy content.** The generated beatmap was poor. The user mapped it in the app and exported it; the script merged the export into the published catalog. Check exported timing against the audio (onset analysis with librosa found a consistent 50 ms offset).
- **Saved state beats published content.** Anything the browser stored (IndexedDB copies, a remembered selection) wins over what you publish, so:
  - a remembered id that no longer exists must fall back to the built-in content, or the picker opens empty;
  - a saved copy of built-in content must still find its built-in assets;
  - you will not see your own published update in a browser that saved a copy. Test in a fresh profile (a new `agent-browser --session`).
- **Audio and media need a real user gesture.** Script clicks do not count; click through the UI.

## Scripted motion capture (web apps)

vibestep's `scripts/capture-gameplay.mjs` is the working example and the starting point for `showcase capture`.

- **Use the agent-browser stream, not `record`.** `record start` opens a fresh page (state is lost), and it writes a fixed 10 fps without frame timestamps, so a busy page comes out sped up. The stream (`stream status` gives a `ws://` URL) sends frames with `metadata.timestamp`; write them to JPEGs and give ffmpeg's concat demuxer each frame's real duration.
- **Drive the app through its real inputs**, but time them from the app's own state. In a recorded headless browser the audio clock jitters by up to 100 ms and `setTimeout` fires 40 to 70 ms late. Reading the scheduled events (React state via the root fiber) and acting on the nearest `requestAnimationFrame` landed every input within ±28 ms.
- **Verify the run, then retry.** Read the app's own result (vibestep: Perfect 36 of 36) and throw the take away if it is wrong. Frame hitches still cost a take about half the time, so allow five tries.
- **Lower the load:** `AGENT_BROWSER_STREAM_MAX_WIDTH` at the output width, viewport 1280x800.
- **Frame for the card, not the screen.** The portfolio crops images with `object-cover object-top` at roughly 3:1. Crop the loop to the band where the action is, which also makes it larger in the README.
- **Loop seams:** start and end on a calm frame (an empty playfield), and wait for dialogs to finish closing before the clip starts.
- **Encoding:** `fps=20`, `libwebp_anim -quality 75 -compression_level 6 -loop 0`, 960 px wide: 18 s came to 780 KB. libwebp merges identical frames, so check the total duration, not the frame count.
- **Look at the frames** (extract a few with Pillow) before committing. Every bug above was visible in a frame grid.

CLIs: logdig records a browser replay of a synthetic session (`npm run demo:capture`), and its S tier is an in-browser terminal (`recipes/browser-terminal/`).

## Portfolio and hosting

- **The site shows its curated list plus feed projects with a priority.** Until priorities are set in the review desk, a new project is invisible unless it is added to the curated list in `lib/portfolio.ts`.
- **Refresh after media changes:** `pnpm showcase` in the portfolio (copies media into `public/showcase/`), commit, `vercel deploy --prod`. The project is not connected to git.
- **New files can 404 for a few seconds** after a deploy reports ready. Re-check before debugging.
- **The lead card** spans both columns with its image beside the text. A two-row card stretched to the height of its neighbours and left empty space.
- **Subdomains:** one Vercel project per demo, `<slug>.soleone.xyz` via the wildcard CNAME and `vercel domains add` (the user runs that one).
