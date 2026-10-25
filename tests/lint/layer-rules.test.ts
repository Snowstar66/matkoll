import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// Proves the AD-1/AD-9/AD-14 lint rules against the fixture module in
// src/features/example. Importing files are virtual (lintText with a filePath),
// imported files are real so the import resolver can find them.

const root = fileURLToPath(new URL("../../", import.meta.url));

let eslint: ESLint;

beforeAll(() => {
  // ignore: false so the fixture folder, which `pnpm lint` skips, is linted here.
  eslint = new ESLint({ cwd: root, ignore: false });
});

async function ruleErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: `${root}${filePath}` });
  const fatal = result.messages.filter((message) => message.fatal);
  expect(fatal, "file should parse").toEqual([]);
  return result.messages
    .filter((message) => message.severity === 2)
    .map((message) => message.ruleId);
}

describe("allowed imports", () => {
  it.each([
    ["ui imports its own actions", "src/features/example/ui/allowed.ts", 'import { saveExample } from "../actions/save-example";'],
    ["ui imports its own index", "src/features/example/ui/allowed.ts", 'import { describeExample } from "@/features/example";'],
    ["actions import domain and data", "src/features/example/actions/allowed.ts", 'import { describeExample } from "../domain/rules";\nimport { loadExample } from "../data/queries";'],
    ["another module uses index.ts", "src/features/other/ui/allowed.ts", 'import { describeExample } from "@/features/example";'],
    ["another module uses server.ts", "src/features/other/actions/allowed.ts", 'import { loadExample } from "@/features/example/server";'],
    ["a route uses server.ts", "src/app/example/page.tsx", 'import { loadExample } from "@/features/example/server";'],
    ["the AI port imports the AI SDK", "src/server/ai/allowed.ts", 'import { generateText } from "ai";\nimport { createOpenAICompatible } from "@ai-sdk/openai-compatible";'],
    ["env.ts reads process.env", "src/server/env.ts", "export const value = process.env.AI_PROVIDER;"],
    ["env.ts imports node:process", "src/server/env.ts", 'import { env } from "node:process";\nexport const value = env.AI_PROVIDER;'],
    ["actions import the AI port", "src/features/other/actions/allowed.ts", 'import { ai } from "@/server/ai";\nimport { client } from "@/server/ai/client";'],
    ["a route uses a module's ui", "src/app/example/page.tsx", 'import { exampleView } from "@/features/example/ui/example-view";'],
    ["a module's index.ts exports its domain", "src/features/example/index.ts", 'export { describeExample } from "./domain/rules";'],
  ])("%s", async (_name, filePath, code) => {
    expect(await ruleErrors(filePath, `${code}\n`)).toEqual([]);
  });

  it("the fixture module itself is clean", async () => {
    const results = await eslint.lintFiles(["src/features/example/**/*.ts"]);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.messages, result.filePath).toEqual([]);
    }
  });
});

