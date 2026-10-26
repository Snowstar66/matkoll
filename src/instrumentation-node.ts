// Node.js-only part of src/instrumentation.ts (process.exit is not available on Edge).
export async function validateEnvOrExit() {
  try {
    await import("@/server/env");
  } catch (error) {
    // EnvError messages name variables, never values, so they are safe to log.
    console.error(error instanceof Error ? error.message : "env_invalid");
    process.exit(1);
  }
}
