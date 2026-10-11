#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { evaluate, tiers } from "../src/checks.js";
import { collect } from "../src/collect.js";
import { init } from "../src/init.js";
import { addProject, findConfig, portfolioFields, removeProject, setPortfolioField } from "../src/manage.js";
import { inspectMotion, runCapture } from "../src/inspect.js";
import { loadPortfolio } from "../src/collect.js";
import { loadProject } from "../src/project.js";
import { formatInspection, formatMatrix, formatReport, formatSummary } from "../src/report.js";
import { buildTerminal, serveTerminal } from "../src/terminal.js";
import { run as manage } from "../src/tui.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const usage = `showcase ${version}: grade how demoable a project is, from D to S.

Usage:
  showcase check [path...]   Show the tier and what it takes to reach the next one
  showcase init [path]       Draft showcase.json from the README and package.json
  showcase collect [config] --out <dir>
                             Grade every project in the portfolio and write
                             <dir>/feed.json plus copies of the local media
  showcase manage [config]   Browse your projects and edit their metadata. Finds the
                             portfolio by itself (see below); give a path once to switch
  showcase add <path>        Put a project in the portfolio (--id, --priority, --type)
  showcase remove <id>       Take a project out of the portfolio; its files stay
  showcase set <id>          Change a project's --priority (or none) or --type
  showcase list              The portfolio's projects (--json for scripts)
  showcase capture [path]    Re-record the media with media.capture, then check media.motion
  showcase terminal [recipe] Build the in-browser terminal demo for a CLI from a folder
                             with terminal.json (default demo/browser)

Options:
  --json         Machine-readable output (check)
  --verbose, -v  List every check, not just the next steps (check)
  --matrix       Every check against every project, one column each (check)
  --config <f>   Use this portfolio.json (add, remove, list, collect)
  --id <id>      Id for the new project (add), default local:<folder name>
  --priority <p> high, mid or low (add, set)
  --type <t>     How the portfolio labels it, e.g. product (add, set)
  --offline      Do not request the live URL (check, collect, manage)
  --out <dir>    Where to write feed.json and media/ (collect), or the page
                 (terminal, default dist/browser)
  --serve        Serve the page on 127.0.0.1 after building it (terminal)
  --port <n>     Port for --serve (default 4321)
  --min <tier>   Exit with status 1 if any project is below this tier (check)
  --force        Overwrite an existing showcase.json (init)
  --dry-run      Print the draft without writing it (init)
  --no-record    Only check the existing media.motion (capture)
  --help, -h     Show this help
  --version      Show the version

manage opens, in order: the [config] argument (remembered, so you pass it once), $SHOWCASE_CONFIG,
the nearest portfolio.json from here upwards, the one remembered, then
~/.config/showcase/portfolio.json, which it creates from the projects in this folder.

Tiers:
  D  nothing to show yet
  C  README explains what it is and how to run it
  B  polished README: pitch, hero visual, concise, no broken links
  A  showcase.json, motion (looping WebP or video), one-command local demo
  S  live: one click to try it for real`;

async function check(paths, values) {
  if (values.min && !tiers.includes(values.min)) throw new Error(`--min must be one of ${tiers.join(", ")}`);
  const reports = await Promise.all((paths.length ? paths : ["."]).map(async (root) => evaluate(await loadProject(root), { offline: values.offline })));

  if (values.json) console.log(JSON.stringify(reports, null, 2));
  else if (values.matrix) console.log(formatMatrix(reports));
  else if (reports.length === 1 || values.verbose) console.log(reports.map((report) => formatReport(report, values)).join("\n\n"));
  else console.log(formatSummary(reports));

  if (values.min && reports.some((report) => tiers.indexOf(report.tier) < tiers.indexOf(values.min))) process.exitCode = 1;
}

async function capture(paths, values) {
  if (paths.length > 1) throw new Error("capture takes a single path");
  const project = await loadProject(paths[0] ?? ".");
  const media = project.manifest?.data?.media ?? {};
  if (!values["no-record"] && !media.capture) throw new Error(`Set media.capture in ${project.manifest?.file ?? "showcase.json"} to the command that records the media.`);
  if (!media.motion) throw new Error("Set media.motion in showcase.json to the file the capture writes.");
  let since;
  if (!values["no-record"]) {
    since = Date.now();
    console.log(`Recording with ${media.capture}\n`);
    await runCapture(project, media.capture);
    console.log("");
  }
  const results = await inspectMotion(project, media.motion, { since });
  console.log(`${media.motion}\n${formatInspection(results)}`);
  if (results.some((result) => result.status === "fail")) process.exitCode = 1;
}

async function terminal(paths, values) {
  if (paths.length > 1) throw new Error("terminal takes a single recipe folder");
  const { out, bytes } = await buildTerminal(paths[0] ?? "demo/browser", values.out ?? "dist/browser");
  console.log(`Built ${out} (${Math.round(bytes / 1024)} KB of files)`);
  if (!values.serve) return;
  const port = Number(values.port ?? 4321);
  if (!Number.isInteger(port)) throw new Error("--port must be a number");
  await serveTerminal(out, port);
  console.log(`Serving at http://127.0.0.1:${port} (Ctrl-C to stop)`);
}

