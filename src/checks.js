import path from "node:path";
import { exists, localPath, mediaType } from "./project.js";

export const tiers = ["D", "C", "B", "A", "S"];

const usageHeading = /install|usage|quick ?start|getting started|setup|how to (use|run)|try it|running/i;
const maxReadmeWords = 1200;

const motionHints = {
  cli: "Record a terminal loop (e.g. a VHS .tape exported to WebP or MP4) and show it in the README.",
  "web-app": "Record the main flow (e.g. Playwright video converted with ffmpeg to a looping WebP) and show it in the README.",
  "local-web-app": "Record the main flow as a short looping WebP (plus an MP4 if sound matters) and show it in the README.",
  "desktop-app": "Record the main flow as a short looping WebP and show it in the README.",
  "browser-extension": "Record a short before/after clip of the extension in action and show it in the README.",
  "agent-extension": "Record a real session as a short looping WebP and show it in the README.",
  theme: "Record the theme in use (wallpapers, views, light and dark) as a short looping WebP and show it in the README.",
};

const liveHints = {
  "web-app": "Deploy a demo with seeded sample data and no login wall, then set live in showcase.json.",
  "local-web-app": "Host the web UI against a recorded or simulated local backend (a replay), then set live in showcase.json.",
  cli: "Host an in-browser terminal with sample files to play with, then set live in showcase.json.",
  "browser-extension": "Publish to the Chrome Web Store (or Firefox Add-ons) and set live to the listing.",
  "agent-extension": "Host a replay of a real recorded session, then set live in showcase.json.",
  library: "Host a small playground, then set live in showcase.json.",
  "desktop-app": "Ship a web build with sample data or a download page, then set live in showcase.json.",
  game: "Host a playable web build, then set live in showcase.json.",
  theme: "Host a preview page drawn in the theme's own colors and assets, then set live in showcase.json.",
};

function manifestData(project) {
  return project.manifest?.errors.length === 0 ? project.manifest.data : null;
}

function mediaReferences(project) {
  const base = project.readme ? path.dirname(project.readme.file) : project.root;
  const fromReadme = (project.readme?.media ?? []).map((item) => ({ ...item, base }));
  const media = project.manifest?.data?.media ?? {};
  const fromManifest = [media.hero, media.motion, media.video, ...(media.screenshots ?? [])]
    .filter((src) => typeof src === "string")
    .map((src) => ({ src, base: project.root, manifest: true }));
  return [...fromReadme, ...fromManifest];
}

const brandKeys = ["icon", "logo", "wordmark"];
const needsIcon = ["web-app", "local-web-app", "browser-extension", "desktop-app"];

function brandReferences(project) {
  const brand = project.manifest?.data?.brand ?? {};
  return brandKeys.filter((key) => typeof brand[key] === "string").map((key) => ({ src: brand[key], base: project.root }));
}

async function missingFiles(project, references) {
  const missing = [];
  for (const { src, base } of references) {
    const file = localPath(project, src, base);
    if (file && !(await exists(file))) missing.push(src);
  }
  return missing;
}

async function isMotion(project, { src, base, tag }) {
  if (tag === "video" || tag === "source") return true;
  const type = await mediaType(project, src, base);
  return type === "unverified" ? type : type === "motion" || type === "video";
}

const pass = (detail) => ({ status: "pass", detail });
const fail = (detail) => ({ status: "fail", detail });
const noReadme = fail("no README");

