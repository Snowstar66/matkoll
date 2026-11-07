"use client";

import { useSyncExternalStore } from "react";
import { type OptionId, optionChangedEvent, options, readOption } from "./options";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(optionChangedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(optionChangedEvent, listener);
  };
}

/** Whether a Tillval switch is on; the default on the server and during the first render. */
export function useOption(id: OptionId): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readOption(id),
    () => options.find((option) => option.id === id)?.defaultOn ?? false,
  );
}
