#!/usr/bin/env node
// Writes the local Supabase URL and keys from `supabase status -o env` into
// .env.local (created from .env.example if missing). Other lines are kept, and
// no values are printed.
//
//   pnpm db:env

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const envFile = `${root}.env.local`;

let status;
try {
  status = execFileSync("supabase", ["status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  console.error("db:env: `supabase status` failed; start Supabase with `pnpm db:start` first");
  process.exit(1);
}

const statusValues = Object.fromEntries(
  status
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]),
);

const values = {
  NEXT_PUBLIC_SUPABASE_URL: statusValues.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: statusValues.PUBLISHABLE_KEY ?? statusValues.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: statusValues.SECRET_KEY ?? statusValues.SERVICE_ROLE_KEY,
};
const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
if (missing.length > 0) {
  console.error(`db:env: \`supabase status\` did not give ${missing.join(", ")}`);
  process.exit(1);
}

const source = existsSync(envFile)
  ? readFileSync(envFile, "utf8")
  : readFileSync(`${root}.env.example`, "utf8");
const lines = source.split("\n");
const written = new Set();
const updated = lines.map((line) => {
  const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
  if (key && key in values) {
    written.add(key);
    return `${key}=${values[key]}`;
  }
  return line;
});
for (const [key, value] of Object.entries(values)) {
  if (!written.has(key)) updated.push(`${key}=${value}`);
}

// A local production build (`pnpm build`) requires SITE_URL; default it to the dev
// server, but never overwrite a value the developer has set.
const siteUrlIndex = updated.findIndex((line) => /^\s*SITE_URL\s*=/.test(line));
if (siteUrlIndex === -1) {
  updated.push("SITE_URL=http://localhost:3000");
} else if (/^\s*SITE_URL\s*=\s*$/.test(updated[siteUrlIndex])) {
  updated[siteUrlIndex] = "SITE_URL=http://localhost:3000";
}

writeFileSync(envFile, `${updated.join("\n").replace(/\n*$/, "")}\n`, { mode: 0o600 });
console.log(`db:env: wrote ${Object.keys(values).join(", ")} to .env.local`);
