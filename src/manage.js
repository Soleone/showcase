import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { evaluate, tiers } from "./checks.js";
import { findAliases, gapTo, loadPortfolio, resolvePath, targetTier } from "./collect.js";
import { exists, loadProject, manifestName } from "./project.js";
import { portfolioSchema, schema, validate } from "./schema.js";

const portfolioItem = portfolioSchema.properties.projects.items;
const textual = (node) => [node.type ?? []].flat().some((type) => type === "string" || type === "integer") || node.enum || (node.type === "array" && node.items?.type === "string");

// What can be edited, derived from the schemas so a new field shows up without touching the UI.
function fieldsOf(node, { skip = [] } = {}) {
  return Object.entries(node.properties)
    .filter(([key, child]) => !skip.includes(key) && key !== "$schema" && textual(child))
    .map(([key, child]) => ({
      key,
      node: child,
      required: (node.required ?? []).includes(key),
      nullable: [child.type ?? []].flat().includes("null"),
    }));
}

export const portfolioFields = fieldsOf(portfolioItem, { skip: ["id"] });
export const manifestFields = fieldsOf(schema);

// The values an enum field cycles through. An optional field also cycles through "unset".
export function options(field) {
  if (!field.node.enum) return null;
  return field.required || field.node.enum.includes(null) ? field.node.enum : [...field.node.enum, undefined];
}

export const isList = (field) => field.node.type === "array";

// The text the editor starts from.
export function toText(field, value) {
  if (value === undefined || value === null) return "";
  return isList(field) ? value.join(", ") : String(value);
}

// Turns what was typed into a value. Empty clears the field; the schema decides whether that is allowed.
export function fromText(field, text) {
  const trimmed = text.trim();
  if (!trimmed) return field.nullable ? null : undefined;
  if (isList(field)) return trimmed.split(/\s*,\s*/).filter(Boolean);
  if (field.node.type === "integer") return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
  return trimmed;
}

const skipSpace = (source, at) => { while (/\s/.test(source[at] ?? "")) at += 1; return at; };

// Where the value that starts at `at` ends.
function valueEnd(source, at) {
  if (source[at] === '"') {
    let end = at + 1;
    while (source[end] !== '"') end += source[end] === "\\" ? 2 : 1;
    return end + 1;
  }
  if (source[at] === "{" || source[at] === "[") {
    let depth = 0;
    for (let end = at; end < source.length; end += 1) {
      if (source[end] === '"') end = valueEnd(source, end) - 1;
      else if ("{[".includes(source[end])) depth += 1;
      else if ("}]".includes(source[end]) && --depth === 0) return end + 1;
    }
  }
  const match = /^[^\s,\]}]+/.exec(source.slice(at));
  return at + (match?.[0].length ?? 0);
}

