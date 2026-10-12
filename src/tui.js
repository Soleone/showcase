import os from "node:os";
import path from "node:path";
import { loadPortfolio, targetTier } from "./collect.js";
import { discover, reviewList, suggestRoots } from "./discover.js";
import { init } from "./init.js";
import { addProject, createConfig, findConfig, fromText, gradeRow, ignoreProjects, loadEntries, manifestFields, moveProjectTo, openRow, options, portfolioFields, removeProject, setManifestField, setPortfolioField, setRoots, sortRows, sorts, stageOf, titleOf, toText, unignoreProjects, unregisteredHere } from "./manage.js";
import { manifestName } from "./project.js";
import { bold, dim, green, muted, paint, red, tierLabel, yellow } from "./report.js";

const inverse = paint("7");
const reviewFilters = ["review", "included", "ignored", "all"];
const filterNames = { review: "Needs review", included: "In the portfolio", ignored: "Ignored", all: "All projects" };
const visible = (review) => review.filter === "all" ? review.all : review.all.filter((candidate) => candidate.status === review.filter);
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

// The portfolio's title and repo only stand in for a project without a showcase.json; with one, its facts win.
const standIns = new Set(["title", "repo"]);

// The editable lines of the detail screen.
function items(row) {
  const data = row.project?.manifest?.data;
  const list = portfolioFields.filter((field) => !(data && standIns.has(field.key))).map((field) => ({ field, source: "portfolio", value: row.entry[field.key] }));
  if (data) list.push(...manifestFields.map((field) => ({ field, source: "manifest", value: data[field.key] })));
  return list;
}

