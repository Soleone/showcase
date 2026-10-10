# beatbox

Tap out a rhythm on your keyboard and beatbox turns it into a loop you can layer, tweak and share.

![Layering three loops in beatbox](docs/loop.webp)

## Quick start

```sh
npm install
npm run dev
```

Open http://localhost:5173, press a key to start recording, and press it again to close the loop. Each loop gets its own track, so you can mute, nudge or delete it without touching the rest.

## How it works

Every key you press is quantised to the nearest sixteenth note, so a loop stays in time even when your tapping does not. Sounds come from a small built-in kit, and you can drop in your own samples as WAV files. Sharing a loop gives you a link that holds the whole pattern in the URL, so nothing is stored on a server.
