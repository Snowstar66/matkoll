"use client";

import { useEffect } from "react";
import { warmAi, type WarmAiKind } from "@/lib/ai-client";

/**
 * Wakes the model when the page is shown (Story 12.2, FR-45): Matvaror
 * renders this with `image` and Recept with `text`, outside their Suspense
 * boundaries, so it never waits for the page's data. The effect runs each
 * time the page is shown, also when React's Activity shows a hidden page
 * again; warmAi itself asks at most once per kind in three minutes, and only
 * once while a request is on its way. Renders nothing and never shows
 * anything.
 */
export function WarmAi({ kind }: { kind: WarmAiKind }) {
  useEffect(() => {
    void warmAi(kind);
  }, [kind]);
  return null;
}
