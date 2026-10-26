import "server-only";
import { revalidateFor } from "@/lib/revalidate";

/**
 * Revalidates what shows the pantry after a write that has committed
 * (AD-18). A failure here is logged, never returned: the write stands, and
 * the page catches up on the next read.
 */
export function revalidatePantryCommitted(): void {
  revalidateLogged("pantry_item");
}

/**
 * Has the pages read again after a write found its place gone
 * (`pantry_site_gone`, Story 8.4), so Hemma shows a place that is there. A
 * failure here is logged, never returned: the answer is the place's.
 */
export function revalidateSiteGone(): void {
  revalidateLogged("pantry_site");
}

function revalidateLogged(table: "pantry_item" | "pantry_site"): void {
  try {
    revalidateFor(table);
  } catch (error) {
    console.error("pantry_revalidate_failed", { reason: error instanceof Error ? error.name : "unknown" });
  }
}
