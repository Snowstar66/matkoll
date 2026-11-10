"use client";

import { useSyncExternalStore } from "react";
import { type ChoiceOptionId, type OptionId, defaultChoice, optionChangedEvent, options, readChoice, readOption } from "./options";

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

/** The chosen value of a choice option (src/lib/options.ts); the default on the server and during the first render. */
export function useChoice(id: ChoiceOptionId): string {
  return useSyncExternalStore(
    subscribe,
    () => readChoice(id),
    () => defaultChoice(id),
  );
}
