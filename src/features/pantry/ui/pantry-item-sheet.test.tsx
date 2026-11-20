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
import { chooseUnit, unitOf } from "./unit-test-helpers";

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

const sheet = () => screen.getByRole("dialog");
/** The place choice is for a new item only: an item and a lagerförslag stay where they are. */
function placeRadio(scope: HTMLElement, name: string) {
  return within(scope).getByRole("radio", { name });
}
const location = (name: Location) => placeRadio(sheet(), name);

const nameField = () => within(sheet()).getByRole("textbox", { name: "Namn" });
const useNameRow = (name: string) => within(sheet()).getByRole("button", { name: `Använd \u201C${name}\u201D som namn` });

/** Writes in "Namn" and waits for the catalog's answer under it (after the 200 ms pause). */
async function search(text: string) {
  const before = searchPantryIngredients.mock.calls.length;
  fireEvent.change(nameField(), { target: { value: text } });
  await waitFor(() => expect(searchPantryIngredients.mock.calls.length).toBeGreaterThan(before));
  expect(searchPantryIngredients).toHaveBeenLastCalledWith(text);
  await act(async () => {});
}

async function save(name: "Lägg till vara" | "Spara ändringar") {
  await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name })));
}

beforeEach(() => {
  savePantryItem.mockReset().mockResolvedValue(ok({ id: rowId }));
  searchPantryIngredients.mockReset().mockResolvedValue(ok([gulLok]));
});

