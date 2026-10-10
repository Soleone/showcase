// Records a web app as a looping animated WebP with agent-browser and FFmpeg, both found on the PATH.
// The project supplies what only it knows (how to start the demo, drive it and tell a good take); this module owns the rest.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function requireTool(command, versionFlag, install) {
  try {
    await exec(command, [versionFlag]);
  } catch {
    throw new Error(`${command} is not on the PATH. ${install}`);
  }
}

// A thin handle on one agent-browser session. Every call is a separate agent-browser process.
function page(session, env) {
  const run = (...args) => exec("agent-browser", ["--session", session, ...args], { timeout: 120_000, env }).then(({ stdout }) => stdout.trim());
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    run,
    // Runs a script in the page and returns its JSON result.
    eval: async (script) => JSON.parse(await run("eval", script)),
    // Waits until a JavaScript expression is truthy in the page.
    waitFor: (expression, { timeoutMs } = {}) => run("wait", "--fn", expression, ...(timeoutMs ? ["--timeout", String(timeoutMs)] : [])),
    sleep: (ms) => run("wait", String(ms)),
    // A real click through the accessibility tree, which counts as a user gesture (script clicks do not unlock audio).
    click: async (name, role = "button") => {
      const ref = (await run("snapshot", "-i")).match(new RegExp(`${role} "${escape(name)}" \\[ref=(\\w+)\\]`))?.[1];
      if (!ref) throw new Error(`No ${role} named "${name}" on the page`);
      await run("click", `@${ref}`);
    },
    // The page's clock, which is the clock frame timestamps use.
    now: async () => JSON.parse(await run("eval", "Date.now()")),
  };
}

// agent-browser's own recorder writes a fixed 10 fps without timestamps, which speeds a busy page up.
// The stream sends each frame with the time it was painted, so durations come out right.
async function streamFrames(url) {
  const frames = [];
  const socket = new WebSocket(`${url}/?maxFps=30`);
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "frame" && message.metadata?.timestamp) frames.push({ at: message.metadata.timestamp, data: message.data });
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error(`Cannot connect to the agent-browser stream at ${url}`));
  });
  return { frames, stop: () => socket.close() };
}

// The stream only sends a frame when the screen changes, so a clip opens on the last frame painted before it.
export function clipFrames(frames, { startAt, endAt }) {
  const opening = frames.findLast((frame) => frame.at < startAt);
  return [...(opening ? [{ ...opening, at: startAt }] : []), ...frames.filter((frame) => frame.at >= startAt && frame.at <= endAt)];
}

const frameName = (index) => `frame-${String(index).padStart(5, "0")}.jpg`;

export async function encode(frames, endAt, work, { out, crop, width, fps, quality, grid }) {
  const list = [];
  for (const [index, frame] of frames.entries()) {
    await writeFile(path.join(work, frameName(index)), Buffer.from(frame.data, "base64"));
    list.push(`file '${frameName(index)}'`, `duration ${((frames[index + 1]?.at ?? endAt) - frame.at) / 1000}`);
  }
  // The concat demuxer drops the last duration unless the last file is listed again, and then the fps filter
  // stretches the end unpredictably, so the output is also cut to the take's length.
  await writeFile(path.join(work, "frames.txt"), `${list.join("\n")}\nfile '${frameName(frames.length - 1)}'\n`);
  const seconds = String((endAt - frames[0].at) / 1000);
  const filters = (scale) => [crop && `crop=${crop}`, `scale=${scale}:-2:flags=lanczos`].filter(Boolean).join(",");
  await mkdir(path.dirname(out), { recursive: true });
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(work, "frames.txt"),
    "-vf", `fps=${fps},${filters(width)}`, "-t", seconds, "-c:v", "libwebp_anim", "-quality", String(quality), "-compression_level", "6", "-loop", "0", "-an", out], { timeout: 600_000 });
  if (!grid) return;
  // Twelve frames spread over the take, to look at before committing.
  const picks = Array.from({ length: 12 }, (_, index) => frameName(Math.round((index * (frames.length - 1)) / 11)));
  await writeFile(path.join(work, "grid.txt"), picks.map((file) => `file '${file}'`).join("\n"));
  await mkdir(path.dirname(grid), { recursive: true });
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(work, "grid.txt"),
    "-vf", `${filters(400)},tile=3x4:padding=4`, "-frames:v", "1", "-update", "1", grid]);
}

