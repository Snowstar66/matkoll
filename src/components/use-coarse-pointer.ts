import { useSyncExternalStore } from "react";

// A phone or tablet (a coarse pointer) gets the camera button; a desktop gets
// the file picker only (EXPERIENCE.md, Responsive). Shared by Importera recept
// and Hemma's camera button.

const coarsePointer = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(coarsePointer);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on a device whose main pointer is coarse (a finger). False on the server and without matchMedia. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(coarsePointer).matches,
    () => false,
  );
}
