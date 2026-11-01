import { render as renderBare, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { SaveStoreState } from "../actions/save-store";
import type { Store } from "../domain/store";
import { StoreSettings } from "./store-settings";

// The sheet Ny butik / Ändra butik, opened from the section Butik as Pontus
// opens it, with both Server Actions stubbed.

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

function render(stores: readonly Store[]) {
  return renderBare(<StoreSettings stores={stores} />, { wrapper: ToastProvider });
}

const card = () => screen.getByTestId("selected-store");
const sheet = (name: string) => screen.getByRole("dialog", { name });

/** The FormData of the last saveStore call, as a plain object. */
function lastSaved(): Record<string, FormDataEntryValue> {
  const formData = saveStore.mock.lastCall![1];
  return Object.fromEntries(formData.entries());
}

beforeEach(() => {
  selectStore.mockReset().mockImplementation(async ({ id }) => ok({ id }));
  saveStore.mockReset().mockImplementation(async (_previous, formData) =>
    ok({ store: { ...maxi, id: String(formData.get("id")), name: String(formData.get("name")) } }),
  );
  refresh.mockReset();
});

describe("StoreSheet: the link to the weekly offers (Story 9.1)", () => {
  const link = "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/";

  it("shows the link field with its help text for ICA, and saves the link", async () => {
    const user = userEvent.setup();
    render([maxi]);
    await user.click(within(card()).getByRole("button", { name: "Ändra" }));
    const dialog = sheet("Ändra butik");
    const field = within(dialog).getByLabelText("Länk till veckans erbjudanden");
    expect(field).toHaveAttribute("inputmode", "url");
    expect(field).toHaveAccessibleDescription("Öppna butikens erbjudanden på ica.se och kopiera adressen.");
    await user.type(field, link.slice(0, -1));
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(1));
    expect(lastSaved()).toMatchObject({ offersUrl: link.slice(0, -1), chain: "ICA" });
  });

  it("shows the error under the field for an address that is not an offer page, and saves nothing", async () => {
    const user = userEvent.setup();
    render([maxi]);
    await user.click(within(card()).getByRole("button", { name: "Ändra" }));
    const dialog = sheet("Ändra butik");
    const field = within(dialog).getByLabelText("Länk till veckans erbjudanden");
    await user.type(field, "https://www.willys.se/erbjudanden/butik");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(
      await within(dialog).findByText(
        "Ange adressen till butikens erbjudanden på ica.se, till exempel https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/.",
      ),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(saveStore).not.toHaveBeenCalled();
  });

  it("has no link field for another chain, and says so", async () => {
    const user = userEvent.setup();
    render([maxi, willys]);
    await user.click(screen.getByRole("button", { name: "Ändra Willys Lindhagen" }));
    const dialog = sheet("Ändra butik");
    expect(within(dialog).queryByLabelText("Länk till veckans erbjudanden")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Länk stöds bara för ICA än så länge.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: "ICA" }));
    expect(within(dialog).getByLabelText("Länk till veckans erbjudanden")).toBeInTheDocument();
  });

  it("shows the stored link in the field, and the card says Erbjudanden: ica.se", async () => {
    const user = userEvent.setup();
    render([{ ...maxi, offersUrl: link }]);
    expect(within(card()).getByText("Erbjudanden: ica.se")).toBeInTheDocument();
    await user.click(within(card()).getByRole("button", { name: "Ändra" }));
    expect(within(sheet("Ändra butik")).getByLabelText("Länk till veckans erbjudanden")).toHaveValue(link);
  });

  it("shows no offers line on the card without a link", () => {
    render([maxi]);
    expect(within(card()).queryByText(/^Erbjudanden:/)).not.toBeInTheDocument();
  });
});

