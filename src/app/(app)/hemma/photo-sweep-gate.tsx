import { needsPlacePhotoSweep } from "@/features/pantry/server";
import { PhotoSweep } from "@/features/pantry/ui/photo-sweep";

/**
 * Renders PhotoSweep when the user has photos older than 30 days (Story
 * 10.3). HomeContent puts it in a Suspense boundary of its own, so Lagersaldo
 * never waits for it. Nothing is shown either way, and an error here (logged
 * with its name only) never reaches the page: the sweep is left for the next
 * view or save.
 */
export async function PhotoSweepGate() {
  let needed = false;
  try {
    needed = await needsPlacePhotoSweep();
  } catch (error) {
    console.error("pantry_photo_sweep_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
  }
  return needed ? <PhotoSweep /> : null;
}
