import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { localPath } from "./project.js";
import { readAnimatedWebp } from "./webp.js";

const exec = promisify(execFile);

// What a motion clip should be to work as a README hero and a portfolio card. Outside these it still counts, with a warning.
export const motionLimits = { maxBytes: 3_000_000, minWidth: 640, minSeconds: 3, maxSeconds: 30 };

const kilobytes = (bytes) => `${Math.round(bytes / 1000).toLocaleString("en-US")} KB`;

// Runs the project's media.capture command in its root, with its output going straight to the terminal.
export function runCapture(project, command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd: project.root, shell: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`'${command}' exited with status ${code}`))));
  });
}

async function probe(file) {
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=width,height,nb_read_packets:format=duration", "-of", "json", file]);
    const { streams: [video] = [], format } = JSON.parse(stdout);
    return video?.width ? { width: video.width, height: video.height, frames: Number(video.nb_read_packets), durationMs: Number(format.duration) * 1000 } : null;
  } catch {
    return null;
  }
}

// Checks the motion file: present, written by this run, animated, looping, and a sensible size, width and length.
// Each result is { status: "pass" | "warn" | "fail", detail }.
export async function inspectMotion(project, reference, { since } = {}) {
  const results = [];
  const add = (status, detail) => results.push({ status, detail });
  const file = localPath(project, reference);
  const info = file && await stat(file).catch(() => null);
  if (!info?.isFile()) {
    add("fail", `${reference} not found`);
    return results;
  }
  if (since && info.mtimeMs < since) add("fail", `${reference} was not rewritten by the capture`);

  const extension = path.extname(file).toLowerCase();
  const clip = extension === ".webp" ? await readAnimatedWebp(file) : await probe(file);
  if (extension === ".webp") {
    if (!clip) add("fail", "not an animated WebP");
    else add(clip.loops === 0 ? "pass" : "warn", clip.loops === 0 ? "animated WebP, loops forever" : `animated WebP, plays ${clip.loops} time(s); encode with -loop 0`);
  } else if (!clip) {
    add("warn", `cannot read ${extension} without ffprobe`);
  }
  if (clip) {
    const seconds = clip.durationMs / 1000;
    const shape = `${clip.width}x${clip.height}, ${seconds.toFixed(1)} s, ${clip.frames} frames`;
    if (clip.width < motionLimits.minWidth) add("warn", `${shape}: narrower than ${motionLimits.minWidth} px looks soft on a card`);
    else if (seconds < motionLimits.minSeconds || seconds > motionLimits.maxSeconds) add("warn", `${shape}: aim for ${motionLimits.minSeconds} to ${motionLimits.maxSeconds} s`);
    else add("pass", shape);
  }
  add(info.size > motionLimits.maxBytes ? "warn" : "pass", info.size > motionLimits.maxBytes
    ? `${kilobytes(info.size)}: over ${kilobytes(motionLimits.maxBytes)}, try a lower quality, fps or a tighter crop`
    : kilobytes(info.size));
  return results;
}
