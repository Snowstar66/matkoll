// Runs once when the Next.js server starts: validates the environment so an
// invalid configuration stops the app instead of failing on first use (AD-14).
export async function register() {
  // NEXT_RUNTIME is set by Next.js itself, not app configuration.
  // eslint-disable-next-line no-restricted-syntax
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvOrExit } = await import("./instrumentation-node");
    await validateEnvOrExit();
  }
}