// The portfolio file for scripts: --config, else the same lookup manage uses.
async function configFor(explicit) {
  if (explicit) return explicit;
  const { file, exists } = await findConfig();
  if (!exists) throw new Error(`No portfolio found. Run 'showcase manage' to start one, or pass --config <file>.`);
  return file;
}

async function portfolio(command, paths, values) {
  if (command === "list" ? paths.length : paths.length !== 1) throw new Error(command === "list" ? "list takes no arguments" : `Usage: showcase ${command} ${command === "add" ? "<path>" : "<id>"}`);
  const file = await configFor(values.config);
  if (command === "list") {
    const { projects } = await loadPortfolio(file);
    if (values.json) return console.log(JSON.stringify(projects, null, 2));
    const width = Math.max(...projects.map((project) => project.id.length), 2);
    return console.log(projects.map((project) => `${project.id.padEnd(width)}  ${(project.priority ?? "-").padEnd(4)}  ${project.path ?? project.repo ?? ""}`).join("\n"));
  }
  if (command === "add") {
    const { id, error } = await addProject(file, paths[0], { id: values.id, priority: values.priority ?? null, type: values.type });
    if (error) throw new Error(error);
    return console.log(`Added ${id} to ${file}`);
  }
  const { projects } = await loadPortfolio(file);
  if (!projects.some((project) => project.id === paths[0])) throw new Error(`${paths[0]} is not in ${file}`);
  if (command === "set") {
    const changes = [["priority", values.priority], ["type", values.type]].filter(([, value]) => value !== undefined);
    if (!changes.length) throw new Error("Nothing to set. Pass --priority and/or --type.");
    for (const [key, raw] of changes) {
      const { errors } = await setPortfolioField(file, paths[0], portfolioFields.find((field) => field.key === key), raw === "none" ? null : raw);
      if (errors.length) throw new Error(errors.join("; "));
    }
    return console.log(`Updated ${paths[0]} in ${file}`);
  }
  await removeProject(file, paths[0]);
  console.log(`Removed ${paths[0]} from ${file}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      verbose: { type: "boolean", short: "v" },
      matrix: { type: "boolean" },
      offline: { type: "boolean" },
      min: { type: "string" },
      force: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "no-record": { type: "boolean" },
      out: { type: "string" },
      config: { type: "string" },
      id: { type: "string" },
      priority: { type: "string" },
      type: { type: "string" },
      serve: { type: "boolean" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });
  const [command, ...paths] = positionals;

  if (values.version) return console.log(version);
  if (values.help || !command) return console.log(usage);
  if (command === "check") return check(paths, values);
  if (command === "capture") return capture(paths, values);
  if (command === "manage") {
    if (paths.length > 1) throw new Error("manage takes a single portfolio.json");
    return manage({ configFile: paths[0], offline: values.offline });
  }
  if (command === "terminal") return terminal(paths, values);
  if (command === "init") {
    if (paths.length > 1) throw new Error("init takes a single path");
    const { file, manifest, errors } = await init(paths[0] ?? ".", { force: values.force, dryRun: values["dry-run"] });
    console.log(`${values["dry-run"] ? "Draft for" : "Wrote"} ${file}\n\n${JSON.stringify(manifest, null, 2)}`);
    if (errors.length) console.log(`\nFill in before it validates:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
    return;
  }
  if (["add", "remove", "set", "list"].includes(command)) return portfolio(command, paths, values);
  if (command === "collect") {
    if (paths.length > 1 || !values.out) throw new Error("Usage: showcase collect [portfolio.json] --out <dir>");
    const { file, feed, reports, warnings } = await collect(paths[0] ?? await configFor(values.config), { out: values.out, offline: values.offline });
    if (reports.length) console.log(formatSummary(reports));
    if (warnings.length) console.log(`\n${warnings.map((warning) => `! ${warning}`).join("\n")}`);
    console.log(`\nWrote ${file} (${feed.projects.length} projects)`);
    return;
  }
  throw new Error(`Unknown command '${command}'. Run 'showcase --help'.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
