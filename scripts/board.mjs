#!/usr/bin/env node
// Keeps the GitHub Project board in sync with BMAD.
//
//   node scripts/board.mjs sync                  Mirror sprint-status.yaml stories onto the board
//   node scripts/board.mjs status <issue> <col>  Move one issue (e.g. a planning card) to a column
//
// Uses the local `gh` login; no tokens are read or stored here.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "Snowstar66";
const REPO = "Snowstar66/matkoll";
const PROJECT_NUMBER = "1";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SPRINT_STATUS = join(ROOT, "_bmad-output/implementation-artifacts/sprint-status.yaml");
const PLANNING_DIR = join(ROOT, "_bmad-output/planning-artifacts");
const IMPLEMENTATION_DIR = join(ROOT, "_bmad-output/implementation-artifacts");
const BLOB = `https://github.com/${REPO}/blob/main`;

// BMAD story status -> board column
const COLUMN_FOR_STATUS = {
  backlog: "Backlog",
  "ready-for-dev": "Redo",
  "in-progress": "Pågår",
  review: "Granskas",
  done: "Klar",
};

function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function ghJson(...args) {
  return JSON.parse(gh(...args));
}

function loadProject() {
  const fields = ghJson("project", "field-list", PROJECT_NUMBER, "--owner", OWNER, "--format", "json").fields;
  const field = (name) => {
    const f = fields.find((x) => x.name === name);
    if (!f) throw new Error(`Board field "${name}" not found`);
    return { id: f.id, options: Object.fromEntries(f.options.map((o) => [o.name, o.id])) };
  };
  const projectId = ghJson("project", "view", PROJECT_NUMBER, "--owner", OWNER, "--format", "json").id;
  const items = ghJson("project", "item-list", PROJECT_NUMBER, "--owner", OWNER, "--limit", "500", "--format", "json").items;
  const itemByIssue = new Map(items.filter((i) => i.content?.number).map((i) => [i.content.number, i]));
  return { projectId, status: field("Status"), epic: field("Epic"), itemByIssue };
}

function ensureItem(project, issueNumber) {
  const existing = project.itemByIssue.get(issueNumber);
  if (existing) return existing;
  const url = `https://github.com/${REPO}/issues/${issueNumber}`;
  const item = ghJson("project", "item-add", PROJECT_NUMBER, "--owner", OWNER, "--url", url, "--format", "json");
  project.itemByIssue.set(issueNumber, item);
  return item;
}

function setSelect(project, item, field, optionName, current) {
  if (current === optionName) return false;
  const optionId = field.options[optionName];
  if (!optionId) throw new Error(`Unknown board option "${optionName}"`);
  gh("project", "item-edit", "--id", item.id, "--project-id", project.projectId,
    "--field-id", field.id, "--single-select-option-id", optionId);
  return true;
}

function setIssueState(issueNumber, column, currentState) {
  const wantClosed = column === "Klar";
  if (wantClosed && currentState !== "CLOSED") gh("issue", "close", String(issueNumber), "--repo", REPO, "--reason", "completed");
  if (!wantClosed && currentState === "CLOSED") gh("issue", "reopen", String(issueNumber), "--repo", REPO);
}

function moveIssue(project, issueNumber, column) {
  const item = ensureItem(project, issueNumber);
  const changed = setSelect(project, item, project.status, column, item.status);
  const state = ghJson("issue", "view", String(issueNumber), "--repo", REPO, "--json", "state").state;
  setIssueState(issueNumber, column, state);
  return changed;
}

// Stories are built on epic and story branches in parallel, so the local file alone lags behind.
// Read sprint-status.yaml from the checkout and every origin epic/story branch, and keep each story's most advanced status.
const STATUS_ORDER = Object.keys(COLUMN_FOR_STATUS);

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// A branch already merged into main is history: main (or a later branch) has its final state.
function isMerged(ref) {
  try {
    git("merge-base", "--is-ancestor", ref, "refs/remotes/origin/main");
    return true;
  } catch {
    return false;
  }
}

