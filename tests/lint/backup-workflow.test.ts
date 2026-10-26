import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// Guards .github/workflows/backup.yml (AD-23): the encrypted `supabase db dump`
// twice a week, skipped with a notice while the secrets are missing and failing
// once BACKUP_ENABLED is "true". The workflow cannot run here, so its shape is
// checked as text, and the check step's script is run with bash for every case.
// The file is small and written in one style, which the line-based reading
// below expects.

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");

const workflow = read(".github/workflows/backup.yml");
const ci = read(".github/workflows/ci.yml");
const lines = workflow.split("\n");

const secretNames = ["SUPABASE_DB_URL", "BACKUP_PASSPHRASE"] as const;
const ready = "steps.secrets.outputs.ready == 'true'";

type Step = {
  lines: string[];
  uses?: string;
  id?: string;
  if?: string;
  run: string[];
  env: Map<string, string>;
  with: Map<string, string>;
};

/** The lines of a top-level block such as `on:` or `permissions:`. */
function topLevelBlock(key: string): string[] {
  const start = lines.indexOf(`${key}:`);
  expect(start, `${key}: at the top level`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
}

/** The indented lines under `key:` (a block scalar or a mapping) inside a step. */
function nested(stepLines: string[], key: string): string[] {
  const start = stepLines.findIndex((line) => new RegExp(`^ {8}${key}:`).test(line));
  if (start === -1) return [];
  const body: string[] = [];
  for (const line of stepLines.slice(start + 1)) {
    if (line.trim() !== "" && !/^ {10}/.test(line)) break;
    body.push(line.slice(10));
  }
  // A block scalar keeps its inner blank lines but not the trailing ones.
  while (body.length > 0 && body.at(-1)!.trim() === "") body.pop();
  return body;
}

function mapping(stepLines: string[], key: string): Map<string, string> {
  return new Map(
    nested(stepLines, key)
      .map((line) => line.match(/^([\w-]+): (.+)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

function field(stepLines: string[], key: string): string | undefined {
  return stepLines.map((line) => line.match(new RegExp(`^ {8}${key}: (.+)$`))?.[1]).find(Boolean);
}

/** The backup job's steps, each from its `- ` line to the next one. */
function parseSteps(): Step[] {
  const start = lines.indexOf("    steps:");
  expect(start, "the job has steps").toBeGreaterThanOrEqual(0);
  const steps: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {6}- /.test(line)) steps.push([line.replace(/^ {6}- /, "        ")]);
    else if (/^ {0,5}\S/.test(line)) break;
    else steps.at(-1)?.push(line);
  }
  return steps.map((stepLines) => ({
    lines: stepLines,
    uses: field(stepLines, "uses"),
    id: field(stepLines, "id"),
    if: field(stepLines, "if"),
    run: nested(stepLines, "run"),
    env: mapping(stepLines, "env"),
    with: mapping(stepLines, "with"),
  }));
}

const steps = parseSteps();
const runLines = steps.flatMap((step) => step.run);
const runText = runLines.join("\n");
const checkStep = steps[0];
const dumpStep = steps.find((step) => step.id === "dump");
const dumpScript = dumpStep?.run.join("\n") ?? "";
/** The dump step's script with continuation lines joined. */
const dumpCommands = dumpScript.replace(/\\\n\s*/g, "");

const tmp = mkdtempSync(join(tmpdir(), "backup-check-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const strongPassphrase = "correct horse battery staple 0123";
const dbUrl = "postgresql://postgres.ref:p%40ss%2Fw0rd@pooler.example:5432/postgres";

/** Runs the check step's script like GitHub does (`bash -e`), with temporary output files. */
function runCheck(env: { SUPABASE_DB_URL?: string; BACKUP_PASSPHRASE?: string; BACKUP_ENABLED?: string }) {
  const dir = mkdtempSync(join(tmp, "run-"));
  const script = join(dir, "check.sh");
  const output = join(dir, "output");
  const summary = join(dir, "summary");
  writeFileSync(script, `${checkStep.run.join("\n")}\n`);
  writeFileSync(output, "");
  writeFileSync(summary, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", script], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      // GitHub passes an unset secret or variable as an empty string.
      SUPABASE_DB_URL: env.SUPABASE_DB_URL ?? "",
      BACKUP_PASSPHRASE: env.BACKUP_PASSPHRASE ?? "",
      BACKUP_ENABLED: env.BACKUP_ENABLED ?? "",
      NODE_ENV: "test",
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: readFileSync(output, "utf8"),
    summary: readFileSync(summary, "utf8"),
  };
}

describe("backup.yml", () => {
  it("runs twice a week and by hand, only on main, never on pushes or pull requests", () => {
    const on = topLevelBlock("on");
    const crons = on.map((line) => line.match(/^\s+- cron: "(.+)"$/)?.[1]).filter(Boolean);
    expect(crons).toEqual(["17 3 * * 1,4"]);
    expect(on).toContain("  workflow_dispatch:");
    expect(on.join("\n")).not.toMatch(/pull_request|push:/);
    expect(lines).toContain("    if: github.ref == 'refs/heads/main'");
  });

  it("may only read the repository", () => {
    expect(topLevelBlock("permissions")).toEqual(["  contents: read"]);
    expect(workflow).not.toMatch(/: write\b/);
  });

  it("pins the same actions on the same major versions as ci.yml", () => {
    const ciRefs = new Map([...ci.matchAll(/uses: ([\w./-]+)@(\S+)/g)].map((match) => [match[1], match[2]]));
    const uses = steps.map((step) => step.uses).filter(Boolean);
    expect(uses).toEqual(["actions/checkout@v7", "supabase/setup-cli@v3", "actions/upload-artifact@v7"]);
    for (const ref of uses) {
      const [action, version] = ref!.split("@");
      expect(version, ref).toMatch(/^v\d+$/);
      expect(version, `${action} as in ci.yml`).toBe(ciRefs.get(action));
    }
  });

  it("uses the Supabase CLI version of ci.yml and package.json", () => {
    const version = (text: string) => text.match(/^ {2}SUPABASE_CLI_VERSION: (\S+)$/m)?.[1];
    const packageJson = JSON.parse(read("package.json")) as { devDependencies: Record<string, string> };
    expect(version(workflow)).toBeDefined();
    expect(version(workflow)).toBe(version(ci));
    expect(version(workflow)).toBe(packageJson.devDependencies.supabase);
    const setup = steps.find((step) => step.uses?.startsWith("supabase/setup-cli@"));
    expect(setup?.with.get("version")).toBe("${{ env.SUPABASE_CLI_VERSION }}");
  });

  it("checks the secrets first, and every other step runs only when they are in order", () => {
    expect(checkStep.id).toBe("secrets");
    expect(checkStep.if).toBeUndefined();
    expect(checkStep.env).toEqual(
      new Map([
        ["SUPABASE_DB_URL", "${{ secrets.SUPABASE_DB_URL }}"],
        ["BACKUP_PASSPHRASE", "${{ secrets.BACKUP_PASSPHRASE }}"],
        ["BACKUP_ENABLED", "${{ vars.BACKUP_ENABLED }}"],
      ]),
    );
    const rest = steps.slice(1);
    expect(rest.length).toBeGreaterThan(0);
    for (const step of rest) expect(step.if, step.uses ?? step.id).toBe(ready);
  });

  it("reads the secrets only through env and never prints them", () => {
    const secretLines = lines.filter((line) => /\bsecrets\.(?!outputs\.)/.test(line));
    expect(secretLines.length).toBeGreaterThan(0);
    for (const line of secretLines) {
      const match = line.match(/^ {10}(\w+): \$\{\{ secrets\.(\w+) \}\}$/);
      expect(match, line).not.toBeNull();
      expect(match![1]).toBe(match![2]);
      expect(secretNames).toContain(match![1]);
    }
    expect(dumpStep?.env).toEqual(
      new Map([
        ["SUPABASE_DB_URL", "${{ secrets.SUPABASE_DB_URL }}"],
        ["BACKUP_PASSPHRASE", "${{ secrets.BACKUP_PASSPHRASE }}"],
      ]),
    );
    // No expressions at all in run scripts: values come in through env.
    expect(runText).not.toContain("${{");
    expect(runText).not.toMatch(/set -x|set -o xtrace/);
    // Each use of a secret, or of the password taken from it, is one of these.
    const allowed = [
      /^\[ -n "\$(SUPABASE_DB_URL|BACKUP_PASSPHRASE)" \] \|\| missing\+=\(\1\)$/,
      /^rest="\$\{SUPABASE_DB_URL#\*:\/\/\}"$/,
      /^case "\$SUPABASE_DB_URL" in$/,
      /^\[ "\$\{#BACKUP_PASSPHRASE\}" -ge 32 \] \|\| problems\+=\("BACKUP_PASSPHRASE är kortare än 32 tecken"\)$/,
      /^case "\$BACKUP_PASSPHRASE" in \*\$'\\n'\* \| \*\$'\\r'\*\) problems\+=\("BACKUP_PASSPHRASE innehåller en radbrytning"\) ;; esac$/,
      /^password="\$\{userinfo#\*:\}"$/,
      /^echo "::add-mask::\$password"$/,
      /^decoded="\$\(decode "\$password"\)"$/,
      /^\[ "\$decoded" = "\$password" \] \|\| echo "::add-mask::\$decoded"$/,
      /^PGPASSWORD="\$\(decode "\$\{userinfo#\*:\}"\)"$/,
      /^export PGPASSWORD$/,
      /^printf '%s' "\$BACKUP_PASSPHRASE" \| gpg /,
    ];
    const sensitive = /\$\{?#?(SUPABASE_DB_URL|BACKUP_PASSPHRASE|password|decoded)\b|PGPASSWORD|\$\{userinfo#\*:\}/;
    for (const line of runLines.filter((candidate) => sensitive.test(candidate))) {
      expect(allowed.some((pattern) => pattern.test(line.trim())), line).toBe(true);
    }
  });

  describe("the check step's script", () => {
    it("skips with a notice, and stays green, when both secrets are missing", () => {
      const result = runCheck({});
      expect(result.status).toBe(0);
      const message = "Säkerhetskopian hoppades över: hemligheterna SUPABASE_DB_URL och BACKUP_PASSPHRASE saknas. Se docs/drift.md.";
      expect(result.stdout).toBe(`::notice title=Säkerhetskopia::${message}\n`);
      expect(result.summary).toBe(`${message}\n`);
      expect(result.output).toBe("ready=false\n");
    });

    it.each([
      ["SUPABASE_DB_URL", { BACKUP_PASSPHRASE: strongPassphrase }],
      ["BACKUP_PASSPHRASE", { SUPABASE_DB_URL: dbUrl }],
    ])("names the one missing secret (%s)", (name, env) => {
      for (const enabled of ["", "false"]) {
        const result = runCheck({ ...env, BACKUP_ENABLED: enabled });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`::notice title=Säkerhetskopia::Säkerhetskopian hoppades över: hemligheten ${name} saknas. Se docs/drift.md.`);
        expect(result.output).toBe("ready=false\n");
        expect(result.stdout).not.toContain(strongPassphrase);
        expect(result.stdout).not.toContain(dbUrl);
      }
    });

    it.each([
      [{}, "hemligheterna SUPABASE_DB_URL och BACKUP_PASSPHRASE saknas"],
      [{ SUPABASE_DB_URL: dbUrl }, "hemligheten BACKUP_PASSPHRASE saknas"],
      [{ BACKUP_PASSPHRASE: strongPassphrase }, "hemligheten SUPABASE_DB_URL saknas"],
    ])("fails with an error when BACKUP_ENABLED is true and a secret is missing (%o)", (env, what) => {
      const result = runCheck({ ...env, BACKUP_ENABLED: "true" });
      expect(result.status).toBe(1);
      const message = `Säkerhetskopian är påslagen med BACKUP_ENABLED, men ${what}. Se docs/drift.md.`;
      expect(result.stdout).toBe(`::error title=Säkerhetskopia::${message}\n`);
      expect(result.summary).toBe(`${message}\n`);
      expect(result.output).toBe("");
    });

    it.each(["", "true"])("goes ahead with both secrets in order (BACKUP_ENABLED=%j) and masks the password", (enabled) => {
      const result = runCheck({ SUPABASE_DB_URL: dbUrl, BACKUP_PASSPHRASE: strongPassphrase, BACKUP_ENABLED: enabled });
      expect(result.status).toBe(0);
      expect(result.output).toBe("ready=true\n");
      // Masked as written in the URL and percent-decoded; nothing else is printed.
      expect(result.stdout).toBe("::add-mask::p%40ss%2Fw0rd\n::add-mask::p@ss/w0rd\n");
      expect(result.summary).toBe("");
    });

    it("masks a password without percent-encoding once", () => {
      const result = runCheck({ SUPABASE_DB_URL: "postgresql://postgres.ref:plain@host:5432/postgres", BACKUP_PASSPHRASE: strongPassphrase });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("::add-mask::plain\n");
    });

    it.each([
      ["a passphrase of 31 characters", { BACKUP_PASSPHRASE: "x".repeat(31) }, "BACKUP_PASSPHRASE är kortare än 32 tecken"],
      ["a passphrase with a newline", { BACKUP_PASSPHRASE: `${strongPassphrase}\n` }, "BACKUP_PASSPHRASE innehåller en radbrytning"],
      ["a passphrase with a carriage return", { BACKUP_PASSPHRASE: `${strongPassphrase}\r` }, "BACKUP_PASSPHRASE innehåller en radbrytning"],
      ["a URL without a password", { SUPABASE_DB_URL: "postgresql://postgres.ref@host:5432/postgres" }, "SUPABASE_DB_URL saknar lösenord"],
      [
        "a URL that is not postgresql://",
        { SUPABASE_DB_URL: "https://user:secret@host/db" },
        "SUPABASE_DB_URL har inte formen postgresql://användare:lösenord@värd:port/databas",
      ],
    ])("fails, naming only the problem, for %s", (_name, env, problem) => {
      const values = { SUPABASE_DB_URL: dbUrl, BACKUP_PASSPHRASE: strongPassphrase, ...env };
      for (const enabled of ["", "true"]) {
        const result = runCheck({ ...values, BACKUP_ENABLED: enabled });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(`::error title=Säkerhetskopia::${problem}. Se docs/drift.md.\n`);
        expect(result.summary).toBe(`${problem}. Se docs/drift.md.\n`);
        expect(result.output).toBe("");
        const printed = result.stdout.replace(/^::add-mask::.*$/gm, "");
        expect(printed).not.toContain(values.BACKUP_PASSPHRASE.trim());
        expect(printed).not.toContain(values.SUPABASE_DB_URL);
      }
    });

    it("accepts a passphrase of exactly 32 characters", () => {
      const result = runCheck({ SUPABASE_DB_URL: dbUrl, BACKUP_PASSPHRASE: "x".repeat(32) });
      expect(result.status).toBe(0);
      expect(result.output).toBe("ready=true\n");
    });
  });

  it("dump step: strict shell, the password only in PGPASSWORD, the same URL parsing as the check", () => {
    expect(dumpStep).toBeDefined();
    expect(dumpStep!.run[0]).toBe("set -euo pipefail");
    for (const line of [
      `decode() { local value="\${1//\\\\/\\\\\\\\}"; printf '%b' "\${value//%/\\\\x}"; }`,
      'rest="${SUPABASE_DB_URL#*://}"',
      'userinfo="${rest%@*}"',
    ]) {
      expect(checkStep.run.map((candidate) => candidate.trim()), line).toContain(line);
      expect(dumpStep!.run.map((candidate) => candidate.trim()), line).toContain(line);
    }
    expect(dumpScript).toContain('db_url="postgresql://${userinfo%%:*}@${rest##*@}"');
    // The secret URL itself never reaches a command line.
    expect(dumpCommands).not.toMatch(/(supabase|psql)[^\n]*\$SUPABASE_DB_URL/);
  });

  it("writes a manifest and row counts, then dumps schema and data without linking or pushing", () => {
    expect(dumpScript).toContain('echo "commit $GITHUB_SHA"');
    expect(dumpScript).toContain('echo "cli $(supabase --version)"');
    expect(dumpScript).toContain('sql -c "select version from supabase_migrations.schema_migrations order by version"');
    expect(dumpScript).toContain('} > "$plain/manifest.txt"');
    expect(dumpScript).toContain(`sql -F ' ' -f scripts/backup-counts.sql > "$plain/counts.txt"`);
    expect(read("scripts/backup-counts.sql")).toContain("from auth.users");

    const dumps = dumpCommands.split("\n").filter((line) => line.includes("supabase db dump"));
    expect(dumps).toHaveLength(2);
    expect(dumps.filter((line) => !line.includes("--data-only"))).toHaveLength(1);
    for (const line of dumps) expect(line).toMatch(/^\s*supabase db dump --db-url "\$db_url" .*--file "\$plain\/\w+\.sql"$/);
    expect(workflow).not.toMatch(/supabase link|db push|--linked|vercel/i);
  });

  it("leaves storage vectors and sensitive auth data out of the data dump", () => {
    const data = dumpCommands.split("\n").find((line) => line.includes("--data-only"))!;
    const excluded = [...data.matchAll(/--exclude (\S+)/g)].map((match) => match[1]).sort();
    expect(excluded).toEqual(
      [
        "storage.buckets_vectors",
        "storage.vector_indexes",
        "auth.sessions",
        "auth.refresh_tokens",
        "auth.mfa_amr_claims",
        "auth.one_time_tokens",
        "auth.flow_state",
        "auth.audit_log_entries",
      ].sort(),
    );
    expect(data).not.toMatch(/auth\.users|auth\.identities/);
  });

  it("checks the dumps, encrypts with AES256 and decrypts each file again before upload", () => {
    expect(dumpScript).toContain("files=(schema.sql data.sql manifest.txt counts.txt)");
    expect(dumpScript).toContain('[ -s "$plain/$name" ] || {');
    expect(dumpScript).toContain(`grep -q '^COPY "auth"."users" ' "$plain/data.sql"`);
    expect(dumpCommands).toContain(
      `printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 --output "$encrypted/$name.gpg" "$plain/$name"`,
    );
    expect(dumpCommands).toContain(
      `printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 0 --decrypt "$encrypted/$name.gpg" | cmp --silent - "$plain/$name" ||`,
    );
    expect(dumpScript).toContain("trap 'rm -rf \"$plain\"' EXIT");
    expect(runText).not.toMatch(/--passphrase[ =]|--passphrase-file/);
  });

  it("uploads only the encrypted files, named by date, with a retention", () => {
    expect(dumpScript).toContain('encrypted="$RUNNER_TEMP/backup"');
    expect(dumpScript).toContain('plain="$RUNNER_TEMP/backup-plain"');
    expect(dumpScript).toContain('echo "date=$(date -u +%F)" >> "$GITHUB_OUTPUT"');
    const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(upload?.with.get("path")).toBe("${{ runner.temp }}/backup/*.gpg");
    expect(upload?.with.get("name")).toBe("matkoll-backup-${{ steps.dump.outputs.date }}");
    expect(upload?.with.get("if-no-files-found")).toBe("error");
    expect(Number(upload?.with.get("retention-days"))).toBeGreaterThan(0);
  });
});
