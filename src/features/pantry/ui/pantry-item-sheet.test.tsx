import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { PantryIngredientHit } from "../actions/search-ingredients";
import type { PantryItem } from "../domain/pantry-item";
import { pantryItemFormSchema, type PantryItemFormInput } from "../domain/pantry-item-form";
import { AddPantryItemButton, PantrySheetProvider, usePantrySheet } from "./pantry-item-sheet";

const savePantryItem = vi.fn<(form: PantryItemFormInput) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: (form: PantryItemFormInput) => savePantryItem(form) }));
const searchPantryIngredients = vi.fn<(query: string) => Promise<Result<PantryIngredientHit[]>>>();
vi.mock("../actions/search-ingredients", () => ({
  searchPantryIngredients: (query: string) => searchPantryIngredients(query),
}));

const gulLokId = "11111111-1111-4111-8111-111111111111";
const mjolkId = "22222222-2222-4222-8222-222222222222";
const rowId = "33333333-3333-4333-8333-333333333333";

const gulLok: PantryIngredientHit = {
  id: gulLokId,
  name: "Gul lök",
  defaults: { section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" },
  exact: false,
};
const mjolk: PantryItem = { id: rowId, ingredientId: mjolkId, name: "Mjölk", location: "Kyl", amount: 1, unit: "l" };

function OpenItem({ item }: { item: PantryItem }) {
  const { openItem } = usePantrySheet();
  return <button onClick={() => openItem(item)}>Öppna {item.name}</button>;
}

function setup(location: Location = "Frys") {
  render(
    <ToastProvider>
      <PantrySheetProvider location={location}>
        <AddPantryItemButton variant="icon" />
        <OpenItem item={mjolk} />
      </PantrySheetProvider>
    </ToastProvider>,
  );
}

const sheet = () => screen.getByRole("dialog", { name: "Lagervara" });
const location = (name: Location) => within(sheet()).getByRole("radio", { name });

/** Types in the search field and searches at once (Enter skips the 200 ms wait). */
async function search(text: string) {
  const field = within(sheet()).getByRole("searchbox", { name: "Sök ingrediens" });
  fireEvent.change(field, { target: { value: text } });
  await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
}

async function save(name: "Lägg till vara" | "Spara ändringar") {
  await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name })));
}

beforeEach(() => {
  savePantryItem.mockReset().mockResolvedValue(ok({ id: rowId }));
  searchPantryIngredients.mockReset().mockResolvedValue(ok([gulLok]));
});

