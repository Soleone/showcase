#!/usr/bin/env node
// Builds a static page that boots a Node.js sandbox (WebContainers) in the browser and opens a shell in it.
// Usage: node recipes/browser-terminal/build.js <recipe-dir> --out <dir> [--serve] [--port 4321]
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolvePath } from "../../src/collect.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const skip = new Set([".git", "node_modules"]);

// Reads a folder into a WebContainer FileSystemTree; `include` limits the top-level entries.
async function tree(folder, include) {
  const result = {};
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (include ? !include.includes(entry.name) : skip.has(entry.name)) continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) result[entry.name] = { directory: await tree(file) };
    else if (entry.isFile()) result[entry.name] = { file: { contents: await readFile(file, "utf8") } };
  }
  return result;
}

// Places a subtree at a path like "node_modules/logdig" inside the root tree.
function place(root, target, subtree) {
  const parts = target.split("/").filter((part) => part && part !== ".");
  let node = root;
  for (const part of parts) {
    node[part] ??= { directory: {} };
    node = node[part].directory;
  }
  Object.assign(node, subtree);
}

const isolationHeaders = { "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Opener-Policy": "same-origin" };

async function build(recipeDir, out) {
  const { mount, ...config } = JSON.parse(await readFile(path.join(recipeDir, "terminal.json"), "utf8"));
  const files = {};
  for (const [target, { from, include }] of Object.entries(mount)) {
    place(files, target, await tree(resolvePath(from, recipeDir), include));
  }
  await mkdir(out, { recursive: true });
  await copyFile(path.join(here, "index.html"), path.join(out, "index.html"));
  await writeFile(path.join(out, "files.json"), JSON.stringify(files));
  await writeFile(path.join(out, "terminal.json"), `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(path.join(out, "vercel.json"), `${JSON.stringify({
    headers: [{ source: "/(.*)", headers: Object.entries(isolationHeaders).map(([key, value]) => ({ key, value })) }],
  }, null, 2)}\n`);
  return { out, bytes: JSON.stringify(files).length };
}

const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript" };

function serve(out, port) {
  createServer(async (request, response) => {
    const name = new URL(request.url, "http://localhost").pathname.replace(/\/$/, "/index.html");
    const file = path.join(out, path.normalize(name));
    if (!file.startsWith(out)) return response.writeHead(403).end();
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", ...isolationHeaders }).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  }).listen(port, () => console.log(`Serving ${out} at http://localhost:${port}`));
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, serve: { type: "boolean" }, port: { type: "string" } } });
if (positionals.length !== 1 || !values.out) {
  console.error("Usage: node recipes/browser-terminal/build.js <recipe-dir> --out <dir> [--serve] [--port 4321]");
  process.exit(2);
}
const { out, bytes } = await build(path.resolve(positionals[0]), path.resolve(values.out));
console.log(`Built ${out} (${Math.round(bytes / 1024)} KB of files)`);
if (values.serve) serve(out, Number(values.port ?? 4321));
