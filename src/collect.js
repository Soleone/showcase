import { copyFile, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluate, tiers } from "./checks.js";
import { draftManifest } from "./init.js";
import { exists, localPath } from "./project.js";
import { portfolioSchema, validate } from "./schema.js";

export const priorityTargets = { high: "S", mid: "A", low: "C" };

export async function loadPortfolio(file) {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
  const errors = validate(data, portfolioSchema);
  const ids = (Array.isArray(data?.projects) ? data.projects : []).map((project) => project?.id);
  for (const id of new Set(ids.filter((id, index) => id && ids.indexOf(id) !== index))) errors.push(`projects: duplicate id ${id}`);
  if (errors.length) throw new Error(`${file} is invalid:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  return data;
}

// Expands ~ and $VAR / ${VAR}; relative paths resolve from the config's folder.
export function resolvePath(raw, base, env = process.env) {
  const missing = [];
  const expanded = raw
    .replace(/^~(?=$|\/)/, os.homedir())
    .replace(/\$(?:\{(\w+)\}|(\w+))/g, (_, braced, bare) => {
      const name = braced ?? bare;
      if (env[name] === undefined) missing.push(name);
      return env[name] ?? "";
    });
  if (missing.length) throw new Error(`${missing.map((name) => `$${name}`).join(", ")} not set`);
  return path.resolve(base, expanded);
}

// Entries that point at a folder another entry already covers, as {ignored id: kept id}. When one is reached
// through a symlink (a project that moved and left a link behind) the real location is kept; otherwise the first.
export async function findAliases(projects, base, env = process.env) {
  const groups = new Map();
  for (const entry of projects) {
    if (!entry.path) continue;
    try {
      const dir = resolvePath(entry.path, base, env);
      const real = await realpath(dir);
      groups.set(real, [...(groups.get(real) ?? []), { entry, linked: real !== dir }]);
    } catch { /* a missing folder is reported where it is used */ }
  }
  const aliases = {};
  for (const group of groups.values()) {
    const kept = group.find((member) => !member.linked) ?? group[0];
    for (const member of group) if (member !== kept) aliases[member.entry.id] = kept.entry.id;
  }
  return aliases;
}

export function targetTier(priority, ceiling) {
  const target = priorityTargets[priority];
  if (!target) return null;
  return ceiling && tiers.indexOf(ceiling) < tiers.indexOf(target) ? ceiling : target;
}

// The required checks still failing at or below the target tier.
export function gapTo(report, target) {
  if (!target) return [];
  return report.checks
    .filter((check) => check.required && check.status !== "pass" && tiers.indexOf(check.tier) <= tiers.indexOf(target))
    .map((check) => check.id);
}

// Only letters, digits, _ and -, so a slug can never climb out of media/.
const slugOf = (id) => id.replace(/^[a-z]+:/i, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "project";

// Copies local media into <out>/media/<slug>/ and points the manifest at the copies. Remote URLs stay as they are.
async function copyMedia(project, media, out, slug, warn) {
  if (!media) return undefined;
  const folder = path.join(out, "media", slug);
  await rm(folder, { recursive: true, force: true });
  const entries = [["hero", media.hero], ["motion", media.motion], ["video", media.video], ...(media.screenshots ?? []).map((src, index) => [`screenshot-${index + 1}`, src])];
  const copied = {};
  for (const [name, src] of entries) {
    if (typeof src !== "string") continue;
    const file = localPath(project, src);
    if (!file || !(await exists(file))) {
      if (/^https?:/i.test(src)) copied[name] = src;
      else warn(`media not found: ${src}`);
      continue;
    }
    const target = `${name}${path.extname(file).toLowerCase()}`;
    await mkdir(folder, { recursive: true });
    await copyFile(file, path.join(folder, target));
    copied[name] = `media/${slug}/${target}`;
  }
  const screenshots = Object.keys(copied).filter((key) => key.startsWith("screenshot-")).map((key) => copied[key]);
  const result = { hero: copied.hero, motion: copied.motion, video: copied.video, screenshots: screenshots.length ? screenshots : undefined, capture: media.capture };
  return Object.values(result).some(Boolean) ? result : undefined;
}

async function collectOne(entry, base, out, options) {
  const warnings = [];
  const warn = (message) => warnings.push(`${entry.id}: ${message}`);
  const listing = { id: entry.id, priority: entry.priority ?? null };
  const slug = slugOf(entry.id);
  let root;
  try {
    root = entry.path ? resolvePath(entry.path, base, options.env) : null;
  } catch (error) {
    warn(error.message);
  }
  if (!root || !(await exists(root))) {
    if (root) warn(`${root} not found`);
    else if (!entry.path) warn("no local path, listed without a grade");
    return { warnings, entry: { ...listing, title: entry.title ?? slug, repo: entry.repo ?? undefined, tier: null, target: priorityTargets[listing.priority] ?? null, gap: [], source: null } };
  }

  const { project, manifest: draft } = await draftManifest(root);
  const declared = project.manifest?.errors.length === 0 ? project.manifest.data : null;
  if (project.manifest && !declared) warn("showcase.json is invalid, using a draft from the README");
  const { $schema, ceiling, media, ...facts } = declared ?? draft;
  const report = await evaluate(project, options);
  const target = targetTier(listing.priority, ceiling);
  return {
    warnings,
    report: { ...report, target },
    entry: {
      ...listing,
      ...facts,
      repo: facts.repo ?? entry.repo ?? undefined,
      media: await copyMedia(project, media, out, slug, warn),
      tier: report.tier,
      target,
      gap: gapTo(report, target),
      source: declared ? "showcase.json" : "draft",
    },
  };
}

// Reads a portfolio config, grades every project and writes <out>/feed.json plus copies of the local media.
export async function collect(configFile, { out, ...options }) {
  options = { fetch: globalThis.fetch, ...options };
  const config = await loadPortfolio(configFile);
  const base = path.dirname(path.resolve(configFile));
  const aliases = await findAliases(config.projects, base, options.env);
  const results = await Promise.all(config.projects.filter((entry) => !aliases[entry.id]).map((entry) => collectOne(entry, base, out, options)));
  const feed = { projects: results.map((result) => JSON.parse(JSON.stringify(result.entry))) };
  await mkdir(out, { recursive: true });
  const file = path.join(out, "feed.json");
  await writeFile(file, `${JSON.stringify(feed, null, 2)}\n`);
  return { file, feed, reports: results.map((result) => result.report).filter(Boolean), warnings: [...Object.entries(aliases).map(([id, kept]) => `${id}: same folder as ${kept}, left out`), ...results.flatMap((result) => result.warnings)] };
}
