import { act, render as renderBare, type RenderOptions, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { ShoppingLine } from "../domain/compute-list";
import type { CustomItemFormInput, CustomItemRow } from "../domain/custom-item";
import type { HiddenLine, LineAmountFormInput, LineOverrideRow, LineRef, RestoreLine } from "../domain/line-override";
import { ShoppingList, type ShoppingListProps } from "./shopping-list";

// Listpostdetalj and hiding recipe lines (Story 3.6): a tap on a line's name
// opens the detail, where Pontus corrects a recipe line's amount, goes back to
// the counted one, or changes an own item; "Ta bort" (swipe or detail) hides
// a recipe line with "Ångra".

const setLineAmount = vi.fn<(input: LineAmountFormInput) => Promise<Result<unknown>>>();
const clearLineAmount = vi.fn<(line: LineRef) => Promise<Result<LineRef>>>();
const hideLine = vi.fn<(line: LineRef) => Promise<Result<HiddenLine | null>>>();
const showLine = vi.fn<(line: LineRef) => Promise<Result<LineRef>>>();
const restoreLine = vi.fn<(input: RestoreLine) => Promise<Result<RestoreLine>>>();
const updateCustomItem = vi.fn<(input: CustomItemFormInput) => Promise<Result<CustomItemRow>>>();
const removeCustomItem = vi.fn<(id: string) => Promise<Result<CustomItemRow | null>>>();
vi.mock("../actions/set-line-amount", () => ({ setLineAmount: (input: LineAmountFormInput) => setLineAmount(input) }));
vi.mock("../actions/clear-line-amount", () => ({ clearLineAmount: (line: LineRef) => clearLineAmount(line) }));
vi.mock("../actions/hide-line", () => ({ hideLine: (line: LineRef) => hideLine(line) }));
vi.mock("../actions/restore-line", () => ({ restoreLine: (input: RestoreLine) => restoreLine(input) }));
vi.mock("../actions/show-line", () => ({ showLine: (line: LineRef) => showLine(line) }));
vi.mock("../actions/update-custom-item", () => ({
  updateCustomItem: (input: CustomItemFormInput) => updateCustomItem(input),
}));
vi.mock("../actions/remove-custom-item", () => ({ removeCustomItem: (id: string) => removeCustomItem(id) }));
vi.mock("../actions/restore-custom-item", () => ({ restoreCustomItem: vi.fn(async (row: unknown) => ok(row)) }));
vi.mock("../actions/add-custom-item", () => ({ addCustomItem: vi.fn() }));
vi.mock("../actions/set-checked", () => ({ setChecked: vi.fn(async (change: unknown) => ok(change)) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: ToastProvider, ...options });

const planId = "33333333-3333-4333-8333-333333333333";
const graddeId = "11111111-1111-4111-8111-111111111111";
const saltId = "22222222-2222-4222-8222-222222222222";
const diskId = "44444444-4444-4444-8444-444444444444";
const kaffeId = "55555555-5555-4555-8555-555555555555";
const overrideId = "66666666-6666-4666-8666-666666666666";
const plan: NonNullable<ShoppingListProps["plan"]> = {
  id: planId,
  name: "Vecka 44",
  dishCount: 2,
  skippedCount: 0,
  dishTitles: { d1: "Krämig kycklinggryta", d2: "Linssoppa" },
};
const graddeKey = `r:${graddeId}:dl`;
const gradde: ShoppingLine = {
  key: graddeKey,
  ingredientId: graddeId,
  label: "Grädde",
  amount: 3,
  unit: "dl",
  isVague: false,
  coverage: { kind: "other-unit", amounts: [{ amount: 1, unit: "l" }] } as ShoppingLine["coverage"],
  pantryNote: "hemma: 1 l",
  section: "Mejeri",
  origins: ["d1", "d2"],
  checked: false,
  isCustom: false,
};
const corrected: ShoppingLine = { ...gradde, amount: 2, computedAmount: 3 };
const salt: ShoppingLine = {
  key: `r:${saltId}:-`,
  ingredientId: saltId,
  label: "Salt",
  amount: null,
  unit: null,
  isVague: true,
  coverage: { kind: "vague-missing" },
  section: "Skafferi",
  origins: ["d1"],
  checked: false,
  isCustom: false,
};
const disk: ShoppingLine = {
  key: `c:${diskId}`,
  ingredientId: kaffeId,
  linkedName: "Kaffe",
  label: "diskmedel",
  amount: 2,
  unit: "förp",
  isVague: false,
  coverage: { kind: "unlinked" },
  section: "Övrigt",
  origins: [],
  checked: false,
  isCustom: true,
};
const previous: LineOverrideRow = { id: overrideId, planId, key: graddeKey, amount: 2, baseAmount: 3, hidden: false };
const hiddenUpdatedAt = "2026-10-26T05:12:29.123456+00:00";

beforeEach(() => {
  // This test starts from I korgen folded; Story 3.9 opens it by default.
  window.localStorage.setItem("matkoll:basket-open", "0");
  setLineAmount.mockReset().mockImplementation(async (input) => ok(input));
  clearLineAmount.mockReset().mockImplementation(async (line) => ok(line));
  hideLine.mockReset().mockResolvedValue(ok({ previous, hiddenUpdatedAt }));
  showLine.mockReset().mockImplementation(async (line) => ok(line));
  restoreLine.mockReset().mockImplementation(async (input) => ok(input));
  updateCustomItem.mockReset().mockImplementation(async (input) =>
    ok({ id: input.id!, planId, label: input.label, ingredientId: input.ingredientId ?? null, amount: 2, unit: "förp" }),
  );
  removeCustomItem.mockReset();
  refresh.mockReset();
});

const nameButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const detail = (name: string) => screen.getByRole("dialog", { name });

describe("Listpostdetalj for a recipe line", () => {
  it("opens on a tap on the name, not the check, with the amount, unit, what is at home, origin and Ta bort", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl (hemma: 1 l)" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The stub's server list keeps the line unchecked, so it comes back from I korgen once the save has settled.
    await user.click(await screen.findByRole("button", { name: /^Grädde/ }));
    const sheet = detail("Grädde");
    expect(within(sheet).getByRole("textbox", { name: "Mängd" })).toHaveValue("3");
    expect(within(sheet).getByTestId("line-detail-unit")).toHaveTextContent("dl");
    expect(within(sheet).getByTestId("line-detail-pantry")).toHaveTextContent("(hemma: 1 l)");
    expect(within(sheet).getByTestId("line-detail-origins")).toHaveTextContent("Från Krämig kycklinggryta, Linssoppa");
    expect(within(sheet).queryByTestId("line-detail-computed")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Ta bort" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    // No product choice here (Epic 7), and no unit to change.
    expect(within(sheet).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("saves a corrected amount and closes", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    const field = within(detail("Grädde")).getByRole("textbox", { name: "Mängd" });
    await user.clear(field);
    await user.type(field, "2");
    await user.click(within(detail("Grädde")).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // With the amount counted now, so the row can say when it changes.
    expect(setLineAmount).toHaveBeenCalledWith({ planId, key: graddeKey, amount: "2", baseAmount: 3 });
  });

  it.each(["två", "0", ""])("refuses %j at the field and saves nothing", async (typed) => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    const sheet = detail("Grädde");
    const field = within(sheet).getByRole("textbox", { name: "Mängd" });
    await user.clear(field);
    if (typed) await user.type(field, typed);
    await user.click(within(sheet).getByRole("button", { name: "Spara" }));
    expect(within(sheet).getByText("Ange ett tal större än 0.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(setLineAmount).not.toHaveBeenCalled();
  });

  it("only closes when Spara gets the amount unchanged", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    await user.click(within(detail("Grädde")).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setLineAmount).not.toHaveBeenCalled();
  });

  it("shows the counted amount beside a corrected one, and goes back to it", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[corrected]} pantryUnavailable={false} />);
    expect(screen.getByText("2 dl (hemma: 1 l)")).toBeInTheDocument();
    await user.click(nameButton("Grädde"));
    const sheet = detail("Grädde");
    expect(within(sheet).getByRole("textbox", { name: "Mängd" })).toHaveValue("2");
    expect(within(sheet).getByTestId("line-detail-computed")).toHaveTextContent("Beräknat: 3 dl");
    await user.click(within(sheet).getByRole("button", { name: "Använd beräknad mängd" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(clearLineAmount).toHaveBeenCalledWith({ planId, key: graddeKey });
  });

  it("keeps the form with an alert when saving fails, and reads the list again when the plan changed", async () => {
    const user = userEvent.setup();
    setLineAmount.mockResolvedValueOnce(fail("shopping_save_failed")).mockResolvedValueOnce(fail("shopping_plan_changed"));
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    const sheet = detail("Grädde");
    await user.type(within(sheet).getByRole("textbox", { name: "Mängd" }), ",5");
    await user.click(within(sheet).getByRole("button", { name: "Spara" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Det gick inte att spara varan. Försök igen.");
    expect(within(sheet).getByRole("textbox", { name: "Mängd" })).toHaveValue("3,5");
    // The button reads "Sparar …" until the failed save has settled.
    await user.click(await within(sheet).findByRole("button", { name: "Spara" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Matsedeln har bytts. Listan är uppdaterad.");
    expect(refresh).toHaveBeenCalled();
  });

  it("asks Släng ändringarna? before closing with a changed amount", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    const sheet = detail("Grädde");
    await user.type(within(sheet).getByRole("textbox", { name: "Mängd" }), "0");
    await user.click(within(sheet).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet).getByText("Släng ändringarna?")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Släng ändringarna" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setLineAmount).not.toHaveBeenCalled();
  });

  it("has no amount to correct on a vague line: only the origin and Ta bort, closed with Klar", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[salt]} pantryUnavailable={false} />);
    await user.click(nameButton("Salt"));
    const sheet = detail("Salt");
    expect(within(sheet).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Spara" })).not.toBeInTheDocument();
    expect(within(sheet).getByTestId("line-detail-origins")).toHaveTextContent("Från Krämig kycklinggryta");
    expect(within(sheet).getByRole("button", { name: "Ta bort" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("hiding a recipe line", () => {
  it("hides the line at once by swipe, and Ångra puts its override back", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShoppingList plan={plan} lines={[corrected, salt]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Svep bort Grädde" }));
    expect(hideLine).toHaveBeenCalledWith({ planId, key: graddeKey });
    expect(screen.queryByText("Grädde")).not.toBeInTheDocument();
    expect(screen.getByTestId("list-progress")).toHaveTextContent("1 vara kvar");
    expect((await screen.findAllByText("Grädde är borttagen.")).length).toBeGreaterThan(0);
    rerender(<ShoppingList plan={plan} lines={[salt]} pantryUnavailable={false} />);

    await user.click(screen.getByRole("button", { name: "Ångra" }));
    expect(restoreLine).toHaveBeenCalledWith({ planId, key: graddeKey, previous, hiddenUpdatedAt });
    // Back with the corrected amount it had.
    expect(await screen.findByText("2 dl (hemma: 1 l)")).toBeInTheDocument();
    rerender(<ShoppingList plan={plan} lines={[corrected, salt]} pantryUnavailable={false} />);
    // Pontus's own removal and Ångra are never announced as a recount.
    expect(screen.getByTestId("list-announcement")).toBeEmptyDOMElement();
  });

  it("hides from the detail's Ta bort and closes the sheet, with the same confirmation", async () => {
    const user = userEvent.setup();
    hideLine.mockResolvedValue(ok({ previous: null, hiddenUpdatedAt }));
    render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    await user.click(within(detail("Grädde")).getByRole("button", { name: "Ta bort" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(hideLine).toHaveBeenCalledWith({ planId, key: graddeKey });
    expect((await screen.findAllByText("Grädde är borttagen.")).length).toBeGreaterThan(0);
    // Focus moves on to the next line.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Salt" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Ångra" }));
    expect(restoreLine).toHaveBeenCalledWith({ planId, key: graddeKey, previous: null, hiddenUpdatedAt });
  });

  it("brings the line back with an alert when it could not be hidden", async () => {
    const user = userEvent.setup();
    hideLine.mockResolvedValue(fail("shopping_remove_failed"));
    render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Svep bort Grädde" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ta bort varan.");
    expect(screen.getByText("Grädde")).toBeInTheDocument();
    expect(screen.getByTestId("list-announcement")).toBeEmptyDOMElement();
  });

  it("hides the line again with an alert when Ångra fails", async () => {
    const user = userEvent.setup();
    restoreLine.mockResolvedValue(fail("shopping_restore_failed"));
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Svep bort Grädde" }));
    rerender(<ShoppingList plan={plan} lines={[salt]} pantryUnavailable={false} />);
    await user.click(await screen.findByRole("button", { name: "Ångra" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(screen.queryByText("Grädde")).not.toBeInTheDocument();
  });

  it("still announces a recount that Pontus did not make", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    rerender(<ShoppingList plan={plan} lines={[{ ...gradde, amount: 4 }, salt]} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("Inköpslistan är omräknad. 2 varor kvar.");
  });

  it("announces no recount for Pontus's own correction, but one that comes from elsewhere", async () => {
    const user = userEvent.setup();
    // The list is read again only after the action has answered.
    let answer: (result: Result<unknown>) => void = () => {};
    setLineAmount.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    const field = within(detail("Grädde")).getByRole("textbox", { name: "Mängd" });
    await user.clear(field);
    await user.type(field, "2");
    await user.click(within(detail("Grädde")).getByRole("button", { name: "Spara" }));
    await act(async () => answer(ok({})));
    rerender(<ShoppingList plan={plan} lines={[corrected, salt]} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-announcement")).toBeEmptyDOMElement();

    // Later, the counted amount changes elsewhere: that is a recount.
    rerender(<ShoppingList plan={plan} lines={[{ ...corrected, computedAmount: 4, computedChanged: true }, salt]} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("Inköpslistan är omräknad.");
    expect(screen.getByText("2 dl (beräknat 4 dl, hemma: 1 l)")).toBeInTheDocument();
  });

  it("hides a line once when Ta bort is pressed twice", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<HiddenLine | null>) => void = () => {};
    hideLine.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    const action = screen.getByRole("button", { name: "Svep bort Grädde" });
    // Two presses before the list renders again.
    act(() => {
      action.click();
      action.click();
    });
    expect(hideLine).toHaveBeenCalledTimes(1);
    await user.click(nameButton("Salt"));
    const sheet = detail("Salt");
    act(() => {
      within(sheet).getByRole("button", { name: "Ta bort" }).click();
      within(sheet).getByRole("button", { name: "Ta bort" }).click();
    });
    expect(hideLine).toHaveBeenCalledTimes(2);
    await act(async () => answer(ok({ previous: null, hiddenUpdatedAt })));
  });

  it("tries a lost hide once more, and then offers Ångra", async () => {
    const user = userEvent.setup();
    hideLine.mockRejectedValueOnce(new Error("offline"));
    render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Svep bort Grädde" }));
    expect((await screen.findAllByText("Grädde är borttagen.")).length).toBeGreaterThan(0);
    expect(hideLine).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Ångra" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("brings the line back and reads the list again when the retry is lost too", async () => {
    const user = userEvent.setup();
    hideLine.mockRejectedValue(new Error("offline"));
    render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Svep bort Grädde" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ta bort varan.");
    expect(hideLine).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText("Grädde")).toBeInTheDocument();
  });

  it("confirms without Ångra when the line is hidden but cannot be put back", async () => {
    const user = userEvent.setup();
    hideLine.mockResolvedValue(ok(null));
    render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Svep bort Grädde" }));
    expect((await screen.findAllByText("Grädde är borttagen.")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Ångra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Listpostdetalj for an own item", () => {
  it("shows the text, amount, unit and link, and Spara changes the item on its id", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[disk]} pantryUnavailable={false} />);
    await user.click(nameButton("diskmedel"));
    const sheet = detail("diskmedel");
    const field = within(sheet).getByRole("textbox", { name: "Vara" });
    expect(field).toHaveValue("diskmedel");
    expect(within(sheet).getByRole("textbox", { name: "Mängd" })).toHaveValue("2");
    expect(within(sheet).getByRole("combobox", { name: "Enhet" })).toHaveValue("förp");
    expect(within(sheet).getByTestId("custom-item-link")).toHaveTextContent("Kopplad till Kaffe");
    // Not in focus at once, unlike Lägg till egen vara.
    expect(field).not.toHaveFocus();

    await user.type(field, " eko");
    await user.click(within(sheet).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateCustomItem).toHaveBeenCalledWith({
      id: diskId,
      label: "diskmedel eko",
      ingredientId: kaffeId,
      amount: "2",
      unit: "förp",
    });
  });

  it("only closes when nothing changed, and asks before throwing changes away", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[disk]} pantryUnavailable={false} />);
    await user.click(nameButton("diskmedel"));
    await user.click(within(detail("diskmedel")).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateCustomItem).not.toHaveBeenCalled();

    await user.click(nameButton("diskmedel"));
    const sheet = detail("diskmedel");
    await user.click(within(sheet).getByRole("button", { name: "Ta bort kopplingen" }));
    await user.click(within(sheet).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet).getByText("Släng ändringarna?")).toBeInTheDocument();
  });

  it("removes the item from the detail with Ångra, as a swipe does", async () => {
    const user = userEvent.setup();
    removeCustomItem.mockResolvedValue(
      ok({ id: diskId, planId, label: "diskmedel", ingredientId: kaffeId, amount: 2, unit: "förp" }),
    );
    render(<ShoppingList plan={plan} lines={[disk]} pantryUnavailable={false} />);
    await user.click(nameButton("diskmedel"));
    await user.click(within(detail("diskmedel")).getByRole("button", { name: "Ta bort" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(removeCustomItem).toHaveBeenCalledWith(diskId);
    expect((await screen.findAllByText("Diskmedel är borttagen.")).length).toBeGreaterThan(0);
    expect(hideLine).not.toHaveBeenCalled();
  });

  it("opens the detail again from the line as it is now", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShoppingList plan={plan} lines={[disk]} pantryUnavailable={false} />);
    await user.click(nameButton("diskmedel"));
    await user.click(within(detail("diskmedel")).getByRole("button", { name: "Avbryt" }));
    rerender(<ShoppingList plan={plan} lines={[{ ...disk, label: "te", amount: null, unit: null }]} pantryUnavailable={false} />);
    await act(async () => {});
    await user.click(nameButton("te"));
    expect(within(detail("te")).getByRole("textbox", { name: "Vara" })).toHaveValue("te");
  });
});

describe("after review (Story 3.6)", () => {
  it("fills the amount field with the exact amount, not the rounded one", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[{ ...gradde, amount: 1 / 3 }]} pantryUnavailable={false} />);
    expect(screen.getByText("0,33 dl (hemma: 1 l)")).toBeInTheDocument();
    await user.click(nameButton("Grädde"));
    const sheet = detail("Grädde");
    expect(within(sheet).getByRole("textbox", { name: "Mängd" })).toHaveValue("0,3333333333333333");
    // Unchanged: no question before closing.
    await user.click(within(sheet).getByRole("button", { name: "Avbryt" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("takes the correction off when the counted amount is typed, and only closes without one", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShoppingList plan={plan} lines={[corrected]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    const field = within(detail("Grädde")).getByRole("textbox", { name: "Mängd" });
    await user.clear(field);
    await user.type(field, "3,0");
    await user.click(within(detail("Grädde")).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(clearLineAmount).toHaveBeenCalledWith({ planId, key: graddeKey });
    expect(setLineAmount).not.toHaveBeenCalled();

    rerender(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    const again = within(detail("Grädde")).getByRole("textbox", { name: "Mängd" });
    await user.clear(again);
    await user.type(again, "3,00");
    await user.click(within(detail("Grädde")).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(clearLineAmount).toHaveBeenCalledTimes(1);
    expect(setLineAmount).not.toHaveBeenCalled();
  });

  it("closes the detail when its line leaves the list while it is open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShoppingList plan={plan} lines={[gradde, salt]} pantryUnavailable={false} />);
    await user.click(nameButton("Grädde"));
    expect(detail("Grädde")).toBeInTheDocument();
    rerender(<ShoppingList plan={plan} lines={[salt]} pantryUnavailable={false} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lists the hidden lines under Dolda varor, and Visa igen shows one again", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ShoppingList plan={plan} lines={[salt]} hiddenLines={[corrected]} pantryUnavailable={false} />,
    );
    await user.click(screen.getByRole("button", { name: "Dolda varor (1)" }));
    const sheet = detail("Dolda varor");
    const row = within(sheet).getByTestId("hidden-line");
    expect(row).toHaveTextContent("Grädde");
    expect(row).toHaveTextContent("2 dl (hemma: 1 l)");
    await user.click(within(sheet).getByRole("button", { name: "Visa igen Grädde" }));
    expect(showLine).toHaveBeenCalledWith({ planId, key: graddeKey });
    // The list read again: the line is back with its correction, and nothing is hidden.
    rerender(<ShoppingList plan={plan} lines={[corrected, salt]} hiddenLines={[]} pantryUnavailable={false} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^Dolda varor/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("list-announcement")).toBeEmptyDOMElement();
  });

  it("says when Visa igen fails", async () => {
    const user = userEvent.setup();
    showLine.mockResolvedValue(fail("shopping_save_failed"));
    render(<ShoppingList plan={plan} lines={[salt]} hiddenLines={[gradde]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Dolda varor (1)" }));
    await user.click(within(detail("Dolda varor")).getByRole("button", { name: "Visa igen Grädde" }));
    expect(await within(detail("Dolda varor")).findByRole("alert")).toHaveTextContent(
      "Det gick inte att spara varan. Försök igen.",
    );
  });

  it("fills an own item's form from its stored text, and names a link without a known name", async () => {
    const user = userEvent.setup();
    render(
      <ShoppingList
        plan={plan}
        lines={[{ ...disk, label: "diskmedel eko", customLabel: "diskmedel  eko", linkedName: undefined, amount: 1500000 }]}
        pantryUnavailable={false}
      />,
    );
    await user.click(nameButton("diskmedel eko"));
    const sheet = detail("diskmedel eko");
    expect(within(sheet).getByRole("textbox", { name: "Vara" })).toHaveValue("diskmedel  eko");
    expect(within(sheet).getByTestId("custom-item-link")).toHaveTextContent("Kopplad till okänd ingrediens");
    expect(within(sheet).getByRole("textbox", { name: "Mängd" })).toHaveValue("1500000");
  });

  it("closes an own item's detail, reads the list again and says so when the item is gone", async () => {
    const user = userEvent.setup();
    updateCustomItem.mockResolvedValue(fail("shopping_item_gone"));
    render(<ShoppingList plan={plan} lines={[disk]} pantryUnavailable={false} />);
    await user.click(nameButton("diskmedel"));
    const sheet = detail("diskmedel");
    await user.type(within(sheet).getByRole("textbox", { name: "Vara" }), " eko");
    await user.click(within(sheet).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
    expect((await screen.findAllByText("Varan finns inte längre.")).length).toBeGreaterThan(0);
  });
});
