import { z } from "zod";

// Pure environment schema (AD-14), safe to import in tests. src/server/env.ts is
// the only place that applies it to process.env. Adding a variable means updating
// this schema, the approved list in the architecture and .env.example. Variables
// that only scripts and tests read live in a marked section of .env.example.

/** Treats unset, empty and whitespace-only values the same, so `KEY=` or `KEY= ` means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

const emailList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )
  .pipe(z.array(z.email()));

const httpUrl = z.url({ protocol: /^https?$/ });

export const aiProviders = ["lmstudio", "anthropic", "openai", "mock"] as const;
export type AiProvider = (typeof aiProviders)[number];

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optional(httpUrl),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
  // The service role key is deliberately not here: only scripts/ and tests/ read it (AD-4).
  /** The app's public origin, used for links in e-mail. Required in production; see parseEnv. */
  SITE_URL: optional(httpUrl),
  ALLOWED_EMAILS: optional(emailList),
  /** Defaults to mock outside production; must be set explicitly in production. See parseEnv. */
  AI_PROVIDER: optional(z.enum(aiProviders)),
  AI_MODEL: optional(z.string()),
  LMSTUDIO_BASE_URL: optional(httpUrl),
  CF_ACCESS_CLIENT_ID: optional(z.string()),
  CF_ACCESS_CLIENT_SECRET: optional(z.string()),
  ANTHROPIC_API_KEY: optional(z.string()),
  OPENAI_API_KEY: optional(z.string()),
  /**
   * How long the mock takes for an AI-förslag call, in milliseconds (0-30 000,
   * Story 12.4). Only the mock reads it, and only tests set it.
   */
  AI_MOCK_DELAY_MS: optional(z.coerce.number().int().min(0).max(30_000)),
  /** Story 15.1: automatic sign-in on the local machine only. Both or neither; see devAutoLoginCredentials. */
  DEV_AUTO_LOGIN_EMAIL: optional(z.string()),
  DEV_AUTO_LOGIN_PASSWORD: optional(z.string()),
  /** Set to 1 by `pnpm dev` only (bound to 127.0.0.1); `pnpm dev:lan` leaves it out, so no auto-login. */
  MATKOLL_DEV_LOOPBACK: optional(z.string()),
  /** Set by Vercel; a guard of the automatic local sign-in. */
  VERCEL: optional(z.string()),
  /** Set by Next (`development`, `production`); a guard of the automatic local sign-in. */
  NODE_ENV: optional(z.string()),
});

/** SITE_URL outside production when it is not set. */
export const devSiteUrl = "http://localhost:3000";

type ParsedEnv = z.infer<typeof envSchema>;

export type Env = Omit<ParsedEnv, "SITE_URL" | "AI_PROVIDER"> & { SITE_URL: string; AI_PROVIDER: AiProvider };

export class EnvError extends Error {
  constructor(readonly variables: string[], details: string[]) {
    super(`Invalid environment variables: ${details.join(", ")}`);
    this.name = "EnvError";
  }
}

/**
 * Validates the given environment, including that the AI settings fit together.
 * The error names the failing variables and the kind of problem, never the
 * values, so it is safe to log.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    const details = result.error.issues.map(
      (issue) => `${issue.path.map(String).join(".")} (${issue.code})`,
    );
    throw new EnvError(variables, details);
  }

  const { SITE_URL, AI_PROVIDER: explicitProvider, ...rest } = result.data;
  const production = source.NODE_ENV === "production";
  const problems: Problem[] = [];
  // In production a missing provider would answer every recipe with fixture data.
  if (!explicitProvider && production) {
    problems.push({ variable: "AI_PROVIDER", detail: "AI_PROVIDER (required in production)" });
  }
  const AI_PROVIDER = explicitProvider ?? "mock";
  problems.push(...aiSettingProblems({ ...rest, AI_PROVIDER }));
  if (!SITE_URL && production) {
    problems.push({ variable: "SITE_URL", detail: "SITE_URL (required in production)" });
  }
  if (problems.length > 0) {
    throw new EnvError(
      [...new Set(problems.map((problem) => problem.variable))],
      problems.map((problem) => problem.detail),
    );
  }

  const AI_MODEL = rest.AI_MODEL ?? (AI_PROVIDER === "lmstudio" ? defaultLmStudioModel : undefined);
  return { ...rest, AI_PROVIDER, AI_MODEL, SITE_URL: SITE_URL ?? devSiteUrl };
}

/** AI_MODEL when AI_PROVIDER=lmstudio and it is not set: the model the app is tested with. */
export const defaultLmStudioModel = "qwen/qwen3.6-35b-a3b";

type Problem = { variable: string; detail: string };

/** The AI settings must fit together, so a wrong setup stops the app at start (AD-9, AD-14). */
function aiSettingProblems(env: Omit<Env, "SITE_URL">): Problem[] {
  const problems: Problem[] = [];
  const requireFor = (variable: keyof typeof env) => {
    if (env[variable] === undefined) {
      problems.push({ variable, detail: `${variable} (required when AI_PROVIDER=${env.AI_PROVIDER})` });
    }
  };

  switch (env.AI_PROVIDER) {
    case "lmstudio":
      requireFor("LMSTUDIO_BASE_URL");
      break;
    case "anthropic":
      requireFor("ANTHROPIC_API_KEY");
      requireFor("AI_MODEL");
      break;
    case "openai":
      requireFor("OPENAI_API_KEY");
      requireFor("AI_MODEL");
      break;
    case "mock":
      break;
  }

  // The Cloudflare Access service token is a pair; half of it is a typo, not a choice.
  const cfId = env.CF_ACCESS_CLIENT_ID !== undefined;
  const cfSecret = env.CF_ACCESS_CLIENT_SECRET !== undefined;
  if (cfId !== cfSecret) {
    for (const variable of ["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"]) {
      problems.push({ variable, detail: `${variable} (CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET go together)` });
    }
  }
  // The token would otherwise travel in clear text.
  if (cfId && cfSecret && env.LMSTUDIO_BASE_URL?.startsWith("http:")) {
    problems.push({
      variable: "LMSTUDIO_BASE_URL",
      detail: "LMSTUDIO_BASE_URL (must use https when CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are set)",
    });
  }
  return problems;
}
