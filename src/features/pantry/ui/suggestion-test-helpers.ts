import { fireEvent, screen } from "@testing-library/react";

/**
 * Kylfoto D: the one button under the rows, "Lägg till 3 varor", "Lägg till 3 · ta bort 1" or "Ta bort 1 vara"
 * (or "Sparar …" while it saves).
 */
export const addAllButton = () =>
  screen.getByRole("button", { name: /^(Lägg till \d+ var(a|or)|Lägg till \d+ · ta bort \d+|Ta bort \d+ var(a|or)|Sparar …)$/ });

/** Kylfoto D: unfolds "Syns inte längre (N)" when it is folded. */
export function openMissing() {
  const toggle = screen.getByTestId("pantry-missing-toggle");
  if (toggle.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
}

/** Kylfoto D: ticks exactly the "Syns inte längre" items `names`, no row, then presses "Ta bort N varor". */
export function removeOnly(...names: string[]) {
  openMissing();
  const wanted = new Set(names.map((name) => `Ta bort ${name}`));
  for (const box of screen.getAllByRole("checkbox")) {
    const tick = wanted.has(box.getAttribute("aria-label") ?? "");
    if ((box.getAttribute("aria-checked") === "true") !== tick && !(box as HTMLButtonElement).disabled) fireEvent.click(box);
  }
  fireEvent.click(addAllButton());
}

/** Ticks exactly the row `name` (the nth with that name), then presses "Lägg till 1 vara". */
export function confirmOnly(name: string, index = 0) {
  const target = screen.getAllByRole("checkbox", { name: `Ta med ${name}` })[index];
  for (const box of screen.getAllByRole("checkbox")) {
    const wanted = box === target;
    if ((box.getAttribute("aria-checked") === "true") !== wanted && !(box as HTMLButtonElement).disabled) fireEvent.click(box);
  }
  fireEvent.click(addAllButton());
}

/** Opens the row ("Rätta name") and presses "Inte en vara" in the sheet. */
export function rejectRow(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Rätta ${name}` }));
  fireEvent.click(screen.getByRole("button", { name: "Inte en vara" }));
}
