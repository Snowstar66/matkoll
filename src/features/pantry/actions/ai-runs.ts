import "server-only";

// The AI run on its way per user, so one person never keeps the local model
// busy twice (a second tab, a double tap that got past the client):
// - an analysis of a photo (analyzePlace) stops whatever run of the same
//   user was on its way, which then answers `ai_superseded`;
// - a lookup of the numbers on a photo (locatePlaceItems, Story 6.6) stops
//   an older lookup, but never an analysis: while one is on its way, the
//   lookup is not started and answers `ai_superseded` itself, since the
//   numbers are extra and the reading is not.
//
// The lock only covers these two calls, and only in this server process: a
// second server instance has its own, and the other AI calls (importing a
// recipe, AI-förslag) do not take it. It is no global queue for the model.

export type AiRunKind = "analyze" | "locate";

const runs = new Map<string, { kind: AiRunKind; controller: AbortController }>();

/**
 * Starts a run of `kind` for the user and returns the controller that a
 * newer run aborts. An analysis always starts; a lookup gets `null` when it
 * has to give way to an analysis on its way. Hand the controller to
 * finishRun when the run is done.
 */
export function startRun(userId: string, kind: "analyze"): AbortController;
export function startRun(userId: string, kind: "locate"): AbortController | null;
export function startRun(userId: string, kind: AiRunKind): AbortController | null {
  const current = runs.get(userId);
  if (kind === "locate" && current?.kind === "analyze") return null;
  current?.controller.abort();
  const controller = new AbortController();
  runs.set(userId, { kind, controller });
  return controller;
}

/** Ends the run, unless a newer one has taken its place. */
export function finishRun(userId: string, controller: AbortController): void {
  if (runs.get(userId)?.controller === controller) runs.delete(userId);
}

/** True while an analysis or a lookup of the user's is on its way (Story 12.2: no warm-up then). */
export function hasRun(userId: string): boolean {
  return runs.has(userId);
}
