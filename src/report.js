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
  const targets = reports.some((report) => "target" in report);
  const lines = [dim(`TIER  ${targets ? "TARGET  " : ""}${"PROJECT".padEnd(width)}  ${"KIND".padEnd(kindWidth)}  NEXT`)];
  for (const report of reports) {
    const blockers = report.nextSteps.filter((step) => step.required).map((step) => step.id);
    const next = report.next ? `${tierLabel(report.next)} ${dim("needs")} ${blockers.join(", ")}` : dim(nextLine(report));
    const target = targets ? `${report.target ? tierLabel(report.target) : dim("-")}       ` : "";
    lines.push(`${tierLabel(report.tier)}     ${target}${report.name.padEnd(width)}  ${dim(report.kind.padEnd(kindWidth))}  ${next}`);
  }
  return lines.join("\n");
}

// One row per check, one column per project, so the same gap across projects lines up.
export function formatMatrix(reports) {
  const names = reports.map((report) => report.name.length > 12 ? `${report.name.slice(0, 11)}…` : report.name);
  const widths = names.map((name) => Math.max(name.length, 4));
  const checks = reports[0].checks;
  const labelWidth = Math.max(...checks.map((result) => result.id.length + (result.required ? 0 : 1)), 5);
  const cell = (text, index, painted = text) => `${" ".repeat(widths[index] - String(text).length)}${painted}`;
  const lines = [
    dim(`   ${"CHECK".padEnd(labelWidth)}  ${names.map((name, index) => cell(name, index)).join("  ")}`),
    `   ${bold("tier".padEnd(labelWidth))}  ${reports.map((report, index) => cell(report.tier, index, tierLabel(report.tier))).join("  ")}`,
  ];
  checks.forEach((check, row) => {
    const label = `${check.id}${check.required ? "" : "*"}`;
    if (row === 0 || checks[row - 1].tier !== check.tier) lines.push("");
    lines.push(`${dim(check.tier)}  ${label.padEnd(labelWidth)}  ${reports.map((report, index) => cell("x", index, mark(report.checks[row]))).join("  ")}`);
  });
  lines.push("", dim("✓ pass  ✗ missing  · advice missing (* advice only)  ? not verified"));
  return lines.join("\n");
}

const inspectMarks = { pass: green("✓"), warn: yellow("!"), fail: red("✗") };

export function formatInspection(results) {
  return results.map((result) => `  ${inspectMarks[result.status]} ${result.detail}`).join("\n");
}
