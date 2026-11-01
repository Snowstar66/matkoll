import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// Guards .github/workflows/offers.yml (Story 17.11): the offers fetch every
// morning and on Sunday evening, off until CLOUD_ENABLED, red when a secret is missing. The
// workflow cannot run here, so its shape is checked as text, and the check
// step's script is run with bash for every case (as backup-workflow.test.ts does).

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");

const workflow = read(".github/workflows/offers.yml");
const ci = read(".github/workflows/ci.yml");
const lines = workflow.split("\n");
const secretNames = ["SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY"];

/** The lines of a top-level block such as `on:`. */
function topLevelBlock(key: string): string[] {
  const start = lines.indexOf(`${key}:`);
  expect(start, `${key}: at the top level`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
}

/** The job's steps, each from its `- ` line to the next one, indented as the first line. */
function steps(): string[][] {
  const start = lines.indexOf("    steps:");
  expect(start).toBeGreaterThanOrEqual(0);
  const all: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {6}- /.test(line)) all.push([line.replace(/^ {6}- /, "        ")]);
    else if (/^ {0,5}\S/.test(line)) break;
    else all.at(-1)?.push(line);
  }
  return all;
}

/** The lines under `run: |` of a step, unindented. */
function runOf(step: string[]): string {
  const start = step.findIndex((line) => line === "        run: |");
  return step
    .slice(start + 1)
    .map((line) => line.slice(10))
    .join("\n")
    .trimEnd();
}

const all = steps();
const check = all[0];
const tmp = mkdtempSync(join(tmpdir(), "offers-check-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function runCheck(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmp, "run-"));
  const script = join(dir, "check.sh");
  const summary = join(dir, "summary");
  writeFileSync(script, `${runOf(check)}\n`);
  writeFileSync(summary, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", script], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GITHUB_STEP_SUMMARY: summary,
      NODE_ENV: "test",
      // GitHub passes an unset secret as an empty string.
      ...Object.fromEntries(secretNames.map((name) => [name, env[name] ?? ""])),
    },
  });
  return { status: result.status, stdout: result.stdout, summary: readFileSync(summary, "utf8") };
}

const allSecrets = { SUPABASE_PROJECT_REF: "abcdefghijklmnop", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" };

describe("offers.yml", () => {
  it("runs every morning, on Sunday evening and by hand, only on main with CLOUD_ENABLED, never on pushes or pull requests", () => {
    const on = topLevelBlock("on");
    const crons = on.map((line) => line.match(/^\s+- cron: "(.+)"$/)?.[1]).filter(Boolean);
    expect(crons).toEqual(["0 4 * * *", "0 19 * * 0"]);
    expect(on).toContain("  workflow_dispatch:");
    expect(on.join("\n")).not.toMatch(/pull_request|push:/);
    expect(lines).toContain("    if: github.ref == 'refs/heads/main' && vars.CLOUD_ENABLED == 'true'");
  });

  it("may only read the repository, and never runs twice at once", () => {
    expect(topLevelBlock("permissions")).toEqual(["  contents: read"]);
    expect(workflow).not.toMatch(/: write\b/);
    expect(topLevelBlock("concurrency")).toEqual(["  group: offers", "  cancel-in-progress: false"]);
  });

  it("installs like ci.yml: the same actions and versions, Node 24 and a frozen lockfile", () => {
    const ciRefs = new Map([...ci.matchAll(/uses: ([\w./-]+)@(\S+)/g)].map((match) => [match[1], match[2]]));
    const uses = [...workflow.matchAll(/uses: ([\w./-]+)@(\S+)/g)].map((match) => [match[1], match[2]]);
    expect(uses.map(([action]) => action)).toEqual(["actions/checkout", "pnpm/action-setup", "actions/setup-node"]);
    for (const [action, version] of uses) expect(version, `${action} as in ci.yml`).toBe(ciRefs.get(action));
    expect(workflow).toContain("          node-version: 24");
    expect(workflow).toContain("      - run: pnpm install --frozen-lockfile");
    expect(workflow).toContain("          persist-credentials: false");
    expect(workflow).toMatch(/^ {10}pnpm offers:fetch$/m);
    const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["offers:fetch"]).toMatch(/scripts\/fetch-offers\.ts$/);
    // It touches every user's stores, so it never picks up a local .env.local by itself.
    expect(packageJson.scripts["offers:fetch"]).not.toMatch(/env-file/);
  });

  it("checks the secrets first, and reads them only through env, never printing them", () => {
    expect(check[0]).toBe("        name: Check the secrets");
    const secretLines = lines.filter((line) => /\bsecrets\./.test(line));
    expect(secretLines.length).toBe(secretNames.length * 2);
    for (const line of secretLines) {
      const match = line.match(/^ {10}(\w+): \$\{\{ secrets\.(\w+) \}\}$/);
      expect(match, line).not.toBeNull();
      expect(match![1]).toBe(match![2]);
      expect(secretNames).toContain(match![1]);
    }
    expect(workflow).not.toMatch(/echo[^\n]*\$(\{)?SUPABASE_(SERVICE_ROLE|PUBLISHABLE)_KEY/);
    expect(workflow).not.toMatch(/set -x/);
  });

  it("passes with every secret", () => {
    const result = runCheck(allSecrets);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it.each(secretNames)("fails clearly without %s, naming it", (name) => {
    const result = runCheck({ ...allSecrets, [name]: "" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`::error title=Erbjudanden::CLOUD_ENABLED är på men hemligheterna saknas: ${name}. Se docs/molnet.md.`);
    expect(result.summary).toContain(name);
    expect(result.stdout).not.toContain("sb_secret_x");
  });

  it("refuses a project ref that is an address", () => {
    const result = runCheck({ ...allSecrets, SUPABASE_PROJECT_REF: "https://abc.supabase.co" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("SUPABASE_PROJECT_REF ska vara projektets id");
  });
});
