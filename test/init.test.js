import assert from "node:assert/strict";
import test from "node:test";
import { draftManifest } from "../src/init.js";
import { fixture, webp } from "./helpers.js";

const draft = async (files) => (await draftManifest(await fixture(files))).manifest;

test("init sorts README media into hero, motion and video", async () => {
  const manifest = await draft({
    "README.md": "# Demo\n\nDemo turns a messy folder of notes into a journal.\n\n![Demo](docs/loop.webp)\n\n[Still](docs/hero.png) · [Video](docs/demo.mp4) · [Docs](docs/usage.md)\n\n## Usage\n\n![Later](docs/later.png)\n",
    "docs/loop.webp": webp({ animated: true }),
  });
  assert.deepEqual(manifest.media, { hero: "docs/hero.png", motion: "docs/loop.webp", video: "docs/demo.mp4" });
});

test("init takes demo and capture commands from package.json scripts", async () => {
  const manifest = await draft({
    "package.json": { name: "demo", packageManager: "pnpm@11.0.0", scripts: { demo: "node demo.js", "demo:capture": "node capture.js" } },
  });
  assert.deepEqual(manifest.demo, { local: "pnpm run demo" });
  assert.deepEqual(manifest.media, { capture: "pnpm run demo:capture" });
});

test("init takes the live demo from the first README link to an app host", async () => {
  const manifest = await draft({
    "README.md": "# Demo\n\nDemo plays songs.\n\nSee [the docs](https://demo.dev/docs) or ![shot](https://demo.github.io/shot.png).\n\nOpen **[demo.vercel.app](https://demo.vercel.app)** to try it.\n",
    "package.json": { name: "demo", homepage: "https://demo.netlify.app" },
  });
  assert.equal(manifest.live, "https://demo.vercel.app");
});

test("init leaves media and demo out when there is nothing to prefill", async () => {
  const manifest = await draft({ "README.md": "# Demo\n\nJust text.\n", "package.json": { name: "demo", scripts: { start: "node ." } } });
  assert.equal(manifest.media, undefined);
  assert.equal(manifest.demo, undefined);
  assert.equal(manifest.live, undefined);
});
