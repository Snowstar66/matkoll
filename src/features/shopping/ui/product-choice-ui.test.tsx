import { render as renderBare, type RenderOptions, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Store } from "@/features/settings";
import { ok, type Result } from "@/lib/errors";
import type { ShoppingLine } from "../domain/compute-list";
import type { ProductChoice, ProductChoiceFormInput } from "../domain/product-choice";
import { ShoppingList, type ShoppingListProps } from "./shopping-list";

// Produktval in Listpostdetalj (Story 7.2), as Pontus meets it on the list:
// the section in the detail of a recipe line with a catalog ingredient, a
// vague line and an own item; "Ange produktval" replaces the detail with the
// sheet Produktval (sheets never stack), after "Släng ändringarna?" when the
// detail has changes. The choice belongs to the ingredient, so two lines of
// it share one choice.

const saveProductChoice = vi.fn<(input: ProductChoiceFormInput) => Promise<Result<{ choice: ProductChoice | null }>>>();
vi.mock("../actions/save-product-choice", () => ({
  saveProductChoice: (input: ProductChoiceFormInput) => saveProductChoice(input),
}));
vi.mock("../actions/remove-product-choice", () => ({ removeProductChoice: vi.fn() }));
vi.mock("../actions/restore-product-choice", () => ({ restoreProductChoice: vi.fn() }));
vi.mock("../actions/set-line-amount", () => ({ setLineAmount: vi.fn(async (input: unknown) => ok(input)) }));
vi.mock("../actions/clear-line-amount", () => ({ clearLineAmount: vi.fn() }));
vi.mock("../actions/hide-line", () => ({ hideLine: vi.fn() }));
vi.mock("../actions/restore-line", () => ({ restoreLine: vi.fn() }));
vi.mock("../actions/show-line", () => ({ showLine: vi.fn() }));
vi.mock("../actions/update-custom-item", () => ({ updateCustomItem: vi.fn() }));
vi.mock("../actions/remove-custom-item", () => ({ removeCustomItem: vi.fn() }));
vi.mock("../actions/restore-custom-item", () => ({ restoreCustomItem: vi.fn() }));
vi.mock("../actions/add-custom-item", () => ({ addCustomItem: vi.fn() }));
vi.mock("../actions/set-checked", () => ({ setChecked: vi.fn(async (change: unknown) => ok(change)) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: ToastProvider, ...options });

const planId = "33333333-3333-4333-8333-333333333333";
const graddeId = "11111111-1111-4111-8111-111111111111";
const saltId = "22222222-2222-4222-8222-222222222222";
const kaffeId = "55555555-5555-4555-8555-555555555555";
const ownId = "44444444-4444-4444-8444-444444444444";
const diskId = "66666666-6666-4666-8666-666666666666";
const plan: NonNullable<ShoppingListProps["plan"]> = {
  id: planId,
  name: "Vecka 44",
  dishCount: 1,
  skippedCount: 0,
  dishTitles: { d1: "Krämig kycklinggryta" },
};
const maxi: Store = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: null,
  url: null,
  isSelected: true,
};
const base = { isVague: false, coverage: { kind: "unlinked" as const }, origins: ["d1"], checked: false, isCustom: false };
const gradde: ShoppingLine = { ...base, key: `r:${graddeId}:dl`, ingredientId: graddeId, label: "Grädde", amount: 3, unit: "dl", section: "Mejeri" };
const graddeForp: ShoppingLine = { ...gradde, key: `r:${graddeId}:förp`, amount: 1, unit: "förp" };
const salt: ShoppingLine = {
  ...base,
  key: `r:${saltId}:-`,
  ingredientId: saltId,
  label: "Salt",
  amount: null,
  unit: null,
  isVague: true,
  coverage: { kind: "vague-missing" } as ShoppingLine["coverage"],
  section: "Skafferi",
};
const citroner: ShoppingLine = { ...base, key: "t:2 citroner", label: "2 citroner", amount: null, unit: null, section: "Övrigt" };
const kaffe: ShoppingLine = {
  ...base,
  key: `c:${ownId}`,
  ingredientId: kaffeId,
  linkedName: "Kaffe",
  label: "Kaffe",
  amount: null,
  unit: null,
  section: "Skafferi",
  origins: [],
  isCustom: true,
};
const disk: ShoppingLine = { ...base, key: `c:${diskId}`, label: "Diskmedel", amount: null, unit: null, section: "Övrigt", origins: [], isCustom: true };
const arla: ProductChoice = {
  id: "88888888-8888-4888-8888-888888888888",
  ingredientId: graddeId,
  storeId: maxi.id,
  productName: "Arla Matlagningsgrädde 15 %",
  packageSize: "5 dl",
  url: null,
  updatedAt: "2026-10-26T11:23:47.123456+00:00",
};

