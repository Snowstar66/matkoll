import { fireEvent, screen } from "@testing-library/react";

/** Kylfoto D: the one button under the rows, "Lägg till 3 varor" (or "Sparar …" while it saves). */
export const addAllButton = () => screen.getByRole("button", { name: /^(Lägg till \d+ var(a|or)|Sparar …)$/ });

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
