#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { evaluate, tiers } from "../src/checks.js";
import { collect } from "../src/collect.js";
import { init } from "../src/init.js";
import { loadProject } from "../src/project.js";
import { formatMatrix, formatReport, formatSummary } from "../src/report.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const usage = `showcase ${version}: grade how demoable a project is, from D to S.

Usage:
  showcase check [path...]   Show the tier and what it takes to reach the next one
  showcase init [path]       Draft showcase.json from the README and package.json
  showcase collect <config> --out <dir>
                             Grade every project in a portfolio.config.json and write
                             <dir>/feed.json plus copies of the local media

Options:
  --json         Machine-readable output (check)
  --verbose, -v  List every check, not just the next steps (check)
  --matrix       Every check against every project, one column each (check)
  --offline      Do not request the live URL (check, collect)
  --out <dir>    Where to write feed.json and media/ (collect)
  --min <tier>   Exit with status 1 if any project is below this tier (check)
  --force        Overwrite an existing showcase.json (init)
  --dry-run      Print the draft without writing it (init)
  --help, -h     Show this help
  --version      Show the version

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
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });
  const [command, ...paths] = positionals;

  if (values.version) return console.log(version);
  if (values.help || !command) return console.log(usage);
  if (command === "check") return check(paths, values);
  if (command === "init") {
    if (paths.length > 1) throw new Error("init takes a single path");
    const { file, manifest, errors } = await init(paths[0] ?? ".", { force: values.force, dryRun: values["dry-run"] });
    console.log(`${values["dry-run"] ? "Draft for" : "Wrote"} ${file}\n\n${JSON.stringify(manifest, null, 2)}`);
    if (errors.length) console.log(`\nFill in before it validates:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
    return;
  }
  if (command === "collect") {
    if (paths.length !== 1 || !values.out) throw new Error("Usage: showcase collect <portfolio.config.json> --out <dir>");
    const { file, feed, reports, warnings } = await collect(paths[0], { out: values.out, offline: values.offline });
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
