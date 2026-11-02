import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { Staple } from "../domain/staples";
import { StaplesSettings } from "./staples-settings";

// Basvaror under Inställningar with the Server Actions stubbed. The "server"
// list does not change, so a removed row stays hidden here until a failure.

const actions = vi.hoisted(() => ({
  addStaple: vi.fn(),
  removeStaple: vi.fn(),
  restoreStaple: vi.fn(),
  resetStaples: vi.fn(),
}));
vi.mock("../actions/staples", () => actions);

const staples: Staple[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Salt", normalizedName: "salt", maxAmount: null, maxUnit: null },
  { id: "22222222-2222-4222-8222-222222222222", name: "Vetemjöl", normalizedName: "vetemjöl", maxAmount: 1, maxUnit: "dl" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Smör", normalizedName: "smör", maxAmount: 50, maxUnit: "g" },
];

function renderStaples() {
  return render(
    <ToastProvider>
      <StaplesSettings staples={staples} />
    </ToastProvider>,
  );
}

const rows = () => screen.queryAllByTestId("staple").map((row) => row.textContent);

/** Presses a bin from the keyboard: a second pointer press on any bin within 400 ms is ignored (trash-button). */
async function pressBin(name: string) {
  screen.getByRole("button", { name }).focus();
  await userEvent.keyboard("{Enter}");
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

describe("StaplesSettings", () => {
  it("lists the staples with their limits and a bin each", () => {
    renderStaples();
    expect(rows()).toEqual(["Saltalltid", "Vetemjölupp till 1 dl", "Smörupp till 50 g"]);
    expect(screen.getByRole("button", { name: "Ta bort Vetemjöl" })).toBeEnabled();
  });

  it("removes a staple at once and brings it back with Ångra, as it was", async () => {
    actions.removeStaple.mockResolvedValue(ok({ staple: staples[1] }));
    actions.restoreStaple.mockResolvedValue(ok({ staple: staples[1] }));
    renderStaples();
    await pressBin("Ta bort Vetemjöl");
    expect(rows()).toEqual(["Saltalltid", "Smörupp till 50 g"]);
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Tog bort Vetemjöl.");
    await userEvent.click(within(toast).getByRole("button", { name: /Ångra/ }));
    await waitFor(() => expect(actions.restoreStaple).toHaveBeenCalledWith({ name: "Vetemjöl", maxAmount: 1, maxUnit: "dl" }));
  });

  it("brings the row back with the notice when the removal fails", async () => {
    actions.removeStaple.mockResolvedValue(fail("staples_save_failed"));
    renderStaples();
    await pressBin("Ta bort Salt");
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara basvarorna. Försök igen.");
    await waitFor(() => expect(rows()).toHaveLength(3));
  });

  it("adds a staple with its limit, and shows a limit it cannot read under the field", async () => {
    actions.addStaple.mockResolvedValueOnce(fail("staples_invalid_limit", { limit: "Skriv en mängd i g, dl, msk eller tsk, t.ex. 1 dl. Lämna tomt för alltid." }));
    renderStaples();
    await userEvent.type(screen.getByLabelText("Namn"), "Kardemumma");
    await userEvent.type(screen.getByLabelText("Upp till, tomt för alltid"), "2 st");
    await userEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(await screen.findByText(/Skriv en mängd i g, dl, msk eller tsk/)).toBeInTheDocument();
    const sent = actions.addStaple.mock.calls[0]![1] as FormData;
    expect([sent.get("name"), sent.get("limit")]).toEqual(["Kardemumma", "2 st"]);

    actions.addStaple.mockResolvedValueOnce(ok({ staple: { ...staples[0], id: "x", name: "Kardemumma" } }));
    await userEvent.clear(screen.getByLabelText("Upp till, tomt för alltid"));
    await userEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Lade till Kardemumma.");
    expect(screen.getByLabelText("Namn")).toHaveValue("");
  });

  it("asks before Återställ standard, and resets after the answer", async () => {
    actions.resetStaples.mockResolvedValue(ok());
    renderStaples();
    await userEvent.click(screen.getByRole("button", { name: "Återställ standard" }));
    expect(await screen.findByRole("dialog", { name: "Återställ standardlistan?" })).toBeInTheDocument();
    expect(actions.resetStaples).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Återställ" }));
    await waitFor(() => expect(actions.resetStaples).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Basvarorna är som från början.");
  });
});
