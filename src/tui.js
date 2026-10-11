import os from "node:os";
import path from "node:path";
import { init } from "./init.js";
import { addProject, createConfig, findConfig, fromText, gradeRow, loadEntries, manifestFields, moveProject, openRow, options, portfolioFields, removeProject, setManifestField, setPortfolioField, titleOf, toText, unregisteredHere } from "./manage.js";
import { manifestName } from "./project.js";
import { bold, dim, green, muted, paint, red, tierLabel, yellow } from "./report.js";

const inverse = paint("7");
const home = (file) => file.startsWith(os.homedir()) ? `~${file.slice(os.homedir().length)}` : file;

// Plain-text helpers: fit before painting so escape codes never count towards the width.
const fit = (text, width) => {
  text = String(text);
  return (text.length > width ? `${text.slice(0, Math.max(width - 1, 0))}…` : text).padEnd(width);
};
const cell = (text, width, style = (value) => value) => style(fit(text, width));

// Line breaks for a text box: [start, end) ranges that break after a space when they can.
export function wrap(text, width) {
  const ranges = [];
  let start = 0;
  while (text.length - start > width) {
    let end = start + width;
    const space = text.lastIndexOf(" ", end - 1);
    if (space > start) end = space + 1;
    ranges.push([start, end]);
    start = end;
  }
  ranges.push([start, text.length]);
  return ranges;
}

const keyNames = new Map(Object.entries({
  "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left",
  "\x1b[H": "home", "\x1b[1~": "home", "\x1bOH": "home", "\x1b[F": "end", "\x1b[4~": "end", "\x1bOF": "end",
  "\x1b[3~": "delete", "\x1b[5~": "pageup", "\x1b[6~": "pagedown", "\x1b": "escape",
  "\r": "enter", "\n": "enter", "\x7f": "backspace", "\b": "backspace", "\t": "tab",
  "\x03": "ctrl-c", "\x01": "ctrl-a", "\x05": "ctrl-e", "\x0b": "ctrl-k", "\x15": "ctrl-u", "\x17": "ctrl-w",
}));

