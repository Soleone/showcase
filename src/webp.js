import { readFile } from "node:fs/promises";

// Reads an animated WebP's container without decoding it: canvas size, loop count and each frame's duration.
// Returns null for anything that is not an animated WebP.
export function parseAnimatedWebp(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  let width, height, animated = false, loops = null;
  const durations = [];
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "VP8X") {
      animated = (buffer[data] & 0x02) !== 0;
      width = buffer.readUIntLE(data + 4, 3) + 1;
      height = buffer.readUIntLE(data + 7, 3) + 1;
    } else if (type === "ANIM") {
      loops = buffer.readUInt16LE(data + 4);
    } else if (type === "ANMF") {
      durations.push(buffer.readUIntLE(data + 12, 3));
    }
    offset = data + size + (size % 2);
  }
  if (!animated || !durations.length) return null;
  return { width, height, loops, frames: durations.length, durationMs: durations.reduce((sum, ms) => sum + ms, 0) };
}

export async function readAnimatedWebp(file) {
  return parseAnimatedWebp(await readFile(file));
}
