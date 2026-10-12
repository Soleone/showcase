import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { cachePath, classify, discover, githubName, liveUrls, projectFolders, reviewList, scan, score, suggestRoots } from "../src/discover.js";
import { addProject, ignoreProjects, setRoots, unignoreProjects } from "../src/manage.js";
import { fixture } from "./helpers.js";

const bin = fileURLToPath(new URL("../bin/showcase.js", import.meta.url));
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const repo = (name, extra = {}) => ({ name, full_name: `me/${name}`, html_url: `https://github.com/me/${name}`, description: `${name} does things`, stargazers_count: 0, forks_count: 0, private: false, pushed_at: "2026-10-01T00:00:00Z", ...extra });

// Stands in for git and gh: git answers from `repos` (by folder name), gh lists `remote`.
function fakeExec({ git = {}, remote = [], ghError = null } = {}) {
  return async (file, args) => {
    if (file === "gh") {
      if (ghError) return { ok: false, stdout: "", stderr: ghError, missing: ghError === "missing" };
      return { ok: true, stdout: remote.map((item) => JSON.stringify(item)).join("\n"), stderr: "" };
    }
    const info = git[path.basename(args[1])] ?? {};
    const answer = { "config": info.origin, "rev-list": String(info.commits ?? 1), "log": info.last ?? "2026-10-01T00:00:00Z", "ls-files": Array.from({ length: info.files ?? 12 }, (_, i) => `f${i}`).join("\0"), "remote": "origin" }[args[2]];
    return answer === undefined ? { ok: false, stdout: "", stderr: "" } : { ok: true, stdout: answer, stderr: "" };
  };
}

async function tree() {
  const root = await fixture({
    "src/products/alpha/package.json": "{}",
    "src/products/alpha/README.md": "# Alpha\n\nAlpha is live at https://alpha.example.com and see ![b](https://img.shields.io/x.svg) https://github.com/me/alpha.\n",
    "src/products/beta/readme.md": "# Beta\n",
    "src/tries/loose/notes.txt": "x",
    "src/solo/package.json": "{}",
    "src/hidden/.secret/x": "x",
    "src/.dot/thing/package.json": "{}",
    "src/products/node_modules/dep/package.json": "{}",
    "portfolio.json": { projects: [] },
  });
  await mkdir(path.join(root, "src/products/alpha/.git"));
  await mkdir(path.join(root, "src/tries/loose/.git"));
  return root;
}

test("githubName reads every spelling of a github.com remote", () => {
  for (const url of ["https://github.com/me/app", "https://github.com/me/app.git", "git@github.com:me/app.git", "ssh://git@github.com/me/app", "http://www.github.com/me/app/"]) assert.equal(githubName(url), "me/app", url);
  assert.equal(githubName("https://gitlab.com/me/app"), null);
  assert.equal(githubName(null), null);
});

test("liveUrls keeps links that could be a demo, not badges, repositories or raw files", () => {
  const text = "![b](https://img.shields.io/x.svg) [repo](https://github.com/a/b) https://raw.githubusercontent.com/a/b/main/x https://app.example.com/try. And http://localhost:3000";
  assert.deepEqual(liveUrls(text), ["https://app.example.com/try"]);
});

test("projectFolders finds category/project folders, and a folder with a manifest is a project itself", async () => {
  const root = await tree();
  const found = (await projectFolders(path.join(root, "src"))).map((folder) => folder.rel);
  assert.deepEqual(found, ["products/alpha", "products/beta", "solo", "tries/loose"]);
});

test("a git repo that only holds projects is a category, one with no folders inside is a project", async () => {
  const root = await fixture({ "src/skills/prune/SKILL.md": "x", "src/skills/lint/SKILL.md": "x", "src/bin/run.sh": "x" });
  await mkdir(path.join(root, "src/skills/.git"));
  await mkdir(path.join(root, "src/bin/.git"));
  assert.deepEqual((await projectFolders(path.join(root, "src"))).map((folder) => folder.rel), ["bin", "skills/lint", "skills/prune"]);
});

