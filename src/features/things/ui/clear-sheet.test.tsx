import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ClearSheet } from "./clear-sheet";

const counts = { things: 74, cards: 9, boxes: 2 };

function setup(onClear = vi.fn().mockResolvedValue(ok(counts))) {
  const onCleared = vi.fn();
  const onStale = vi.fn();
  render(
    <ClearSheet open onClose={vi.fn()} title="Rensa rummet" counts={counts} detail="Det går inte att ångra." word="Skräpförrådet" onClear={onClear} onCleared={onCleared} onStale={onStale} />,
  );
  return { onClear, onCleared, onStale, dialog: screen.getByRole("dialog", { name: "Rensa rummet?" }) };
}

describe("the sheet that guards a clearing", () => {
  it("says what goes and keeps the button disabled until the word is typed", async () => {
    const { dialog, onClear } = setup();
    expect(within(dialog).getByText("Det här tas bort: 74 föremål, 9 kort, 2 lådor.")).toBeInTheDocument();
    const button = within(dialog).getByRole("button", { name: "Rensa rummet" });
    expect(button).toBeDisabled();
    const field = within(dialog).getByLabelText("Skriv Skräpförrådet för att bekräfta.");
    await userEvent.type(field, "skräpför");
    expect(button).toBeDisabled();
    await userEvent.type(field, "rådet ");
    expect(button).toBeEnabled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("clears once the word is typed and tells the page", async () => {
    const { dialog, onClear, onCleared } = setup();
    await userEvent.type(within(dialog).getByLabelText(/Skriv/), "SKRÄPFÖRRÅDET");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rensa rummet" }));
    await waitFor(() => expect(onCleared).toHaveBeenCalledWith(counts));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows the failure and keeps the sheet when the clearing fails", async () => {
    const { dialog, onCleared } = setup(vi.fn().mockResolvedValue(fail("things_clear_failed")));
    await userEvent.type(within(dialog).getByLabelText(/Skriv/), "Skräpförrådet");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rensa rummet" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att rensa.");
    expect(onCleared).not.toHaveBeenCalled();
  });

  it("reads the page again when the room is gone", async () => {
    const { dialog, onStale } = setup(vi.fn().mockResolvedValue(fail("things_place_gone")));
    await userEvent.type(within(dialog).getByLabelText(/Skriv/), "Skräpförrådet");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rensa rummet" }));
    await waitFor(() => expect(onStale).toHaveBeenCalled());
  });
});
