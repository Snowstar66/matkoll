import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { PantryIngredientHit } from "../actions/search-ingredients";
import type { PantryItem } from "../domain/pantry-item";
import { pantryItemFormSchema, type PantryItemForm, type PantryItemFormInput } from "../domain/pantry-item-form";
import type { PantrySuggestion } from "../domain/pantry-suggestion";
import { AddPantryItemButton, PantryItemSheet, PantrySheetProvider, usePantrySheet } from "./pantry-item-sheet";
import type { CorrectOutcome, RejectOutcome } from "./pantry-suggestions";
import { PantryRemovalProvider } from "./pantry-removal";
import { PantrySuggestionsProvider } from "./pantry-suggestions";

const savePantryItem = vi.fn<(form: PantryItemFormInput) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: (form: PantryItemFormInput) => savePantryItem(form) }));
const searchPantryIngredients = vi.fn<(query: string) => Promise<Result<PantryIngredientHit[]>>>();
vi.mock("../actions/search-ingredients", () => ({
  searchPantryIngredients: (query: string) => searchPantryIngredients(query),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ postAiForm: vi.fn() }));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: vi.fn() }));

const gulLokId = "11111111-1111-4111-8111-111111111111";
const mjolkId = "22222222-2222-4222-8222-222222222222";
const rowId = "33333333-3333-4333-8333-333333333333";
/** The places (Story 8.2): Hemma, which the page shows, and Stugan, where Mjölk is. */
const hemma = { id: "44444444-4444-4444-8444-444444444444" };
const stugan = { id: "55555555-5555-4555-8555-555555555555" };