function list(lines: ShoppingLine[], changes: Partial<ShoppingListProps> = {}) {
  return <ShoppingList plan={plan} lines={lines} pantryUnavailable={false} store={maxi} {...changes} />;
}

const nameButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const dialog = (name: string) => screen.getByRole("dialog", { name });
const section = (within_: HTMLElement) => within(within_).getByRole("region", { name: "Produktval" });

beforeEach(() => {
  saveProductChoice.mockReset().mockImplementation(async (input) =>
    ok({ choice: { ...arla, productName: input.productName, packageSize: input.packageSize || null } }),
  );
  refresh.mockReset();
});

describe("Produktval in Listpostdetalj", () => {
  it("shows the section under the origin of a recipe line, and Ange produktval replaces the detail with the sheet", async () => {
    const user = userEvent.setup();
    render(list([gradde]));
    await user.click(nameButton("Grädde"));
    const detail = dialog("Grädde");
    const origin = within(detail).getByTestId("line-detail-origins");
    const choice = section(detail);
    expect(origin.compareDocumentPosition(choice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(choice).toHaveTextContent("Inget produktval i Maxi ICA Stormarknad Östersund.");

    await user.click(within(choice).getByRole("button", { name: "Ange produktval" }));
    const sheet = await screen.findByRole("dialog", { name: "Produktval för grädde" });
    // Never stacked: the detail has closed.
    expect(screen.queryByRole("dialog", { name: "Grädde" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(sheet).toHaveAccessibleDescription("Maxi ICA Stormarknad Östersund");

    await user.type(within(sheet).getByLabelText("Produkt"), "Arla Matlagningsgrädde 15 %");
    await user.type(within(sheet).getByLabelText("Förpackning"), "5 dl");
    await user.click(within(sheet).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).toHaveBeenCalledWith({
      ingredientId: graddeId,
      storeId: maxi.id,
      productName: "Arla Matlagningsgrädde 15 %",
      packageSize: "5 dl",
      url: "",
      expected: null,
    });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Produktvalet är sparat.");
  });

  it("shows the saved choice for both lines of the ingredient, and opens it to change", async () => {
    const user = userEvent.setup();
    render(list([gradde, graddeForp], { productChoices: { [graddeId]: arla } }));
    for (const line of ["Grädde, 3 dl", "Grädde, 1 förp"]) {
      const [name] = line.split(",");
      const buttons = screen.getAllByRole("button", { name: new RegExp(`^${name}`) });
      await user.click(buttons[line.endsWith("förp") ? 1 : 0]);
      const detail = dialog("Grädde");
      expect(section(detail)).toHaveTextContent("Arla Matlagningsgrädde 15 % · 5 dl");
      await user.click(within(detail).getByRole("button", { name: "Avbryt" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    await user.click(screen.getAllByRole("button", { name: /^Grädde/ })[0]);
    await user.click(within(section(dialog("Grädde"))).getByRole("button", { name: "Ändra produktval" }));
    const sheet = await screen.findByRole("dialog", { name: "Produktval för grädde" });
    expect(within(sheet).getByLabelText("Produkt")).toHaveValue("Arla Matlagningsgrädde 15 %");
    expect(within(sheet).getByRole("button", { name: "Ta bort produktval" })).toBeInTheDocument();
  });

  it("asks Släng ändringarna? before the sheet replaces a detail with a changed amount", async () => {
    const user = userEvent.setup();
    render(list([gradde]));
    await user.click(nameButton("Grädde"));
    const detail = dialog("Grädde");
    const amount = within(detail).getByRole("textbox", { name: "Mängd" });
    await user.clear(amount);
    await user.type(amount, "4");
    await user.click(within(section(detail)).getByRole("button", { name: "Ange produktval" }));
    expect(await within(detail).findByText("Släng ändringarna?")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Produktval för grädde" })).not.toBeInTheDocument();

    // "Fortsätt ändra" keeps the detail with its amount, and no sheet opens.
    await user.click(within(detail).getByRole("button", { name: "Fortsätt ändra" }));
    expect(within(detail).getByRole("textbox", { name: "Mängd" })).toHaveValue("4");
    expect(screen.queryByRole("dialog", { name: "Produktval för grädde" })).not.toBeInTheDocument();

    await user.click(within(section(detail)).getByRole("button", { name: "Ange produktval" }));
    await user.click(await within(detail).findByRole("button", { name: "Släng ändringarna" }));
    expect(await screen.findByRole("dialog", { name: "Produktval för grädde" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Grädde" })).not.toBeInTheDocument();
  });

  it("has the section on a vague line, and none on a recipe line without a catalog ingredient", async () => {
    const user = userEvent.setup();
    render(list([salt, citroner]));
    await user.click(nameButton("Salt"));
    expect(section(dialog("Salt"))).toHaveTextContent("Inget produktval i Maxi ICA Stormarknad Östersund.");
    await user.click(within(dialog("Salt")).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(nameButton("2 citroner"));
    expect(within(dialog("2 citroner")).queryByRole("region", { name: "Produktval" })).not.toBeInTheDocument();
  });

  it("has the section under the form of an own item linked to a catalog ingredient, for its saved link", async () => {
    const user = userEvent.setup();
    const choice = { ...arla, ingredientId: kaffeId, productName: "Zoégas Skånerost", packageSize: "450 g" };
    render(list([kaffe], { productChoices: { [kaffeId]: choice } }));
    await user.click(nameButton("Kaffe"));
    const detail = dialog("Kaffe");
    expect(section(detail)).toHaveTextContent("Zoégas Skånerost · 450 g");
    // A link taken off in the form, not yet saved: the section keeps the saved
    // one, and its button waits until the item is saved.
    await user.click(within(detail).getByRole("button", { name: "Ta bort kopplingen" }));
    expect(section(detail)).toHaveTextContent("Zoégas Skånerost · 450 g");
    const button = within(section(detail)).getByRole("button", { name: "Ändra produktval" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Spara varan först.");
    expect(screen.queryByRole("dialog", { name: "Produktval för kaffe" })).not.toBeInTheDocument();
  });

  it("explains instead of the section that an own item without a link needs one", async () => {
    const user = userEvent.setup();
    render(list([disk]));
    await user.click(nameButton("Diskmedel"));
    const detail = dialog("Diskmedel");
    expect(within(detail).getByText("Koppla varan till en ingrediens för att spara ett produktval.")).toBeInTheDocument();
    expect(within(detail).queryByRole("region", { name: "Produktval" })).not.toBeInTheDocument();
  });

  it("shows the selected store's name: another store has its own choices", async () => {
    const user = userEvent.setup();
    const willys: Store = { ...maxi, id: "99999999-9999-4999-8999-999999999999", name: "Willys Lindhagen", chain: "Willys" };
    render(list([gradde], { store: willys, productChoices: {} }));
    await user.click(nameButton("Grädde"));
    expect(section(dialog("Grädde"))).toHaveTextContent("Inget produktval i Willys Lindhagen.");
  });

  it("shows the list as always when the store or the choices cannot be read; only the section says so", async () => {
    const user = userEvent.setup();
    const { rerender } = render(list([gradde], { store: null, storeUnavailable: true }));
    expect(screen.getAllByTestId("shopping-line")).toHaveLength(1);
    expect(screen.queryByText("Det gick inte att läsa butiken. Försök igen.")).not.toBeInTheDocument();
    await user.click(nameButton("Grädde"));
    expect(within(section(dialog("Grädde"))).getByRole("status")).toHaveTextContent("Det gick inte att läsa butiken. Försök igen.");
    await user.click(within(dialog("Grädde")).getByRole("button", { name: "Avbryt" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    rerender(list([gradde], { productChoicesUnavailable: true }));
    await user.click(nameButton("Grädde"));
    expect(within(section(dialog("Grädde"))).getByRole("status")).toHaveTextContent(
      "Det gick inte att läsa produktvalen. Försök igen.",
    );
  });

  it("says a stored choice cannot be read, and offers no way to save over it", async () => {
    const user = userEvent.setup();
    render(list([gradde], { unreadableChoices: [graddeId] }));
    await user.click(nameButton("Grädde"));
    expect(within(section(dialog("Grädde"))).getByRole("status")).toHaveTextContent("Det gick inte att läsa produktvalet.");
    expect(within(section(dialog("Grädde"))).queryByRole("button")).not.toBeInTheDocument();
  });

  it("closes the sheet, and says why, when the list is read again with another store", async () => {
    const user = userEvent.setup();
    const { rerender } = render(list([gradde]));
    await user.click(nameButton("Grädde"));
    await user.click(within(section(dialog("Grädde"))).getByRole("button", { name: "Ange produktval" }));
    await screen.findByRole("dialog", { name: "Produktval för grädde" });
    const willys: Store = { ...maxi, id: "99999999-9999-4999-8999-999999999999", name: "Willys Lindhagen", chain: "Willys" };
    rerender(list([gradde], { store: willys }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("alert")).toHaveTextContent("Butiken har bytts. Öppna produktvalet igen.");
    expect(saveProductChoice).not.toHaveBeenCalled();
  });

  it("closes the sheet when the choices cannot be read any more", async () => {
    const user = userEvent.setup();
    const { rerender } = render(list([gradde]));
    await user.click(nameButton("Grädde"));
    await user.click(within(section(dialog("Grädde"))).getByRole("button", { name: "Ange produktval" }));
    await screen.findByRole("dialog", { name: "Produktval för grädde" });
    rerender(list([gradde], { productChoicesUnavailable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att läsa produktvalen. Försök igen.");
  });

  it("gives the sheet the choice as the list has it now, so a refused save takes it up", async () => {
    saveProductChoice.mockResolvedValueOnce({ ok: false, error: { code: "shopping_product_choice_changed", message: "Produktvalet har ändrats på annat håll. Uppgifterna är uppdaterade." } });
    const user = userEvent.setup();
    const { rerender } = render(list([gradde]));
    await user.click(nameButton("Grädde"));
    await user.click(within(section(dialog("Grädde"))).getByRole("button", { name: "Ange produktval" }));
    const sheet = await screen.findByRole("dialog", { name: "Produktval för grädde" });
    await user.type(within(sheet).getByLabelText("Produkt"), "Arla");
    await user.click(within(sheet).getByRole("button", { name: "Spara" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Produktvalet har ändrats på annat håll.");
    expect(refresh).toHaveBeenCalled();
    rerender(list([gradde], { productChoices: { [graddeId]: arla } }));
    await waitFor(() => expect(within(sheet).getByLabelText("Produkt")).toHaveValue(arla.productName));
    expect(within(sheet).getByRole("button", { name: "Ta bort produktval" })).toBeInTheDocument();
  });
});
