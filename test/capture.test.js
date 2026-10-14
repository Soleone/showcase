import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { clipFrames, encode, findRef } from "../src/capture.js";
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

test("findRef finds a button by name, also when its snapshot line carries state", () => {
  const snapshot = [
    '- button "Choose a theme" [expanded=false, ref=e16]',
    '- button "Close" [ref=e2]',
    '- option "Topdeck" [selected, ref=e18]',
    '- button "Play (1x)" [ref=e7]',
  ].join("\n");
  assert.equal(findRef(snapshot, "button", "Choose a theme"), "e16");
  assert.equal(findRef(snapshot, "button", "Close"), "e2");
  assert.equal(findRef(snapshot, "option", "Topdeck"), "e18");
  assert.equal(findRef(snapshot, "button", "Play (1x)"), "e7");
  assert.equal(findRef(snapshot, "button", "Topdeck"), undefined);
});

test("a clip opens on the frame on screen when it starts", () => {
  const frames = [{ at: 100, data: "a" }, { at: 900, data: "b" }, { at: 1500, data: "c" }, { at: 4000, data: "d" }];
  assert.deepEqual(clipFrames(frames, { startAt: 1000, endAt: 3000 }), [{ at: 1000, data: "b" }, { at: 1500, data: "c" }]);
  assert.deepEqual(clipFrames(frames, { startAt: 0, endAt: 1000 }), [{ at: 100, data: "a" }, { at: 900, data: "b" }]);
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("encode keeps every frame's real duration, including a long still ending", { skip: !hasFfmpeg && "needs FFmpeg" }, async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), "showcase-encode-"));
  const frame = (color) => {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=${color}:s=320x180`, "-frames:v", "1", path.join(work, `${color}.jpg`)]);
    return readFile(path.join(work, `${color}.jpg`), "base64");
  };
  const [red, green, blue] = await Promise.all(["red", "green", "blue"].map(frame));
  const out = path.join(work, "clip.webp");
  await encode([{ at: 0, data: red }, { at: 1000, data: green }, { at: 2000, data: blue }], 7000, work, { out, width: 320, fps: 20, quality: 50 });
  assert.equal(parseAnimatedWebp(await readFile(out)).durationMs, 7000);
});