// The [start, end) of the value at a path of keys and indexes in JSON text, or null.
export function locate(source, steps) {
  let start = skipSpace(source, 0);
  let end = valueEnd(source, start);
  for (const step of steps) {
    const object = source[start] === "{";
    let at = skipSpace(source, start + 1);
    let found = null;
    for (let index = 0; at < end - 1 && !found; index += 1) {
      let key = index;
      if (object) {
        const keyEnd = valueEnd(source, at);
        key = JSON.parse(source.slice(at, keyEnd));
        at = skipSpace(source, source.indexOf(":", keyEnd) + 1);
      }
      const stop = valueEnd(source, at);
      if (key === step) found = [at, stop];
      at = skipSpace(source, stop);
      if (source[at] === ",") at = skipSpace(source, at + 1);
    }
    if (!found) return null;
    [start, end] = found;
  }
  return [start, end];
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

const writeJson = (file, data) => writeFile(file, `${JSON.stringify(data, null, 2)}\n`);

// Replaces one existing value in place so the rest of the file keeps its formatting and the diff stays one line.
// Adding or removing a key rewrites the whole file instead.
async function save(file, candidate, steps, value) {
  const source = await readFile(file, "utf8");
  const span = value === undefined ? null : locate(source, steps);
  if (span) {
    const patched = source.slice(0, span[0]) + JSON.stringify(value) + source.slice(span[1]);
    let parsed;
    try { parsed = JSON.parse(patched); } catch { /* fall through to a rewrite */ }
    if (isDeepStrictEqual(parsed, candidate)) return writeFile(file, patched);
  }
  return writeJson(file, candidate);
}

const errorsFor = (errors, key) => errors.filter((error) => error.startsWith(`${key}:`) || error.startsWith(`${key}.`) || error.startsWith(`${key}[`));

// Keeps the schema's field order when a key is added; keys the schema does not know (x-...) stay after it.
function ordered(data) {
  const known = Object.keys(schema.properties);
  const rank = (key) => known.includes(key) ? known.indexOf(key) : known.length;
  return Object.fromEntries(Object.entries(data).sort(([a], [b]) => rank(a) - rank(b)));
}

function assign(data, key, value, order) {
  const next = { ...data };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return order && !(key in data) ? order(next) : next;
}

// Each edit re-reads the file, changes one field and writes it back, so edits made elsewhere in the meantime survive.
export async function setPortfolioField(configFile, id, field, value) {
  const config = await readJson(configFile);
  const index = config.projects.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`${id} is no longer in ${configFile}`);
  const candidate = { ...config, projects: config.projects.map((entry, i) => i === index ? assign(entry, field.key, value) : entry) };
  const errors = errorsFor(validate(candidate, portfolioSchema), `projects[${index}].${field.key}`).map((error) => error.replace(/^projects\[\d+\]\./, ""));
  if (errors.length) return { errors };
  await save(configFile, candidate, ["projects", index, field.key], value);
  return { errors: [] };
}

export async function setManifestField(root, field, value) {
  const file = path.join(root, manifestName);
  const data = await readJson(file);
  const candidate = assign(data, field.key, value, ordered);
  const errors = errorsFor(validate(candidate), field.key);
  if (errors.length) return { errors };
  await save(file, candidate, [field.key], value);
  return { errors: [] };
}

// Moves a project to the place another one holds in portfolio order. Returns false when either is unknown.
export async function moveProjectTo(configFile, id, otherId) {
  const config = await readJson(configFile);
  const from = config.projects.findIndex((entry) => entry.id === id);
  const to = config.projects.findIndex((entry) => entry.id === otherId);
  if (from < 0 || to < 0) return false;
  if (from !== to) {
    config.projects.splice(to, 0, config.projects.splice(from, 1)[0]);
    await writeJson(configFile, config);
  }
  return true;
}

// Finds one project of the portfolio on disk. Quick: no network, no grading.
export async function openRow(entry, base, env = process.env) {
  const row = { id: entry.id, entry, root: null, project: null, report: null, target: null, gap: [], note: null };
  try {
    row.root = entry.path ? resolvePath(entry.path, base, env) : null;
  } catch (error) {
    row.note = error.message;
  }
  if (!row.root) return { ...row, note: row.note ?? "no local path, so nothing to grade" };
  if (!(await exists(row.root))) return { ...row, note: `${row.root} not found` };
  row.project = await loadProject(row.root);
  const data = row.project.manifest?.errors.length === 0 ? row.project.manifest.data : null;
  row.target = targetTier(entry.priority, data?.ceiling);
  return row;
}

// Grades an opened row. This is the slow part when the live URL is checked.
export async function gradeRow(row, options = {}) {
  if (!row.project) return row;
  const report = await evaluate(row.project, { offline: options.offline, fetch: options.fetch ?? globalThis.fetch });
  return { ...row, report, gap: gapTo(report, row.target) };
}

// The portfolio's entries, minus any that only repeat another's folder (see findAliases), which come back as ignored.
export async function loadEntries(configFile, env = process.env) {
  const config = await loadPortfolio(configFile);
  const base = path.dirname(path.resolve(configFile));
  const ignored = await findAliases(config.projects, base, env);
  return { base, entries: config.projects.filter((entry) => !ignored[entry.id]), ignored };
}

// The ways the list can be ordered. "order" is portfolio.json itself, the only one J/K can change.
export const sorts = {
  priority: "priority, then tier",
  tier: "tier, best first",
  gap: "gap to target, biggest first",
  order: "portfolio.json order",
};

