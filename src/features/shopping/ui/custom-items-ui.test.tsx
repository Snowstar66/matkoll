import { act, render as renderBare, type RenderOptions, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { ShoppingLine } from "../domain/compute-list";
import type { CustomItemFormInput, CustomItemRow } from "../domain/custom-item";
import { ShoppingList, type ShoppingListProps } from "./shopping-list";

// Own items on Inköpslista (Story 3.5): "Lägg till egen vara" with the
// catalog's suggestions, and removing an own item with "Ångra".

const addCustomItem = vi.fn<(input: CustomItemFormInput) => Promise<Result<CustomItemRow>>>();
const removeCustomItem = vi.fn<(id: string) => Promise<Result<CustomItemRow | null>>>();
const restoreCustomItem = vi.fn<(row: CustomItemRow) => Promise<Result<CustomItemRow>>>();
vi.mock("../actions/add-custom-item", () => ({ addCustomItem: (input: CustomItemFormInput) => addCustomItem(input) }));
vi.mock("../actions/remove-custom-item", () => ({ removeCustomItem: (id: string) => removeCustomItem(id) }));
vi.mock("../actions/restore-custom-item", () => ({ restoreCustomItem: (row: CustomItemRow) => restoreCustomItem(row) }));
vi.mock("../actions/set-checked", () => ({ setChecked: vi.fn(async (change: unknown) => ok(change)) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: ToastProvider, ...options });

const planId = "33333333-3333-4333-8333-333333333333";
const diskId = "11111111-1111-4111-8111-111111111111";
const kaffeId = "22222222-2222-4222-8222-222222222222";
const kaffe = "44444444-4444-4444-8444-444444444444";
const plan: NonNullable<ShoppingListProps["plan"]> = {
  id: planId,
  name: "Vecka 44",
  dishCount: 1,
  skippedCount: 0,
  dishTitles: { d1: "Krämig kycklinggryta" },
};
const own = (id: string, label: string, section: ShoppingLine["section"], checked = false): ShoppingLine => ({
  key: `c:${id}`,
  label,
  amount: null,
  unit: null,
  isVague: false,
  coverage: { kind: "unlinked" },
  section,
  origins: [],
  checked,
  isCustom: true,
});
const gradde: ShoppingLine = {
  key: "r:gradde:dl",
  ingredientId: "gradde",
  label: "Grädde",
  amount: 3,
  unit: "dl",
  isVague: false,
  coverage: { kind: "missing" },
  section: "Mejeri",
  origins: ["d1"],
  checked: false,
  isCustom: false,
};
const disk = own(diskId, "diskmedel", "Övrigt");
const coffee = own(kaffeId, "Kaffe", "Skafferi");
const diskRow: CustomItemRow = { id: diskId, planId, label: "diskmedel", ingredientId: null, amount: null, unit: null };
const searchIngredients = vi.fn(async (query: string) =>
  ok("kaffe".startsWith(query.trim().toLowerCase()) ? [{ id: kaffe, name: "Kaffe" }] : []),
);

beforeEach(() => {
  addCustomItem.mockReset().mockImplementation(async (input) =>
    ok({ id: input.id!, planId, label: input.label, ingredientId: input.ingredientId ?? null, amount: null, unit: null }),
  );
  removeCustomItem.mockReset().mockResolvedValue(ok(diskRow));
  restoreCustomItem.mockReset().mockImplementation(async (row) => ok(row));
  searchIngredients.mockClear();
  refresh.mockReset();
});

const sheet = () => screen.getByRole("dialog", { name: "Lägg till egen vara" });

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Lägg till egen vara" }));
  return sheet();
}

describe("Lägg till egen vara", () => {
  it("is not there without a plan, and is under the list with one, also with nothing on it", () => {
    const { rerender } = render(<ShoppingList plan={null} lines={[]} pantryUnavailable={false} />);
    expect(screen.queryByRole("button", { name: "Lägg till egen vara" })).not.toBeInTheDocument();
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByRole("button", { name: "Lägg till egen vara" })).toBeInTheDocument();
  });

  it("asks for text, then adds the item with an id made once and closes the sheet", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} searchIngredients={searchIngredients} />);
    const dialog = await openSheet(user);
    const field = within(dialog).getByRole("textbox", { name: "Vara" });
    await waitFor(() => expect(field).toHaveFocus());

    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect(within(dialog).getByText("Skriv vad du vill lägga till.")).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(addCustomItem).not.toHaveBeenCalled();

    await user.type(field, "diskmedel");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lägg till egen vara" })).not.toBeInTheDocument());
    expect(addCustomItem).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      planId,
      label: "diskmedel",
      ingredientId: null,
      amount: "",
      unit: "",
    });
  });

  it("suggests catalog ingredients while Pontus types, and links the item to the one chosen", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} searchIngredients={searchIngredients} />);
    const dialog = await openSheet(user);
    const field = within(dialog).getByRole("textbox", { name: "Vara" });
    await user.type(field, "kaff");
    const suggestions = await within(dialog).findByRole("list", { name: "Förslag" });
    // One search after the pause, not one per key.
    expect(searchIngredients).toHaveBeenCalledTimes(1);
    expect(searchIngredients).toHaveBeenCalledWith("kaff");

    await user.click(within(suggestions).getByRole("button", { name: "Kaffe" }));
    expect(field).toHaveValue("Kaffe");
    expect(within(dialog).getByTestId("custom-item-link")).toHaveTextContent("Kopplad till Kaffe");
    expect(within(dialog).queryByRole("list", { name: "Förslag" })).not.toBeInTheDocument();

    // The text can still change; the link stays, and the text becomes a synonym.
    await user.type(field, " bryggmalet");
    await user.type(within(dialog).getByRole("textbox", { name: "Mängd" }), "2");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Enhet" }), "förp");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(addCustomItem).toHaveBeenCalledTimes(1));
    expect(addCustomItem.mock.calls[0][0]).toMatchObject({
      label: "Kaffe bryggmalet",
      ingredientId: kaffe,
      amount: "2",
      unit: "förp",
    });
  });

  it("takes the link off with Ta bort kopplingen", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} searchIngredients={searchIngredients} />);
    const dialog = await openSheet(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Vara" }), "kaffe");
    await user.click(await within(dialog).findByRole("button", { name: "Kaffe" }));
    await user.click(within(dialog).getByRole("button", { name: "Ta bort kopplingen" }));
    expect(within(dialog).queryByTestId("custom-item-link")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(addCustomItem).toHaveBeenCalledTimes(1));
    expect(addCustomItem.mock.calls[0][0]).toMatchObject({ label: "Kaffe", ingredientId: null });
  });

  it("asks for a unit with an amount, and for a number", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    const dialog = await openSheet(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Vara" }), "diskmedel");
    const amount = within(dialog).getByRole("textbox", { name: "Mängd" });
    await user.type(amount, "2");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect(within(dialog).getByText("Välj en enhet.")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Enhet" })).toHaveFocus();
    await user.clear(amount);
    await user.type(amount, "0");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Enhet" }), "förp");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect(within(dialog).getByText("Ange ett tal större än 0.")).toBeInTheDocument();
    expect(addCustomItem).not.toHaveBeenCalled();
  });

  it("keeps the form and the id after a failure, and asks before throwing the text away", async () => {
    const user = userEvent.setup();
    addCustomItem.mockResolvedValueOnce(fail("shopping_save_failed"));
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    const dialog = await openSheet(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Vara" }), "diskmedel");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att spara varan. Försök igen.");
    expect(within(dialog).getByRole("textbox", { name: "Vara" })).toHaveValue("diskmedel");

    // The button reads "Sparar …" until the failed save has settled.
    await user.click(await within(dialog).findByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(addCustomItem).toHaveBeenCalledTimes(2));
    expect(addCustomItem.mock.calls[1][0].id).toBe(addCustomItem.mock.calls[0][0].id);
  });

  it("reads the list again when the plan was switched elsewhere", async () => {
    const user = userEvent.setup();
    addCustomItem.mockResolvedValueOnce(fail("shopping_plan_changed"));
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    const dialog = await openSheet(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Vara" }), "diskmedel");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Matsedeln har bytts. Listan är uppdaterad.");
    expect(refresh).toHaveBeenCalled();
  });
});