test("scan matches folders to GitHub repositories and lists the rest", async () => {
  const root = await tree();
  const exec = fakeExec({ git: { alpha: { origin: "git@github.com:me/alpha.git", commits: 40 } }, remote: [repo("alpha", { stargazers_count: 7 }), repo("beta"), repo("elsewhere", { homepage: "https://elsewhere.dev" })] });
  const result = await scan([path.join(root, "src")], { exec });
  const byId = Object.fromEntries(result.candidates.map((candidate) => [candidate.id, candidate]));
  assert.deepEqual(Object.keys(byId).sort(), ["github:me/elsewhere", "local:products/alpha", "local:products/beta", "local:solo", "local:tries/loose"]);
  assert.equal(byId["local:products/alpha"].source, "both");
  assert.equal(byId["local:products/alpha"].repo, "https://github.com/me/alpha");
  assert.equal(byId["local:products/alpha"].liveUrl, "https://alpha.example.com");
  assert.equal(byId["local:products/beta"].source, "both", "matched by its folder name when it has no origin");
  assert.equal(byId["local:solo"].source, "local");
  assert.equal(byId["github:me/elsewhere"].path, null);
  assert.equal(result.candidates[0].id, "local:products/alpha", "the strongest evidence comes first");
  assert.ok(result.candidates.every((candidate, i, all) => !i || all[i - 1].score >= candidate.score));
});

test("a root typed as $VAR keeps its spelling in each project's path", async () => {
  const root = await tree();
  const result = await scan(["$SRC_ROOT/"], { env: { SRC_ROOT: path.join(root, "src") }, github: false, exec: fakeExec() });
  assert.equal(result.candidates.find((candidate) => candidate.id === "local:solo").path, "$SRC_ROOT/solo");
});

test("a missing gh or a failed login is a note, and folders are still found", async () => {
  const root = await tree();
  const missing = await scan([path.join(root, "src")], { exec: fakeExec({ ghError: "missing" }) });
  assert.match(missing.notes[0], /gh is not installed/);
  assert.equal(missing.candidates.length, 4);
  const loggedOut = await scan([path.join(root, "src"), path.join(root, "nope")], { exec: fakeExec({ ghError: "gh auth login\nmore" }) });
  assert.ok(loggedOut.notes.includes("GitHub skipped: gh auth login"));
  assert.ok(loggedOut.notes.includes(`${path.join(root, "nope")} is not a folder`));
});

test("score rewards evidence and discounts forks and archives", () => {
  const strong = score({ source: "both", private: false, homepage: "https://x.dev", readme: true, description: "d", stars: 3, commits: 30, files: 40, lastActive: new Date().toISOString() });
  const weak = score({ source: "both", private: false, fork: true, archived: true, files: 1, lastActive: "2015-01-01T00:00:00Z" });
  assert.ok(strong.score > 60 && weak.score < 20, `${strong.score} vs ${weak.score}`);
  assert.ok(strong.reasons.includes("live/demo URL") && weak.reasons.includes("archived"));
  assert.equal(score({ source: "local", isGit: false, files: 0 }).reasons.includes("not a git repo"), true);
});

test("classify marks included, ignored and undecided projects, following symlinks and repo-only entries", async () => {
  const root = await tree();
  await symlink(path.join(root, "src/solo"), path.join(root, "alias"));
  const { candidates } = await scan([path.join(root, "src")], { exec: fakeExec({ remote: [repo("remote")] }) });
  const config = {
    projects: [
      { id: "local:products/alpha", path: path.join(root, "src/products/alpha") },
      { id: "mine", path: path.join(root, "alias") },
      { id: "github:me/remote", path: null, repo: "https://github.com/me/remote.git" },
    ],
    ignored: ["local:tries/loose", "local:products/alpha"],
  };
  const status = Object.fromEntries((await classify(candidates, config, root)).map((candidate) => [candidate.id, candidate.status]));
  assert.deepEqual(status, { "local:products/alpha": "included", "local:products/beta": "review", "local:solo": "included", "local:tries/loose": "ignored", "github:me/remote": "included" });
});

test("ignoring and un-ignoring edit portfolio.json, and a project in the portfolio cannot be ignored", async () => {
  const root = await tree();
  const file = path.join(root, "portfolio.json");
  await writeFile(file, JSON.stringify({ projects: [{ id: "local:kept", priority: null, path: "src/solo" }] }));
  assert.deepEqual(await ignoreProjects(file, ["local:a", "local:b", "local:a", "local:kept"]), ["local:a", "local:b"]);
  assert.deepEqual(await ignoreProjects(file, ["local:a"]), []);
  assert.deepEqual((await json(file)).ignored, ["local:a", "local:b"]);
  assert.deepEqual(await unignoreProjects(file, ["local:a", "local:zzz"]), ["local:a"]);
  assert.deepEqual(await unignoreProjects(file, ["local:b"]), ["local:b"]);
  assert.equal("ignored" in (await json(file)), false, "an empty list leaves no key behind");
});