// Splits what the terminal sent into keys. Printable runs stay whole so a paste is one insert.
export function parseKeys(chunk) {
  const tokens = String(chunk).match(/\x1b\[[0-9;]*[A-Za-z~]|\x1bO[A-Za-z]|\x1b|[\x00-\x1f\x7f]|[^\x00-\x1f\x7f\x1b]+/g) ?? [];
  return tokens.map((token) => keyNames.has(token) ? { name: keyNames.get(token) } : /^[^\x00-\x1f\x7f\x1b]+$/.test(token) ? { name: "char", text: token } : { name: "ignored" });
}

// The editable lines of the detail screen.
function items(row) {
  const list = portfolioFields.map((field) => ({ field, source: "portfolio", value: row.entry[field.key] }));
  const data = row.project?.manifest?.data;
  if (data) list.push(...manifestFields.map((field) => ({ field, source: "manifest", value: data[field.key] })));
  return list;
}

export function createApp({ configFile, cwd = process.cwd(), notice = null, offline = false, env = process.env, fetch = globalThis.fetch, onChange = () => {} } = {}) {
  const state = { rows: [], screen: "list", cursor: 0, field: 0, edit: null, confirm: null, status: notice ? { text: notice, kind: "ok" } : null, base: null };
  const pending = new Set();

  const flash = (text, kind = "info") => { state.status = { text, kind }; };
  const track = (promise) => {
    const tracked = promise.catch((error) => flash(error.message, "error")).finally(() => { pending.delete(tracked); onChange(); });
    pending.add(tracked);
    return tracked;
  };
  const replaceRow = (row) => {
    const index = state.rows.findIndex((existing) => existing.id === row.id);
    if (index >= 0) state.rows[index] = row;
  };

  // Grades in the background; the list shows "grading" until the report arrives.
  const grade = (row) => track(gradeRow(row, { offline, fetch }).then((graded) => replaceRow({ ...graded, grading: false }), (error) => replaceRow({ ...row, grading: false, note: error.message })));

  // Lists the projects at once, then opens and grades each in the background.
  async function load() {
    const { base, entries } = await loadEntries(configFile);
    state.base = base;
    state.rows = entries.map((entry) => ({ id: entry.id, entry, gap: [], target: null, grading: false, note: "loading" }));
    onChange();
    for (const entry of entries) {
      track((async () => {
        const row = await openRow(entry, base, env);
        replaceRow({ ...row, grading: Boolean(row.project) });
        onChange();
        if (row.project) await grade(row);
      })());
    }
  }

  // Picks up what an edit changed: the entry from the config, the project from disk, then the grade.
  async function reload(row) {
    const { base, entries } = await loadEntries(configFile);
    const entry = entries.find((candidate) => candidate.id === row.id);
    if (!entry) return;
    const opened = await openRow(entry, base, env);
    replaceRow({ ...opened, grading: Boolean(opened.project) });
    if (opened.project) grade(opened);
  }

  const current = () => state.rows[state.cursor];

  async function commit(item, value) {
    const row = current();
    const write = item.source === "portfolio" ? () => setPortfolioField(configFile, row.id, item.field, value) : () => setManifestField(row.root, item.field, value);
    const { errors } = await write();
    if (errors.length) return errors[0];
    await reload(row);
    flash(`Saved ${item.field.key} to ${item.source === "portfolio" ? path.basename(configFile) : manifestName}`, "ok");
    return null;
  }

  async function cycle(item, step) {
    const choices = options(item.field);
    const at = choices.indexOf(item.value);
    const error = await commit(item, choices[(at + step + choices.length) % choices.length]);
    if (error) flash(error, "error");
  }

  async function editKey(key) {
    const edit = state.edit;
    const { text, pos } = edit;
    const set = (next, at) => { edit.text = next; edit.pos = at; edit.error = null; };
    const wordStart = () => { let at = pos; while (at > 0 && text[at - 1] === " ") at -= 1; while (at > 0 && text[at - 1] !== " ") at -= 1; return at; };
    switch (key.name) {
      case "char": return set(text.slice(0, pos) + key.text + text.slice(pos), pos + key.text.length);
      case "backspace": return pos > 0 && set(text.slice(0, pos - 1) + text.slice(pos), pos - 1);
      case "delete": return set(text.slice(0, pos) + text.slice(pos + 1), pos);
      case "ctrl-w": return set(text.slice(0, wordStart()) + text.slice(pos), wordStart());
      case "ctrl-u": return set(text.slice(pos), 0);
      case "ctrl-k": return set(text.slice(0, pos), pos);
      case "left": edit.pos = Math.max(pos - 1, 0); return;
      case "right": edit.pos = Math.min(pos + 1, text.length); return;
      case "home": case "ctrl-a": edit.pos = 0; return;
      case "end": case "ctrl-e": edit.pos = text.length; return;
      case "escape": case "ctrl-c": state.edit = null; flash("Edit cancelled"); return;
      case "enter": {
        const error = await edit.submit(text);
        if (error) edit.error = error;
        else state.edit = null;
        return;
      }
      default:
    }
  }

  async function detailKey(key) {
    const list = items(current());
    const item = list[state.field];
    const move = (to) => { state.field = Math.min(Math.max(to, 0), list.length - 1); };
    switch (key.name === "char" ? key.text : key.name) {
      case "up": case "k": return move(state.field - 1);
      case "down": case "j": return move(state.field + 1);
      case "home": case "g": return move(0);
      case "end": case "G": return move(list.length - 1);
      case "escape": case "q": case "backspace": state.screen = "list"; state.status = null; return;
      case "left": case "h": return options(item.field) ? cycle(item, -1) : undefined;
      case "right": case "l": return options(item.field) ? cycle(item, 1) : undefined;
      case "enter": case " ":
        if (options(item.field)) return cycle(item, 1);
        {
          const text = toText(item.field, item.value);
          state.edit = { label: item.field.key, max: item.field.node.maxLength, help: item.field.node.description, text, pos: text.length, error: null, submit: (typed) => commit(item, fromText(item.field, typed)) };
        }
        return;
      case "n": {
        const row = current();
        if (!row.root || row.project?.manifest) return flash(row.root ? `${manifestName} already exists` : "This project has no local path", "error");
        const { file, errors } = await init(row.root);
        await reload(row);
        state.field = 0;
        return flash(`Wrote ${home(file)}${errors.length ? `. Still to fill in: ${errors.join("; ")}` : ""}`, errors.length ? "error" : "ok");
      }
      case "r": await reload(current()); return flash("Refreshed");
      default:
    }
  }

  async function addPrompt() {
    state.edit = {
      label: "Add a project", help: "Path to the project folder. ~ and relative paths work.", text: "", pos: 0, error: null,
      submit: async (typed) => {
        const { id, error } = await addProject(configFile, typed, { cwd, env });
        if (error) return error;
        await load();
        state.cursor = Math.max(state.rows.findIndex((row) => row.id === id), 0);
        flash(`Added ${id}`, "ok");
        return null;
      },
    };
  }

  async function confirmKey(key) {
    const { yes } = state.confirm;
    state.confirm = null;
    if (key.text === "y") await yes();
    else flash("Okay, left as it was");
  }

  // Asks to add the project the user started in, if it is not in the portfolio yet.
  async function offerHere() {
    const dir = await unregisteredHere(configFile, { cwd, env });
    if (!dir) return;
    state.confirm = {
      question: `Add ${bold(path.basename(dir))} ${dim(`(${home(dir)})`)} to the portfolio?`,
      yes: async () => {
        const { id, error } = await addProject(configFile, dir, { cwd, env });
        if (error) return flash(error, "error");
        await load();
        state.cursor = Math.max(state.rows.findIndex((row) => row.id === id), 0);
        flash(`Added ${id}`, "ok");
      },
    };
    onChange();
  }

  async function listKey(key) {
    const move = (to) => { state.cursor = Math.max(Math.min(to, state.rows.length - 1), 0); };
    switch (key.name === "char" ? key.text : key.name) {
      case "a": return addPrompt();
      case "d": case "x":
        if (current()) {
          const row = current();
          state.confirm = {
            question: `Remove ${bold(titleOf(row))} from the portfolio? ${dim("Its files stay as they are.")}`,
            yes: async () => {
              await removeProject(configFile, row.id);
              state.rows.splice(state.rows.findIndex((existing) => existing.id === row.id), 1);
              state.cursor = Math.max(Math.min(state.cursor, state.rows.length - 1), 0);
              flash(`Removed ${titleOf(row)} from the portfolio. Its files are untouched.`, "ok");
            },
          };
        }
        return;
      case "up": case "k": return move(state.cursor - 1);
      case "down": case "j": return move(state.cursor + 1);
      case "pageup": return move(state.cursor - 10);
      case "pagedown": return move(state.cursor + 10);
      case "home": case "g": return move(0);
      case "end": case "G": return move(state.rows.length - 1);
      case "enter": case "right": case "l": case " ":
        if (!state.rows.length) return;
        state.screen = "detail"; state.field = 0; state.status = null;
        return;
      case "J": case "K": {
        const delta = key.text === "J" ? 1 : -1;
        const row = current();
        if (!(await moveProject(configFile, row.id, delta))) return;
        state.rows.splice(state.cursor + delta, 0, state.rows.splice(state.cursor, 1)[0]);
        state.cursor += delta;
        return flash(`Moved ${titleOf(row)} to position ${state.cursor + 1}`, "ok");
      }
      case "r": flash("Refreshing"); track(load()); return;
      case "q": state.quit = true; return;
      default:
    }
  }

  // Keys are handled one at a time, so a slow write never interleaves with the next key.
  let queue = Promise.resolve();
  function key(input) {
    const keys = typeof input === "string" ? parseKeys(input) : [input];
    queue = queue.then(async () => {
      while (keys.length) {
        const next = keys.shift();
        // Outside the editor a run like "jjj" (key repeat) is several presses; a paste only matters while editing.
        if (next.name === "char" && !state.edit && next.text.length > 1) {
          const [first, ...rest] = [...next.text];
          keys.unshift({ name: "char", text: first }, ...(rest.length ? [{ name: "char", text: rest.join("") }] : []));
          continue;
        }
        try {
          if (!state.edit) state.status = null;
          if (next.name === "ctrl-c" && !state.edit) state.quit = true;
          else if (state.edit) await editKey(next);
          else if (state.confirm) await confirmKey(next);
          else if (state.screen === "detail") await detailKey(next);
          else await listKey(next);
        } catch (error) {
          flash(error.message, "error");
        }
      }
      onChange();
    });
    return queue;
  }

  const idle = async () => { await queue; while (pending.size) await Promise.all([...pending]); };

  return { state, load, offerHere, key, idle, render: (size) => render(state, configFile, size) };
}

// The text box for the editor in state.edit: label with counter, wrapped text, error and help. cursor.row is relative to the first line returned.
function editorLines(edit, width) {
  const text = edit.text;
  const ranges = wrap(text, Math.max(width - 4, 10));
  const at = edit.pos;
  const index = Math.max(ranges.findIndex(([start, end], i) => at >= start && (at < end || i === ranges.length - 1)), 0);
  const lines = [` ${bold(edit.label)}${edit.max ? dim(`  ${text.length}/${edit.max}`) : ""}`, ...ranges.map(([start, end]) => `   ${text.slice(start, end)}`)];
  if (edit.error) lines.push(` ${red(edit.error)}`);
  if (edit.help) for (const [start, end] of wrap(edit.help, Math.max(width - 4, 10))) lines.push(muted(`   ${edit.help.slice(start, end)}`));
  return { lines, cursor: { row: 1 + index, col: at - ranges[index][0] + 3 } };
}

// With no priority there is no goal, so show what the next tier needs, as check does.
function nextNeeds(report) {
  if (!report.next) return report.tier === "S" ? "top tier" : `at ceiling ${report.ceiling}`;
  return `next ${report.next}: ${report.nextSteps.filter((step) => step.required).map((step) => step.id).join(", ")}`;
}

function listScreen(state, configFile, width, height) {
  const { rows } = state;
  const widths = {
    pri: Math.max(...rows.map((row) => (row.entry.priority ?? "-").length), 3),
    type: Math.max(...rows.map((row) => (row.entry.type ?? "-").length), 4),
    name: Math.min(Math.max(...rows.map((row) => titleOf(row).length), 7), 28),
    kind: Math.max(...rows.map((row) => (row.report?.kind ?? "").length), 4),
  };
  const lines = [` ${bold("showcase")}  ${dim(`${home(configFile)} · ${rows.length} project${rows.length === 1 ? "" : "s"}`)}`, ""];
  lines.push(dim(` ${fit("TIER", 5)}${fit("GOAL", 5)}${fit("PRIO", widths.pri + 2)}${fit("TYPE", widths.type + 2)}${fit("PROJECT", widths.name + 2)}${fit("KIND", widths.kind + 2)}GAP`));

  const room = Math.max(height - lines.length - 3, 1);
  const first = Math.min(Math.max(state.cursor - room + 1, 0), Math.max(rows.length - room, 0));
  rows.slice(first, first + room).forEach((row, offset) => {
    const selected = first + offset === state.cursor;
    const { report } = row;
    const tier = report ? tierLabel(report.tier) : dim(row.grading ? "…" : "-");
    const gap = report ? (row.gap.length ? row.gap.join(", ") : row.target ? "on target" : nextNeeds(report)) : (row.grading ? "grading" : row.note ?? "");
    const plain = [
      fit(report ? report.tier : row.grading ? "…" : "-", 5), fit(row.target ?? "-", 5), fit(row.entry.priority ?? "-", widths.pri + 2),
      fit(row.entry.type ?? "-", widths.type + 2), fit(titleOf(row), widths.name + 2), fit(report?.kind ?? "", widths.kind + 2), gap,
    ].join("");
    if (selected) return lines.push(inverse(fit(` ${plain}`, width)));
    const gapStyle = report && !row.gap.length ? green : row.gap.length ? yellow : dim;
    lines.push(` ${tier}${" ".repeat(4)}${cell(row.target ?? "-", 5, row.target ? (value) => value : dim)}${cell(row.entry.priority ?? "-", widths.pri + 2, row.entry.priority ? (value) => value : dim)}${cell(row.entry.type ?? "-", widths.type + 2, row.entry.type ? (value) => value : dim)}${cell(titleOf(row), widths.name + 2, bold)}${cell(report?.kind ?? "", widths.kind + 2, dim)}${gapStyle(gap)}`);
  });
  if (first + room < rows.length) lines.push(dim(` ↓ ${rows.length - first - room} more`));
  return { lines, cursor: null, footer: " ↑↓ select   enter open   a add   d remove   J/K reorder   r refresh   q quit" };
}

function detailScreen(state, width, height) {
  const row = state.rows[state.cursor];
  const { report } = row;
  const lines = [` ${bold(titleOf(row))}  ${report ? `${tierLabel(report.tier)}${row.target ? ` → ${tierLabel(row.target)}` : ""}  ${dim(report.kind)}` : dim(row.grading ? "grading…" : "not graded")}`];
  lines.push(dim(` ${row.root ? home(row.root) : row.note ?? row.id}`));
  if (report) lines.push(row.gap.length ? ` ${yellow("gap")} ${row.gap.join(", ")}` : row.target ? ` ${green("on target")}` : dim(" no priority set, so no target"));
  else if (row.note) lines.push(` ${yellow(row.note)}`);
  const problems = row.project?.manifest?.errors ?? [];
  for (const problem of problems.slice(0, 3)) lines.push(` ${red("✗")} ${problem}`);
  if (problems.length > 3) lines.push(dim(`   and ${problems.length - 3} more`));

  const list = items(row);
  const keyWidth = Math.max(...list.map((item) => item.field.key.length + 1), 6);
  const section = (title) => lines.push("", dim(` ${title}`));
  const draw = (item, index) => {
    const selected = index === state.field;
    const choices = options(item.field);
    const empty = item.value === undefined || item.value === null || (Array.isArray(item.value) && !item.value.length);
    const shown = empty ? "-" : toText(item.field, item.value);
    const label = fit(`${item.field.key}${item.field.required && item.source === "manifest" ? "*" : ""}`, keyWidth);
    const body = selected && choices ? `◂ ${shown} ▸` : shown;
    if (selected) return lines.push(inverse(fit(` ${label} ${body}`, width)));
    lines.push(` ${dim(label)} ${empty ? dim(body) : fit(body, width - keyWidth - 3).trimEnd()}`);
  };
  section("portfolio.json");
  list.forEach((item, index) => { if (item.source === "portfolio") draw(item, index); });
  if (row.project?.manifest && !row.project.manifest.data) {
    section(manifestName);
    lines.push(` ${red("invalid JSON")}${dim(", fix it by hand before editing here")}`);
  } else if (row.project?.manifest) {
    section(manifestName);
    list.forEach((item, index) => { if (item.source === "manifest") draw(item, index); });
  } else if (row.root) {
    section(manifestName);
    lines.push(dim(" none yet. Press n to draft one from the README and package.json."));
  }

  // Below the list: the selected field in full, or its editor.
  const item = list[state.field];
  lines.push("", dim(` ${"─".repeat(Math.max(width - 2, 1))}`));
  let cursor = null;
  if (state.edit) {
    const box = editorLines(state.edit, width);
    cursor = { row: lines.length + box.cursor.row, col: box.cursor.col };
    lines.push(...box.lines);
  } else if (item) {
    lines.push(` ${bold(item.field.key)}`);
    for (const [start, end] of wrap(toText(item.field, item.value), Math.max(width - 4, 10))) lines.push(`   ${toText(item.field, item.value).slice(start, end)}`);
    const help = item.field.node.description;
    if (help) for (const [start, end] of wrap(help, Math.max(width - 4, 10))) lines.push(muted(`   ${help.slice(start, end)}`));
  }
  const footer = state.edit ? " enter save   esc cancel   ctrl-u clear to start   ctrl-k clear to end" : " ↑↓ select   enter edit   ←→ change choice   n new showcase.json   esc back";
  return { lines, cursor, footer };
}

// Draws the whole screen as lines, plus where the text cursor goes while editing.
export function render(state, configFile, { width = 80, height = 24 } = {}) {
  let screen;
  if (state.rows.length === 0) {
    screen = { lines: [` ${bold("showcase")}  ${dim(home(configFile))}`, "", " No projects in this portfolio yet.", dim(" Press a and type the path to a project folder.")], cursor: null, footer: " a add   q quit" };
  } else {
    screen = state.screen === "detail" ? detailScreen(state, width, height) : listScreen(state, configFile, width, height);
  }
  if (state.screen === "list" || state.rows.length === 0) {
    if (state.edit) {
      const box = editorLines(state.edit, width);
      screen.cursor = { row: screen.lines.length + 1 + box.cursor.row, col: box.cursor.col };
      screen.lines.push("", ...box.lines);
      screen.footer = " enter add   esc cancel";
    } else if (state.confirm) {
      screen.lines.push("", ` ${state.confirm.question} ${bold("y")}/n`);
      screen.footer = " y yes   any other key no";
    }
  }
  const body = screen.lines.slice(0, height - 2);
  while (body.length < height - 2) body.push("");
  const status = state.status ? ` ${state.status.kind === "error" ? red(state.status.text) : state.status.kind === "ok" ? green(state.status.text) : state.status.text}` : "";
  const lines = [...body, status, dim(screen.footer)];
  return { lines, cursor: screen.cursor && screen.cursor.row < height - 2 ? screen.cursor : null };
}

// Runs the interface on the real terminal until the user quits.
export async function run(options) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("showcase manage needs an interactive terminal.");
  const draw = () => {
    const { lines, cursor } = app.render({ width: stdout.columns, height: stdout.rows });
    stdout.write(`\x1b[?25l\x1b[H${lines.map((line) => `${line}\x1b[K`).join("\r\n")}\x1b[J`);
    if (cursor) stdout.write(`\x1b[${cursor.row + 1};${cursor.col + 1}H\x1b[?25h`);
  };
  const cwd = process.cwd();
  let { configFile, notice } = options;
  if (configFile) {
    configFile = path.resolve(cwd, configFile);
    await loadEntries(configFile);
    notice = `Using ${home(configFile)}.`;
  } else {
    const found = await findConfig({ cwd, env: process.env });
    configFile = found.file;
    if (!found.exists) {
      const count = await createConfig(configFile, cwd);
      notice = `Started a portfolio at ${home(configFile)} with ${count} project${count === 1 ? "" : "s"} from here. Have one already? Run showcase manage <path> once.`;
    }
  }
  await loadEntries(configFile);
  const app = createApp({ ...options, configFile, cwd, notice, onChange: draw });

  const restore = () => stdout.write("\x1b[?25h\x1b[?1049l");
  stdout.write("\x1b[?1049h");
  process.on("exit", restore);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  stdout.on("resize", draw);

  try {
    await app.load();
    await app.offerHere();
  } catch (error) {
    stdin.setRawMode(false);
    stdin.pause();
    throw error;
  }
  await new Promise((resolve) => {
    stdin.on("data", async (chunk) => {
      await app.key(chunk);
      if (app.state.quit) resolve();
    });
  });
  stdin.setRawMode(false);
  stdin.pause();
  restore();
}