const gulLok: PantryIngredientHit = {
  id: gulLokId,
  name: "Gul lök",
  defaults: { section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" },
  exact: false,
};
const mjolk: PantryItem = { id: rowId, siteId: stugan.id, ingredientId: mjolkId, name: "Mjölk", location: "Kyl", amount: 1, unit: "l", label: null, createdAt: "2026-10-20T10:00:00+00:00", section: "Mejeri" };

function OpenItem({ item }: { item: PantryItem }) {
  const { openItem } = usePantrySheet();
  return <button onClick={() => openItem(item)}>Öppna {item.name}</button>;
}

function setup(location: Location = "Frys") {
  render(
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={hemma}>
          <AddPantryItemButton variant="icon" />
          <OpenItem item={mjolk} />
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
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
      siteId: hemma.id,
      replaceId: null,
      label: "",
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
      siteId: hemma.id,
      replaceId: null,
      label: "",
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

describe("PantryItemSheet and the place (Story 8.2, FR-33)", () => {
  /** Hemma, whose shown place a test can switch while the sheet is open, as a selection would. */
  let switchTo: (site: { id: string }) => void = () => {};
  function SwitchingHemma() {
    const [site, setSite] = useState(hemma);
    useEffect(() => {
      switchTo = setSite;
    }, []);
    return (
      <ToastProvider>
        <PantrySuggestionsProvider>
          <PantrySheetProvider location="Kyl" site={site}>
            <AddPantryItemButton variant="icon" />
            <OpenItem item={mjolk} />
          </PantrySheetProvider>
        </PantrySuggestionsProvider>
      </ToastProvider>
    );
  }

  it("keeps the place it opened for when Hemma selects another place while it is open", async () => {
    render(<SwitchingHemma />);
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    act(() => switchTo(stugan));
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith(expect.objectContaining({ siteId: hemma.id }));

    // Opened again after the switch: the place shown now.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenLastCalledWith(expect.objectContaining({ siteId: stugan.id }));
  });

  it("saves a changed item on its own place, whatever place Hemma shows", async () => {
    render(<SwitchingHemma />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2" } });
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith(expect.objectContaining({ siteId: stugan.id, replaceId: rowId }));
  });

  it("shows pantry_site_gone in the sheet and keeps the form", async () => {
    savePantryItem.mockResolvedValue(fail("pantry_site_gone"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    await save("Lägg till vara");
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Stället finns inte längre. Välj ett annat ställe.");
    expect(within(sheet()).getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Gul lök");
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
      siteId: stugan.id,
      replaceId: rowId,
      label: "",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Mjölk är sparad i kylen.");
  });

  describe("Märke eller sort (Story 11.2)", () => {
    function openLabelled(label: string | null) {
      render(
        <ToastProvider>
          <PantrySuggestionsProvider>
            <PantrySheetProvider location="Kyl" site={hemma}>
              <OpenItem item={{ ...mjolk, label }} />
            </PantrySheetProvider>
          </PantrySuggestionsProvider>
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
      return within(sheet()).getByRole("textbox", { name: "Märke eller sort" });
    }

    it("is an optional text field with the item's label, a placeholder, at most 60 characters", () => {
      const field = openLabelled("Arla laktosfri");
      expect(field).toHaveValue("Arla laktosfri");
      expect(field).toHaveAttribute("placeholder", "Till exempel Arla laktosfri");
      expect(field).toHaveAttribute("maxLength", "60");
      expect(field).not.toBeRequired();
    });

    it.each([
      ["a changed label", "Garant"],
      ["an emptied field, which removes the label", ""],
    ])("saves %s", async (_case, text) => {
      const field = openLabelled("Arla");
      fireEvent.change(field, { target: { value: text } });
      await save("Spara ändringar");
      expect(savePantryItem).toHaveBeenLastCalledWith(expect.objectContaining({ label: text, replaceId: rowId }));
    });

    it("asks before closing with a changed label", () => {
      const field = openLabelled(null);
      fireEvent.change(field, { target: { value: "Arla" } });
      fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
      expect(screen.getByText("Släng ändringarna?")).toBeInTheDocument();
    });

    it("refuses more than 60 characters at the field and saves nothing", async () => {
      const field = openLabelled(null);
      // Past maxLength, as a script can.
      fireEvent.change(field, { target: { value: "a".repeat(61) } });
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(within(sheet()).getByText("Skriv högst 60 tecken.")).toBeInTheDocument();
      await save("Spara ändringar");
      expect(savePantryItem).not.toHaveBeenCalled();
    });
  });

  it.each([
    [0.333, "0,333"],
    [0.004, "0,004"],
  ])("keeps the exact amount %s when only the location changes", async (amount, text) => {
    render(
      <ToastProvider>
        <PantrySuggestionsProvider>
          <PantrySheetProvider location="Kyl" site={hemma}>
            <OpenItem item={{ ...mjolk, amount, unit: "kg" }} />
          </PantrySheetProvider>
        </PantrySuggestionsProvider>
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

describe("PantryItemSheet, a lagerförslag (Rätta)", () => {
  const ketchup: PantrySuggestion = {
    id: "s3",
    name: "ketchup",
    ingredient: { kind: "new", proposalId: "n2", name: "ketchup", section: "Skafferi", location: "Kyl", defaultUnit: "förp" },
    location: "Kyl",
    amount: 0.5,
    unit: "l",
    current: null,
    change: null,
    replaces: [],
  };
  const mjolkSuggestion: PantrySuggestion = {
    id: "s4",
    name: "mjölk",
    ingredient: { kind: "existing", ingredientId: mjolkId },
    location: "Kyl",
    amount: 1,
    unit: "förp",
    current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
    change: null,
    replaces: [],
  };

  const onConfirm = vi.fn<(id: string, generation: number, form: PantryItemForm, onSaved: () => void) => Promise<CorrectOutcome>>();
  const onReject = vi.fn<(id: string, generation: number) => RejectOutcome>();
  let reviewSaving = false;

  /** The sheet for one suggestion, opened by "Rätta" as PantrySheetProvider opens it. */
  function Correct({ suggestion }: { suggestion: PantrySuggestion }) {
    const [sheet, setSheet] = useState({ open: false, session: 0 });
    return (
      <>
        <button onClick={() => setSheet((current) => ({ open: true, session: current.session + 1 }))}>Rätta</button>
        <PantryItemSheet
          open={sheet.open}
          session={sheet.session}
          target={{ kind: "suggestion", suggestion, generation: 7, siteId: hemma.id }}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          review={{ confirm: onConfirm, reject: onReject, saving: reviewSaving }}
        />
      </>
    );
  }

  function open(suggestion: PantrySuggestion) {
    render(
      <ToastProvider>
        <PantrySuggestionsProvider>
          <PantryRemovalProvider>
            <Correct suggestion={suggestion} />
          </PantryRemovalProvider>
        </PantrySuggestionsProvider>
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rätta" }));
  }

  beforeEach(() => {
    onConfirm.mockReset().mockImplementation(async (_id, _generation, _form, onSaved) => {
      onSaved();
      return { kind: "saved" };
    });
    onReject.mockReset().mockReturnValue("rejected");
    reviewSaving = false;
  });

  it("opens on the form filled in from an existing ingredient's suggestion, with Bekräfta and Avvisa", () => {
    open(mjolkSuggestion);
    expect(within(sheet()).getByRole("heading", { name: "Lagervara" })).toBeInTheDocument();
    expect(within(sheet()).getByTestId("pantry-sheet-ingredient")).toHaveTextContent("mjölk");
    expect(within(sheet()).queryByText("Ny")).toBeNull();
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
    expect(within(sheet()).getByLabelText("Enhet")).toHaveValue("förp");
    expect(location("Kyl")).toHaveAttribute("aria-checked", "true");
    expect(within(sheet()).getByRole("button", { name: "Bekräfta" })).toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "Avvisa" })).toBeInTheDocument();
    expect(within(sheet()).queryByRole("button", { name: "Lägg till vara" })).toBeNull();
    expect(within(sheet()).queryByRole("button", { name: "Ta bort" })).toBeNull();
  });

  it("fills in a new ingredient with its name, Ny and section, and the amount with a decimal comma", () => {
    open(ketchup);
    expect(within(sheet()).getByTestId("pantry-sheet-ingredient")).toHaveTextContent("ketchup");
    expect(within(sheet()).getByText("Ny")).toBeInTheDocument();
    expect(within(sheet()).getByLabelText("Avdelning")).toHaveValue("Skafferi");
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("0,5");
    expect(within(sheet()).getByLabelText("Enhet")).toHaveValue("l");
  });

  it("fills in Märke eller sort with the suggestion's first label and confirms a changed one (Story 11.2)", async () => {
    open({ ...mjolkSuggestion, labels: ["Arla Mellanmjölk laktosfri 1,5 l", "Mjölk"] });
    const field = within(sheet()).getByRole("textbox", { name: "Märke eller sort" });
    expect(field).toHaveValue("Arla Mellanmjölk laktosfri 1,5 l");
    fireEvent.change(field, { target: { value: "Arla" } });
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(onConfirm.mock.calls[0]![2]).toMatchObject({ label: "Arla" });
  });

  it("leaves the label out when the field is empty, so the item keeps its own", async () => {
    open(mjolkSuggestion);
    expect(within(sheet()).getByRole("textbox", { name: "Märke eller sort" })).toHaveValue("");
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect("label" in onConfirm.mock.calls[0]![2]).toBe(false);
  });

  it("leaves an unlimited suggestion's amount and unit empty", () => {
    open({ ...mjolkSuggestion, amount: null, unit: null });
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("");
    expect(within(sheet()).getByLabelText("Enhet")).toHaveValue("");
  });

  it("keeps the place when another ingredient is chosen", async () => {
    open(mjolkSuggestion);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Byt ingrediens" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    expect(location("Kyl")).toHaveAttribute("aria-checked", "true");
    expect(within(sheet()).getByLabelText("Enhet")).toHaveValue("förp");
  });

  it("Bekräfta saves the form as corrected, then closes with the short confirmation", async () => {
    open(ketchup);
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2" } });
    fireEvent.change(within(sheet()).getByLabelText("Enhet"), { target: { value: "dl" } });
    fireEvent.click(location("Frys"));
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(onConfirm).toHaveBeenCalledWith(
      "s3",
      7,
      {
        ingredient: { kind: "new", name: "ketchup", section: "Skafferi", location: "Frys", defaultUnit: "dl" },
        location: "Frys",
        amount: 2,
        unit: "dl",
        siteId: hemma.id,
        replaceId: null,
      },
      expect.any(Function),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("toast")).toHaveTextContent("ketchup är sparad i frysen.");
    expect(savePantryItem).not.toHaveBeenCalled();
  });

  it("says Sparar … while confirming, and keeps the sheet with the text after a failure", async () => {
    let answer: (outcome: CorrectOutcome) => void = () => {};
    onConfirm.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    open(mjolkSuggestion);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(within(sheet()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    expect(within(sheet()).getByRole("button", { name: "Avvisa" })).toBeDisabled();
    // A second submit (Enter) while saving sends nothing more.
    fireEvent.submit(within(sheet()).getByLabelText("Mängd").closest("form")!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => answer({ kind: "failed", error: fail("pantry_confirm_failed").error }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
    expect(within(sheet()).getByRole("button", { name: "Bekräfta" })).toBeEnabled();
  });

  it("shows the server's text for a refused item in the sheet", async () => {
    onConfirm.mockResolvedValue({
      kind: "failed",
      error: fail("validation", { "0": "Förslaget går inte att spara som det är. Rätta eller avvisa det." }).error,
    });
    open(mjolkSuggestion);
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Förslaget går inte att spara som det är.");
  });

  it("closes with Förslaget finns inte längre. when the suggestion is gone, for Bekräfta and Avvisa", async () => {
    onConfirm.mockResolvedValue({ kind: "gone" });
    open(mjolkSuggestion);
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("toast")).toHaveTextContent("Förslaget finns inte längre.");

    onReject.mockReturnValue("gone");
    fireEvent.click(screen.getByRole("button", { name: "Rätta" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avvisa" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onReject).toHaveBeenCalledWith("s4", 7);
    expect(screen.getByTestId("toast")).toHaveTextContent("Förslaget finns inte längre.");
  });

  it("stays open, silently, when another confirmation is being saved", async () => {
    onConfirm.mockResolvedValue({ kind: "busy" });
    onReject.mockReturnValue("busy");
    open(mjolkSuggestion);
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avvisa" }));
    expect(sheet()).toBeInTheDocument();
    expect(within(sheet()).queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("waits with Bekräfta and Avvisa while a card's confirmation is being saved", () => {
    reviewSaving = true;
    open(mjolkSuggestion);
    expect(within(sheet()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    expect(within(sheet()).getByRole("button", { name: "Avvisa" })).toBeDisabled();
  });

  it("refuses an amount at the field and confirms nothing", async () => {
    open(mjolkSuggestion);
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "0" } });
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(within(sheet()).getByText("Ange ett tal större än 0.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Avvisa closes without asking, also with changes, and rejects the suggestion", () => {
    open(mjolkSuggestion);
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avvisa" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onReject).toHaveBeenCalledWith("s4", 7);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes unchanged without asking, and asks Släng ändringarna? when changed, keeping the suggestion", () => {
    open(mjolkSuggestion);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rätta" }));
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet()).getByText("Släng ändringarna?")).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Släng ändringarna" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onReject).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    // Opened again, it starts from the suggestion as it was.
    fireEvent.click(screen.getByRole("button", { name: "Rätta" }));
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
  });
});
