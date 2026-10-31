import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import { AddCardThings } from "./add-card-things";

const addCardThings = vi.fn();
vi.mock("../actions/add-card-things", () => ({ addCardThings: (input: unknown) => addCardThings(input) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const cardId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";

beforeEach(() => {
  addCardThings.mockReset();
  refresh.mockReset();
});

async function open() {
  render(
    <ToastProvider>
      <AddCardThings cardId={cardId} name="Väggen" />
    </ToastProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /Lägg till föremål/ }));
  return screen.getByRole("dialog", { name: "Lägg till föremål på kortet" });
}

describe("Lägg till föremål on a card", () => {
  it("sends the text for this card and reads the page again", async () => {
    addCardThings.mockResolvedValue(ok({ count: 2, categorized: true }));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Vad saknas?"), "Skiftnyckel, 2 st");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(addCardThings).toHaveBeenCalledWith({ cardId, text: "Skiftnyckel, 2 st" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((await screen.findAllByText("Lade till 2 föremål.")).length).toBeGreaterThan(0);
  });

  it("says so when the AI did not sort them", async () => {
    addCardThings.mockResolvedValue(ok({ count: 1, categorized: false }));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Vad saknas?"), "Spade");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect((await screen.findAllByText(/utan kategorier/)).length).toBeGreaterThan(0);
  });

  it("shows the text under the field when it is refused, and a failure in the sheet", async () => {
    addCardThings.mockResolvedValueOnce(fail("validation", { text: "Skriv minst ett föremål." }));
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect(await within(dialog).findByText("Skriv minst ett föremål.")).toBeInTheDocument();
    addCardThings.mockResolvedValueOnce(fail("things_item_failed"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att spara föremålet.");
  });
});
