import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// The index (docs/guide/index.md) lists these; every file is also readable on GitHub.
export const topics = [
  { name: "pitch", file: "docs/guide/pitch.md", summary: "the README, the pitch and the hero visual (C and B)" },
  { name: "manifest", file: "docs/guide/manifest.md", summary: "showcase.json: kind, description, demo.externals, ceiling (A)" },
  { name: "demo", file: "docs/guide/demo.md", summary: "the demo route for each kind, sample data, seeding a web app, hosting (A and S)" },
  { name: "media", file: "docs/guide/media.md", summary: "motion: scripting and checking the recording (A)" },
  { name: "terminal", file: "recipes/browser-terminal/README.md", summary: "the S route for a CLI: the in-browser terminal and terminal.json" },
  { name: "portfolio", file: "docs/guide/portfolio.md", summary: "portfolio.json, add, set, list, collect, and how priority sets the goal" },
];

// Relative links in the files work on GitHub; printed, they become absolute paths
// the reader can open from wherever the package is installed.
function absoluteLinks(text, dir) {
  return text.replace(/\]\((?!https?:|#|\/)([^)\s]+)\)/g, (_, target) => `](${path.resolve(dir, target)})`);
}

export async function guide(name) {
  const topic = name === undefined ? null : topics.find((candidate) => candidate.name === name);
  if (name !== undefined && !topic) throw new Error(`No guide topic '${name}'. Topics: ${topics.map((candidate) => candidate.name).join(", ")}.`);
  const file = path.join(root, topic?.file ?? "docs/guide/index.md");
  const text = absoluteLinks(await readFile(file, "utf8"), path.dirname(file));
  const list = topics.map((candidate) => `- \`${candidate.name}\`: ${candidate.summary}`).join("\n");
  return text.replace("{{topics}}", list).trimEnd();
}