describe("PantryItemSheet, a new item", () => {
  it("opens on an empty Namn field in focus with the chosen location preselected", async () => {
    setup("Frys");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" })));
    expect(sheet()).toHaveAccessibleName("Lägg till vara");
    expect(nameField()).toHaveFocus();
    expect(nameField()).toHaveValue("");
    expect(location("Frys")).toHaveAttribute("aria-checked", "true");
    // The same sheet as for an item: no search step, no Byt vara.
    expect(within(sheet()).queryByRole("searchbox")).toBeNull();
    await search("lök");
    expect(searchPantryIngredients).toHaveBeenCalledWith("lök");
  });

  it("asks for a name, and saves nothing, while Namn is empty", async () => {
    setup("Frys");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await save("Lägg till vara");
    expect(within(sheet()).getByRole("alert")).toHaveTextContent("Skriv vad det är.");
    expect(nameField()).toHaveAttribute("aria-invalid", "true");
    expect(nameField()).toHaveFocus();
    expect(savePantryItem).not.toHaveBeenCalled();
  });

  it("lists catalog hits and Använd \u201Cx\u201D som namn under the field while typing", async () => {
    setup("Frys");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    const list = within(sheet()).getByRole("list", { name: "Förslag" });
    expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual(["Gul lök", "Använd \u201CGul\u201D som namn"]);
    // A name the catalog has (exactly) is not offered as new.
    searchPantryIngredients.mockResolvedValue(ok([{ ...gulLok, exact: true }]));
    await search("Gul lök");
    expect(within(sheet()).queryByRole("button", { name: /som namn$/ })).toBeNull();
  });

  it("suggests the location and unit from the catalog and saves the amount", async () => {
    setup("Frys");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));

    expect(nameField()).toHaveValue("Gul lök");
    expect(location("Skafferi")).toHaveAttribute("aria-checked", "true");
    expect(unitOf(sheet())).toBe("st");
    // No field takes focus on its own after a pick, so the keyboard stays down.
    expect(within(sheet()).getByLabelText("Mängd")).not.toHaveFocus();

    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith({
      ingredient: { kind: "existing", ingredientId: gulLokId },
      amount: "3",
      unit: "st",
      location: "Skafferi",
      siteId: hemma.id,
      replaceId: null,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Gul lök är sparad i skafferiet.");
  });

  it("sends a typed label for a new item, and none when the field is empty (Story 11.2)", async () => {
    setup("Frys");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    fireEvent.change(within(sheet()).getByRole("textbox", { name: /^Märke eller sort/ }), { target: { value: "Svenska" } });
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenLastCalledWith(expect.objectContaining({ label: "Svenska" }));

    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    await save("Lägg till vara");
    // Empty: a row the item lands on keeps its label.
    expect("label" in savePantryItem.mock.lastCall![0]).toBe(false);
  });

  it("saves a name that is not in the register as a new ingredient in Övrigt, without asking", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup("Kyl");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("Saffran");
    fireEvent.click(useNameRow("Saffran"));
    expect(nameField()).toHaveValue("Saffran");
    // The place choice stays for a new item, and there is no section step.
    expect(within(sheet()).queryByRole("button", { name: /^Avdelning/ })).toBeNull();
    fireEvent.click(location("Skafferi"));
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith({
      ingredient: { kind: "new", name: "Saffran", section: "Övrigt", location: "Skafferi" },
      amount: "",
      unit: "",
      location: "Skafferi",
      siteId: hemma.id,
      replaceId: null,
    });
  });

  it("saves the typed name as new in Övrigt even when no row was tapped and the answer is not in yet", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup("Kyl");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    fireEvent.change(nameField(), { target: { value: "  tomatpuré " } });
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ ingredient: { kind: "new", name: "Tomatpuré", section: "Övrigt", location: "Kyl" }, location: "Kyl" }),
    );
  });

  it("takes a typed name that is a catalog name as that ingredient", async () => {
    searchPantryIngredients.mockResolvedValue(ok([{ ...gulLok, exact: true }]));
    setup("Kyl");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul lök");
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith(expect.objectContaining({ ingredient: { kind: "existing", ingredientId: gulLokId } }));
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
    fireEvent.click(useNameRow("Saffran"));
    await save("Lägg till vara");
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Skriv ett namn med bokstäver eller siffror.");
  });

  it("offers no new ingredient for a name without letters or digits, and asks for a name", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("!!!");
    expect(within(sheet()).queryByRole("button", { name: /som namn$/ })).toBeNull();
    await save("Lägg till vara");
    expect(within(sheet()).getByRole("alert")).toHaveTextContent("Skriv vad det är.");
    expect(savePantryItem).not.toHaveBeenCalled();
  });

  it("shows why saving failed and keeps the form", async () => {
    savePantryItem.mockResolvedValue(fail("pantry_save_failed"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    await save("Lägg till vara");
    expect(within(sheet()).getByRole("alert")).toHaveTextContent(errorMessages.pantry_save_failed);
    expect(nameField()).toHaveValue("Gul lök");
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
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Boendet finns inte längre. Välj ett annat boende.");
    expect(nameField()).toHaveValue("Gul lök");
  });
});