test("adding an ignored project includes it and drops it from the ignored list, keeping its repo", async () => {
  const root = await tree();
  const file = path.join(root, "portfolio.json");
  await writeFile(file, JSON.stringify({ projects: [], ignored: ["local:solo", "github:me/x", "local:other"] }));
  const local = await addProject(file, path.join(root, "src/solo"), { id: "local:solo", repo: "https://github.com/me/solo", priority: "mid" });
  assert.equal(local.id, "local:solo");
  const remote = await addProject(file, "", { id: "github:me/x", repo: "https://github.com/me/x" });
  assert.equal(remote.id, "github:me/x");
  const saved = await json(file);
  assert.deepEqual(saved.ignored, ["local:other"]);
  assert.equal(saved.projects[0].repo, "https://github.com/me/solo");
  assert.equal(saved.projects[0].priority, "mid");
});

test("roots are validated and saved as typed", async () => {
  const root = await tree();
  const file = path.join(root, "portfolio.json");
  assert.deepEqual((await setRoots(file, ["$SRC", "~/code"])).errors, []);
  assert.deepEqual((await json(file)).roots, ["$SRC", "~/code"]);
  assert.match((await setRoots(file, [""])).errors[0], /roots\[0\]: must not be empty/);
  assert.deepEqual((await setRoots(file, [])).errors, []);
  assert.equal("roots" in (await json(file)), false);
});

test("discover needs roots, keeps its result in the cache, and reviewList applies today's decisions", async () => {
  const root = await tree();
  const file = path.join(root, "portfolio.json");
  const env = { XDG_CACHE_HOME: path.join(root, "cache") };
  await assert.rejects(discover(file, { env, github: false }), /no roots to scan/);
  assert.equal(await reviewList(file, { env }), null);
  await setRoots(file, [path.join(root, "src")]);
  const first = await discover(file, { env, github: false, exec: fakeExec() });
  assert.equal(first.candidates.filter((candidate) => candidate.status === "review").length, 4);
  assert.ok(cachePath(file, env).startsWith(path.join(root, "cache", "showcase")));
  await ignoreProjects(file, ["local:solo"]);
  const again = await reviewList(file, { env });
  assert.equal(again.candidates.find((candidate) => candidate.id === "local:solo").status, "ignored");
});

test("the CLI discovers, lists by status, ignores and un-ignores", async () => {
  const root = await tree();
  const file = path.join(root, "portfolio.json");
  const env = { ...process.env, NO_COLOR: "1", XDG_CACHE_HOME: path.join(root, "cache") };
  const run = (...args) => promisify(execFile)(process.execPath, [bin, ...args, "--config", file], { env }).catch((error) => error);
  const found = await run("discover", "--root", path.join(root, "src"), "--no-github");
  assert.match(found.stdout, /Found 4 projects in .*: 0 in the portfolio, 0 ignored, 4 to review\./);
  assert.match(found.stdout, /local:products\/alpha/);
  const ignored = await run("ignore", "local:solo", "local:tries/loose");
  assert.match(ignored.stdout, /Ignored: local:solo, local:tries\/loose/);
  assert.match((await run("ignore", "local:solo")).stdout, /Ignored: nothing\nUnchanged \(already ignored or in the portfolio\): local:solo/);
  const listed = JSON.parse((await run("discover", "--no-github", "--json", "--status", "ignored")).stdout);
  assert.deepEqual(listed.map((candidate) => candidate.id).sort(), ["local:solo", "local:tries/loose"]);
  assert.match((await run("unignore", "local:solo")).stdout, /Back in the review queue: local:solo/);
  assert.equal((await run("discover", "--status", "other")).code, 2);
});

test("suggestRoots offers home folders that hold projects, most first, skipping dot and standard folders", async () => {
  const home = await fixture({
    "src/a/package.json": "{}", "src/b/package.json": "{}", "code/c/package.json": "{}",
    "Documents/d/package.json": "{}", ".config/e/package.json": "{}", "empty/readme.txt": "x", "notes.txt": "x",
  });
  assert.deepEqual((await suggestRoots(home)).map(({ path: where, count }) => [where, count]), [["~/src", 2], ["~/code", 1]]);
  assert.deepEqual(await suggestRoots(path.join(home, "nope")), []);
});
