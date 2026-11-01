// Snabbkamera (Story 18.10): the in-app camera on a room's page. Tap, tap, tap:
// every tap is a shot in the strip, an × drops one, and "Klar" sends them all,
// in the order they were taken, each as its own card. Pure.

/** One shot in the strip: the photo, and a small preview of it. */
export type Shot<Photo = Blob> = { id: string; photo: Photo; thumb: string };

export type ShotsAction<Photo = Blob> = { type: "add"; shot: Shot<Photo> } | { type: "remove"; id: string } | { type: "clear" };

export function shotsReducer<Photo>(shots: readonly Shot<Photo>[], action: ShotsAction<Photo>): readonly Shot<Photo>[] {
  switch (action.type) {
    case "add":
      return shots.some((shot) => shot.id === action.shot.id) ? shots : [...shots, action.shot];
    case "remove":
      return shots.filter((shot) => shot.id !== action.id);
    case "clear":
      return [];
  }
}

/** What "Klar" sends: the photos in the order they were taken. */
export function sendQueue<Photo>(shots: readonly Shot<Photo>[]): Photo[] {
  return shots.map((shot) => shot.photo);
}

/** Why the camera does not show: no permission, or no camera (a desktop without one, an old browser). */
export type CameraProblem = "denied" | "missing";

/** The error getUserMedia threw, as a problem. Anything but a refusal reads as "no camera". */
export function cameraProblem(error: unknown): CameraProblem {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError" ? "denied" : "missing";
}

export const quickCameraText = "Snabbkamera";
export const quickCameraHintText = "Tryck, tryck, tryck – Klar skickar alla";
export const shutterText = "Ta kort";
export const startingCameraText = "Startar kameran …";
export const fallbackCameraText = "Använd Ta foto";

/** "3 kort" in the top right corner. */
export function shotCountText(count: number): string {
  return `${count} kort`;
}

/** The × on a thumbnail. */
export function removeShotText(index: number): string {
  return `Ta bort kort ${index + 1}`;
}

/** "Klar" says how many are sent, for a screen reader. */
export function sendShotsLabel(count: number): string {
  return count === 1 ? "Klar, skicka 1 kort" : `Klar, skicka ${count} kort`;
}

/** The calm line when the camera cannot start, and what to do instead. */
export function cameraProblemText(problem: CameraProblem): string {
  return problem === "denied"
    ? "Kameran är inte tillåten för appen. Du kan tillåta den i webbläsarens inställningar, eller ta ett foto i taget med Ta foto."
    : "Hittar ingen kamera här. Ta ett foto i taget med Ta foto, eller välj bilder.";
}