describe("PantryItemSheet, an item in the pantry", () => {
  it("opens on the form with the item and saves a new amount for the same row", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
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
      return within(sheet()).getByRole("textbox", { name: /^Märke eller sort/ });
    }

    it("is an optional text field with the item's label and a placeholder, which counts its limit in characters", () => {
      const field = openLabelled("Arla laktosfri");
      expect(field).toHaveValue("Arla laktosfri");
      expect(field).toHaveAttribute("placeholder", "Till exempel Arla laktosfri");
      // No maxLength: it would count UTF-16 units, not characters (parseLabelField counts them).
      expect(field).not.toHaveAttribute("maxLength");
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
  ])("keeps the exact amount %s when only the label changes", async (amount, text) => {
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
    fireEvent.change(within(sheet()).getByRole("textbox", { name: /^Märke eller sort/ }), { target: { value: "Arla" } });
    await save("Spara ändringar");
    const [input] = savePantryItem.mock.calls[0];
    expect(pantryItemFormSchema.parse(input)).toMatchObject({ amount, unit: "kg", location: "Kyl" });
  });

  it("stays where it is: no place choice, and the place is saved as it was", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    expect(within(sheet()).queryByRole("radiogroup", { name: "Plats" })).toBeNull();
    expect(within(sheet()).queryByRole("button", { name: /^Ligger i/ })).toBeNull();
    expect(within(sheet()).queryByText("Flytta")).toBeNull();
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2" } });
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith(expect.objectContaining({ location: "Kyl", replaceId: rowId }));
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

  it("opens as Ändra vara with the name first, Mängd and Enhet on one row, and none of the old extras", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    expect(sheet()).toHaveAccessibleName("Ändra vara");
    expect(nameField()).toHaveValue("Mjölk");
    const form = within(sheet()).getByLabelText("Mängd").closest("form")!;
    const labels = [...form.querySelectorAll("label")].map((label) => label.textContent);
    expect(labels.slice(0, 3)).toEqual(["Namn", "Mängd", "Enhet"]);
    expect(within(sheet()).getByRole("combobox", { name: "Enhet" })).toHaveValue("l");
    expect(within(sheet()).queryByRole("radiogroup", { name: "Enhet" })).toBeNull();
    expect(within(sheet()).queryByText(/Fel vara/)).toBeNull();
    expect(within(sheet()).queryByRole("button", { name: "Byt vara" })).toBeNull();
    expect(within(sheet()).queryByText(/Lämna mängden tom/)).toBeNull();
    expect(within(sheet()).queryByText("(valfritt)", { selector: "label *" })).not.toBeNull();
    // No field takes focus on its own, so the keyboard does not open over the sheet.
    expect(within(sheet()).getByLabelText("Mängd")).not.toHaveFocus();
    expect(nameField()).not.toHaveFocus();
    // Hits only show once the text is changed.
    expect(within(sheet()).queryByRole("list", { name: "Förslag" })).toBeNull();
  });

  it("writes over the name and picks a catalog hit: the item changes ingredient and stays where it is", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    expect(nameField()).toHaveValue("Gul lök");
    // The hit's own defaults are for a new item; a changed one keeps its amount, unit and place.
    expect(unitOf(sheet())).toBe("l");
    expect(within(sheet()).queryByRole("list", { name: "Förslag" })).toBeNull();
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith({
      ingredient: { kind: "existing", ingredientId: gulLokId },
      amount: "1",
      unit: "l",
      location: "Kyl",
      siteId: stugan.id,
      replaceId: rowId,
      label: "",
    });
  });

  it("saves a name that is not in the register as a new ingredient in Övrigt, where the item is, replacing the row", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    await search("tomatpuré");
    fireEvent.click(useNameRow("Tomatpuré"));
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ ingredient: { kind: "new", name: "Tomatpuré", section: "Övrigt", location: "Kyl" }, replaceId: rowId, location: "Kyl" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Tomatpuré är sparad i kylen.");
  });

  it("saves a rewritten name without a tap on a row, and asks before closing with it", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    fireEvent.change(nameField(), { target: { value: "havredryck" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet()).getByText("Släng ändringarna?")).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Fortsätt ändra" }));
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ ingredient: { kind: "new", name: "Havredryck", section: "Övrigt", location: "Kyl" }, replaceId: rowId }),
    );
  });

  it("asks for a name when it is emptied, and saves nothing", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    fireEvent.change(nameField(), { target: { value: "" } });
    await save("Spara ändringar");
    expect(within(sheet()).getByRole("alert")).toHaveTextContent("Skriv vad det är.");
    expect(savePantryItem).not.toHaveBeenCalled();
  });

  it("changes the unit in the select, one row with Mängd", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
    chooseUnit("dl", sheet());
    await save("Spara ändringar");
    expect(savePantryItem).toHaveBeenCalledWith(expect.objectContaining({ unit: "dl", amount: "1" }));
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
    expect(sheet()).toHaveAccessibleName("Ändra vara");
    expect(nameField()).toHaveValue("mjölk");
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
    expect(unitOf(sheet())).toBe("förp");
    // It stays where the photo saw it: no place choice.
    expect(within(sheet()).queryByRole("radiogroup", { name: "Plats" })).toBeNull();
    expect(within(sheet()).getByRole("button", { name: "Bekräfta" })).toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "Inte en vara" })).toBeInTheDocument();
    expect(within(sheet()).queryByRole("button", { name: "Lägg till vara" })).toBeNull();
    expect(within(sheet()).queryByRole("button", { name: "Ta bort" })).toBeNull();
  });

  it("fills in a new ingredient with its name and section, and the amount with a decimal comma", () => {
    open(ketchup);
    expect(nameField()).toHaveValue("ketchup");
    expect(within(sheet()).getByRole("button", { name: "Avdelning: Skafferi" })).toBeInTheDocument();
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("0,5");
    expect(unitOf(sheet())).toBe("l");
  });

  it("fills in Märke eller sort with the suggestion's first label and confirms a changed one (Story 11.2)", async () => {
    open({ ...mjolkSuggestion, labels: ["Arla Mellanmjölk laktosfri 1,5 l", "Mjölk"] });
    const field = within(sheet()).getByRole("textbox", { name: /^Märke eller sort/ });
    expect(field).toHaveValue("Arla Mellanmjölk laktosfri 1,5 l");
    fireEvent.change(field, { target: { value: "Arla" } });
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(onConfirm.mock.calls[0]![2]).toMatchObject({ label: "Arla" });
  });

  it("leaves the photo's label as filled in out of the form, so it only fills an item without a label", async () => {
    open({ ...mjolkSuggestion, labels: ["Arla Mellanmjölk laktosfri 1,5 l"] });
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect("label" in onConfirm.mock.calls[0]![2]).toBe(false);
  });

  it("shows the label the item has rather than the photo's, and keeps it as it is", async () => {
    open({ ...mjolkSuggestion, labels: ["Arla Mellanmjölk laktosfri 1,5 l"], currentLabel: "Garant" });
    expect(within(sheet()).getByRole("textbox", { name: /^Märke eller sort/ })).toHaveValue("Garant");
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect("label" in onConfirm.mock.calls[0]![2]).toBe(false);
  });

  it("leaves the label out when the field is empty, so the item keeps its own", async () => {
    open(mjolkSuggestion);
    expect(within(sheet()).getByRole("textbox", { name: /^Märke eller sort/ })).toHaveValue("");
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect("label" in onConfirm.mock.calls[0]![2]).toBe(false);
  });

  it("leaves an unlimited suggestion's amount and unit empty", () => {
    open({ ...mjolkSuggestion, amount: null, unit: null });
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("");
    expect(unitOf(sheet())).toBe("");
  });

  it("corrects what the photo misread: a typed name replaces it and the place stays", async () => {
    open(ketchup);
    searchPantryIngredients.mockResolvedValue(ok([]));
    await search("tomatpuré");
    fireEvent.click(useNameRow("Tomatpuré"));
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(onConfirm.mock.calls[0]![2]).toMatchObject({
      ingredient: { kind: "new", name: "Tomatpuré", section: "Övrigt", location: "Kyl" },
      location: "Kyl",
    });
  });

  it("corrects an existing suggestion to another catalog ingredient and keeps the place and unit", async () => {
    open(mjolkSuggestion);
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
    expect(unitOf(sheet())).toBe("förp");
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(onConfirm.mock.calls[0]![2]).toMatchObject({ ingredient: { kind: "existing", ingredientId: gulLokId }, location: "Kyl", unit: "förp" });
  });

  it("Bekräfta saves the form as corrected, then closes with the short confirmation", async () => {
    open(ketchup);
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2" } });
    chooseUnit("dl", sheet());
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    expect(onConfirm).toHaveBeenCalledWith(
      "s3",
      7,
      {
        ingredient: { kind: "new", name: "ketchup", section: "Skafferi", location: "Kyl", defaultUnit: "dl" },
        location: "Kyl",
        amount: 2,
        unit: "dl",
        siteId: hemma.id,
        replaceId: null,
      },
      expect.any(Function),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("toast")).toHaveTextContent("ketchup är sparad i kylen.");
    expect(savePantryItem).not.toHaveBeenCalled();
  });

  it("says Sparar … while confirming, and keeps the sheet with the text after a failure", async () => {
    let answer: (outcome: CorrectOutcome) => void = () => {};
    onConfirm.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    open(mjolkSuggestion);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(within(sheet()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    expect(within(sheet()).getByRole("button", { name: "Inte en vara" })).toBeDisabled();
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
    fireEvent.click(within(sheet()).getByRole("button", { name: "Inte en vara" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onReject).toHaveBeenCalledWith("s4", 7);
    expect(screen.getByTestId("toast")).toHaveTextContent("Förslaget finns inte längre.");
  });

  it("stays open, silently, when another confirmation is being saved", async () => {
    onConfirm.mockResolvedValue({ kind: "busy" });
    onReject.mockReturnValue("busy");
    open(mjolkSuggestion);
    await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" })));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Inte en vara" }));
    expect(sheet()).toBeInTheDocument();
    expect(within(sheet()).queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("waits with Bekräfta and Avvisa while a card's confirmation is being saved", () => {
    reviewSaving = true;
    open(mjolkSuggestion);
    expect(within(sheet()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    expect(within(sheet()).getByRole("button", { name: "Inte en vara" })).toBeDisabled();
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
    fireEvent.click(within(sheet()).getByRole("button", { name: "Inte en vara" }));
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

describe("PantryItemSheet, the clearer sheet (Story 16.17)", () => {
  const amount = () => within(sheet()).getByLabelText("Mängd");
  const less = () => within(sheet()).getByRole("button", { name: "Minska" });
  const more = () => within(sheet()).getByRole("button", { name: "Öka" });
  const openMjolk = () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
  };
  const openNewGulLok = async () => {
    setup("Frys");
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    await search("gul");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Gul lök" }));
  };

  it("is headed Ändra vara, with the item's name in a field, never the generic Lagervara", () => {
    openMjolk();
    expect(sheet()).toHaveAccessibleName("Ändra vara");
    expect(within(sheet()).getByRole("heading", { name: "Ändra vara" })).toBeInTheDocument();
    expect(within(sheet()).queryByRole("heading", { name: "Lagervara" })).toBeNull();
    expect(within(sheet()).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    expect(nameField()).toHaveValue("Mjölk");
  });

  it("steps the amount by the unit and lets the number be typed", async () => {
    openMjolk();
    // Mjölk is counted in litres, a measure: a plain number field, and no stepper (the unit is the select beside it).
    expect(amount()).toHaveValue("1");
    expect(within(sheet()).queryByRole("button", { name: "Öka" })).toBeNull();
    expect(unitOf(sheet())).toBe("l");
    // A counted unit has − n +.
    chooseUnit("st", sheet());
    expect(await within(sheet()).findByRole("button", { name: "Öka" })).toBeInTheDocument();
    fireEvent.click(more());
    expect(amount()).toHaveValue("2");
    fireEvent.click(less());
    expect(amount()).toHaveValue("1");
    chooseUnit("g", sheet());
    fireEvent.change(amount(), { target: { value: "250" } });
    expect(within(sheet()).queryByRole("button", { name: "Öka" })).toBeNull();
    chooseUnit("st", sheet());
    fireEvent.change(amount(), { target: { value: "2" } });
    fireEvent.click(more());
    expect(amount()).toHaveValue("3");
  });

  it("disables − at the smallest amount and when empty, and + from empty gives the first step", async () => {
    await openNewGulLok();
    // A new item starts without an amount (not counted): no −, and + gives one piece (unit st).
    expect(amount()).toHaveValue("");
    expect(less()).toBeDisabled();
    fireEvent.click(more());
    expect(amount()).toHaveValue("1");
    expect(less()).toBeDisabled();
    fireEvent.click(more());
    expect(amount()).toHaveValue("2");
    expect(less()).toBeEnabled();
    fireEvent.change(amount(), { target: { value: "0" } });
    expect(less()).toBeDisabled();
    // An emptied amount still means "not counted" and saves as before.
    fireEvent.change(amount(), { target: { value: "" } });
    expect(less()).toBeDisabled();
    await save("Lägg till vara");
    expect(savePantryItem).toHaveBeenCalledWith(expect.objectContaining({ amount: "", location: "Skafferi" }));
  });

  it("shows the place choice at once for a new item, preselected, and no Ta bort", async () => {
    await openNewGulLok();
    expect(within(sheet()).queryByRole("button", { name: /^Ligger i/ })).toBeNull();
    expect(location("Skafferi")).toHaveAttribute("aria-checked", "true");
    expect(within(sheet()).queryByRole("button", { name: "Ta bort" })).toBeNull();
    expect(within(sheet()).getAllByText("(valfritt)").length).toBeGreaterThan(0);
  });

  it("heads a new item Lägg till vara, with the name field and a hint in it, and no search step", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    expect(within(sheet()).getByRole("heading", { name: "Lägg till vara" })).toBeInTheDocument();
    expect(nameField()).toHaveAttribute("placeholder", expect.stringContaining("Börja skriva"));
    expect(within(sheet()).queryByRole("button", { name: "Tillbaka" })).toBeNull();
  });

  it("still asks Släng ändringarna? when cancelling with changes, and Ta bort stays last", () => {
    openMjolk();
    chooseUnit("st", sheet());
    fireEvent.click(more());
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet()).getByText("Släng ändringarna?")).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Fortsätt ändra" }));
    const buttons = within(sheet()).getAllByRole("button").map((button) => button.textContent);
    expect(buttons.at(-1)).toBe("Ta bort");
  });
});

describe("PantryItemSheet, an item read from a photo", () => {
  function openFromPhoto(photo: PantryItem["photo"]) {
    render(
      <ToastProvider>
        <PantrySuggestionsProvider>
          <PantrySheetProvider location="Kyl" site={hemma}>
            <OpenItem item={{ ...mjolk, photo }} />
          </PantrySheetProvider>
        </PantrySuggestionsProvider>
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Öppna Mjölk" }));
  }

  it("shows the photo around the item at the top, with a link to the whole photo", () => {
    openFromPhoto({ number: 2, photoId: "p1", kept: { url: "/api/pantry/photo/p1", point: { x: 300, y: 600 } } });
    const block = within(sheet()).getByTestId("pantry-item-photo");
    expect(block).toHaveTextContent("Så här läste AI fotot.");
    expect(within(block).getByTestId("pantry-sheet-crop")).toHaveTextContent("2");
    expect(within(block).getByRole("link", { name: "Visa hela fotot" })).toHaveAttribute("href", "/api/pantry/photo/p1");
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
  });

  it("shows the whole-photo link alone when the photo has no point for the item", () => {
    openFromPhoto({ number: 1, photoId: "p1", kept: { url: "/api/pantry/photo/p1", point: null } });
    expect(within(sheet()).queryByTestId("pantry-sheet-crop")).toBeNull();
    expect(within(sheet()).getByRole("link", { name: "Visa hela fotot" })).toBeInTheDocument();
  });

  it("says the photo is gone, with no picture, when it is swept or removed", () => {
    openFromPhoto({ number: 2, photoId: null });
    expect(within(sheet()).getByTestId("pantry-item-photo-gone")).toHaveTextContent("Fotot finns inte kvar.");
    expect(within(sheet()).queryByTestId("pantry-sheet-crop")).toBeNull();
    expect(within(sheet()).queryByRole("link", { name: "Visa hela fotot" })).toBeNull();
  });

  it("shows nothing about a photo for an item without a link", () => {
    openFromPhoto(null);
    expect(within(sheet()).queryByTestId("pantry-item-photo")).toBeNull();
    expect(within(sheet()).queryByTestId("pantry-item-photo-gone")).toBeNull();
  });
});