// Sorts rows for display without touching the portfolio. Ties keep portfolio order; ungraded rows come last.
export function sortRows(rows, mode, order = rows.map((row) => row.id)) {
  const position = (row) => { const at = order.indexOf(row.id); return at < 0 ? order.length : at; };
  const priority = (row) => ["high", "mid", "low"].indexOf(row.entry.priority) < 0 ? 3 : ["high", "mid", "low"].indexOf(row.entry.priority);
  const tier = (row) => row.report ? tiers.indexOf(row.report.tier) : -1;
  const gap = (row) => row.report && row.target ? tiers.indexOf(row.target) - tiers.indexOf(row.report.tier) : -1;
  const keys = { priority: [priority, (row) => -tier(row)], tier: [(row) => -tier(row), priority], gap: [(row) => -gap(row), (row) => -tier(row)], order: [] }[mode] ?? [];
  return [...rows].sort((a, b) => {
    for (const key of keys) if (key(a) !== key(b)) return key(a) - key(b);
    return position(a) - position(b);
  });
}

// How far along a project is, as its showcase.json says.
export const stageOf = (row) => row.project?.manifest?.data?.stage;

// The title shown for a project: showcase.json first, then the portfolio entry, then its id.
export function titleOf(row) {
  const data = row.project?.manifest?.data;
  return data?.title ?? row.entry.title ?? row.id.replace(/^[a-z]+:/i, "");
}

export const configName = "portfolio.json";

// Another project's portfolio.json (a data file of a site, say) is not ours unless it has this shape.
async function isPortfolio(file) {
  try {
    return validate(JSON.parse(await readFile(file, "utf8")), portfolioSchema).length === 0;
  } catch {
    return false;
  }
}

const userDir = (env) => path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "showcase");
// Where the portfolio lives when nobody says: $SHOWCASE_CONFIG, the nearest portfolio.json from here upwards,
// then the user-level one.
export async function findConfig({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.SHOWCASE_CONFIG) {
    const file = path.resolve(cwd, env.SHOWCASE_CONFIG);
    return { file, exists: await exists(file) };
  }
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (await isPortfolio(path.join(dir, configName))) return { file: path.join(dir, configName), exists: true };
    if (path.dirname(dir) === dir) break;
  }
  const file = path.join(userDir(env), configName);
  return { file, exists: await exists(file) };
}

const projectMarkers = ["showcase.json", "package.json", ".git", "README.md", "readme.md", "Cargo.toml", "go.mod"];
const isDirectory = async (dir) => (await stat(dir).catch(() => null))?.isDirectory() ?? false;

async function looksLikeProject(dir) {
  for (const marker of projectMarkers) if (await exists(path.join(dir, marker))) return true;
  return false;
}

// The project in this folder, or else the projects directly inside it.
export async function discoverProjects(dir) {
  dir = path.resolve(dir);
  if (["showcase.json", "package.json", ".git"].some((marker) => existsSync(path.join(dir, marker)))) return [dir];
  const found = [];
  for (const child of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!child.isDirectory() || child.name.startsWith(".") || child.name === "node_modules") continue;
    if (await looksLikeProject(path.join(dir, child.name))) found.push(path.join(dir, child.name));
  }
  return found.sort().slice(0, 100);
}

// How a project folder is written in the config: relative inside the config's folder, else ~/..., else absolute.
export function storedPath(dir, configFile) {
  const base = path.dirname(path.resolve(configFile));
  const inside = (parent) => dir === parent || dir.startsWith(`${parent}${path.sep}`);
  if (inside(base)) return path.relative(base, dir) || ".";
  if (inside(os.homedir())) return `~/${path.relative(os.homedir(), dir).split(path.sep).join("/")}`;
  return dir;
}

const entryFor = (dir, configFile, id) => ({ id, priority: null, path: storedPath(dir, configFile) });

// The config entry that points at this folder, if any. A symlink to the folder counts as the folder.
async function entryAt(config, configFile, dir, env) {
  const base = path.dirname(path.resolve(configFile));
  const real = await realpath(dir).catch(() => dir);
  for (const entry of config.projects) {
    try {
      if (entry.path && await realpath(resolvePath(entry.path, base, env)).catch(() => resolvePath(entry.path, base, env)) === real) return entry;
    } catch { /* an unset $VAR cannot match */ }
  }
  return undefined;
}