export function createApp({ configFile, cwd = process.cwd(), notice = null, offline = false, env = process.env, fetch = globalThis.fetch, scanOptions = {}, onChange = () => {} } = {}) {
  const review = { all: [], filter: "review", cursor: 0, scannedAt: null, roots: [], notes: [], scanning: null, undo: [], dirty: false };
  const state = { rows: [], screen: "list", cursor: 0, field: 0, edit: null, confirm: null, status: notice ? { text: notice, kind: "ok" } : null, base: null, sort: "priority", order: [], grab: null, review };
  const pending = new Set();

  const flash = (text, kind = "info") => { state.status = { text, kind }; };
  const track = (promise) => {
    const tracked = promise.catch((error) => flash(error.message, "error")).finally(() => { pending.delete(tracked); onChange(); });
    pending.add(tracked);
    return tracked;
  };
  // Puts the rows in the chosen order and keeps the cursor on the same project, wherever it lands.
  const resort = (id = state.rows[state.cursor]?.id) => {
    state.rows = sortRows(state.rows, state.sort, state.order);
    state.cursor = Math.max(state.rows.findIndex((row) => row.id === id), 0);
  };
  const replaceRow = (row) => {
    const index = state.rows.findIndex((existing) => existing.id === row.id);
    if (index < 0) return;
    state.rows[index] = row;
    resort();
  };

  // Grades in the background; the list shows "grading" until the report arrives.
  const grade = (row) => track(gradeRow(row, { offline, fetch }).then((graded) => replaceRow({ ...graded, grading: false }), (error) => replaceRow({ ...row, grading: false, note: error.message })));

  // Lists the projects at once, then opens and grades each in the background.
  async function load() {
    const { base, entries, ignored } = await loadEntries(configFile, env);
    const selected = state.rows[state.cursor]?.id;
    state.base = base;
    state.order = entries.map((entry) => entry.id);
    state.rows = entries.map((entry) => ({ id: entry.id, entry, gap: [], target: null, grading: false, note: "loading" }));
    resort(selected);
    const repeats = Object.entries(ignored);
    if (repeats.length) flash(`Ignoring ${repeats.map(([id, kept]) => `${id} (same folder as ${kept})`).join(", ")}`);
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
    const { base, entries } = await loadEntries(configFile, env);
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

  // Moves the displayed row to where another displayed row is; the file is written first, so the list never disagrees with it.
  async function shift(from, to) {
    const row = state.rows[from];
    to = Math.max(Math.min(to, state.rows.length - 1), 0);
    if (to === from) return row;
    if (!(await moveProjectTo(configFile, row.id, state.rows[to].id))) return null;
    state.rows.splice(to, 0, state.rows.splice(from, 1)[0]);
    state.order = state.rows.map((existing) => existing.id);
    state.cursor = to;
    return row;
  }

  // A picked-up project moves in portfolio.json as the arrow keys are pressed; every step is already saved.
  async function grabKey(key) {
    const at = state.rows.findIndex((row) => row.id === state.grab.id);
    const name = key.name === "char" ? key.text : key.name;
    const target = { up: at - 1, k: at - 1, down: at + 1, j: at + 1, pageup: at - 10, pagedown: at + 10, home: 0, g: 0, end: Infinity, G: Infinity }[name];
    if (target !== undefined) return void await shift(at, target);
    if (name === "escape" || name === "ctrl-c") {
      await shift(at, state.grab.start);
      state.grab = null;
      return flash("Put back where it was");
    }
    if (name === "m" || name === "enter" || name === " ") {
      const row = state.rows[at];
      state.grab = null;
      return flash(`Dropped ${titleOf(row)} at position ${at + 1}`, "ok");
    }
  }

  // The review queue: what the last scan found, with today's decisions applied.
  const shown = () => visible(review);
  const reviewing = () => shown()[review.cursor];

  function showReview(result) {
    const id = reviewing()?.id;
    Object.assign(review, { all: result.candidates, scannedAt: result.scannedAt, roots: result.roots ?? [], notes: result.notes ?? review.notes });
    const at = shown().findIndex((candidate) => candidate.id === id);
    review.cursor = at >= 0 ? at : Math.min(review.cursor, Math.max(shown().length - 1, 0));
  }

  async function rescan() {
    if (review.scanning) return;
    review.scanning = { phase: "folders", done: 0, total: 0 };
    onChange();
    try {
      const { notes } = await discover(configFile, { env, ...scanOptions, onProgress: (progress) => { review.scanning = progress; onChange(); } });
      review.notes = notes;
      showReview(await reviewList(configFile, { env }));
      const waiting = review.all.filter((candidate) => candidate.status === "review").length;
      flash(`Found ${review.all.length} projects, ${waiting} to review${notes.length ? `. ${notes[0]}` : ""}`, notes.length ? "info" : "ok");
    } catch (error) {
      flash(error.message, "error");
    } finally {
      review.scanning = null;
    }
  }

  // Asks where projects live. Nothing is guessed: the home folders that hold projects are offered by number,
  // and any path can be typed instead.
  async function rootsPrompt() {
    const suggestions = await suggestRoots(env.HOME || undefined);
    const text = review.roots.join(", ");
    state.edit = {
      label: "Where do your projects live?", text, pos: text.length, error: null,
      help: "Type a folder, like ~/code or /work/src, or a number from the list. Separate several with commas. Each project is a folder in one of them, or in a folder inside one (category/project). GitHub is scanned too when gh is logged in.",
      extra: suggestions.length ? ["Found in your home folder:", ...suggestions.slice(0, 9).map((suggestion, i) => `${i + 1}  ${suggestion.path}  ${suggestion.count} project${suggestion.count === 1 ? "" : "s"}`)] : ["No project folders found in your home folder, so type a path."],
      submit: async (typed) => {
        const roots = [];
        for (const token of typed.split(",").map((root) => root.trim()).filter(Boolean)) {
          const picked = /^\d+$/.test(token) ? suggestions[Number(token) - 1] : null;
          if (/^\d+$/.test(token) && !picked) return `There is no number ${token} in the list`;
          roots.push(picked ? picked.path : token);
        }
        if (!roots.length) return "Type a folder or a number from the list";
        const { errors } = await setRoots(configFile, roots);
        if (errors.length) return errors[0];
        review.roots = roots;
        track(rescan());
        return null;
      },
    };
  }

  async function openReview() {
    state.screen = "review";
    const config = await loadPortfolio(configFile);
    review.roots = config.roots ?? [];
    if (!review.roots.length) return rootsPrompt();
    const cached = await reviewList(configFile, { env });
    if (cached) showReview(cached);
    else track(rescan());
  }

  function leaveReview() {
    state.screen = "list";
    state.status = null;
    if (review.dirty) { review.dirty = false; track(load()); }
  }

  // Records a decision on one candidate. In a filtered view it leaves the list and the next one slides up.
  function settle(candidate, status, entry = null) {
    const at = review.all.findIndex((other) => other.id === candidate.id);
    review.all[at] = { ...candidate, status, entry };
    if (status === "included" || candidate.status === "included") review.dirty = true;
    if (review.filter === "all") review.cursor = Math.min(review.cursor + 1, review.all.length - 1);
    else review.cursor = Math.min(review.cursor, Math.max(shown().length - 1, 0));
  }

  const priorities = { 1: "high", 2: "mid", 3: "low" };

  async function includeCandidate(priority = null) {
    const candidate = reviewing();
    if (!candidate) return;
    if (candidate.status === "included") return flash("Already in the portfolio", "error");
    const { id, error } = await addProject(configFile, candidate.path ?? "", { cwd, env, id: candidate.id, repo: candidate.repo ?? undefined, priority });
    if (error) return flash(error, "error");
    review.undo.push({ id, action: "include", wasIgnored: candidate.status === "ignored" });
    settle(candidate, "included", { id, priority });
    flash(`Added ${id}${priority ? ` with ${priority} priority` : ""}`, "ok");
  }

  async function toggleIgnore() {
    const candidate = reviewing();
    if (!candidate) return;
    if (candidate.status === "included") return flash("In the portfolio already. Remove it from the portfolio list (tab, then d) first.", "error");
    const ignoring = candidate.status !== "ignored";
    await (ignoring ? ignoreProjects : unignoreProjects)(configFile, [candidate.id]);
    review.undo.push({ id: candidate.id, action: ignoring ? "ignore" : "unignore" });
    settle(candidate, ignoring ? "ignored" : "review");
    flash(ignoring ? `Ignored ${candidate.id}` : `${candidate.id} is back in the queue`, "ok");
  }

  async function undoDecision() {
    const last = review.undo.pop();
    if (!last) return flash("Nothing to undo");
    const candidate = review.all.find((other) => other.id === last.id);
    if (last.action === "include") {
      await removeProject(configFile, last.id);
      if (last.wasIgnored) await ignoreProjects(configFile, [last.id]);
    } else {
      await (last.action === "ignore" ? unignoreProjects : ignoreProjects)(configFile, [last.id]);
    }
    const status = last.action === "include" ? (last.wasIgnored ? "ignored" : "review") : last.action === "ignore" ? "review" : "ignored";
    const keep = review.cursor;
    settle(candidate, status);
    const at = shown().findIndex((other) => other.id === last.id);
    review.cursor = at >= 0 ? at : keep;
    flash(`Undid ${last.action} of ${last.id}`, "ok");
  }

  async function reviewKey(key) {
    const move = (to) => { review.cursor = Math.max(Math.min(to, shown().length - 1), 0); };
    const name = key.name === "char" ? key.text : key.name;
    switch (name) {
      case "up": case "k": return move(review.cursor - 1);
      case "down": case "j": return move(review.cursor + 1);
      case "pageup": return move(review.cursor - 10);
      case "pagedown": return move(review.cursor + 10);
      case "home": case "g": return move(0);
      case "end": case "G": return move(shown().length - 1);
      case "i": return includeCandidate();
      case "1": case "2": case "3": return includeCandidate(priorities[name]);
      case "x": return toggleIgnore();
      case "u": return undoDecision();
      case "f": {
        review.filter = reviewFilters[(reviewFilters.indexOf(review.filter) + 1) % reviewFilters.length];
        review.cursor = 0;
        return;
      }
      case "r": if (!review.roots.length) return rootsPrompt(); flash("Scanning"); track(rescan()); return;
      case "R": return rootsPrompt();
      case "tab": case "escape": case "backspace": return leaveReview();
      case "q": state.quit = true; return;
      default:
    }
  }

  async function listKey(key) {
    if (state.grab) return grabKey(key);
    const move = (to) => { state.cursor = Math.max(Math.min(to, state.rows.length - 1), 0); };
    switch (key.name === "char" ? key.text : key.name) {
      case "a": return addPrompt();
      case "tab": return openReview();
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
      case "s": {
        const modes = Object.keys(sorts);
        state.sort = modes[(modes.indexOf(state.sort) + 1) % modes.length];
        resort();
        return flash(`Sorted by ${sorts[state.sort]}`, "ok");
      }
      case "J": case "K": {
        if (state.sort !== "order") return flash("Press s until it says portfolio.json order, then reorder", "error");
        const delta = key.text === "J" ? 1 : -1;
        const row = await shift(state.cursor, state.cursor + delta);
        return row && flash(`Moved ${titleOf(row)} to position ${state.cursor + 1}`, "ok");
      }
      case "m": {
        const row = current();
        if (!row) return;
        state.sort = "order";
        resort();
        state.grab = { id: row.id, start: state.cursor };
        return;
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
          else if (state.screen === "review") await reviewKey(next);
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

  return { state, load, offerHere, openReview, key, idle, render: (size) => render(state, configFile, size) };
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
  for (const line of edit.extra ?? []) lines.push(`   ${line}`);
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
    stage: Math.max(...rows.map((row) => (stageOf(row) ?? "-").length), 5),
    name: Math.min(Math.max(...rows.map((row) => titleOf(row).length), 7), 28),
    kind: Math.max(...rows.map((row) => (row.report?.kind ?? "").length), 4),
  };
  const lines = [` ${bold("showcase")}  ${dim(`${home(configFile)} · ${rows.length} project${rows.length === 1 ? "" : "s"} · by ${sorts[state.sort]}`)}`, ""];
  lines.push(dim(` ${fit("TIER", 5)}${fit("GOAL", 5)}${fit("PRIO", widths.pri + 2)}${fit("STAGE", widths.stage + 2)}${fit("PROJECT", widths.name + 2)}${fit("KIND", widths.kind + 2)}GAP`));

  const room = Math.max(height - lines.length - 3, 1);
  const first = Math.min(Math.max(state.cursor - room + 1, 0), Math.max(rows.length - room, 0));
  rows.slice(first, first + room).forEach((row, offset) => {
    const selected = first + offset === state.cursor;
    const { report } = row;
    const tier = report ? tierLabel(report.tier) : dim(row.grading ? "…" : "-");
    const gap = report ? (row.gap.length ? row.gap.join(", ") : row.target ? "on target" : nextNeeds(report)) : (row.grading ? "grading" : row.note ?? "");
    const plain = [
      fit(report ? report.tier : row.grading ? "…" : "-", 5), fit(row.target ?? "-", 5), fit(row.entry.priority ?? "-", widths.pri + 2),
      fit(stageOf(row) ?? "-", widths.stage + 2), fit(titleOf(row), widths.name + 2), fit(report?.kind ?? "", widths.kind + 2), gap,
    ].join("");
    if (selected) return lines.push(inverse(fit(` ${plain}`, width)));
    const gapStyle = report && !row.gap.length ? green : row.gap.length ? yellow : dim;
    lines.push(` ${tier}${" ".repeat(4)}${cell(row.target ?? "-", 5, row.target ? (value) => value : dim)}${cell(row.entry.priority ?? "-", widths.pri + 2, row.entry.priority ? (value) => value : dim)}${cell(stageOf(row) ?? "-", widths.stage + 2, stageOf(row) ? (value) => value : dim)}${cell(titleOf(row), widths.name + 2, bold)}${cell(report?.kind ?? "", widths.kind + 2, dim)}${gapStyle(gap)}`);
  });
  if (first + room < rows.length) lines.push(dim(` ↓ ${rows.length - first - room} more`));
  if (state.grab) {
    lines.push("", ` ${yellow(`Moving ${titleOf(rows[state.cursor])}`)} ${dim("in portfolio.json order, which sorts projects of the same priority and tier on the site")}`);
    return { lines, cursor: null, footer: " ↑↓ move   pgup/pgdn jump 10   g/G top/bottom   m or enter drop   esc put back" };
  }
  return { lines, cursor: null, footer: " ↑↓ select   enter open   s sort   m move   a add   d remove   tab review   r refresh   q quit" };
}

// "3d", "5mo", "2y": how long ago, in the fewest characters.
export function ago(iso, now = Date.now()) {
  if (!iso) return "-";
  const days = Math.max(Math.floor((now - Date.parse(iso)) / 86_400_000), 0);
  if (days < 1) return "today";
  if (days < 60) return `${days}d`;
  return days < 700 ? `${Math.round(days / 30)}mo` : `${Math.round(days / 365)}y`;
}

const sourceLabel = { local: "local", both: "both", github: "github" };

function reviewScreen(state, configFile, width, height) {
  const { review } = state;
  const rows = visible(review);
  const counts = Object.fromEntries(reviewFilters.map((name) => [name, name === "all" ? review.all.length : review.all.filter((candidate) => candidate.status === name).length]));
  const tabs = reviewFilters.map((name) => name === review.filter ? inverse(` ${filterNames[name]} ${counts[name]} `) : dim(` ${filterNames[name]} ${counts[name]} `)).join(" ");
  const progress = review.scanning ? yellow(review.scanning.phase === "github" ? "asking GitHub" : `scanning folders ${review.scanning.done}/${review.scanning.total}`) : dim(review.scannedAt ? `scanned ${ago(review.scannedAt) === "today" ? "today" : `${ago(review.scannedAt)} ago`}` : "not scanned yet");
  const lines = [` ${bold("showcase")}  ${dim("review")}  ${progress}${review.roots.length ? dim(`  ${review.roots.join(", ")}`) : ""}`, ` ${tabs}`, ""];

  const busy = state.edit ? 14 : state.confirm ? 2 : 0;
  const previewHeight = busy ? 0 : 8;
  const room = Math.max(height - lines.length - 3 - previewHeight - busy - 1, 3);
  const first = Math.min(Math.max(review.cursor - room + 1, 0), Math.max(rows.length - room, 0));
  const name = Math.min(Math.max(...rows.map((row) => row.id.replace(/^local:/, "").length), 7), 34);
  if (rows.length) lines.push(dim(` ${fit("SCORE", 7)}${fit("PROJECT", name + 2)}${fit("SOURCE", 8)}${fit("ACTIVE", 8)}SIGNALS`));
  rows.slice(first, first + room).forEach((row, offset) => {
    const label = row.id.replace(/^local:/, "");
    const signals = row.status === "included" ? `in portfolio${row.entry?.priority ? `, ${row.entry.priority}` : ""}` : row.status === "ignored" && review.filter === "all" ? "ignored" : row.reasons.join(", ");
    const fixed = 7 + name + 2 + 16 + 1;
    const plain = `${fit(row.score, 7)}${fit(label, name + 2)}${fit(sourceLabel[row.source], 8)}${fit(ago(row.lastActive), 8)}${fit(signals, Math.max(width - fixed, 10)).trimEnd()}`;
    if (first + offset === review.cursor) return lines.push(inverse(fit(` ${plain}`, width)));
    const style = row.status === "included" ? green : row.status === "ignored" ? dim : (value) => value;
    lines.push(` ${dim(fit(row.score, 7))}${style(fit(label, name + 2))}${dim(fit(sourceLabel[row.source], 8))}${dim(fit(ago(row.lastActive), 8))}${dim(plain.slice(fixed - 1))}`);
  });
  if (!rows.length) {
    const hint = !review.all.length ? (review.scanning ? "Looking…" : review.roots.length ? "Nothing found. Press R to change the folders, r to scan again." : "Press R to choose the folders to scan.") : review.filter === "review" ? "Nothing left to review." : "Nothing here yet.";
    lines.push(` ${hint}`);
  }
  if (first + room < rows.length) lines.push(dim(` ↓ ${rows.length - first - room} more`));

  const pick = rows[review.cursor];
  if (pick && !busy) {
    while (lines.length < height - 3 - previewHeight) lines.push("");
    lines.push(dim(` ${"─".repeat(Math.max(width - 2, 1))}`));
    const facts = [pick.language, pick.stars ? `★ ${pick.stars}` : null, pick.commits ? `${pick.commits} commits` : null, pick.readme ? `README ${pick.readmeWords} words` : null, pick.private ? "private" : null, pick.archived ? "archived" : null, pick.fork ? "fork" : null].filter(Boolean);
    lines.push(` ${bold(pick.name)}  ${dim(pick.dir ? home(pick.dir) : pick.repo)}`);
    if (pick.description) for (const [start, end] of wrap(pick.description, Math.max(width - 4, 10)).slice(0, 2)) lines.push(`   ${pick.description.slice(start, end)}`);
    if (facts.length) lines.push(dim(`   ${facts.join(" · ")}`));
    const link = pick.homepage ?? pick.liveUrl;
    if (link) lines.push(`   ${dim("live")} ${link}`);
    if (pick.repo && pick.dir) lines.push(`   ${dim("repo")} ${pick.repo}`);
  }
  return { lines, cursor: null, footer: " ↑↓ select   i include   1 2 3 high mid low   x ignore   u undo   f filter   r rescan   R folders   tab portfolio   q quit" };
}

// The goal comes from the portfolio priority; a ceiling in showcase.json can only lower it, never raise it.
function goalSource(priority, ceiling) {
  const base = targetTier(priority);
  const capped = ceiling && targetTier(priority, ceiling) !== base;
  return capped ? `${priority} priority would aim for ${base}, capped by ceiling ${ceiling}` : `${priority} priority${ceiling ? `, ceiling ${ceiling} does not lower it` : ""}`;
}

function detailScreen(state, width, height) {
  const row = state.rows[state.cursor];
  const { report } = row;
  const lines = [` ${bold(titleOf(row))}  ${report ? `${tierLabel(report.tier)}${row.target ? ` → ${tierLabel(row.target)}` : ""}  ${dim(report.kind)}` : dim(row.grading ? "grading…" : "not graded")}`];
  lines.push(dim(` ${row.root ? home(row.root) : row.note ?? row.id}`));
  if (report) lines.push(row.gap.length ? ` ${yellow("gap")} ${row.gap.join(", ")}` : row.target ? ` ${green("on target")}` : dim(" no priority set, so no target"));
  if (report && row.target) lines.push(dim(` goal ${row.target}: ${goalSource(row.entry.priority, report.ceiling)}`));
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
  if (state.screen === "review") {
    screen = reviewScreen(state, configFile, width, height);
  } else if (state.rows.length === 0) {
    screen = { lines: [` ${bold("showcase")}  ${dim(home(configFile))}`, "", " No projects in this portfolio yet.", dim(" Press tab to find projects to review, or a to add one by path.")], cursor: null, footer: " tab review   a add   q quit" };
  } else {
    screen = state.screen === "detail" ? detailScreen(state, width, height) : listScreen(state, configFile, width, height);
  }
  if (state.screen === "list" || state.screen === "review" || state.rows.length === 0) {
    if (state.edit) {
      const box = editorLines(state.edit, width);
      screen.cursor = { row: screen.lines.length + 1 + box.cursor.row, col: box.cursor.col };
      screen.lines.push("", ...box.lines);
      screen.footer = " enter save   esc cancel";
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
  let fresh = false;
  if (configFile) {
    configFile = path.resolve(cwd, configFile);
    await loadEntries(configFile);
    notice = `Using ${home(configFile)}.`;
  } else {
    const found = await findConfig({ cwd, env: process.env });
    configFile = found.file;
    if (!found.exists) {
      const count = await createConfig(configFile, cwd);
      fresh = true;
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
    if (fresh || app.state.rows.length === 0) await app.openReview();
    else await app.offerHere();
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
