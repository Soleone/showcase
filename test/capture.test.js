import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inspectMotion } from "../src/inspect.js";
import { loadProject } from "../src/project.js";
import { parseAnimatedWebp } from "../src/webp.js";
import { animatedWebp, fixture, manifest, webp } from "./helpers.js";

const bin = fileURLToPath(new URL("../bin/showcase.js", import.meta.url));
const run = (...args) => promisify(execFile)(process.execPath, [bin, ...args], { env: { ...process.env, NO_COLOR: "1" } })
  .catch((error) => error);

test("reads an animated WebP's size, loop count and length without decoding it", () => {
  assert.deepEqual(parseAnimatedWebp(animatedWebp({ width: 960, height: 344, loops: 0, durations: [50, 50, 100] })),
    { width: 960, height: 344, loops: 0, frames: 3, durationMs: 200 });
  assert.equal(parseAnimatedWebp(webp({ animated: false })), null);
  assert.equal(parseAnimatedWebp(Buffer.from("not a webp")), null);
});

test("inspectMotion passes a good loop and warns about one that stops or is tiny", async () => {
  const root = await fixture({
    "good.webp": animatedWebp(),
    "once.webp": animatedWebp({ loops: 1, width: 320, height: 180 }),
    "still.webp": webp({ animated: false }),
  });
  const project = await loadProject(root);
  const statuses = async (file) => (await inspectMotion(project, file)).map((result) => result.status);
  assert.deepEqual(await statuses("good.webp"), ["pass", "pass", "pass"]);
  assert.deepEqual(await statuses("once.webp"), ["warn", "warn", "pass"]);
  assert.deepEqual(await statuses("still.webp"), ["fail", "pass"]);
  assert.deepEqual(await statuses("missing.webp"), ["fail"]);
  const later = await inspectMotion(project, "good.webp", { since: Date.now() + 60_000 });
  assert.match(later[0].detail, /was not rewritten/);
});

test("capture runs media.capture in the project and checks what it wrote", async () => {
  const write = `node -e "require('fs').writeFileSync('docs/loop.webp', Buffer.from('${animatedWebp().toString("base64")}', 'base64'))"`;
  const root = await fixture({
    "docs/loop.webp": webp({ animated: false }),
    "showcase.json": { ...manifest, media: { ...manifest.media, motion: "docs/loop.webp", capture: write } },
  });
  const recorded = await run("capture", root);
  assert.equal(recorded.code, undefined, recorded.stderr);
  assert.match(recorded.stdout, /Recording with node -e/);
  assert.match(recorded.stdout, /✓ animated WebP, loops forever\n\s+✓ 960x540, 4.0 s, 8 frames/);

  const broken = await fixture({ "showcase.json": { ...manifest, media: { ...manifest.media, motion: "docs/loop.webp", capture: "node -e 0" } } });
  const failed = await run("capture", broken);
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /✗ docs\/loop.webp not found/);

  const existing = await run("capture", root, "--no-record");
  assert.doesNotMatch(existing.stdout, /Recording/);
  assert.equal(existing.code, undefined);
});

test("capture explains what to set when showcase.json has no capture command", async () => {
  const root = await fixture({ "showcase.json": manifest });
  const { code, stderr } = await run("capture", root);
  assert.equal(code, 2);
  assert.match(stderr, /Set media.capture in .*showcase.json/);
});
