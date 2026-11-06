import type { Instrumentation } from "next";

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

// Errors in pages, Server Actions and Route Handlers go to the owner's Inkorg (kind
// error), as the signed-in user. Awaited, so the report is not cut off.
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  // eslint-disable-next-line no-restricted-syntax
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("./instrumentation-node");
  await reportRequestError(error, request);
};