/**
 * Records one take, or several until one passes `verify`.
 *
 * @param {object} options
 * @param {string} options.url        Page to open in a fresh browser session (empty storage, so a first visit).
 * @param {string} options.out        The .webp to write.
 * @param {(page) => Promise<void>} [options.start]   Gets the page ready. Recording starts when it returns.
 * @param {(page) => Promise<{startAt?: number, endAt?: number} | void>} options.drive
 *   Plays the clip and returns when it is over. Return page-clock times (`Date.now()` in the page) to trim the clip.
 * @param {(page) => Promise<string | void>} [options.verify]  Returns a reason to throw the take away and try again.
 * @param {number} [options.attempts=1]
 * @param {string} [options.crop]     FFmpeg crop, e.g. "iw:ih/2:0:ih/4", applied before scaling.
 * @param {number} [options.width=960]  Output width; the stream is captured at this width too.
 * @param {{width: number, height: number}} [options.viewport]
 * @param {number} [options.fps=20]
 * @param {number} [options.quality=75]
 * @param {string | false} [options.grid]  Where to write a sheet of twelve frames; defaults to the temp directory.
 * @param {(message: string) => void} [options.log]
 */
export async function record(options) {
  const { url, drive, start = async () => {}, verify = async () => {}, attempts = 1, log = (message) => console.error(message) } = options;
  if (!url || !options.out || typeof drive !== "function") throw new Error("record needs url, out and drive");
  const settings = {
    out: path.resolve(options.out),
    crop: options.crop,
    width: options.width ?? 960,
    fps: options.fps ?? 20,
    quality: options.quality ?? 75,
    grid: options.grid === false ? null : path.resolve(options.grid ?? path.join(os.tmpdir(), `${path.basename(options.out, path.extname(options.out))}-frames.png`)),
  };
  const viewport = options.viewport ?? { width: 1280, height: 800 };
  await requireTool("agent-browser", "--version", "Install it with `npm i -g agent-browser && agent-browser install`.");
  await requireTool("ffmpeg", "-version", "Install FFmpeg with libwebp.");

  for (let attempt = 1; ; attempt += 1) {
    const work = await mkdtemp(path.join(os.tmpdir(), "showcase-capture-"));
    const session = `showcase-capture-${process.pid}-${attempt}`;
    const env = { ...process.env, AGENT_BROWSER_STREAM_QUALITY: "92", AGENT_BROWSER_STREAM_MAX_WIDTH: String(settings.width) };
    const browser = page(session, env);
    let stream, window, rejected;
    try {
      await browser.run("open", "about:blank");
      await browser.run("set", "viewport", String(viewport.width), String(viewport.height));
      await browser.run("open", url);
      await start(browser);
      stream = await streamFrames((await browser.run("stream", "status")).match(/ws:\/\/[\w.:]+/)?.[0] ?? "ws://missing");
      const startAt = await browser.now();
      window = { startAt, ...(await drive(browser)) };
      window.endAt ??= await browser.now();
      rejected = await verify(browser);
    } finally {
      stream?.stop();
      await browser.run("close").catch(() => {});
    }
    try {
      if (rejected) {
        if (attempt >= attempts) throw new Error(`The take was rejected: ${rejected}`);
        log(`Take ${attempt} rejected: ${rejected}. Trying again.`);
        continue;
      }
      const frames = clipFrames(stream.frames, window);
      if (frames.length < 2) throw new Error("The stream sent fewer than two frames during the take");
      await encode(frames, window.endAt, work, settings);
      return { out: settings.out, grid: settings.grid, frames: frames.length, durationMs: window.endAt - window.startAt, attempt };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
