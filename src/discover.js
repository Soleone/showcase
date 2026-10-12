import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadPortfolio, resolvePath } from "./collect.js";

// Finds the projects worth reviewing: the folders under the portfolio's roots, matched with the user's GitHub
// repositories when `gh` is installed and logged in. Nothing here decides anything; it only gathers evidence.

const ghRepos = "user/repos?visibility=all&affiliation=owner&per_page=100";
// A folder with one of these is a project itself. Without, it is a category holding projects (a git repo of
// several projects is a category too), unless it holds no folders at all.
const projectMarkers = ["package.json", "showcase.json", "Cargo.toml", "go.mod", "pyproject.toml", "Gemfile", "mix.exs"];
const hiddenOrJunk = (name) => name.startsWith(".") || name === "node_modules";

// Runs a program and never throws: { ok, stdout, missing } so a failing git or gh just means less evidence.
export function run(file, args, { cwd, timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout, maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout ?? "", stderr: (stderr ?? "").trim(), missing: error?.code === "ENOENT" });
    });
  });
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const at = next++;
      results[at] = await fn(items[at], at);
    }
  }));
  return results;
}

// owner/name for a github.com remote, in any of its URL spellings, else null.
export function githubName(url) {
  const value = String(url ?? "").trim();
  const match = /^(?:git@github\.com:|(?:https?:\/\/|ssh:\/\/git@)?(?:www\.)?github\.com[/:])([^/\s]+)\/([^/\s?#]+?)(?:\.git)?\/?(?:[?#].*)?$/i.exec(value);
  return match ? `${match[1]}/${match[2]}` : null;
}

const notLive = new Set(["github.com", "gitlab.com", "bitbucket.org", "localhost", "127.0.0.1", "youtube.com", "www.youtube.com", "discord.com", "www.discord.com", "npmjs.com", "www.npmjs.com", "rubygems.org", "docs.rs", "nextjs.org", "www.nextjs.org", "prisma.io", "www.prisma.io"]);

// Links in a README that could be a live demo: not badges, repositories, registries or videos.
export function liveUrls(text) {
  const found = [];
  for (const match of text.match(/https?:\/\/[^\s<>()[\]{}"']+/g) ?? []) {
    const url = match.replace(/[.,;:!?)\]}>'"]+$/, "");
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (!host || notLive.has(host) || host.endsWith(".githubusercontent.com") || /(^|\.)shields\.io$|(^|\.)badge\.fury\.io$/.test(host)) continue;
    if (!found.includes(url)) found.push(url);
  }
  return found;
}

async function readme(dir) {
  const names = (await readdir(dir).catch(() => [])).filter((name) => name.toLowerCase().startsWith("readme")).sort((a, b) => (b.toLowerCase() === "readme.md") - (a.toLowerCase() === "readme.md") || a.localeCompare(b));
  for (const name of names) {
    const raw = await readFile(path.join(dir, name)).catch(() => null);
    if (raw && raw.length < 2_000_000 && !raw.subarray(0, 8192).includes(0)) return raw.toString("utf8");
  }
  return null;
}

// What one folder says about itself, from git and the README. Cheap enough to run for hundreds of folders.
export async function inspectFolder(dir, { exec = run } = {}) {
  const isGit = existsSync(path.join(dir, ".git"));
  const text = await readme(dir);
  const info = { isGit, readme: text !== null, readmeWords: text ? (text.match(/[\w'-]+/g) ?? []).length : 0, liveUrl: text ? liveUrls(text)[0] ?? null : null, origin: null, commits: 0, lastCommit: null, files: 0 };
  if (isGit) {
    const git = (...args) => exec("git", ["-C", dir, ...args], { timeout: 30000 });
    const [origin, remotes, count, last, tracked] = await Promise.all([git("config", "--get", "remote.origin.url"), git("remote"), git("rev-list", "--all", "--count"), git("log", "--all", "-1", "--format=%cI"), git("ls-files", "-z")]);
    info.origin = origin.ok ? origin.stdout.trim() : null;
    if (!info.origin && remotes.ok && remotes.stdout.trim()) {
      const url = await git("remote", "get-url", remotes.stdout.trim().split(/\s+/)[0]);
      info.origin = url.ok ? url.stdout.trim() : null;
    }
    info.commits = Number(count.stdout.trim()) || 0;
    info.lastCommit = last.stdout.trim() || null;
    info.files = tracked.ok ? tracked.stdout.split("\0").filter(Boolean).length : 0;
  }
  if (!info.files) info.files = (await readdir(dir).catch(() => [])).length;
  if (!info.lastCommit) info.lastCommit = (await stat(dir).catch(() => null))?.mtime.toISOString() ?? null;
  return info;
}

const isProjectFolder = (dir) => projectMarkers.some((marker) => existsSync(path.join(dir, marker)));
const subfolders = async (dir) => (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && !hiddenOrJunk(entry.name)).map((entry) => entry.name).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
const isDirectory = async (dir) => (await stat(dir).catch(() => null))?.isDirectory() ?? false;

// The project folders under one root: subfolders with a project marker, else their subfolders (category/project).
export async function projectFolders(root) {
  const found = [];
  for (const first of await subfolders(root)) {
    const dir = path.join(root, first);
    if (!(await isDirectory(dir))) continue;
    if (isProjectFolder(dir)) { found.push({ dir, rel: first }); continue; }
    const inside = [];
    for (const second of await subfolders(dir)) {
      if (await isDirectory(path.join(dir, second))) inside.push({ dir: path.join(dir, second), rel: `${first}/${second}` });
    }
    if (inside.length) found.push(...inside);
    else if (existsSync(path.join(dir, ".git"))) found.push({ dir, rel: first });
  }
  return found;
}

const daysAgo = (iso, now) => iso ? Math.floor((now - Date.parse(iso)) / 86_400_000) : null;

// A triage hint, not a decision: evidence that a project is real, shown, and alive. Higher means look at it sooner.
export function score(candidate, now = Date.now()) {
  const reasons = [];
  let points = 0;
  const add = (amount, reason) => { points += amount; if (reason) reasons.push(reason); };
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (candidate.source !== "local") add(8, "GitHub repo");
  if (candidate.private === false) add(4, "public");
  if (candidate.homepage || candidate.liveUrl) add(15, "live/demo URL");
  if (candidate.readme) add(10, "README");
  if (candidate.description) add(8, "description");
  if (candidate.stars) add(Math.min(15, Math.round(5 * Math.log2(candidate.stars + 1))), plural(candidate.stars, "star"));
  if (candidate.forks) add(Math.min(8, Math.round(2 * Math.log2(candidate.forks + 1))), plural(candidate.forks, "fork"));
  const age = daysAgo(candidate.lastActive, now);
  if (age !== null) {
    if (age <= 90) add(10, "active <90d");
    else if (age <= 365) add(6, "active <1y");
    else if (age <= 730) add(2);
  }
  if (candidate.commits) add(Math.min(8, Math.round(2 * Math.log2(candidate.commits + 1))), plural(candidate.commits, "commit"));
  if (candidate.files >= 10) add(5, "substantial code");
  else if (candidate.files > 0) add(2);
  if (candidate.fork) add(-8, "fork");
  if (candidate.archived) add(-10, "archived");
  if (candidate.source === "local" && !candidate.isGit) add(-2, "not a git repo");
  return { score: Math.max(0, Math.min(100, points)), reasons };
}

const later = (a, b) => (a && b ? (Date.parse(a) >= Date.parse(b) ? a : b) : a ?? b ?? null);

function fromRepo(repo) {
  return {
    repo: repo.html_url ?? `https://github.com/${repo.full_name}`,
    description: repo.description || null,
    homepage: (repo.homepage || "").trim() || null,
    language: repo.language || null,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    fork: Boolean(repo.fork),
    archived: Boolean(repo.archived),
    private: Boolean(repo.private),
    pushedAt: repo.pushed_at || null,
  };
}

// Puts local folders and GitHub repositories on one list. A folder matches the repository its origin points at,
// else the one repository with its name that no other folder claimed.
export function merge(folders, repos, now = Date.now()) {
  const byName = new Map(repos.map((repo) => [repo.full_name.toLowerCase(), repo]));
  const byShortName = new Map();
  for (const repo of repos) byShortName.set(repo.name.toLowerCase(), [...(byShortName.get(repo.name.toLowerCase()) ?? []), repo]);
  const claimed = new Set();
  const candidates = [];
  for (const folder of folders) {
    const fullName = githubName(folder.origin)?.toLowerCase();
    let repo = fullName && byName.get(fullName);
    if (!repo) {
      const named = byShortName.get(path.basename(folder.dir).toLowerCase()) ?? [];
      if (named.length === 1 && !claimed.has(named[0].full_name)) repo = named[0];
    }
    if (repo) claimed.add(repo.full_name);
    const base = {
      id: folder.id, name: path.basename(folder.dir), category: folder.rel.includes("/") ? folder.rel.split("/")[0] : null, source: repo ? "both" : "local",
      path: folder.path, dir: folder.dir, repo: null, description: null, homepage: null, language: null, stars: 0, forks: 0, fork: false, archived: false, private: null, pushedAt: null,
      isGit: folder.isGit, readme: folder.readme, readmeWords: folder.readmeWords, liveUrl: folder.liveUrl, commits: folder.commits, files: folder.files, lastCommit: folder.lastCommit,
      ...(repo ? fromRepo(repo) : {}),
    };
    if (!repo && githubName(folder.origin)) base.repo = `https://github.com/${githubName(folder.origin)}`;
    candidates.push(base);
  }
  for (const repo of repos) {
    if (claimed.has(repo.full_name)) continue;
    candidates.push({
      id: `github:${repo.full_name}`, name: repo.name, category: "github-only", source: "github", path: null, dir: null, ...fromRepo(repo),
      isGit: false, readme: false, readmeWords: 0, liveUrl: null, commits: 0, files: 0, lastCommit: null,
    });
  }
  return candidates.map((candidate) => {
    const lastActive = later(candidate.lastCommit, candidate.pushedAt);
    const { score: points, reasons } = score({ ...candidate, lastActive }, now);
    return { ...candidate, lastActive, score: points, reasons };
  }).sort((a, b) => b.score - a.score || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
}

// The user's repositories through gh. { repos, note }: a missing or logged-out gh is a note, never an error.
export async function fetchRepos({ exec = run } = {}) {
  const result = await exec("gh", ["api", "--paginate", "--jq", ".[]", ghRepos], { timeout: 180000 });
  if (result.missing) return { repos: [], note: "GitHub skipped: gh is not installed" };
  if (!result.ok) return { repos: [], note: `GitHub skipped: ${result.stderr.split("\n")[0] || "gh failed"}` };
  const repos = [];
  for (const line of result.stdout.split("\n")) {
    try {
      const repo = JSON.parse(line);
      if (repo?.full_name) repos.push(repo);
    } catch { /* not a repository line */ }
  }
  return { repos, note: null };
}

// Scans the roots (as typed in portfolio.json) and GitHub. `base` is the portfolio's folder, where relative roots resolve from.
export async function scan(roots, { base = process.cwd(), env = process.env, github = true, exec = run, now = Date.now(), onProgress = () => {} } = {}) {
  const notes = [];
  const folders = [];
  const seenDirs = new Set();
  for (const typed of roots) {
    let root;
    try { root = resolvePath(typed, base, env); } catch (error) { notes.push(`${typed}: ${error.message}`); continue; }
    if (!(await isDirectory(root))) { notes.push(`${typed} is not a folder`); continue; }
    const prefix = typed.replace(/\/+$/, "");
    for (const folder of await projectFolders(root)) {
      const real = await realpath(folder.dir).catch(() => folder.dir);
      if (seenDirs.has(real)) continue;
      seenDirs.add(real);
      folders.push({ ...folder, path: `${prefix}/${folder.rel}`, root });
    }
  }
  const ids = new Set();
  for (const folder of folders) {
    folder.id = `local:${folder.rel}`;
    if (ids.has(folder.id)) folder.id = `local:${path.basename(folder.root)}/${folder.rel}`;
    for (let n = 2; ids.has(folder.id); n += 1) folder.id = `local:${path.basename(folder.root)}/${folder.rel}-${n}`;
    ids.add(folder.id);
  }
  let done = 0;
  onProgress({ phase: "folders", done, total: folders.length });
  const inspected = await mapLimit(folders, 8, async (folder) => {
    const info = await inspectFolder(folder.dir, { exec });
    onProgress({ phase: "folders", done: ++done, total: folders.length });
    return { ...folder, ...info };
  });
  let repos = [];
  if (github) {
    onProgress({ phase: "github", done: 0, total: 1 });
    const fetched = await fetchRepos({ exec });
    repos = fetched.repos;
    if (fetched.note) notes.push(fetched.note);
  }
  return { scannedAt: new Date(now).toISOString(), roots, github: github && repos.length > 0, candidates: merge(inspected, repos, now), notes };
}

// Where the scan result is kept: a cache, one per portfolio file, safe to delete.
export function cachePath(configFile, env = process.env) {
  const dir = path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "showcase");
  return path.join(dir, `discovery-${createHash("sha1").update(path.resolve(configFile)).digest("hex").slice(0, 10)}.json`);
}

export async function readCache(configFile, env = process.env) {
  try {
    const cache = JSON.parse(await readFile(cachePath(configFile, env), "utf8"));
    return Array.isArray(cache?.candidates) ? cache : null;
  } catch {
    return null;
  }
}

export async function writeCache(configFile, result, env = process.env) {
  const file = cachePath(configFile, env);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(result)}\n`);
}

const repoKey = (url) => githubName(url)?.toLowerCase() ?? String(url ?? "").toLowerCase();

// Marks each candidate "included" (in the portfolio), "ignored" (decided against) or "review" (undecided).
// A folder counts as included when an entry has its id or points at the same real folder; one reached through
// a symlink is the same folder. A repo-only entry covers the candidate with the same repository.
export async function classify(candidates, config, base, env = process.env) {
  const real = (dir) => realpath(dir).catch(() => dir);
  const byDir = new Map();
  for (const entry of config.projects) {
    if (!entry.path) continue;
    try { byDir.set(await real(resolvePath(entry.path, base, env)), entry); } catch { /* an unset $VAR cannot match */ }
  }
  const byId = new Map(config.projects.map((entry) => [entry.id, entry]));
  const byRepo = new Map(config.projects.filter((entry) => entry.repo && !entry.path).map((entry) => [repoKey(entry.repo), entry]));
  const ignored = new Set(config.ignored ?? []);
  return Promise.all(candidates.map(async (candidate) => {
    const entry = byId.get(candidate.id) ?? (candidate.dir && byDir.get(await real(candidate.dir))) ?? (candidate.repo && byRepo.get(repoKey(candidate.repo)));
    return { ...candidate, status: entry ? "included" : ignored.has(candidate.id) ? "ignored" : "review", entry: entry ?? null };
  }));
}

export const statuses = ["review", "included", "ignored"];

const baseOf = (configFile) => path.dirname(path.resolve(configFile));

// The last scan with today's decisions applied. Reads the cache only, so it is instant; null when never scanned.
export async function reviewList(configFile, { env = process.env } = {}) {
  const [config, cache] = await Promise.all([loadPortfolio(configFile), readCache(configFile, env)]);
  if (!cache) return null;
  return { ...cache, candidates: await classify(cache.candidates, config, baseOf(configFile), env) };
}

// Scans the portfolio's roots and GitHub, keeps the result in the cache, and returns it with today's decisions applied.
export async function discover(configFile, { env = process.env, ...options } = {}) {
  const config = await loadPortfolio(configFile);
  if (!config.roots?.length) throw new Error(`${configFile} has no roots to scan. Set them with showcase discover --root <folder>.`);
  const result = await scan(config.roots, { base: baseOf(configFile), env, ...options });
  await writeCache(configFile, result, env);
  return { ...result, candidates: await classify(result.candidates, config, baseOf(configFile), env) };
}

// Where projects usually live, for the question "which folders should I scan?": $SRC, else the first common name that exists.
export function suggestRoots(env = process.env) {
  if (env.SRC && existsSync(env.SRC)) return ["$SRC"];
  for (const name of ["src", "code", "projects", "Projects", "dev", "repos"]) {
    if (existsSync(path.join(os.homedir(), name))) return [`~/${name}`];
  }
  return ["~"];
}
