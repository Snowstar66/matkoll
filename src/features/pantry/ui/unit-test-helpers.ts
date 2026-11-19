import { fireEvent, within } from "@testing-library/react";

/** The unit the sheet's Enhet select shows ("" for none). Enhet is a plain select next to Mängd. */
export function unitOf(scope: HTMLElement = document.body): string {
  return (within(scope).getByRole("combobox", { name: "Enhet" }) as HTMLSelectElement).value;
}

/** Chooses a unit in the sheet's Enhet select ("" for none). */
export function chooseUnit(unit: string, scope: HTMLElement = document.body): void {
  fireEvent.change(within(scope).getByRole("combobox", { name: "Enhet" }), { target: { value: unit } });
}
