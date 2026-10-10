import { writeFile } from "node:fs/promises";
import path from "node:path";
import { firstCommitYear, loadProject, localPath, manifestName, mediaType } from "./project.js";
import { schema, validate } from "./schema.js";

function shortPitch(text) {
  if (text.length <= 160) return text;
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
  return sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}...` : sentence;
}

function title(project) {
  const raw = project.readme?.title ?? project.pkg?.name ?? project.name;
  const cleaned = raw.replace(/^@[^/]+\//, "").replace(/\s*\([^)]*\)\s*$/, "").split(/\s*[:|–—-]\s+/)[0].trim();
  return (cleaned || project.name).slice(0, 60);
}

function manifestPath(project, reference, base) {
  const file = localPath(project, reference, base);
  return file ? path.relative(project.root, file).split(path.sep).join("/") : reference;
}

// Sorts what the README shows or links to: the first loop is motion, the first video is video, and the first still above the first section is the hero.
async function draftMedia(project) {
  const { readme } = project;
  if (!readme) return {};
  const base = path.dirname(readme.file);
  const references = [...readme.media, ...readme.links.map((link) => ({ src: link.href, line: link.line, linked: true }))]
    .sort((a, b) => a.line - b.line);
  const media = {};
  for (const { src, line, tag, linked } of references) {
    const type = tag === "video" || tag === "source" ? "video" : await mediaType(project, src, base);
    if (linked && !type) continue;
    if (type === "video") media.video ??= manifestPath(project, src, base);
    else if (type === "motion") media.motion ??= manifestPath(project, src, base);
    else if (line < readme.firstSectionLine) media.hero ??= manifestPath(project, src, base);
  }
  return { hero: media.hero, motion: media.motion, video: media.video };
}

const captureScripts = ["capture", "demo:capture", "media:capture"];
const runners = ["npm", "pnpm", "yarn", "bun"];

function draftScripts(pkg) {
  const scripts = pkg?.scripts ?? {};
  const name = pkg?.packageManager?.split("@")[0];
  const run = (script) => `${runners.includes(name) ? name : "npm"} run ${script}`;
  const capture = captureScripts.find((script) => scripts[script]);
  return { local: scripts.demo ? run("demo") : undefined, capture: capture ? run(capture) : undefined };
}

// Drafts a manifest from what the project already says about itself.
export async function draftManifest(root) {
  const project = await loadProject(root);
  const pitch = project.readme?.lead ?? project.pkg?.description ?? "";
  const media = await draftMedia(project);
  const { local, capture } = draftScripts(project.pkg);
  const manifest = {
    $schema: schema.$id,
    title: title(project),
    pitch: shortPitch(pitch),
    kind: project.kind,
    year: await firstCommitYear(project.root) ?? undefined,
    repo: project.remote?.url,
    media: Object.values(media).some(Boolean) || capture ? { ...media, capture } : undefined,
    demo: local ? { local } : undefined,
  };
  return { project, manifest: JSON.parse(JSON.stringify(manifest)) };
}

export async function init(root, { force = false, dryRun = false } = {}) {
  const { project, manifest } = await draftManifest(root);
  const file = path.join(project.root, manifestName);
  if (project.manifest && !force && !dryRun) throw new Error(`${file} already exists. Use --force to overwrite it.`);
  if (!dryRun) await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return { file, manifest, errors: validate(manifest) };
}
