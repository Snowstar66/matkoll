// Välkomstturen (Story 20.1): six pages, the last one with three choices.
// Plain data and rules; the pictures and the dialog are in ui/.

/** The number of pages in the tour. */
export const tourPageCount = 6;

/** The page index `n` kept inside the tour: never before the first page or after the last. */
export function clampTourPage(n: number): number {
  return Math.max(0, Math.min(tourPageCount - 1, Math.round(n)));
}

/** "Sida 2 av 6", for the screen reader on every change of page. */
export function tourPageLabel(index: number): string {
  return `Sida ${clampTourPage(index) + 1} av ${tourPageCount}`;
}

/** Whether `index` is the last page, "Var vill du börja?", where Fortsätt and Hoppa över give way to the choices. */
export function isLastTourPage(index: number): boolean {
  return clampTourPage(index) === tourPageCount - 1;
}

/** How far a horizontal swipe must go to change the page. */
export const tourSwipeDistancePx = 40;

/**
 * The page a swipe of `dx` px (negative to the left) leads to from `index`: the next to the left, the
 * previous to the right, the same for a short one. The first page cannot be swiped back from.
 */
export function pageAfterSwipe(index: number, dx: number): number {
  if (Math.abs(dx) <= tourSwipeDistancePx) return index;
  return clampTourPage(index + (dx < 0 ? 1 : -1));
}

/**
 * How the tour was closed. Every way counts as seen. `skip` is Hoppa över or Esc; the other three
 * are the last page's choices.
 */
export type TourExit = "skip" | "add-recipe" | "photo-fridge" | "explore";

/** Where the replay (/valkomst) goes when it is closed with Hoppa över or Esc: back to Hjälp when it came from there. */
export function replayReturnPath(from: string | string[] | undefined): "/hjalp" | "/recept" {
  const value = Array.isArray(from) ? from[0] : from;
  return value === "hjalp" ? "/hjalp" : "/recept";
}

/** Where a choice on the last page leads (Recept for Lägg till ett recept and Titta runt själv, Matvaror's Kyl for the photo). */
export function choicePath(exit: Exclude<TourExit, "skip">): "/recept" | "/hemma?plats=kyl" {
  return exit === "photo-fridge" ? "/hemma?plats=kyl" : "/recept";
}

/** The route of the replay; Hjälp och tips links to it with `?fran=hjalp`. */
export const welcomeRoute = "/valkomst";