describe("PantryItemSheet, a new item", () => {
  it("opens on the search with the field in focus and the chosen location preselected", async () => {
    setup("Frys");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" })));
    expect(within(sheet()).getByRole("searchbox", { name: "Sök ingrediens" })).toHaveFocus();
    await search("lök");
    expect(searchPantryIngredients).toHaveBeenCalledWith("lök");
    // Before an ingredient is chosen, there is nothing to save.
    expect(within(sheet()).queryByRole("button", { name: "Lägg till vara" })).toBeNull();
  });

  it("suggests the location and unit from the catalog and saves the amount", async () => {
    setup("Frys");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));

    expect(within(sheet()).getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Gul lök");
    expect(location("Skafferi")).toHaveAttribute("aria-checked", "true");
    expect(within(sheet()).getByLabelText("Enhet")).toHaveValue("st");
    expect(within(sheet()).getByLabelText("Mängd")).toHaveFocus();

    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith({
      ingredient: { kind: "existing", ingredientId: gulLokId },
      amount: "3",
      unit: "st",
      location: "Skafferi",
      replaceId: null,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Gul lök är sparad i skafferiet.");
  });

  it("asks for the section of a new ingredient, keeps it where the item is, and saves without amount", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup("Kyl");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("Saffran");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Lägg till Saffran som ny" }));

    expect(within(sheet()).getByText("Ny")).toBeInTheDocument();
    fireEvent.change(within(sheet()).getByLabelText("Avdelning"), { target: { value: "Skafferi" } });
    fireEvent.click(location("Skafferi"));
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith({
      ingredient: { kind: "new", name: "Saffran", section: "Skafferi", location: "Skafferi" },
      amount: "",
      unit: "",
      location: "Skafferi",
      replaceId: null,
    });
  });

  it.each(["två", "0", "-1", "1-2"])("refuses the amount %j at the field once tried, and saves nothing", async (amount) => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    const field = within(sheet()).getByLabelText("Mängd");
    fireEvent.change(field, { target: { value: amount } });
    // Not while typing.
    expect(within(sheet()).queryByText("Ange ett tal större än 0.")).toBeNull();
    // Saving shows why, at the field, and saves nothing.
    await save("Lägg till vara");
    expect(within(sheet()).getByText("Ange ett tal större än 0.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(savePantryItem).not.toHaveBeenCalled();
  });

  it("shows the amount's error when Pontus leaves the field", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    const field = within(sheet()).getByLabelText("Mängd");
    fireEvent.change(field, { target: { value: "två" } });
    fireEvent.blur(field);
    expect(within(sheet()).getByText("Ange ett tal större än 0.")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "2" } });
    expect(within(sheet()).queryByText("Ange ett tal större än 0.")).toBeNull();
  });

  it("shows the server's message for the amount at the field, and clears it on a change", async () => {
    savePantryItem.mockResolvedValue(fail("validation", { amount: "Ange ett tal större än 0." }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2" } });
    await save("Lägg till vara");
    const field = within(sheet()).getByLabelText("Mängd");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Ange ett tal större än 0.");
    expect(within(sheet()).queryByRole("alert")).toBeNull();
    fireEvent.change(field, { target: { value: "3" } });
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("shows the server's message for a new ingredient's name", async () => {
    savePantryItem.mockResolvedValue(fail("validation", { ingredient: "Skriv ett namn med bokstäver eller siffror." }));
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("Saffran");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Lägg till Saffran som ny" }));
    await save("Lägg till vara");
    expect(within(sheet()).getByRole("alert")).toHaveTextContent("Skriv ett namn med bokstäver eller siffror.");
  });

  it("offers no new ingredient for a name without letters or digits", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("!!!");
    expect(within(sheet()).getByText("Ingen ingrediens hittades.")).toBeInTheDocument();
    expect(within(sheet()).queryByRole("button", { name: /som ny$/ })).toBeNull();
  });

  it("shows why saving failed and keeps the form", async () => {
    savePantryItem.mockResolvedValue(fail("pantry_save_failed"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    await save("Lägg till vara");
    expect(within(sheet()).getByRole("alert")).toHaveTextContent(errorMessages.pantry_save_failed);
    expect(within(sheet()).getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Gul lök");
    // A change means the failure no longer applies.
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2" } });
    expect(within(sheet()).queryByRole("alert")).toBeNull();
  });

  it("asks before throwing away a chosen ingredient", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet()).getByText("Släng ändringarna?")).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Släng ändringarna" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PantryItemSheet, an item in the pantry", () => {
  it("opens on the form with the item and saves a new amount for the same row", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
    expect(location("Kyl")).toHaveAttribute("aria-checked", "true");
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2" } });
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith({
      ingredient: { kind: "existing", ingredientId: mjolkId },
      amount: "2",
      unit: "l",
      location: "Kyl",
      replaceId: rowId,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Mjölk är sparad i kylen.");
  });

  it.each([
    [0.333, "0,333"],
    [0.004, "0,004"],
  ])("keeps the exact amount %s when only the location changes", async (amount, text) => {
    render(
      <ToastProvider>
        <PantrySheetProvider location="Kyl">
          <OpenItem item={{ ...mjolk, amount, unit: "kg" }} />
        </PantrySheetProvider>
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue(text);
    fireEvent.click(location("Frys"));
    await save("Spara ändringar");
    const [input] = savePantryItem.mock.calls[0];
    expect(pantryItemFormSchema.parse(input)).toMatchObject({ amount, unit: "kg", location: "Frys" });
  });

  it("moves it to another location", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    fireEvent.click(location("Frys"));
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith(expect.objectContaining({ location: "Frys", replaceId: rowId }));
  });

  it("closes without asking when nothing changed, and asks when something did", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet()).getByText("Släng ändringarna?")).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Fortsätt ändra" }));
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("3");
  });

  it("swaps the ingredient through the search, and Avbryt goes back to the form", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Byt ingrediens" }));
    expect(within(sheet()).getByRole("heading", { name: "Byt ingrediens" })).toBeInTheDocument();
    fireEvent.keyDown(within(sheet()).getByRole("searchbox"), { key: "Escape" });
    expect(within(sheet()).getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Mjölk");

    fireEvent.click(within(sheet()).getByRole("button", { name: "Byt ingrediens" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    // Swapping keeps the item where it is.
    expect(location("Kyl")).toHaveAttribute("aria-checked", "true");
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ ingredient: { kind: "existing", ingredientId: gulLokId }, replaceId: rowId }),
    );
  });
});
