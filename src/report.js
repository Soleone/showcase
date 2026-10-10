import os from "node:os";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text);
const bold = paint("1");
const dim = paint("2");
const green = paint("32");
const red = paint("31");
const yellow = paint("33");
const tierColors = { S: paint("1;35"), A: paint("1;32"), B: paint("1;36"), C: paint("1;33"), D: paint("1;31") };

const tierLabel = (tier) => tierColors[tier](tier);
const home = (file) => file.startsWith(os.homedir()) ? `~${file.slice(os.homedir().length)}` : file;
const mark = (result) => result.status === "pass" ? green("✓") : result.status === "skip" ? yellow("?") : result.required ? red("✗") : yellow("·");

function nextLine(report) {
  if (report.next) return `next ${tierLabel(report.next)}`;
  return report.tier === "S" ? "top tier" : `at ceiling ${report.ceiling}`;
}

export function formatReport(report, { verbose = false } = {}) {
  const lines = [`${tierLabel(report.tier)}  ${bold(report.name)}  ${dim(`${report.kind} · ${home(report.root)}`)}  ${dim("·")} ${nextLine(report)}`];
  if (verbose) {
    for (const result of report.checks) {
      lines.push(`  ${dim(result.tier)} ${mark(result)} ${result.label}${result.required ? "" : dim(" (advice)")}  ${dim(result.detail ?? "")}`);
    }
  }
  if (report.nextSteps.length) {
    lines.push("", `  To reach ${tierLabel(report.next)}:`);
    for (const step of report.nextSteps) {
      lines.push(`  ${mark(step)} ${step.label}${step.required ? "" : dim(" (advice)")}  ${dim(step.detail)}`, `    ${step.hint}`);
    }
  }
  return lines.join("\n");
}

export function formatSummary(reports) {
  const width = Math.max(...reports.map((report) => report.name.length), 7);
  const kindWidth = Math.max(...reports.map((report) => report.kind.length), 4);
  const lines = [dim(`${"TIER"}  ${"PROJECT".padEnd(width)}  ${"KIND".padEnd(kindWidth)}  NEXT`)];
  for (const report of reports) {
    const blockers = report.nextSteps.filter((step) => step.required).map((step) => step.id);
    const next = report.next ? `${tierLabel(report.next)} ${dim("needs")} ${blockers.join(", ")}` : dim(nextLine(report));
    lines.push(`${tierLabel(report.tier)}     ${report.name.padEnd(width)}  ${dim(report.kind.padEnd(kindWidth))}  ${next}`);
  }
  return lines.join("\n");
}