function sprintStatusTexts() {
  if (!existsSync(SPRINT_STATUS)) throw new Error(`Missing ${SPRINT_STATUS} – run sprint planning first`);
  const texts = [readFileSync(SPRINT_STATUS, "utf8")];
  const path = relative(ROOT, SPRINT_STATUS);
  try {
    git("fetch", "--quiet", "origin");
  } catch {
    // Offline: the refs we already have are still better than the local file alone.
  }
  const refs = git("for-each-ref", "--format=%(refname)", "refs/remotes/origin/main", "refs/remotes/origin/epic", "refs/remotes/origin/story")
    .split("\n").filter(Boolean);
  for (const ref of refs.filter((r) => r.endsWith("/main") || !isMerged(r))) {
    try {
      texts.push(git("show", `${ref}:${path}`));
    } catch {
      // The branch predates sprint-status.yaml.
    }
  }
  return texts;
}

function readStoryStatuses() {
  const best = new Map();
  for (const text of sprintStatusTexts()) {
    for (const story of parseStoryStatuses(text)) {
      const seen = best.get(story.key);
      if (!seen || STATUS_ORDER.indexOf(story.status) > STATUS_ORDER.indexOf(seen.status)) best.set(story.key, story);
    }
  }
  return [...best.values()].sort((a, b) => a.epic - b.epic || a.num - b.num);
}

// sprint-status.yaml is flat `key: value` lines under development_status:, so a full YAML parser is not needed.
function parseStoryStatuses(text) {
  const stories = [];
  let inSection = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (/^development_status:\s*$/.test(line)) { inSection = true; continue; }
    if (inSection && /^\S/.test(line)) inSection = false;
    if (!inSection) continue;
    const m = line.match(/^\s+([\p{L}\p{N}_-]+):\s*([\w-]+)\s*$/u);
    if (!m) continue;
    const [, key, status] = m;
    const story = key.match(/^(\d+)-(\d+)-/);
    if (story) stories.push({ key, status, epic: Number(story[1]), num: Number(story[2]) });
  }
  return stories;
}

// Story sections come from the epics document(s): "### Story 1.2: Title" up to the next heading of the same or higher level.
function parseStorySections(text, file, sections) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^(#+)\s*Story\s+(\d+)\.(\d+):\s*(.+)$/);
    if (!m) return;
    const level = m[1].length;
    let end = lines.findIndex((l, j) => j > i && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= level);
    if (end === -1) end = lines.length;
    sections.set(`${m[2]}.${m[3]}`, {
      title: m[4].trim(),
      text: lines.slice(i + 1, end).join("\n").trim(),
      file,
    });
  });
}

// One source of planning docs: the local checkout, or an origin branch read through git.
function localSource() {
  const sections = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".md")) parseStorySections(readFileSync(p, "utf8"), relative(ROOT, p), sections);
    }
  };
  walk(PLANNING_DIR);
  const storyFiles = existsSync(IMPLEMENTATION_DIR) ? readdirSync(IMPLEMENTATION_DIR) : [];
  return { sections, storyFiles, blob: BLOB };
}