// The project the user is standing in: this folder or the nearest one above it with a project marker, never the home folder or above.
export function projectRootOf(cwd, home = os.homedir()) {
  for (let dir = path.resolve(cwd); dir !== home && path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    if (["showcase.json", "package.json", ".git"].some((marker) => existsSync(path.join(dir, marker)))) return dir;
  }
  return null;
}

// The project to offer adding: where the user started, unless it is already registered or the portfolio lives inside it.
export async function unregisteredHere(configFile, { cwd = process.cwd(), env = process.env } = {}) {
  const dir = projectRootOf(cwd);
  if (!dir) return null;
  const base = path.dirname(path.resolve(configFile));
  if (base === dir || base.startsWith(`${dir}${path.sep}`)) return null;
  return (await entryAt(await readJson(configFile), configFile, dir, env)) ? null : dir;
}

// Adds a project folder to the config, unless it is already there.
export async function addProject(configFile, input, { cwd = process.cwd(), env = process.env, id: wanted, priority = null, repo } = {}) {
  if (!input.trim() && repo) return addRemote(configFile, { id: wanted, priority, repo });
  if (!input.trim()) return { error: "Type the path to a project folder" };
  let dir;
  try {
    dir = resolvePath(input.trim(), cwd, env);
  } catch (error) {
    return { error: error.message };
  }
  if (!(await isDirectory(dir))) return { error: `${dir} is not a folder` };
  const config = await readJson(configFile);
  const known = await entryAt(config, configFile, dir, env);
  if (known) return { error: `${known.id} already points there` };
  const name = path.basename(dir).toLowerCase();
  let id = wanted ?? `local:${name}`;
  if (wanted && config.projects.some((entry) => entry.id === wanted)) return { error: `${wanted} is already in the portfolio` };
  for (let n = 2; !wanted && config.projects.some((entry) => entry.id === id); n += 1) id = `local:${name}-${n}`;
  const entry = entryFor(dir, configFile, id);
  // A path typed with ~ or $VAR stays that way, so the config does not hard-code this machine's folders.
  if (/^[~$]/.test(input.trim())) entry.path = input.trim();
  entry.priority = priority;
  const errors = validate({ projects: [entry] }, portfolioSchema);
  if (errors.length) return { error: errors.map((error) => error.replace(/^projects\[0\]\./, "")).join("; ") };
  config.projects.push(entry);
  await writeJson(configFile, config);
  return { id };
}

// A project with no local checkout, listed by its repo (graded as "no local path", shown by the portfolio).
async function addRemote(configFile, { id, priority, repo }) {
  if (!id) return { error: "A project without a folder needs an --id" };
  const config = await readJson(configFile);
  if (config.projects.some((entry) => entry.id === id)) return { error: `${id} is already in the portfolio` };
  const known = config.projects.find((entry) => entry.repo === repo);
  if (known) return { error: `${known.id} already points there` };
  const entry = { id, priority, path: null, repo };
  const errors = validate({ projects: [entry] }, portfolioSchema);
  if (errors.length) return { error: errors.map((error) => error.replace(/^projects\[0\]\./, "")).join("; ") };
  config.projects.push(entry);
  await writeJson(configFile, config);
  return { id };
}

// Takes a project out of the portfolio. The project's own files are not touched.
export async function removeProject(configFile, id) {
  const config = await readJson(configFile);
  config.projects = config.projects.filter((entry) => entry.id !== id);
  await writeJson(configFile, config);
}

// A starter config from whatever is in this folder. An empty portfolio is valid too.
export async function createConfig(configFile, cwd = process.cwd()) {
  const projects = (await discoverProjects(cwd)).map((dir) => entryFor(dir, configFile, `local:${path.basename(dir).toLowerCase()}`));
  const seen = new Set();
  await mkdir(path.dirname(configFile), { recursive: true });
  await writeJson(configFile, { projects: projects.filter((entry) => !seen.has(entry.id) && seen.add(entry.id)) });
  return seen.size;
}
