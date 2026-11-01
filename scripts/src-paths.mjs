// Lets `node` run a script in scripts/ that imports app code from src/ (Story 17.11).
// Node 24 runs TypeScript itself, but not Next's import style: `@/` for src/,
// imports without an extension, and `server-only` (which only the Next server
// may import). These resolve hooks add that and nothing else; code that needs
// Next itself (next/headers ...) does not belong in a script. Used as
// `node --experimental-transform-types --import ./scripts/src-paths.mjs scripts/<script>.ts`
// (transform, not only strip: src has classes with parameter properties).
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = new URL("../src/", import.meta.url);
/** `server-only` throws outside the Next server; here it is an empty module, as in the tests (tests/mocks/server-only.ts). */
const serverOnly = "data:text/javascript,export%20%7B%7D%3B";
const extensions = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/** A file URL with its extension, or the URL itself when no file matches. */
function withExtension(url) {
  const path = fileURLToPath(url);
  if (isFile(path)) return url;
  for (const extension of extensions) {
    if (isFile(path + extension)) return pathToFileURL(path + extension).href;
  }
  return url;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: serverOnly, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      return nextResolve(withExtension(new URL(specifier.slice(2), src).href), context);
    }
    const fromSrc = context.parentURL?.startsWith(src.href) && (specifier.startsWith("./") || specifier.startsWith("../"));
    if (fromSrc) return nextResolve(withExtension(new URL(specifier, context.parentURL).href), context);
    return nextResolve(specifier, context);
  },
});
