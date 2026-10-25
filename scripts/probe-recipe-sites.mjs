#!/usr/bin/env node
// Fetches recipe pages with the app's own safeFetch and extract (AD-11) and
// reports, per page, whether the fetch works, whether the page has Recipe
// JSON-LD and how much readable text it has. Run by hand, never in tests or
// CI: it fetches from the real sites.
//
//   pnpm sites:probe <url> [<url> …]           # report only
//   pnpm sites:probe --save <name> <url>       # also save the page as tests/fixtures/sites/<name>.html
//   pnpm sites:probe --parse <url> [<url> …]   # also run parseRecipe with AI_PROVIDER from .env.local
//
// Each page's own domain is the only approved one for its fetch, so the
// script can try sites before they are added to ensure_user_defaults().
// --save also writes what the import flow sends to parseRecipe for the page,
// tests/fixtures/ai/<name>.txt and <name>.jsonld.json, and with --parse the
// model's answer, <name>.response.json: an AI test case for the page.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, createServerModuleRunner } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const parse = args.includes("--parse");
const saveIndex = args.indexOf("--save");
const saveName = saveIndex >= 0 ? args[saveIndex + 1] : undefined;
const urls = args.filter((arg, index) => !arg.startsWith("--") && !(saveIndex >= 0 && index === saveIndex + 1));

if (urls.length === 0 || (saveIndex >= 0 && (!saveName || !/^[a-z0-9-]+$/.test(saveName) || urls.length !== 1))) {
  console.error("Usage: pnpm sites:probe [--parse] [--save <name>] <https-url> [<https-url> …] (--save takes one URL)");
  process.exit(1);
}

// Vite loads the app's TypeScript with the same aliases as Vitest.
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: {
    alias: {
      "@/": `${root}src/`,
      "server-only": `${root}tests/mocks/server-only.ts`,
    },
  },
});
const runner = createServerModuleRunner(server.environments.ssr);

try {
  const { safeFetch } = await runner.import("/src/server/fetch/safe-fetch.ts");
  const { extractRecipePage } = await runner.import("/src/server/fetch/extract.ts");
  let ai;
  if (parse) {
    const { parseEnv } = await runner.import("/src/server/env-schema.ts");
    const { createAiService } = await runner.import("/src/server/ai/service.ts");
    const env = parseEnv(process.env);
    if (env.AI_PROVIDER === "mock") throw new Error("--parse needs a real AI_PROVIDER (e.g. lmstudio in .env.local)");
    ai = createAiService(env);
  }

  for (const url of urls) {
    let domain;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      console.log(`${url}\n  ogiltig adress`);
      continue;
    }
    const started = performance.now();
    const page = await safeFetch(url, { allowedDomains: [domain], signal: AbortSignal.timeout(15_000) });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(url);
    if (!page.ok) {
      console.log(`  hämtning: ${page.error.code} (${seconds} s)`);
      continue;
    }
    const extracted = extractRecipePage(page.data.html);
    console.log(`  hämtning: ok, ${Math.round(page.data.html.length / 1024)} kB på ${seconds} s, slutadress ${page.data.url}`);
    console.log(`  JSON-LD Recipe: ${extracted.jsonLd ? `ja (${extracted.jsonLd.length} tecken)` : "nej"}`);
    console.log(`  läsbar text: ${extracted.text.length} tecken; bild: ${extracted.imageUrl ? "ja" : "nej"}`);

    const sitesDir = `${root}tests/fixtures/sites/`;
    const aiDir = `${root}tests/fixtures/ai/`;
    if (saveName) {
      mkdirSync(sitesDir, { recursive: true });
      writeFileSync(`${sitesDir}${saveName}.html`, page.data.html);
      // What the import flow sends to parseRecipe for this page, as an AI test case.
      writeFileSync(`${aiDir}${saveName}.txt`, extracted.text);
      if (extracted.jsonLd) writeFileSync(`${aiDir}${saveName}.jsonld.json`, extracted.jsonLd);
      console.log(`  sparad: tests/fixtures/sites/${saveName}.html och tests/fixtures/ai/${saveName}.txt`);
    }
    if (ai) {
      const answerStarted = performance.now();
      const answer = await ai.parseRecipe(
        { text: extracted.text, jsonLd: extracted.jsonLd ?? undefined },
        AbortSignal.timeout(120_000),
      );
      const answerSeconds = ((performance.now() - answerStarted) / 1000).toFixed(1);
      if (!answer.ok) {
        console.log(`  parseRecipe: ${answer.error.code} (${answerSeconds} s)`);
        continue;
      }
      const { title, servings, ingredients, steps } = answer.data;
      console.log(
        `  parseRecipe: "${title}", ${servings} portioner, ${ingredients.length} rader, ${steps.length} steg (${answerSeconds} s)`,
      );
      if (saveName) {
        writeFileSync(`${aiDir}${saveName}.response.json`, `${JSON.stringify(answer.data, null, 2)}\n`);
        console.log(`  sparad: tests/fixtures/ai/${saveName}.response.json`);
      }
    }
  }
} finally {
  await runner.close();
  await server.close();
}
