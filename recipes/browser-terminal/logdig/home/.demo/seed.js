// Writes the sample Pi sessions, dated relative to today so `logdig backfill` (last 3 days) finds them.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const home = os.homedir();
const sessions = JSON.parse(await readFile(new URL("./sessions.json", import.meta.url), "utf8"));
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

for (const [index, session] of sessions.entries()) {
  const start = new Date(`${day(session.day)}T${session.time}:00Z`);
  const at = (minutes) => new Date(start.getTime() + minutes * 60000).toISOString();
  const id = `demo-${String(index + 1).padStart(2, "0")}`;
  const cwd = `/home/demo/src/${session.project}`;
  const records = [
    { type: "session", version: 3, id, cwd, timestamp: at(0) },
    { type: "message", id: `${id}-user`, timestamp: at(0), message: { role: "user", content: session.ask } },
    { type: "message", id: `${id}-assistant`, timestamp: at(18), message: { role: "assistant", content: `${session.detail} ${session.small}` } },
  ];
  const folder = path.join(home, ".pi/agent/sessions", `--home-demo-src-${session.project}--`);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, `${at(0).replace(/[:.]/g, "-")}_${id}.jsonl`), records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

// A handwritten note that LogDig must leave alone.
await mkdir(path.join(home, "vault/Daily"), { recursive: true });
await writeFile(path.join(home, "vault/Daily", `${day(-1)}.md`), "# Log\n\nCoffee, a walk, then a few good hours of building.\n");
