import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Story 10.4: the pantry page is called Matvaror; "Hemma" is the name of the
// first place (defaultSiteName). No component or error text may call the page
// Hemma again. Code comments are left out (they may still call the page
// Hemma), and so are tests. A "Hemma" that is the place's name, or the
// phrase "Finns hemma", is in the allow-list with its reason.

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Allowed lines with "Hemma", by file: a text that must be on the line, and why. */
const allowed: Record<string, readonly { contains: string; reason: string }[]> = {};

function componentFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return componentFiles(path);
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [path] : [];
  });
}

/** The source without comments: `//` to the end of the line, and `/* … *\/` blocks, also in JSX. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** The lines that say "Hemma" as a word (not "hemma", as in "Finns hemma"), with their file and number. */
function hemmaLines(path: string): { file: string; line: number; text: string }[] {
  const file = relative(root, path);
  return withoutComments(readFileSync(path, "utf8"))
    .split("\n")
    .flatMap((text, index) => (/\bHemma\b/.test(text) ? [{ file, line: index + 1, text: text.trim() }] : []))
    .filter(({ text }) => !(allowed[file] ?? []).some(({ contains }) => text.includes(contains)));
}

describe("the page is called Matvaror (Story 10.4)", () => {
  it("finds Hemma in text and code, never in comments", () => {
    const source = [
      "// Hemma's cards",
      "/* Hemma */ const a = 1;",
      "{/* The place Hemma shows */}",
      "<Link>Öppna Hemma</Link>",
      'const b = "Lägg till varor i Hemma";',
      "const c = 'Finns hemma';",
    ].join("\n");
    const found = withoutComments(source)
      .split("\n")
      .filter((line) => /\bHemma\b/.test(line));
    expect(found).toEqual(["<Link>Öppna Hemma</Link>", 'const b = "Lägg till varor i Hemma";']);
  });

  it("no component or error text calls it Hemma", () => {
    const files = [...componentFiles(join(root, "src")), join(root, "src/lib/errors.ts")];
    expect(files.length).toBeGreaterThan(50);
    expect(files.flatMap(hemmaLines)).toEqual([]);
  });

  it("the menu and the page say Matvaror", () => {
    expect(readFileSync(join(root, "src/components/app-shell/destinations.ts"), "utf8")).toContain(
      '{ href: "/hemma", helpId: "matvaror", label: "Matvaror"',
    );
    expect(readFileSync(join(root, "src/app/(app)/hemma/page.tsx"), "utf8")).toContain('title: "Matvaror"');
  });
});
