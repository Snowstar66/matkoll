import { z } from "zod";

// Pure environment schema (AD-14), safe to import in tests. src/server/env.ts is
// the only place that applies it to process.env. Adding a variable means updating
// this schema, the approved list in the architecture and .env.example.

/** Treats unset and empty values the same, so `KEY=` in a .env file means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

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

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optional(httpUrl),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
  /** Only for tests and scripts, never for request handling (AD-4). */
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string()),
  ALLOWED_EMAILS: optional(emailList),
  AI_PROVIDER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(aiProviders).default("mock"),
  ),
  AI_MODEL: optional(z.string()),
  LMSTUDIO_BASE_URL: optional(httpUrl),
  CF_ACCESS_CLIENT_ID: optional(z.string()),
  CF_ACCESS_CLIENT_SECRET: optional(z.string()),
  ANTHROPIC_API_KEY: optional(z.string()),
  OPENAI_API_KEY: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(readonly variables: string[], details: string[]) {
    super(`Invalid environment variables: ${details.join(", ")}`);
    this.name = "EnvError";
  }
}

/**
 * Validates the given environment. The error names the failing variables and
 * the kind of problem, never the values, so it is safe to log.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  const details = result.error.issues.map(
    (issue) => `${issue.path.map(String).join(".")} (${issue.code})`,
  );
  throw new EnvError(variables, details);
}