function branchSource(ref) {
  const sections = new Map();
  const files = (dir) => git("ls-tree", "-r", "--name-only", ref, "--", dir).split("\n").filter(Boolean);
  for (const file of files(relative(ROOT, PLANNING_DIR)).filter((f) => f.endsWith(".md"))) {
    parseStorySections(git("show", `${ref}:${file}`), file, sections);
  }
  const storyFiles = files(relative(ROOT, IMPLEMENTATION_DIR)).map((f) => f.split("/").pop());
  const branch = ref.replace(/^refs\/remotes\/origin\//, "");
  return { sections, storyFiles, blob: `https://github.com/${REPO}/blob/${branch}` };
}

// An epic's own branch holds its newest plan, so it wins over the checkout and main for that epic's stories.
function storySources() {
  const local = localSource();
  const epicRefs = git("for-each-ref", "--format=%(refname)", "refs/remotes/origin/epic").split("\n").filter(Boolean);
  const byEpic = new Map();
  // Epics are squash-merged, so an old epic branch never looks merged; only epics with an open PR count as active.
  const open = new Set(ghJson("pr", "list", "--repo", REPO, "--state", "open", "--json", "headRefName").map((p) => p.headRefName));
  for (const ref of epicRefs.filter((r) => open.has(r.replace(/^refs\/remotes\/origin\//, "")))) {
    const m = ref.match(/\/epic\/(\d+)-/);
    if (m) byEpic.set(Number(m[1]), ref);
  }
  const cache = new Map();
  return (epic) => {
    const ref = byEpic.get(epic);
    if (!ref) return [local];
    if (!cache.has(ref)) cache.set(ref, branchSource(ref));
    return [cache.get(ref), local];
  };
}

function storyBody(s, sourcesFor) {
  const sources = sourcesFor(s.epic);
  const source = sources.find((src) => src.sections.has(`${s.epic}.${s.num}`)) ?? sources[0];
  const section = source.sections.get(`${s.epic}.${s.num}`);
  const parts = [];
  if (section?.text) parts.push(section.text);
  const links = [];
  if (section) links.push(`[Epics och stories](${source.blob}/${section.file})`);
  const storyFile = source.storyFiles.find((f) => f.startsWith(`${s.key}`) && f.endsWith(".md"));
  if (storyFile) links.push(`[Story-fil](${source.blob}/_bmad-output/implementation-artifacts/${storyFile})`);
  parts.push(`---\nStory \`${s.key}\` från BMAD.${links.length ? " " + links.join(" · ") : ""}`);
  parts.push(`<!-- bmad-story: ${s.key} -->`);
  return { body: parts.join("\n\n"), section };
}

function epicOption(project, epicNumber) {
  return Object.keys(project.epic.options).find((name) => name.startsWith(`${epicNumber} `));
}

function sync() {
  const project = loadProject();
  const stories = readStoryStatuses();
  const sourcesFor = storySources();
  const issues = ghJson("issue", "list", "--repo", REPO, "--label", "story", "--state", "all",
    "--limit", "500", "--json", "number,body,state,stateReason");
  const issueByKey = new Map();
  for (const issue of issues) {
    const m = issue.body?.match(/<!-- bmad-story: ([\p{L}\p{N}_-]+) -->/u);
    if (m) issueByKey.set(m[1], issue);
  }

  const log = [];
  for (const s of stories) {
    const column = COLUMN_FOR_STATUS[s.status];
    if (!column) { log.push(`? ${s.key}: unknown status "${s.status}", skipped`); continue; }
    let issue = issueByKey.get(s.key);
    // A card closed as not planned was replaced by a new plan; stale branches must not reopen it.
    if (issue?.stateReason === "NOT_PLANNED") continue;
    const { body, section } = storyBody(s, sourcesFor);
    if (!issue) {
      const title = `${s.epic}.${s.num} ${section?.title ?? s.key}`;
      const url = gh("issue", "create", "--repo", REPO, "--title", title, "--label", "story", "--body", body);
      issue = { number: Number(url.split("/").pop()), state: "OPEN" };
      log.push(`+ ${title}`);
    } else if (section && issue.body.trim() !== body) {
      gh("issue", "edit", String(issue.number), "--repo", REPO, "--body", body);
      log.push(`✎ #${issue.number} ${s.key}: description updated`);
    }
    const item = ensureItem(project, issue.number);
    const epicName = epicOption(project, s.epic);
    if (epicName) setSelect(project, item, project.epic, epicName, item.epic);
    if (setSelect(project, item, project.status, column, item.status)) log.push(`→ #${issue.number} ${s.key}: ${column}`);
    setIssueState(issue.number, column, issue.state);
  }
  console.log(log.length ? log.join("\n") : "Board already in sync.");
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "sync") {
  sync();
} else if (cmd === "status" && args.length === 2) {
  const column = args[1];
  const project = loadProject();
  if (!project.status.options[column]) throw new Error(`Column must be one of: ${Object.keys(project.status.options).join(", ")}`);
  moveIssue(project, Number(args[0]), column);
  console.log(`#${args[0]} → ${column}`);
} else {
  console.error("Usage: node scripts/board.mjs sync | status <issue> <column>");
  process.exit(1);
}
