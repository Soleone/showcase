#!/usr/bin/env node
// Records showcase's own browser demo (demo/browser) as the README loop, and the hero from the first command's output.
// Usage: npm run media:capture. Needs agent-browser (with its browser installed) and FFmpeg on the PATH.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { record } from "../src/capture.js";
import { buildTerminal, serveTerminal } from "../src/terminal.js";

const exec = promisify(execFile);
const media = path.resolve("docs/media");
const viewport = { width: 960, height: 720 };
// Everything below the page title: the hint buttons and the terminal. The hero stops below the summary.
const crop = "iw:ih*29/36:0:ih*7/36";
const heroCrop = "iw:ih*19/36:0:ih*7/36";
const commands = [
  ["showcase check projects/*", 3500],
  ["showcase check projects/notecli", 4500],
  ["showcase init projects/notecli --dry-run", 5000],
];

const out = await mkdtemp(path.join(os.tmpdir(), "showcase-demo-"));
const server = await serveTerminal((await buildTerminal("demo/browser", out)).out, 0);
const shot = path.join(out, "last.png");
try {
  const { frames, durationMs, grid } = await record({
    url: `http://127.0.0.1:${server.address().port}/`,
    out: path.join(media, "demo.webp"),
    viewport,
    width: viewport.width,
    crop,
    async start(page) {
      await page.waitFor(`!document.querySelector("#hints button").disabled`, { timeoutMs: 60_000 });
      await page.run("eval", `document.querySelector("textarea").focus()`);
      await page.run("keyboard", "type", "clear");
      await page.run("press", "Enter");
      await page.sleep(800);
    },
    async drive(page) {
      await page.sleep(700);
      for (const [index, [command, ms]] of commands.entries()) {
        // Ctrl-L clears the screen without a visible command, so each output starts at the top.
        if (index) await page.run("press", "Control+l");
        await page.click(command);
        await page.sleep(ms);
        // The hero is the first output: every sample project's tier at a glance.
        if (!index) await page.run("screenshot", shot);
      }
    },
  });
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", shot, "-vf", `crop=${heroCrop}`, path.join(media, "hero.png")]);
  console.log(`Wrote docs/media/demo.webp (${frames} frames, ${(durationMs / 1000).toFixed(1)} s) and docs/media/hero.png. Check the frames in ${grid}.`);
} finally {
  server.close();
  await rm(out, { recursive: true, force: true });
}