describe("removing an own item", () => {
  const lines = [gradde, coffee, disk];

  it("offers Ta bort on own items, and on recipe lines too since Story 3.6", () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    expect(screen.getByRole("button", { name: "Ta bort diskmedel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ta bort Kaffe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ta bort Grädde" })).toBeInTheDocument();
  });

  it("removes the item at once, and Ångra puts it back with the same row and check", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde, coffee, { ...disk, checked: true }]} pantryUnavailable={false} />);
    // Checked off, it is in I korgen (Story 11.4).
    await user.click(screen.getByRole("button", { name: "Visa" }));
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    expect(removeCustomItem).toHaveBeenCalledWith(diskId);
    expect(screen.queryByText("diskmedel")).not.toBeInTheDocument();
    expect((await screen.findAllByText("Diskmedel är borttagen.")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Ångra" }));
    expect(restoreCustomItem).toHaveBeenCalledWith(diskRow);
    // The basket folded when it was empty: the item is back in it, still checked.
    expect(await screen.findByText("1 vara i korgen")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Visa" }));
    const back = screen.getByRole("checkbox", { name: "diskmedel" });
    expect(back).toBeChecked();
    expect(within(screen.getByRole("list", { name: "I korgen" })).getByText("diskmedel")).toBeInTheDocument();
  });

  it("joins items removed while the confirmation shows, and puts them all back", async () => {
    const user = userEvent.setup();
    const kaffeRow = { ...diskRow, id: kaffeId, label: "Kaffe" };
    removeCustomItem.mockImplementation(async (id) => ok(id === diskId ? diskRow : kaffeRow));
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    await screen.findAllByText("Diskmedel är borttagen.");
    await user.click(screen.getByRole("button", { name: "Ta bort Kaffe" }));
    expect((await screen.findAllByText("Diskmedel och Kaffe är borttagna.")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreCustomItem).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Kaffe")).toBeInTheDocument();
  });

  it("brings the item back with an alert when it could not be removed", async () => {
    const user = userEvent.setup();
    removeCustomItem.mockResolvedValue(fail("shopping_remove_failed"));
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ta bort varan.");
    expect(screen.getByText("diskmedel")).toBeInTheDocument();
  });

  it("takes the item away again with an alert when Ångra fails", async () => {
    const user = userEvent.setup();
    restoreCustomItem.mockResolvedValue(fail("shopping_restore_failed"));
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    // The server's list, read again after the removal, has no diskmedel.
    rerender(<ShoppingList plan={plan} lines={[gradde, coffee]} pantryUnavailable={false} />);
    await user.click(await screen.findByRole("button", { name: "Ångra" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(screen.queryByText("diskmedel")).not.toBeInTheDocument();
  });

  it("moves focus to the next line after a removal with the keyboard, else to Lägg till egen vara", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde, disk]} pantryUnavailable={false} />);
    const action = screen.getByRole("button", { name: "Ta bort diskmedel" });
    act(() => action.focus());
    await user.keyboard("{Enter}");
    // diskmedel was last: the line before it.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Grädde, 3 dl" })).toHaveFocus());

    rerender(<ShoppingList plan={plan} lines={[disk]} pantryUnavailable={false} />);
    await waitFor(() => expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument());
  });

  it("focuses Lägg till egen vara when the last line goes", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[disk]} pantryUnavailable={false} />);
    act(() => screen.getByRole("button", { name: "Ta bort diskmedel" }).focus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Lägg till egen vara" })).toHaveFocus());
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
  });
});