describe("forbidden imports", () => {
  it.each([
    ["domain imports data", "src/features/example/domain/bad.ts", 'import { loadExample } from "../data/queries";', "import/no-restricted-paths"],
    ["domain imports actions", "src/features/example/domain/bad.ts", 'import { saveExample } from "../actions/save-example";', "import/no-restricted-paths"],
    ["domain imports ui", "src/features/example/domain/bad.ts", 'import { exampleView } from "../ui/example-view";', "import/no-restricted-paths"],
    ["domain imports server.ts", "src/features/example/domain/bad.ts", 'import { loadExample } from "../server";', "import/no-restricted-paths"],
    ["domain imports src/server", "src/features/example/domain/bad.ts", 'import { parseEnv } from "@/server/env";', "import/no-restricted-paths"],
    ["domain imports React", "src/features/example/domain/bad.ts", 'import { useState } from "react";', "no-restricted-imports"],
    ["domain imports Next", "src/features/example/domain/bad.ts", 'import { cookies } from "next/headers";', "no-restricted-imports"],
    ["ui imports data", "src/features/example/ui/bad.ts", 'import { loadExample } from "../data/queries";', "import/no-restricted-paths"],
    ["another module's ui imports data", "src/features/other/ui/bad.ts", 'import { loadExample } from "@/features/example/data/queries";', "import/no-restricted-paths"],
    ["another module imports actions", "src/features/other/actions/bad.ts", 'import { saveExample } from "@/features/example/actions/save-example";', "import/no-restricted-paths"],
    ["another module imports ui", "src/features/other/ui/bad.ts", 'import { exampleView } from "@/features/example/ui/example-view";', "import/no-restricted-paths"],
    ["another module imports domain directly", "src/features/other/actions/bad.ts", 'import { describeExample } from "@/features/example/domain/rules";', "import/no-restricted-paths"],
    ["a route imports data", "src/app/example/page.tsx", 'import { loadExample } from "@/features/example/data/queries";', "import/no-restricted-paths"],
    ["a port imports a feature", "src/server/fetch/bad.ts", 'import { describeExample } from "@/features/example";', "import/no-restricted-paths"],
    ["the AI SDK outside src/server/ai", "src/features/example/actions/bad.ts", 'import { generateText } from "ai";', "no-restricted-imports"],
    ["an @ai-sdk provider outside src/server/ai", "src/lib/bad.ts", 'import { createAnthropic } from "@ai-sdk/anthropic";', "no-restricted-imports"],
    ["process.env outside env.ts", "src/lib/bad.ts", "export const value = process.env.AI_PROVIDER;", "no-restricted-syntax"],
    ["domain imports Supabase", "src/features/example/domain/bad.ts", 'import { createClient } from "@supabase/supabase-js";', "no-restricted-imports"],
    ["domain imports server-only", "src/features/example/domain/bad.ts", 'import "server-only";', "no-restricted-imports"],
    ["domain imports node:fs", "src/features/example/domain/bad.ts", 'import { readFileSync } from "node:fs";', "no-restricted-imports"],
    ["domain imports fs", "src/features/example/domain/bad.ts", 'import { readFile } from "fs/promises";', "no-restricted-imports"],
    ["index.ts imports data", "src/features/example/index.ts", 'export { loadExample } from "./data/queries";', "import/no-restricted-paths"],
    ["index.ts imports actions", "src/features/example/index.ts", 'export { saveExample } from "./actions/save-example";', "import/no-restricted-paths"],
    ["index.ts imports server.ts", "src/features/example/index.ts", 'export { loadExample } from "./server";', "import/no-restricted-paths"],
    ["index.ts imports src/server", "src/features/example/index.ts", 'export { parseEnv } from "@/server/env-schema";', "import/no-restricted-paths"],
    ["ui imports its own server.ts", "src/features/example/ui/bad.ts", 'import { loadExample } from "../server";', "import/no-restricted-paths"],
    ["ui imports src/server", "src/features/example/ui/bad.ts", 'import { parseEnv } from "@/server/env-schema";', "import/no-restricted-paths"],
    ["another module's actions import data", "src/features/other/actions/bad.ts", 'import { loadExample } from "@/features/example/data/queries";', "import/no-restricted-paths"],
    ["another module imports a file outside the layers", "src/features/other/domain/bad.ts", 'import type { ExampleId } from "@/features/example/types";', "import/no-restricted-paths"],
    ["a route imports domain", "src/app/example/page.tsx", 'import { describeExample } from "@/features/example/domain/rules";', "import/no-restricted-paths"],
    ["a route imports actions", "src/app/example/page.tsx", 'import { saveExample } from "@/features/example/actions/save-example";', "import/no-restricted-paths"],
    ["a component imports a feature", "src/components/bad.tsx", 'import { describeExample } from "@/features/example";', "import/no-restricted-paths"],
    ["lib imports a feature", "src/lib/bad.ts", 'import { loadExample } from "@/features/example/server";', "import/no-restricted-paths"],
    ["process[\"env\"]", "src/lib/bad.ts", 'export const value = process["env"].AI_PROVIDER;', "no-restricted-syntax"],
    ["destructured process.env", "src/lib/bad.ts", "const { env } = process;\nexport const value = env.AI_PROVIDER;", "no-restricted-syntax"],
    ["globalThis.process.env", "src/lib/bad.ts", "export const value = globalThis.process.env.AI_PROVIDER;", "no-restricted-syntax"],
    ["importing node:process", "src/lib/bad.ts", 'import { env } from "node:process";\nexport const value = env.AI_PROVIDER;', "no-restricted-imports"],
    ["importing process", "src/lib/bad.ts", 'import process from "process";\nexport const value = process.pid;', "no-restricted-imports"],
  ])("%s", async (_name, filePath, code, rule) => {
    expect(await ruleErrors(filePath, `${code}\n`)).toContain(rule);
  });
});
