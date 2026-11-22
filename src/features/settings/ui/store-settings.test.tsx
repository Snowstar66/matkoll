import { render as renderBare, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { SaveStoreState } from "../actions/save-store";
import type { Store } from "../domain/store";
import { StoreSettings, StoreSettingsUnavailable } from "./store-settings";

// The section Butik with both Server Actions stubbed. The "server" stores do
// not change, so what the card shows after "Välj" comes from the optimistic
// state and goes back when the transition ends.

const selectStore = vi.fn<(input: { id: string }) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/select-store", () => ({ selectStore: (input: { id: string }) => selectStore(input) }));
const saveStore = vi.fn<(previous: SaveStoreState, formData: FormData) => Promise<SaveStoreState>>();
vi.mock("../actions/save-store", () => ({
  saveStore: (previous: SaveStoreState, formData: FormData) => saveStore(previous, formData),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const maxi: Store = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: null,
  url: "https://handlaprivatkund.ica.se/stores/1003733",
  offersUrl: null,
  isSelected: true,
};
const willys: Store = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Willys Lindhagen",
  chain: "Willys",
  externalStoreId: null,
  address: "Lindhagensgatan 1",
  url: null,
  offersUrl: null,
  isSelected: false,
};

const coop: Store = { ...willys, id: "33333333-3333-4333-8333-333333333333", name: "Coop Forum", chain: "Coop" };

function render(stores: readonly Store[]) {
  return renderBare(<StoreSettings stores={stores} />, { wrapper: ToastProvider });
}

const card = () => screen.getByTestId("selected-store");

beforeEach(() => {
  selectStore.mockReset().mockImplementation(async ({ id }) => ok({ id }));
  saveStore.mockReset().mockImplementation(async (_previous, formData) =>
    ok({ store: { ...maxi, id: String(formData.get("id")), name: String(formData.get("name")) } }),
  );
  refresh.mockReset();
});

describe("StoreSettings", () => {
  it("shows the selected store as a card, without the raw web address (Story 14.7)", () => {
    render([maxi]);
    expect(screen.getByRole("heading", { level: 2, name: "Butik" })).toBeInTheDocument();
    expect(within(card()).getByRole("heading", { level: 3, name: "Maxi ICA Stormarknad Östersund" })).toBeInTheDocument();
    expect(card()).toHaveTextContent("ICA · butiks-id 1003733");
    expect(card()).toHaveTextContent("Ingen adress angiven");
    expect(within(card()).queryByRole("link")).not.toBeInTheDocument();
    expect(card()).not.toHaveTextContent("handlaprivatkund");
    expect(within(card()).getByRole("button", { name: "Ändra" })).toBeEnabled();
    expect(screen.queryByRole("list", { name: "Byt butik" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg till butik" })).toBeEnabled();
  });

  it("says at the top what the page is for, and what the selected store controls", () => {
    render([maxi]);
    expect(screen.getByText(/^Här väljer du butiken du handlar i\. Den styr två saker/)).toBeInTheDocument();
    expect(card()).toHaveTextContent("Din butik");
    expect(card()).toHaveTextContent("Vald");
    expect(card()).toHaveTextContent("Varukorgen: listan kopieras med den här butiken");
  });

  it("lists the other stores as cards with Ändra and Använd den här butiken each", () => {
    render([maxi, willys]);
    const list = screen.getByRole("list", { name: "Byt butik" });
    expect(within(list).getAllByTestId("other-store")).toHaveLength(1);
    expect(list).toHaveTextContent("Willys Lindhagen");
    expect(list).toHaveTextContent("Willys");
    const use = within(list).getByRole("button", { name: "Använd Willys Lindhagen" });
    expect(use).toBeEnabled();
    expect(use).toHaveTextContent("Använd den här butiken");
    expect(within(list).getByRole("button", { name: "Ändra Willys Lindhagen" })).toBeEnabled();
    // One Ändra per card, the same in every card.
    expect(within(card()).getAllByRole("button", { name: "Ändra" })).toHaveLength(1);
  });

  it("explains when no store is selected, and still offers Lägg till butik", () => {
    render([{ ...willys }]);
    expect(screen.getByTestId("no-store")).toHaveTextContent("Ingen butik vald");
    expect(screen.getByTestId("no-store")).toHaveTextContent("Välj en butik nedan så får du erbjudanden och en färdig lista att kopiera.");
    expect(screen.queryByTestId("selected-store")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Använd Willys Lindhagen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg till butik" })).toBeInTheDocument();
  });

  it("explains what a store gives, with a big Lägg till butik, when there are no stores", () => {
    render([]);
    const empty = screen.getByTestId("no-stores");
    expect(empty).toHaveTextContent("Lägg till din butik");
    expect(empty).toHaveTextContent("Du ser veckans erbjudanden från butiken (just nu för ICA).");
    expect(empty).toHaveTextContent("Listan kan kopieras med butikens namn");
    expect(screen.queryByText(/^Här väljer du butiken/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg till butik" })).toBeEnabled();
  });

  it("says Erbjudanden hämtas från ica.se when the store has a link, and warns on an ICA store without one", () => {
    const { unmount } = render([{ ...maxi, offersUrl: "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/" }]);
    expect(screen.getByTestId("store-offers-link")).toHaveTextContent("Erbjudanden hämtas från ica.se");
    expect(screen.queryByTestId("no-offers")).not.toBeInTheDocument();
    unmount();
    render([maxi]);
    expect(screen.getByTestId("no-offers")).toHaveTextContent("Inga erbjudanden än.");
  });

  it("gives no warning about offers for a chain without an offer site", () => {
    render([{ ...willys, isSelected: true }]);
    expect(screen.queryByTestId("no-offers")).not.toBeInTheDocument();
  });

  it("selects a store at once with Använd den här butiken, and confirms it", async () => {
    let answer: (result: Result<{ id: string }>) => void = () => {};
    selectStore.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    render([maxi, willys, coop]);
    await userEvent.click(screen.getByRole("button", { name: "Använd Willys Lindhagen" }));

    // Optimistic: the card shows Willys before the server answers.
    await waitFor(() => expect(within(card()).getByRole("heading", { level: 3 })).toHaveTextContent("Willys Lindhagen"));
    // One selection at a time: every Använd waits while it is saved.
    expect(screen.getByRole("button", { name: "Använd Maxi ICA Stormarknad Östersund" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Använd Coop Forum" })).toBeDisabled();
    expect(selectStore).toHaveBeenCalledWith({ id: willys.id });
    answer(ok({ id: willys.id }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Du handlar nu hos Willys Lindhagen.");
    // The pressed button left the list, so focus goes to the card.
    expect(within(card()).getByRole("heading", { level: 3 })).toHaveFocus();
    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Använd Coop Forum" })).toBeEnabled());
  });

  it.each([
    ["an error result", () => Promise.resolve(fail("settings_save_failed")), "Det gick inte att spara ändringen. Försök igen."],
    ["a store that is gone", () => Promise.resolve(fail("settings_store_gone")), "Butiken finns inte längre."],
    ["no answer", () => Promise.reject(new TypeError("Failed to fetch")), "Det gick inte att spara ändringen. Försök igen."],
  ])("goes back after %s, with the notice, and reads the stores again", async (_, answer, message) => {
    selectStore.mockImplementation(answer);
    render([maxi, willys]);
    await userEvent.click(screen.getByRole("button", { name: "Använd Willys Lindhagen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    await waitFor(() => expect(within(card()).getByRole("heading", { level: 3 })).toHaveTextContent(maxi.name));
    expect(within(card()).getByRole("heading", { level: 3 })).not.toHaveFocus();
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });
});

describe("StoreSettingsUnavailable", () => {
  it("shows the heading and the notice", () => {
    renderBare(<StoreSettingsUnavailable />);
    expect(screen.getByRole("heading", { level: 2, name: "Butik" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa butiken. Försök igen.");
  });
});