describe("StoreSheet", () => {
  it("adds a store, selected by default, with an id from the client", async () => {
    const user = userEvent.setup();
    render([maxi]);
    await user.click(screen.getByRole("button", { name: "Lägg till butik" }));
    const dialog = sheet("Ny butik");
    expect(within(dialog).getByRole("checkbox", { name: "Använd för varukorgen" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "ICA" })).toBeChecked();
    expect(within(dialog).getByLabelText("URL")).toHaveAttribute("type", "url");

    await user.type(within(dialog).getByLabelText("Namn"), "Willys Lindhagen");
    await user.click(within(dialog).getByRole("radio", { name: "Willys" }));
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));

    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(1));
    expect(lastSaved()).toMatchObject({
      name: "Willys Lindhagen",
      chain: "Willys",
      externalStoreId: "",
      address: "",
      url: "",
      makeSelected: "true",
      mode: "add",
    });
    expect(String(lastSaved().id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByTestId("toast")).toHaveTextContent("Butiken är sparad.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("adds a store without selecting it when the box is unticked", async () => {
    const user = userEvent.setup();
    render([maxi]);
    await user.click(screen.getByRole("button", { name: "Lägg till butik" }));
    const dialog = sheet("Ny butik");
    await user.type(within(dialog).getByLabelText("Namn"), "Lidl Lillänge");
    await user.click(within(dialog).getByRole("checkbox", { name: "Använd för varukorgen" }));
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(1));
    expect(lastSaved().makeSelected).toBeUndefined();
  });

  it("shows the form's own messages at their fields and saves nothing", async () => {
    const user = userEvent.setup();
    render([maxi]);
    await user.click(screen.getByRole("button", { name: "Lägg till butik" }));
    const dialog = sheet("Ny butik");
    await user.type(within(dialog).getByLabelText("URL"), "handla.ica.se");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));

    expect(await within(dialog).findByText("Ange butikens namn.")).toBeInTheDocument();
    expect(within(dialog).getByText("Ange en adress som börjar med https://.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Namn")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("Namn")).toHaveFocus();
    expect(saveStore).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Namn"), "x".repeat(101));
    expect(within(dialog).getByText("Texten får vara högst 100 tecken.")).toBeInTheDocument();
  });

  it("keeps the id for the whole opening, also after a change, and a new opening takes a new one", async () => {
    const user = userEvent.setup();
    saveStore.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render([maxi]);
    await user.click(screen.getByRole("button", { name: "Lägg till butik" }));
    const dialog = sheet("Ny butik");
    await user.type(within(dialog).getByLabelText("Namn"), "Coop Forum");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att spara ändringen. Försök igen.");
    const first = lastSaved().id;

    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(2));
    expect(lastSaved().id).toBe(first);
    await within(dialog).findByRole("alert");

    // A changed form keeps the id too: save_store changes the row a lost answer may have added.
    await user.type(within(dialog).getByLabelText("Butiks-id"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(3));
    expect(lastSaved()).toMatchObject({ id: first, mode: "add", externalStoreId: "1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Lägg till butik" }));
    await user.type(within(sheet("Ny butik")).getByLabelText("Namn"), "Coop Forum");
    await user.click(within(sheet("Ny butik")).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(4));
    expect(lastSaved().id).not.toBe(first);
  });

  it.each([
    ["settings_save_failed", fail("settings_save_failed"), true],
    ["unauthorized", fail("unauthorized"), false],
  ])("reads the stores again after %s", async (_, answer, notice) => {
    const user = userEvent.setup();
    saveStore.mockResolvedValue(answer);
    render([maxi]);
    await user.click(screen.getByRole("button", { name: "Lägg till butik" }));
    const dialog = sheet("Ny butik");
    await user.type(within(dialog).getByLabelText("Namn"), "Coop Forum");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    if (notice) expect(within(dialog).getByRole("alert")).toHaveTextContent("Det gick inte att spara ändringen. Försök igen.");
    else expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names a duplicate at Butiks-id", async () => {
    const user = userEvent.setup();
    saveStore.mockResolvedValue(fail("settings_duplicate_store", { externalStoreId: "Butiken finns redan." }));
    render([maxi]);
    await user.click(screen.getByRole("button", { name: "Lägg till butik" }));
    const dialog = sheet("Ny butik");
    await user.type(within(dialog).getByLabelText("Namn"), "Maxi igen");
    await user.type(within(dialog).getByLabelText("Butiks-id"), "1003733");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));

    expect(await within(dialog).findByText("Butiken finns redan.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Butiks-id")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("Butiks-id")).toHaveFocus();
  });

  it("changes the selected store's details, with the hint under Kedja and no box", async () => {
    const user = userEvent.setup();
    render([maxi, willys]);
    await user.click(within(card()).getByRole("button", { name: "Ändra" }));
    const dialog = sheet("Ändra butik");
    expect(within(dialog).getByLabelText("Namn")).toHaveValue(maxi.name);
    expect(within(dialog).getByLabelText("Butiks-id")).toHaveValue("1003733");
    expect(within(dialog).getByRole("radiogroup", { name: "Kedja" })).toHaveAccessibleDescription(
      "Byter du kedja, lägg hellre till en ny butik, så behåller den här sina produktval.",
    );
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Adress"), "Krondikesvägen 97, Östersund");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(1));
    expect(lastSaved()).toMatchObject({ id: maxi.id, mode: "change", address: "Krondikesvägen 97, Östersund", chain: "ICA" });
    expect(lastSaved().makeSelected).toBeUndefined();
    expect(await screen.findByTestId("toast")).toHaveTextContent("Butiken är sparad.");
  });

  it("closes without saving when nothing changed", async () => {
    const user = userEvent.setup();
    render([maxi]);
    await user.click(within(card()).getByRole("button", { name: "Ändra" }));
    await user.click(within(sheet("Ändra butik")).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveStore).not.toHaveBeenCalled();
  });

  it("asks before it throws away changes", async () => {
    const user = userEvent.setup();
    render([maxi]);
    await user.click(within(card()).getByRole("button", { name: "Ändra" }));
    const dialog = sheet("Ändra butik");
    await user.type(within(dialog).getByLabelText("Adress"), "Krondikesvägen 97");
    await user.click(within(dialog).getByRole("button", { name: "Avbryt" }));
    expect(within(dialog).getByText("Släng ändringarna?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Släng ändringarna" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveStore).not.toHaveBeenCalled();
  });

  it("closes and reads the stores again when the store is gone", async () => {
    const user = userEvent.setup();
    saveStore.mockResolvedValue(fail("settings_store_gone"));
    render([maxi]);
    await user.click(within(card()).getByRole("button", { name: "Ändra" }));
    const dialog = sheet("Ändra butik");
    await user.type(within(dialog).getByLabelText("Adress"), "Krondikesvägen 97");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Butiken finns inte längre.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });

  it("changes a store under Andra butiker with its own Ändra", async () => {
    const user = userEvent.setup();
    render([maxi, willys]);
    await user.click(screen.getByRole("button", { name: "Ändra Willys Lindhagen" }));
    const dialog = sheet("Ändra butik");
    expect(within(dialog).getByLabelText("Namn")).toHaveValue("Willys Lindhagen");
    await user.clear(within(dialog).getByLabelText("Adress"));
    await user.type(within(dialog).getByLabelText("Adress"), "Lindhagensgatan 2");
    await user.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveStore).toHaveBeenCalledTimes(1));
    expect(lastSaved()).toMatchObject({ id: willys.id, mode: "change", address: "Lindhagensgatan 2" });
  });

  it("stays Ändra butik when the stores are read again, and closes when the store is gone", async () => {
    const user = userEvent.setup();
    const { rerender } = render([maxi, willys]);
    await user.click(screen.getByRole("button", { name: "Ändra Willys Lindhagen" }));
    await user.type(within(sheet("Ändra butik")).getByLabelText("Adress"), " 2");

    rerender(<StoreSettings stores={[maxi, { ...willys, address: "Annan gata" }]} />);
    expect(within(sheet("Ändra butik")).getByLabelText("Adress")).toHaveValue("Lindhagensgatan 1 2");

    rerender(<StoreSettings stores={[maxi]} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveStore).not.toHaveBeenCalled();
  });
});
