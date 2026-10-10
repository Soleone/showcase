import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildTerminal, serveTerminal } from "../src/terminal.js";
import { fixture, manifest } from "./helpers.js";

const recipeFiles = {
  "showcase.json": { ...manifest, repo: "https://github.com/you/demo", demo: { ...manifest.demo, externals: [
    { name: "Model", type: "model", seam: "model setting", standIn: "canned", note: "Summaries are canned." },
    { name: "Disk", type: "service", seam: "none", standIn: "real" },
  ] } },
  "bin/demo.js": "console.log('hi')\n",
  "src/index.js": "export {}\n",
  "notes.txt": "not mounted\n",
  "demo/browser/terminal.json": {
    project: "../..",
    mount: {
      "node_modules/demo": { from: "../..", include: ["bin", "src"] },
      ".": { from: "./home" },
    },
    hints: ["demo --help"],
    seed: "seed.js",
  },
  "demo/browser/home/.demo/sessions.json": "[]\n",
  "demo/browser/seed.js": "export default () => ({})\n",
  "demo/browser/home/loop.webp": Buffer.from([0x52, 0x49, 0x46, 0x46, 0xff, 0x00, 0x80]),
};

const json = async (file) => JSON.parse(await readFile(file, "utf8"));

test("buildTerminal mounts the project and takes its facts from showcase.json", async () => {
  const root = await fixture(recipeFiles);
  const out = path.join(root, "dist");
  await buildTerminal(path.join(root, "demo/browser"), out);

  const config = await json(path.join(out, "terminal.json"));
  assert.deepEqual(config, {
    title: "Demo",
    pitch: "Turns notes into a journal.",
    repo: "https://github.com/you/demo",
    hints: ["demo --help"],
    seed: "seed.js",
    disclosure: "The real Demo runs in a Node.js sandbox in your browser (WebContainers). Summaries are canned. Reload to start over.",
  });

  const files = await json(path.join(out, "files.json"));
  assert.deepEqual(Object.keys(files.node_modules.directory.demo.directory).sort(), ["bin", "src"]);
  assert.equal(files[".demo"].directory["sessions.json"].file.contents, "[]\n");
  assert.deepEqual(files["loop.webp"].file, { base64: Buffer.from([0x52, 0x49, 0x46, 0x46, 0xff, 0x00, 0x80]).toString("base64") });

  const vercel = await json(path.join(out, "vercel.json"));
  assert.deepEqual(vercel.headers[0].headers.map((header) => header.key), ["Cross-Origin-Embedder-Policy", "Cross-Origin-Opener-Policy"]);
  assert.match(await readFile(path.join(out, "index.html"), "utf8"), /webcontainer/i);
  await readFile(path.join(out, "seed.js"));
  await readFile(path.join(out, "fonts/JetBrainsMonoNerdFontMono-Regular.woff2"));
  await assert.rejects(readFile(path.join(out, "fonts/build.sh")));
});

test("buildTerminal explains a missing terminal.json", async () => {
  const root = await fixture({});
  await assert.rejects(buildTerminal(root, path.join(root, "dist")), /No terminal.json/);
});

test("serveTerminal serves the page with isolation headers and nothing outside it", async () => {
  const root = await fixture(recipeFiles);
  const out = path.join(root, "dist");
  await buildTerminal(path.join(root, "demo/browser"), out);
  const server = await serveTerminal(out, 0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(page.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.equal((await fetch(`${base}/terminal.json`)).headers.get("content-type"), "application/json");
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    assert.notEqual((await fetch(`${base}/%2e%2e/showcase.json`)).status, 200);
  } finally {
    server.close();
  }
});

test("showcase terminal builds from demo/browser into dist/browser by default", async () => {
  const root = await fixture(recipeFiles);
  const bin = fileURLToPath(new URL("../bin/showcase.js", import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [bin, "terminal"], { cwd: root });
  assert.match(stdout, /^Built .*dist\/browser/);
  assert.equal((await json(path.join(root, "dist/browser/terminal.json"))).title, "Demo");
});
