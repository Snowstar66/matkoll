import type { Location } from "@/features/catalog";
import type { Result } from "@/lib/errors";
import { savePlacePhotoPoints } from "../actions/save-place-photo-points";
import type { PhotoPoint } from "../domain/photo-numbers";
import { postPlacePhoto, type PhotoPostAnswer } from "./photo-post";

// Senaste foto (Story 10.1, FR-37, AD-26): the client side of saving the
// latest photo of a place. One PhotoSave per answer with cards (one
// generation of suggestions): the first write from them that succeeds
// (Bekräfta, the sheet's "Bekräfta", "Bekräfta alla", "Ta bort") calls
// `written`, which sends the photo, in the background, to POST
// /api/pantry/photo (postPlacePhoto); later writes do nothing. A save that
// got no answer or a server error is sent once more at the next write that
// succeeds; a refusal is final. The points of the numbers (Story 6.6) go with
// it when they have come, or are added once with savePlacePhotoPoints when
// they come after it was saved. The call is never stopped by a new photo,
// "Avbryt" or Hemma being hidden, only by its own 60 s. Nothing is ever shown
// for it. The photo is the same Blob that was analysed, never resized or
// encoded again, so the points stay on their items.
//
// The photo's id comes from the server (it names the file there). When an
// answer is lost, there is no id, and points that come later are not sent;
// a second try saves the photo with points, if they have come by then.

/** What is saved with a photo: the place and location its suggestions are for (FR-33), when it was taken and the reading. */
export type PhotoToSave = {
  image: Blob;
  siteId: string;
  location: Location;
  takenAt: Date;
  reading: readonly string[];
};

export type PhotoSave = {
  /** A write from the photo's suggestions succeeded: saves the photo, the first time (and once more after no answer). */
  written: () => void;
  /** The numbers' points have come (Story 6.6): sent with the photo, or added once after it. */
  located: (points: readonly PhotoPoint[]) => void;
};

/** The calls a PhotoSave makes; replaced in tests. */
export type PhotoSaveCalls = {
  post: (form: FormData) => Promise<PhotoPostAnswer>;
  savePoints: (input: { id: string; points: { positions: PhotoPoint[] } }) => Promise<Result<unknown>>;
};

const defaultCalls: PhotoSaveCalls = {
  post: (form) => postPlacePhoto(form),
  savePoints: (input) => savePlacePhotoPoints(input),
};

/** How many times a photo is sent at most: once, and once more after no answer or a server error. */
export const maxPhotoPosts = 2;

/** A save for the photo `photo`, which sends nothing until `written`. */
export function photoSave(photo: PhotoToSave, calls: PhotoSaveCalls = defaultCalls): PhotoSave {
  let state: "waiting" | "saving" | "saved" | "retry" | "failed" = "waiting";
  let posts = 0;
  let id: string | null = null;
  let points: PhotoPoint[] | null = null;
  let pointsSent = false;

  function sendPoints() {
    if (id === null || points === null || pointsSent) return;
    pointsSent = true;
    void calls.savePoints({ id, points: { positions: points } }).catch(() => {});
  }

  async function save() {
    posts += 1;
    const form = new FormData();
    form.append("image", photo.image, "photo");
    form.append("site", photo.siteId);
    form.append("location", photo.location);
    form.append("takenAt", photo.takenAt.toISOString());
    form.append("reading", JSON.stringify(photo.reading));
    const withPoints = points !== null;
    if (withPoints) form.append("points", JSON.stringify({ positions: points }));
    let answer: PhotoPostAnswer;
    try {
      answer = await calls.post(form);
    } catch {
      answer = { kind: "retry" };
    }
    if (answer.kind === "saved") {
      id = answer.id;
      state = "saved";
      if (withPoints) pointsSent = true;
      // Points that came while it was on its way.
      sendPoints();
    } else {
      state = answer.kind === "retry" && posts < maxPhotoPosts ? "retry" : "failed";
    }
  }

  return {
    written() {
      if (state !== "waiting" && state !== "retry") return;
      state = "saving";
      void save();
    },
    located(found) {
      if (points !== null || found.length === 0) return;
      points = [...found].sort((a, b) => a.n - b.n);
      if (state === "saved") sendPoints();
    },
  };
}
