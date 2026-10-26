import "server-only";
import { revalidateFor } from "@/lib/revalidate";

/**
 * Revalidates what shows the pantry after a write that has committed
 * (AD-18). A failure here is logged, never returned: the write stands, and
 * the page catches up on the next read.
 */
export function revalidatePantryCommitted(): void {
  try {
    revalidateFor("pantry_item");
  } catch (error) {
    console.error("pantry_revalidate_failed", { reason: error instanceof Error ? error.name : "unknown" });
  }
}
