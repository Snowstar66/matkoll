#!/usr/bin/env node
// Keeps the GitHub Project board in sync with BMAD.
//
//   node scripts/board.mjs sync                  Mirror sprint-status.yaml stories onto the board
//   node scripts/board.mjs status <issue> <col>  Move one issue (e.g. a planning card) to a column
//
// Uses the local `gh` login; no tokens are read or stored here.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OWNER = "Snowstar66";
const REPO = "Snowstar66/matkoll";
const PROJECT_NUMBER = "1";
const ROOT = new URL("..", import.meta.url).pathname;
const SPRINT_STATUS = join(ROOT, "_bmad-output/implementation-artifacts/sprint-status.yaml");
const PLANNING_DIR = join(ROOT, "_bmad-output/planning-artifacts");

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

// sprint-status.yaml is flat `key: value` lines under development_status:, so a full YAML parser is not needed.
function readStoryStatuses() {
  if (!existsSync(SPRINT_STATUS)) throw new Error(`Missing ${SPRINT_STATUS} – run sprint planning first`);
  const stories = [];
  let inSection = false;
  for (const raw of readFileSync(SPRINT_STATUS, "utf8").split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (/^development_status:\s*$/.test(line)) { inSection = true; continue; }
    if (inSection && /^\S/.test(line)) inSection = false;
    if (!inSection) continue;
    const m = line.match(/^\s+([\w-]+):\s*([\w-]+)\s*$/);
    if (!m) continue;
    const [, key, status] = m;
    const story = key.match(/^(\d+)-(\d+)-/);
    if (story) stories.push({ key, status, epic: Number(story[1]), num: Number(story[2]) });
  }
  return stories;
}

// Story titles come from the epics document(s): "### Story 1.2: Title".
function readStoryTitles() {
  const titles = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".md")) {
        for (const m of readFileSync(p, "utf8").matchAll(/^#+\s*Story\s+(\d+)\.(\d+):\s*(.+)$/gm)) {
          titles.set(`${m[1]}.${m[2]}`, m[3].trim());
        }
      }
    }
  };
  walk(PLANNING_DIR);
  return titles;
}

function epicOption(project, epicNumber) {
  return Object.keys(project.epic.options).find((name) => name.startsWith(`${epicNumber} `));
}

function sync() {
  const project = loadProject();
  const stories = readStoryStatuses();
  const titles = readStoryTitles();
  const issues = ghJson("issue", "list", "--repo", REPO, "--label", "story", "--state", "all",
    "--limit", "500", "--json", "number,body,state");
  const issueByKey = new Map();
  for (const issue of issues) {
    const m = issue.body?.match(/<!-- bmad-story: ([\w-]+) -->/);
    if (m) issueByKey.set(m[1], issue);
  }

  const log = [];
  for (const s of stories) {
    const column = COLUMN_FOR_STATUS[s.status];
    if (!column) { log.push(`? ${s.key}: unknown status "${s.status}", skipped`); continue; }
    let issue = issueByKey.get(s.key);
    if (!issue) {
      const title = `${s.epic}.${s.num} ${titles.get(`${s.epic}.${s.num}`) ?? s.key}`;
      const body = `Story \`${s.key}\` från BMAD.\n\nDetaljer: \`_bmad-output/planning-artifacts/\` och story-filen när den skapats.\n\n<!-- bmad-story: ${s.key} -->`;
      const url = gh("issue", "create", "--repo", REPO, "--title", title, "--label", "story", "--body", body);
      issue = { number: Number(url.split("/").pop()), state: "OPEN" };
      log.push(`+ ${title}`);
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
