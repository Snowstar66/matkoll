import { fireEvent, within } from "@testing-library/react";

/** The unit the sheet's Enhet chips show as chosen ("" for none). Story 19.5: Enhet is a row of chips, not a select. */
export function unitOf(scope: HTMLElement = document.body): string {
  const group = within(scope).getByRole("radiogroup", { name: "Enhet" });
  return within(group).queryByRole("radio", { checked: true })?.textContent ?? "";
}

/** Chooses a unit: its chip when it shows, else through "Fler ›" and the row in the step behind it. */
export function chooseUnit(unit: string, scope: HTMLElement = document.body): void {
  const group = within(scope).getByRole("radiogroup", { name: "Enhet" });
  const chip = within(group).queryByRole("radio", { name: unit });
  if (chip) {
    if (chip.getAttribute("aria-checked") !== "true") fireEvent.click(chip);
    return;
  }
  fireEvent.click(within(group).getByRole("button", { name: "Fler ›" }));
  fireEvent.click(within(scope).getByRole("radio", { name: unit }));
}
