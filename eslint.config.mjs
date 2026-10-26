import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const root = import.meta.dirname;

// Feature modules from the architecture, plus any module folder that exists on disk.
const plannedModules = [
  "auth",
  "catalog",
  "recipes",
  "pantry",
  "mealplan",
  "shopping",
  "suggestions",
  "settings",
];
const modulesOnDisk = (() => {
  try {
    return readdirSync(`${root}/src/features`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
})();
const modules = [...new Set([...plannedModules, ...modulesOnDisk])];

// Layer rules from AD-1. Paths are relative to the project root.
const layerZones = [
  {
    target: "./src/features/*/domain/**",
    from: [
      "./src/features/*/data/**",
      "./src/features/*/actions/**",
      "./src/features/*/ui/**",
      "./src/features/*/server.ts",
      "./src/server/**",
      "./src/lib/supabase/**",
    ],
    message: "domain is pure: no data, actions, ui, server code or Supabase (AD-1).",
  },
  {
    target: "./src/features/*/index.ts",
    from: [
      "./src/features/*/data/**",
      "./src/features/*/actions/**",
      "./src/features/*/server.ts",
      "./src/server/**",
      "./src/lib/supabase/**",
    ],
    message: "index.ts is client-safe: only types and domain (AD-1).",
  },
  {
    target: "./src/features/*/ui/**",
    from: [
      "./src/features/*/data/**",
      "./src/features/*/server.ts",
      "./src/server/**",
      "./src/lib/supabase/**",
    ],
    message: "ui reaches the server only through actions (AD-1, AD-2).",
  },
  {
    target: "./src/app/**",
    from: [
      "./src/features/*/data/**",
      "./src/features/*/domain/**",
      "./src/features/*/actions/**",
    ],
    message: "Routes use a module's ui, index.ts or server.ts, never its inner layers (AD-1).",
  },
  {
    target: "./src/server/**",
    from: ["./src/features/**", "./src/lib/supabase/**"],
    message: "Ports never import features or Supabase; pass what they need as arguments (AD-1).",
  },
  {
    target: ["./src/components/**", "./src/lib/**"],
    from: ["./src/features/**"],
    message: "Shared code never imports feature modules (AD-1).",
  },
  // A module reaches another module only through its index.ts or server.ts.
  ...modules.map((name) => ({
    target: `./src/features/!(${name})/**`,
    from: `./src/features/${name}`,
    except: ["./index.ts", "./server.ts"],
    message: `Import the ${name} module through @/features/${name} (index.ts) or @/features/${name}/server (AD-1).`,
  })),
];

const aiSdkPattern = {
  regex: "^(ai(/.*)?|@ai-sdk/.+)$",
  message: "Only src/server/ai may import the AI SDK (AD-9).",
};

const processImports = ["process", "node:process"].map((name) => ({
  name,
  message: "Read configuration through src/server/env.ts (AD-14).",
}));

const serviceRoleMessage =
  "The service role is only for scripts/ and tests/; src uses the session client in @/lib/supabase/server (AD-4).";

// The app talks to Supabase through @supabase/ssr session clients; a plain
// supabase-js client is how a service role key would get in.
const supabaseJsClient = {
  name: "@supabase/supabase-js",
  importNames: ["createClient"],
  message: serviceRoleMessage,
};

const domainPatterns = [
  {
    group: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*"],
    message: "domain is pure TypeScript: no React or Next (AD-1).",
  },
  {
    group: [
      "@supabase/*",
      "server-only",
      "node:*",
      "fs",
      "fs/*",
      "http",
      "https",
      "net",
      "child_process",
    ],
    message: "domain has no I/O and no server-only code (AD-1).",
  },
];

/** Builds no-restricted-imports options; flat config replaces (not merges) them per file. */
const restrictedImports = ({ aiSdk = true, processImport = true, domain = false } = {}) => [
  "error",
  {
    paths: [...(processImport ? processImports : []), supabaseJsClient],
    patterns: [...(aiSdk ? [aiSdkPattern] : []), ...(domain ? domainPatterns : [])],
  },
];

const envMessage = "Read configuration through src/server/env.ts (AD-14).";
const processEnvSelectors = [
  // process.env, process["env"]
  "MemberExpression[object.name='process'][property.name='env']:not([computed=true])",
  "MemberExpression[object.name='process'][computed=true][property.value='env']",
  // globalThis.process.env, globalThis.process["env"]
  "MemberExpression[object.type='MemberExpression'][object.property.name='process'][property.name='env']:not([computed=true])",
  "MemberExpression[object.type='MemberExpression'][object.property.name='process'][computed=true][property.value='env']",
  // const { env } = process / globalThis.process
  "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
  "VariableDeclarator[init.property.name='process'] > ObjectPattern > Property[key.name='env']",
].map((selector) => ({ selector, message: envMessage }));

const serviceRoleSelectors = [
  "Identifier[name='SUPABASE_SERVICE_ROLE_KEY']",
  "Literal[value='SUPABASE_SERVICE_ROLE_KEY']",
  "TemplateElement[value.raw=/SUPABASE_SERVICE_ROLE_KEY/]",
  "Literal[value='service_role']",
  "Literal[value=/^sb_secret_/]",
].map((selector) => ({ selector, message: serviceRoleMessage }));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "matkoll/layers",
    files: ["src/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "import/no-restricted-paths": ["error", { basePath: root, zones: layerZones }],
      "no-restricted-imports": restrictedImports(),
      "no-restricted-syntax": ["error", ...processEnvSelectors, ...serviceRoleSelectors],
    },
  },
  {
    name: "matkoll/domain",
    files: ["src/features/*/domain/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": restrictedImports({ domain: true }),
    },
  },
  {
    name: "matkoll/ai-port",
    files: ["src/server/ai/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": restrictedImports({ aiSdk: false }),
    },
  },
  {
    name: "matkoll/env",
    files: ["src/server/env.ts"],
    rules: {
      "no-restricted-imports": restrictedImports({ processImport: false }),
      "no-restricted-syntax": ["error", ...serviceRoleSelectors],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test output:
    "playwright-report/**",
    "test-results/**",
    // Lint-rule fixtures contain forbidden imports on purpose; tests/lint lints them explicitly.
    "src/features/example/**",
    // Git worktrees of stories built in parallel; each is linted in its own checkout.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
