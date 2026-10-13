import { execFile } from "node:child_process";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadReadme } from "./readme.js";
import { schema, validate } from "./schema.js";

const exec = promisify(execFile);

export const manifestName = "showcase.json";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function exists(file) {
  return stat(file).then(() => true, () => false);
}

export async function gitRemote(root) {
  try {
    const { stdout } = await exec("git", ["-C", root, "remote", "get-url", "origin"]);
    const match = stdout.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
    return match ? { owner: match[1], repo: match[2], url: `https://github.com/${match[1]}/${match[2]}` } : null;
  } catch {
    return null;
  }
}

export async function firstCommitYear(root) {
  try {
    const { stdout } = await exec("git", ["-C", root, "log", "--reverse", "--format=%ad", "--date=format:%Y"]);
    const year = Number(stdout.split("\n")[0]);
    return Number.isInteger(year) && year > 1990 ? year : null;
  } catch {
    return null;
  }
}

const webFrameworks = ["next", "vite", "astro", "@remix-run/react", "react-router", "@sveltejs/kit", "nuxt", "react-scripts", "gatsby"];

// A best guess; showcase.json's kind always wins.
export async function detectKind(root, pkg) {
  const extension = await readJson(path.join(root, "manifest.json"));
  if (extension?.manifest_version) return "browser-extension";
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.electron || deps["@tauri-apps/api"] || await exists(path.join(root, "src-tauri"))) return "desktop-app";
    if (pkg.bin) return "cli";
    if (pkg.pi?.extensions) return "agent-extension";
    if (pkg.contributes?.themes) return "theme";
    if (webFrameworks.some((name) => deps[name])) return "web-app";
    if (pkg.main || pkg.exports) return "library";
  }
  if (await exists(path.join(root, "Cargo.toml"))) return await exists(path.join(root, "src/main.rs")) ? "cli" : "library";
  if (await exists(path.join(root, "go.mod"))) return await exists(path.join(root, "main.go")) ? "cli" : "library";
  if (await exists(path.join(root, "index.html"))) return "web-app";
  // An Omarchy theme: a palette and its wallpapers.
  if (await exists(path.join(root, "colors.toml")) && await exists(path.join(root, "backgrounds"))) return "theme";
  return "other";
}

export async function loadManifest(root) {
  const file = path.join(root, manifestName);
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(source);
    return { file, data, errors: validate(data) };
  } catch (error) {
    return { file, data: null, errors: [`invalid JSON: ${error.message}`] };
  }
}

export async function loadProject(root) {
  root = path.resolve(root);
  if (!(await stat(root).catch(() => null))?.isDirectory()) throw new Error(`Not a directory: ${root}`);
  const [pkg, readme, manifest, remote] = await Promise.all([
    readJson(path.join(root, "package.json")),
    loadReadme(root),
    loadManifest(root),
    gitRemote(root),
  ]);
  const declaredKind = manifest?.data?.kind;
  return {
    root,
    name: path.basename(root),
    pkg,
    readme,
    manifest,
    remote,
    kind: schema.properties.kind.enum.includes(declaredKind) ? declaredKind : await detectKind(root, pkg),
  };
}

// Maps a reference from a README or manifest to a file on disk, including GitHub URLs that point into the same repo.
export function localPath(project, reference, base = project.root) {
  if (/^(mailto:|tel:|data:|#)/i.test(reference)) return null;
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(clean)) return path.resolve(clean.startsWith("/") ? project.root : base, clean.replace(/^\//, ""));
  if (!project.remote) return null;
  const { owner, repo } = project.remote;
  const escaped = `${owner}/${repo}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = clean.match(new RegExp(`^https://(?:raw\\.githubusercontent\\.com/${escaped}/[^/]+|github\\.com/${escaped}/(?:blob|raw|tree)/[^/]+)/(.+)$`, "i"));
  return match ? path.join(project.root, match[1]) : null;
}

export async function isAnimatedWebp(file) {
  let handle;
  try {
    handle = await open(file);
    const { buffer } = await handle.read(Buffer.alloc(21), 0, 21, 0);
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 16) === "WEBPVP8X" && (buffer[20] & 0x02) !== 0;
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

const stillExtensions = new Set([".png", ".jpg", ".jpeg", ".avif", ".svg"]);
const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v"]);

// "still", "motion" (a silent loop), "video", or null when the reference is not media. A remote WebP cannot be read, so it is "unverified".
export async function mediaType(project, reference, base = project.root) {
  const extension = path.extname(reference.split(/[?#]/)[0]).toLowerCase();
  if (videoExtensions.has(extension)) return "video";
  if (extension === ".gif" || extension === ".apng") return "motion";
  if (stillExtensions.has(extension)) return "still";
  if (extension !== ".webp") return null;
  const file = localPath(project, reference, base);
  return file ? (await isAnimatedWebp(file) ? "motion" : "still") : "unverified";
}

export { exists };
