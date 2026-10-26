import "server-only";
import { type Env, parseEnv } from "./env-schema";

// The only place that reads process.env (AD-14). Evaluated at server start via
// src/instrumentation.ts, so an invalid environment stops the app.
export const env: Env = parseEnv(process.env);
