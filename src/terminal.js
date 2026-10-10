// Builds the browser terminal recipe: a static page that boots a Node.js sandbox (WebContainers) and opens a shell in it.
import { copyFile, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePath } from "./collect.js";
import { loadManifest } from "./project.js";

const assets = fileURLToPath(new URL("../recipes/browser-terminal/", import.meta.url));
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

// Places a subtree at a path like "node_modules/my-cli" inside the root tree.
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

// The page says what is not real, from the project's demo.externals.
function disclosure(title, externals = []) {
  const notes = externals.filter((external) => external.standIn !== "real").map((external) => external.note ?? `${external.name}: ${external.standIn} stand-in.`);
  return [`The real ${title} runs in a Node.js sandbox in your browser (WebContainers).`, ...notes, "Reload to start over."].join(" ");
}

export async function buildTerminal(recipeDir, out) {
  recipeDir = path.resolve(recipeDir);
  out = path.resolve(out);
  const recipeFile = path.join(recipeDir, "terminal.json");
  const { mount, project, ...recipe } = JSON.parse(await readFile(recipeFile, "utf8").catch(() => {
    throw new Error(`No terminal.json in ${recipeDir}. See recipes/browser-terminal/README.md.`);
  }));
  if (!mount) throw new Error(`${recipeFile}: mount is required`);
  // Facts come from the project's showcase.json; terminal.json only adds what is specific to this page.
  const manifest = project ? await loadManifest(resolvePath(project, recipeDir)) : null;
  if (manifest?.errors.length) throw new Error(`${manifest.file}: ${manifest.errors.join("; ")}`);
  const facts = manifest?.data ?? {};
  const config = { title: facts.title, pitch: facts.pitch, repo: facts.repo, ...recipe };
  config.disclosure ??= disclosure(config.title, facts.demo?.externals);
  const files = {};
  for (const [target, { from, include }] of Object.entries(mount)) {
    place(files, target, await tree(resolvePath(from, recipeDir), include));
  }
  await mkdir(out, { recursive: true });
  await copyFile(path.join(assets, "index.html"), path.join(out, "index.html"));
  await cp(path.join(assets, "fonts"), path.join(out, "fonts"), { recursive: true, filter: (source) => !source.endsWith(".sh") });
  await writeFile(path.join(out, "files.json"), JSON.stringify(files));
  if (config.seed) await copyFile(path.join(recipeDir, config.seed), path.join(out, config.seed));
  await writeFile(path.join(out, "terminal.json"), `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(path.join(out, "vercel.json"), `${JSON.stringify({
    headers: [
      { source: "/(.*)", headers: Object.entries(isolationHeaders).map(([key, value]) => ({ key, value })) },
      { source: "/fonts/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ],
  }, null, 2)}\n`);
  return { out, bytes: JSON.stringify(files).length };
}

const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".woff2": "font/woff2", ".txt": "text/plain" };

// Serves a built page on this machine only, with the headers the sandbox needs.
export function serveTerminal(out, port = 4321) {
  out = path.resolve(out);
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const name = new URL(request.url, "http://localhost").pathname.replace(/\/$/, "/index.html");
      const file = path.join(out, path.normalize(name));
      if (!file.startsWith(out + path.sep)) return response.writeHead(403).end();
      try {
        const body = await readFile(file);
        response.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", ...isolationHeaders }).end(body);
      } catch {
        response.writeHead(404).end("Not found");
      }
    });
    server.once("error", reject).listen(port, "127.0.0.1", () => resolve(server));
  });
}
