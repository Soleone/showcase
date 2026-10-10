import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function fixture(files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "showcase-test-"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof content === "string" || Buffer.isBuffer(content) ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return root;
}

export function webp({ animated }) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBPVP8X", 8, "ascii");
  buffer[20] = animated ? 0x02 : 0x00;
  return buffer;
}

const filler = "This project does something useful for people who need it, and the rest of this paragraph explains why that matters. ".repeat(6);

export const polishedReadme = `# Demo

Demo turns a messy folder of notes into a tidy daily journal that you can actually read.

![Demo in action](docs/hero.png)

## Quick start

\`\`\`sh
npx demo
\`\`\`

${filler}
`;

export const polishedFiles = {
  "README.md": polishedReadme,
  "docs/hero.png": "png",
  "docs/loop.webp": webp({ animated: true }),
  "package.json": { name: "demo", bin: { demo: "./bin/demo.js" } },
};

export const manifest = {
  title: "Demo",
  pitch: "Turns notes into a journal.",
  kind: "cli",
  media: { hero: "docs/hero.png", motion: "docs/loop.webp" },
  demo: { local: "npm run demo" },
};