export const checks = [
  {
    id: "readme",
    guide: "pitch",
    tier: "C",
    label: "README present",
    run: (project) => project.readme ? pass(path.relative(project.root, project.readme.file)) : fail("no README found"),
    hint: () => "Add a README.md with a one-line pitch, a hero image and a quick start.",
  },
  {
    id: "readme.substance",
    guide: "pitch",
    tier: "C",
    label: "README explains the project",
    run: ({ readme }) => !readme ? noReadme : readme.words >= 80 ? pass(`${readme.words} words`) : fail(`${readme.words} words, needs at least 80`),
    hint: () => "Say what it is, why it exists and how to run it.",
  },
  {
    id: "readme.usage",
    guide: "pitch",
    tier: "C",
    label: "README shows how to run it",
    run: ({ readme }) => {
      if (!readme) return noReadme;
      const heading = readme.headings.find((item) => usageHeading.test(item.text));
      if (heading) return pass(`"${heading.text}" section`);
      return readme.codeBlocks ? pass(`${readme.codeBlocks} code block${readme.codeBlocks === 1 ? "" : "s"}`) : fail("no usage section or code block");
    },
    hint: () => "Add a Quick start section with the commands to install and run it.",
  },
  {
    id: "readme.pitch",
    guide: "pitch",
    tier: "B",
    label: "Pitch right under the title",
    run: ({ readme }) => {
      if (!readme) return noReadme;
      if (!readme.title) return fail("no H1 title");
      if (!readme.lead) return fail("no paragraph after the title");
      const words = readme.lead.split(/\s+/).length;
      if (words < 8) return fail(`lead is ${words} words, too thin to sell it`);
      if (words > 60) return fail(`lead is ${words} words, aim for 60 or fewer`);
      return pass(`"${readme.lead.length > 70 ? `${readme.lead.slice(0, 67)}...` : readme.lead}"`);
    },
    hint: () => "Open with an H1 and one or two sentences (8-60 words) that make someone want to try it.",
  },
  {
    id: "readme.hero",
    guide: "pitch",
    tier: "B",
    label: "Hero visual before the first section",
    run: ({ readme }) => {
      if (!readme) return noReadme;
      const hero = readme.media.find((item) => item.line < readme.firstSectionLine);
      if (hero) return pass(hero.src.length > 60 ? `${hero.src.slice(0, 57)}...` : hero.src);
      return readme.media.length ? fail("visuals exist but sit below the first section") : fail("no images or video");
    },
    hint: () => "Put a screenshot or looping WebP right after the pitch, above the first ## heading.",
  },
  {
    id: "readme.concise",
    guide: "pitch",
    tier: "B",
    label: `README is concise (at most ${maxReadmeWords} words of prose)`,
    run: ({ readme }) => !readme ? noReadme : readme.words <= maxReadmeWords ? pass(`${readme.words} words`) : fail(`${readme.words} words`),
    hint: () => `Cut the README to ${maxReadmeWords} words or fewer and move the detail into docs/.`,
  },
  {
    id: "readme.links",
    guide: "pitch",
    tier: "B",
    label: "Local links and images resolve",
    run: async (project) => {
      if (!project.readme) return noReadme;
      const base = path.dirname(project.readme.file);
      const references = [...project.readme.links.map((link) => ({ src: link.href, base })), ...project.readme.media.map((item) => ({ src: item.src, base }))];
      const missing = await missingFiles(project, references);
      return missing.length ? fail(`broken: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}`) : pass(`${references.length} checked`);
    },
    hint: () => "Fix or remove the broken links.",
  },
  {
    id: "manifest",
    guide: "manifest",
    tier: "A",
    label: "showcase.json is valid",
    run: async (project) => {
      const { manifest } = project;
      if (!manifest) return fail("no showcase.json");
      if (manifest.errors.length) return fail(manifest.errors.slice(0, 3).join("; "));
      const missingMedia = await missingFiles(project, mediaReferences(project).filter((item) => item.manifest));
      const missingBrand = await missingFiles(project, brandReferences(project));
      if (missingMedia.length) return fail(`media not found: ${missingMedia.join(", ")}`);
      return missingBrand.length ? fail(`brand not found: ${missingBrand.join(", ")}`) : pass(`${manifest.data.kind}: "${manifest.data.title}"`);
    },
    hint: (project) => project.manifest ? "Fix the errors in showcase.json." : "Run `showcase init` to create showcase.json.",
  },
  {
    id: "brand.icon",
    guide: "brand",
    tier: "A",
    required: false,
    label: "Icon for the favicon and cards",
    run: (project) => {
      const icon = manifestData(project)?.brand?.icon;
      if (icon) return pass(icon);
      return needsIcon.includes(project.kind) ? fail("brand.icon not set in showcase.json") : pass(`not needed for a ${project.kind}`);
    },
    hint: () => "Add a square icon (SVG if you can) and set brand.icon in showcase.json. It becomes the favicon.",
  },
  {
    id: "media.motion",
    guide: "media",
    tier: "A",
    label: "Motion: looping WebP, GIF or video",
    run: async (project) => {
      let unverified = null;
      for (const reference of mediaReferences(project)) {
        const motion = await isMotion(project, reference);
        if (motion === true) return pass(path.basename(reference.src.split(/[?#]/)[0]));
        if (motion === "unverified") unverified ??= reference.src;
      }
      return unverified ? pass(`${path.basename(unverified)} (remote WebP, assumed animated)`) : fail("only still images");
    },
    hint: (project) => motionHints[project.kind] ?? "Record a short looping WebP or video of it in action and show it in the README.",
  },
  {
    id: "demo.local",
    guide: "demo",
    tier: "A",
    label: "One-command local demo",
    run: (project) => {
      const local = manifestData(project)?.demo?.local;
      return local ? pass(local) : fail("demo.local not set in showcase.json");
    },
    hint: () => "Add a single command that runs it with sample data, and set it as demo.local in showcase.json.",
  },
  {
    id: "demo.externals",
    guide: "manifest",
    tier: "A",
    required: false,
    label: "Externals have stand-ins",
    run: (project) => {
      const externals = manifestData(project)?.demo?.externals;
      if (!externals) return fail("demo.externals not set");
      if (!externals.length) return pass("none");
      return pass(externals.map((external) => `${external.name}: ${external.standIn}`).join(", "));
    },
    hint: () => "List what a demo cannot reach (models, accounts, hardware, services) in demo.externals, each with its seam and stand-in, or set it to [] if there is nothing.",
  },
  {
    id: "media.capture",
    guide: "media",
    tier: "A",
    required: false,
    label: "Media can be regenerated",
    run: (project) => {
      const capture = manifestData(project)?.media?.capture;
      return capture ? pass(capture) : fail("media.capture not set");
    },
    hint: () => "Script the screenshots and recordings, and set media.capture so they never go stale.",
  },
  {
    id: "live",
    guide: (project) => project.kind === "cli" ? "terminal" : "demo",
    tier: "S",
    label: "Live: one click to try it for real",
    run: async (project, options) => {
      const live = manifestData(project)?.live;
      if (!live) return fail("live not set in showcase.json");
      if (options.offline) return { status: "skip", detail: `${live} (not verified offline)` };
      try {
        const response = await options.fetch(live, { redirect: "follow", signal: AbortSignal.timeout(options.timeoutMs ?? 8000) });
        return response.ok ? pass(live) : fail(`${live} returned ${response.status}`);
      } catch (error) {
        return fail(`${live} unreachable: ${error.cause?.code ?? error.message}`);
      }
    },
    hint: (project, result) => manifestData(project)?.live
      ? (result.status === "skip" ? "Run without --offline to verify the live URL." : "Get the live URL responding again.")
      : liveHints[project.kind] ?? "Host something people can try in one click, then set live in showcase.json.",
  },
];

export async function evaluate(project, options = {}) {
  options = { fetch: globalThis.fetch, ...options };
  const results = [];
  for (const check of checks) {
    const result = await check.run(project, options);
    const failing = result.status !== "pass";
    const guide = typeof check.guide === "function" ? check.guide(project) : check.guide;
    results.push({ id: check.id, tier: check.tier, label: check.label, required: check.required !== false, ...result, hint: failing ? check.hint(project, result) : null, guide: failing ? guide : null });
  }

  let tier = "D";
  for (const candidate of tiers.slice(1)) {
    const blocked = results.some((result) => result.required && result.tier === candidate && result.status !== "pass");
    if (blocked) break;
    tier = candidate;
  }

  const ceiling = manifestData(project)?.ceiling ?? null;
  const atCeiling = ceiling !== null && tiers.indexOf(tier) >= tiers.indexOf(ceiling);
  const next = atCeiling || tier === "S" ? null : tiers[tiers.indexOf(tier) + 1];
  return {
    name: manifestData(project)?.title ?? project.name,
    root: project.root,
    kind: project.kind,
    tier,
    ceiling,
    next,
    nextSteps: next ? results.filter((result) => result.tier === next && result.status !== "pass") : [],
    checks: results,
  };
}
