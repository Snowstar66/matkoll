import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { CardMenu } from "./card-menu";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }) }));
vi.mock("../actions/remove-card", () => ({ removeThingCard: vi.fn(), restoreThingCard: vi.fn(), finishCardRemoval: vi.fn() }));
vi.mock("../actions/add-card-things", () => ({ addCardThings: vi.fn() }));
vi.mock("./use-card-upload", () => ({ useCardUpload: () => ({ state: { kind: "idle" }, send: vi.fn() }) }));

const cardId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";

function menu() {
  render(
    <ToastProvider>
      <CardMenu cardId={cardId} placeId="0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02" takenAt="2026-10-30T10:00:00Z" name="Hela rummet" roomHref="/prylar/rum/s/boden" />
    </ToastProvider>,
  );
}

beforeEach(() => replace.mockReset());

describe("the ⋯ of a card's page", () => {
  it("is the only place of the card's actions: Ta om kortet, Lägg till föremål and Ta bort kortet in a sheet", async () => {
    menu();
    // Nothing but the ⋯ until it is pressed.
    expect(screen.queryByRole("button", { name: "Ta om" })).toBeNull();
    expect(screen.queryByTestId("remove-card")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Fler val: Hela rummet" }));
    const sheet = screen.getByRole("dialog", { name: "Kortet" });
    expect(within(sheet).getAllByRole("button").map((button) => button.textContent)).toEqual(["Klar", "Ta om kortet", "Lägg till föremål", "Ta bort kortet"]);
  });

  it("opens the question of each action as before, in place of the menu", async () => {
    menu();
    await userEvent.click(screen.getByRole("button", { name: "Fler val: Hela rummet" }));
    await userEvent.click(screen.getByTestId("card-menu-remove"));
    expect(await screen.findByRole("dialog", { name: "Ta bort kortet?" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Kortet" })).toBeNull();
  });
});