describe("own items after review", () => {
  it("shows the summary without dishes, and the checks notice, for a plan with only own items", () => {
    render(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[disk, coffee]} pantryUnavailable={false} checksUnavailable />);
    expect(screen.getByTestId("list-summary")).toHaveTextContent(/^Vecka 44$/);
    expect(screen.getByTestId("list-progress")).toHaveTextContent("2 varor kvar 0 av 2 i korgen");
    expect(screen.getByText("Det gick inte att läsa bockarna, så det går inte att bocka av just nu.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("announces no recount when an own item is added or removed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    rerender(<ShoppingList plan={plan} lines={[gradde, disk]} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("");
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    rerender(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await screen.findAllByText("Diskmedel är borttagen.");
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("");
  });

  it.each([
    ["the plan was switched", async () => fail("shopping_plan_changed"), "Matsedeln har bytts. Listan är uppdaterad."],
    ["there is no answer", async () => Promise.reject(new Error("offline")), "Det gick inte att ta bort varan."],
  ] as const)("shows an alert and reads the list again when a removal fails because %s", async (_, answer, text) => {
    const user = userEvent.setup();
    removeCustomItem.mockImplementation(answer as () => Promise<Result<CustomItemRow | null>>);
    render(<ShoppingList plan={plan} lines={[gradde, disk]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText("diskmedel")).toBeInTheDocument();
  });

  it("shows an alert and reads the list again when Ångra gets no answer", async () => {
    const user = userEvent.setup();
    restoreCustomItem.mockRejectedValue(new Error("offline"));
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde, disk]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    rerender(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(await screen.findByRole("button", { name: "Ångra" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(refresh).toHaveBeenCalled();
  });

  it("names the items Ångra could not put back when only some come back", async () => {
    const user = userEvent.setup();
    const kaffeRow = { ...diskRow, id: kaffeId, label: "Kaffe" };
    removeCustomItem.mockImplementation(async (id) => ok(id === diskId ? diskRow : kaffeRow));
    restoreCustomItem.mockImplementation(async (row) => (row.id === diskId ? fail("shopping_restore_failed") : ok(row)));
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde, coffee, disk]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    await screen.findAllByText("Diskmedel är borttagen.");
    await user.click(screen.getByRole("button", { name: "Ta bort Kaffe" }));
    rerender(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(await screen.findByRole("button", { name: "Ångra" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ångra diskmedel.");
    expect(screen.getByText("Kaffe")).toBeInTheDocument();
    expect(screen.queryByText("diskmedel")).not.toBeInTheDocument();
  });

  it("confirms a removal that cannot be put back without Ångra, and starts a new confirmation after it", async () => {
    const user = userEvent.setup();
    removeCustomItem.mockResolvedValueOnce(ok(null));
    render(<ShoppingList plan={plan} lines={[gradde, coffee, disk]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Ta bort diskmedel" }));
    await screen.findAllByText("Diskmedel är borttagen.");
    expect(screen.queryByRole("button", { name: "Ångra" })).not.toBeInTheDocument();
    removeCustomItem.mockResolvedValueOnce(ok({ ...diskRow, id: kaffeId, label: "Kaffe" }));
    await user.click(screen.getByRole("button", { name: "Ta bort Kaffe" }));
    // Kaffe alone: diskmedel's confirmation was no batch to join.
    expect((await screen.findAllByText("Kaffe är borttagen.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ångra" })).toBeInTheDocument();
  });

  it("moves focus to the next line's Ta bort when checking is off", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[coffee, disk]} pantryUnavailable={false} checksUnavailable />);
    act(() => screen.getByRole("button", { name: "Ta bort Kaffe" }).focus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ta bort diskmedel" })).toHaveFocus());
  });

  it("makes a new id when a field changes after a failed save", async () => {
    const user = userEvent.setup();
    addCustomItem.mockResolvedValueOnce(fail("shopping_save_failed"));
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    const dialog = await openSheet(user);
    const field = within(dialog).getByRole("textbox", { name: "Vara" });
    await user.type(field, "diskmedel");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    await within(dialog).findByRole("alert");
    await user.type(field, "s");
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(addCustomItem).toHaveBeenCalledTimes(2));
    expect(addCustomItem.mock.calls[1][0]).toMatchObject({ label: "diskmedels" });
    expect(addCustomItem.mock.calls[1][0].id).not.toBe(addCustomItem.mock.calls[0][0].id);
  });

  it("says when suggestions cannot be shown, and the item can still be added", async () => {
    const user = userEvent.setup();
    render(
      <ShoppingList
        plan={plan}
        lines={[gradde]}
        pantryUnavailable={false}
        searchIngredients={async () => fail("catalog_unavailable")}
      />,
    );
    const dialog = await openSheet(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Vara" }), "kaff");
    expect(await within(dialog).findByText("Förslag går inte att visa just nu.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(addCustomItem).toHaveBeenCalledTimes(1));
  });

  it("starts without the last opening's suggestions", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} searchIngredients={searchIngredients} />);
    let dialog = await openSheet(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Vara" }), "kaff");
    await within(dialog).findByRole("list", { name: "Förslag" });
    await user.click(within(dialog).getByRole("button", { name: "Avbryt" }));
    await user.click(within(dialog).getByRole("button", { name: "Släng ändringarna" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lägg till egen vara" })).not.toBeInTheDocument());

    dialog = await openSheet(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Vara" }), "d");
    expect(within(dialog).queryByRole("list", { name: "Förslag" })).not.toBeInTheDocument();
  });

  it("caps the amount field at 40 characters", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    const dialog = await openSheet(user);
    expect(within(dialog).getByRole("textbox", { name: "Mängd" })).toHaveAttribute("maxlength", "40");
  });
});
