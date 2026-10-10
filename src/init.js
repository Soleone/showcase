import { writeFile } from "node:fs/promises";
import path from "node:path";
import { firstCommitYear, loadProject, localPath, manifestName } from "./project.js";
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

// Drafts a manifest from what the project already says about itself.
export async function draftManifest(root) {
  const project = await loadProject(root);
  const pitch = project.readme?.lead ?? project.pkg?.description ?? "";
  const hero = project.readme?.media.find((item) => item.line < project.readme.firstSectionLine);
  const heroPath = hero && localPath(project, hero.src, path.dirname(project.readme.file));
  const manifest = {
    $schema: schema.$id,
    title: title(project),
    pitch: shortPitch(pitch),
    kind: project.kind,
    year: await firstCommitYear(project.root) ?? undefined,
    repo: project.remote?.url,
    media: hero ? { hero: heroPath ? path.relative(project.root, heroPath).split(path.sep).join("/") : hero.src } : undefined,
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
