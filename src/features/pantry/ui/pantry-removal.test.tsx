import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { PantryItem } from "../domain/pantry-item";
import type { PantryItemFormInput, PantryRow } from "../domain/pantry-item-form";
import { AddPantryItemButton, PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { PantryPlace } from "./pantry-place";
import { applyPantryChanges } from "./pantry-removal";

// Removing items on Hemma with "Ångra" (Story 2.3). The actions are stubbed;
// `serverUpdate` changes the server's items, as a revalidation would.

const removePantryItem = vi.fn<(id: string) => Promise<Result<PantryRow | null>>>();
const restorePantryItem = vi.fn<(row: PantryRow) => Promise<Result<PantryRow>>>();
const savePantryItem = vi.fn<(form: PantryItemFormInput) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: (id: string) => removePantryItem(id) }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: (row: PantryRow) => restorePantryItem(row) }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: (form: PantryItemFormInput) => savePantryItem(form) }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const item = (id: string, name: string, overrides: Partial<PantryItem> = {}): PantryItem => ({
  id,
  ingredientId: `${id.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  name,
  location: "Kyl",
  amount: 1,
  unit: "st",
  ...overrides,
});
const mjolk = item("11111111-1111-4111-8111-111111111111", "Mjölk", { unit: "l" });
const smor = item("22222222-2222-4222-8222-222222222222", "Smör", { amount: 250, unit: "g" });
const salt = item("33333333-3333-4333-8333-333333333333", "Salt", { amount: null, unit: null });
const agg = item("44444444-4444-4444-8444-444444444444", "Ägg", { amount: 6 });
const everything = [mjolk, smor, salt, agg];

const rowOf = ({ id, ingredientId, location, amount, unit }: PantryItem): PantryRow => ({
  id,
  ingredientId,
  location,
  amount,
  unit,
});
const byName = (a: PantryItem, b: PantryItem) => a.name.localeCompare(b.name, "sv");

/** Changes the server's items for Kyl, as the page would after a revalidation. */
let serverUpdate: (update: (items: PantryItem[]) => PantryItem[]) => void = () => {};
const serverRemoves = (id: string) => act(() => serverUpdate((items) => items.filter((other) => other.id !== id)));
const serverAdds = (added: PantryItem) => act(() => serverUpdate((items) => [...items, added].sort(byName)));

function Hemma({ initial }: { initial: PantryItem[] }) {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    serverUpdate = (update) => setItems(update);
  }, []);
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location="Kyl">
          <AddPantryItemButton variant="icon" />
          <PantryPlace location="Kyl" counts={{ Kyl: items.length, Frys: 2, Skafferi: 0 }} items={items} />
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

const rowNames = () => screen.queryAllByTestId("pantry-row").map((row) => row.textContent);
const tagNames = () => screen.queryAllByTestId("pantry-tag").map((tag) => tag.textContent);
const kylCard = () => within(screen.getByRole("navigation", { name: "Platser" })).getAllByRole("link")[0];
const toast = () => screen.getByTestId("toast");
/** A tap on the swipe action (a pointer click has a detail). */
const tapRemove = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name: `Ta bort ${name}` }), { detail: 1 }));
const undo = () => act(async () => fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" })));

/** A promise resolved from the test, to see the list while an action waits. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  refresh.mockReset();
  // By default the server answers, and its items change right after the answer.
  removePantryItem.mockReset().mockImplementation(async (id) => {
    queueMicrotask(() => serverUpdate((items) => items.filter((other) => other.id !== id)));
    return ok(rowOf(everything.find((other) => other.id === id)!));
  });
  restorePantryItem.mockReset().mockImplementation(async (row) => {
    const restored = everything.find((other) => other.id === row.id)!;
    queueMicrotask(() => serverUpdate((items) => [...items, restored].sort(byName)));
    return ok(row);
  });
  savePantryItem.mockReset();
});

describe("applyPantryChanges", () => {
  it("leaves out removed items and puts restored ones of the location back in order", () => {
    expect(applyPantryChanges([mjolk, smor], "Kyl", [])).toEqual([mjolk, smor]);
    expect(applyPantryChanges([mjolk, smor], "Kyl", [{ kind: "remove", item: mjolk }])).toEqual([smor]);
    expect(applyPantryChanges([smor], "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolk, smor]);
    // Already back from the server, or of another location: nothing to add.
    expect(applyPantryChanges([mjolk, smor], "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolk, smor]);
    expect(applyPantryChanges([smor], "Frys", [{ kind: "restore", item: mjolk }])).toEqual([smor]);
  });

  it("does not restore over a row the location has now: the same unit, or either one unlimited", () => {
    const mjolkAgain = { ...mjolk, id: "55555555-5555-4555-8555-555555555555", amount: 3 };
    const mjolkUnlimited = { ...mjolkAgain, amount: null, unit: null };
    const mjolkInDl = { ...mjolkAgain, unit: "dl" as const };
    expect(applyPantryChanges([mjolkAgain], "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolkAgain]);
    expect(applyPantryChanges([mjolkUnlimited], "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolkUnlimited]);
    expect(applyPantryChanges([mjolk], "Kyl", [{ kind: "restore", item: mjolkUnlimited }])).toEqual([mjolk]);
    expect(applyPantryChanges([mjolkInDl], "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolkInDl, mjolk]);
  });
});

describe("removing an item on Hemma", () => {
  it("removes a row at once with its action, and confirms with Ångra", async () => {
    render(<Hemma initial={[mjolk, smor, salt]} />);
    const pending = deferred<Result<PantryRow | null>>();
    removePantryItem.mockImplementationOnce(() => pending.promise);

    await tapRemove("Mjölk");
    // Gone before the server answers, and the card counts what is shown.
    expect(rowNames()).toEqual(["Smör 250 g"]);
    expect(kylCard()).toHaveTextContent("Kyl 2 varor");
    expect(removePantryItem).toHaveBeenCalledWith(mjolk.id);

    await act(async () => pending.resolve(ok(rowOf(mjolk))));
    expect(toast()).toHaveTextContent("Mjölk är borttagen.");
    expect(within(toast()).getByRole("button", { name: "Ångra" })).toBeInTheDocument();
  });

  it("keeps a removed row hidden until the server's items no longer have it", async () => {
    removePantryItem.mockImplementation(async (id) => ok(rowOf(everything.find((other) => other.id === id)!)));
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    // Answered, but the page is not read again yet: no flash of the old row.
    expect(rowNames()).toEqual(["Smör 250 g"]);
    serverRemoves(mjolk.id);
    expect(rowNames()).toEqual(["Smör 250 g"]);
    // The change is done with: when the server has the item again, it shows.
    serverAdds(mjolk);
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]);
  });

  it("puts the row back with the same id on Ångra, and keeps it until the server has it", async () => {
    restorePantryItem.mockImplementation(async (row) => ok(row));
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    await undo();
    expect(restorePantryItem).toHaveBeenCalledWith(rowOf(mjolk));
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]);
    expect(kylCard()).toHaveTextContent("Kyl 2 varor");
    expect(screen.queryByTestId("toast")).toBeNull();

    // Answered, but not read again yet: still there; then the server has it.
    serverAdds(mjolk);
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]);
  });

  it("collects items removed while the confirmation shows, and Ångra puts them all back", async () => {
    render(<Hemma initial={everything} />);
    await tapRemove("Mjölk");
    expect(toast()).toHaveTextContent("Mjölk är borttagen.");
    await tapRemove("Smör");
    expect(toast()).toHaveTextContent("Mjölk och Smör är borttagna.");
    await tapRemove("Ägg");
    expect(toast()).toHaveTextContent("3 varor är borttagna.");
    expect(rowNames()).toEqual([]);

    await undo();
    expect(restorePantryItem.mock.calls.map(([row]) => row.id)).toEqual([mjolk.id, smor.id, agg.id]);
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g", "Ägg 6 st"]);
  });

  it("reports a failed Ångra as an alert, and keeps the ones that worked", async () => {
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    await tapRemove("Smör");
    restorePantryItem.mockImplementationOnce(async () => fail("pantry_restore_failed"));
    await undo();
    expect(rowNames()).toEqual(["Smör 250 g"]);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(toast()).toHaveTextContent("Det gick inte att ångra.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("brings the row back with an alert when the removal fails", async () => {
    removePantryItem.mockResolvedValueOnce(fail("pantry_remove_failed"));
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ta bort varan.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads the page again when an action gets no answer", async () => {
    removePantryItem.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ta bort varan.");
    expect(refresh).toHaveBeenCalledTimes(1);

    await tapRemove("Smör");
    restorePantryItem.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await undo();
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("confirms without Ångra when the removed row cannot be put back", async () => {
    removePantryItem.mockResolvedValueOnce(ok(null));
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    expect(rowNames()).toEqual(["Smör 250 g"]);
    expect(toast()).toHaveTextContent("Mjölk är borttagen.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
  });

});

describe("Ta bort in the sheet", () => {
  it("removes an unlimited item, closes without asking, and moves focus to the next item", async () => {
    render(<Hemma initial={[mjolk, salt, agg]} />);
    fireEvent.click(screen.getByRole("button", { name: "Salt" }));
    const sheet = screen.getByRole("dialog", { name: "Lagervara" });
    // Even with a change that is not saved.
    fireEvent.change(within(sheet).getByLabelText("Mängd"), { target: { value: "2" } });
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort" })));

    expect(screen.queryByRole("dialog", { name: "Lagervara" })).toBeNull();
    expect(screen.queryByText("Släng ändringarna?")).toBeNull();
    expect(removePantryItem).toHaveBeenCalledWith(salt.id);
    expect(tagNames()).toEqual([]);
    expect(toast()).toHaveTextContent("Salt är borttagen.");
    // Salt was the last item; the one before it takes focus.
    expect(screen.getByRole("button", { name: "Ägg 6 st" })).toHaveFocus();
  });

  it("offers Ta bort only for an item in the pantry", () => {
    render(<Hemma initial={[mjolk]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mjölk 1 l" }));
    expect(within(screen.getByRole("dialog", { name: "Lagervara" })).getByRole("button", { name: "Ta bort" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));

    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    expect(within(screen.getByRole("dialog", { name: "Lagervara" })).queryByRole("button", { name: "Ta bort" })).toBeNull();
  });

  it("removes the row a save moved, not the one the sheet opened with", async () => {
    const moved = { ...mjolk, id: "66666666-6666-4666-8666-666666666666", location: "Kyl" as const, amount: 2 };
    savePantryItem.mockImplementation(async () => {
      serverUpdate((items) => [moved, ...items.filter((other) => other.id !== mjolk.id)]);
      return ok({ id: moved.id });
    });
    removePantryItem.mockImplementation(async (id) => ok(rowOf(id === moved.id ? moved : mjolk)));
    render(<Hemma initial={[mjolk, smor]} />);

    fireEvent.click(screen.getByRole("button", { name: "Mjölk 1 l" }));
    fireEvent.change(screen.getByLabelText("Mängd"), { target: { value: "2" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Spara ändringar" })));
    // Saving closes the sheet; it opens again from the list as it is now.
    expect(screen.queryByRole("dialog", { name: "Lagervara" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mjölk 2 l" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort" })));
    expect(removePantryItem).toHaveBeenCalledWith(moved.id);
  });
});

describe("focus after a removal", () => {
  it("goes to the next row after a removal with the keyboard, else the one before, else Lägg till vara", async () => {
    render(<Hemma initial={[mjolk, smor]} />);
    const keyboardRemove = (name: string) =>
      act(async () => {
        const action = screen.getByRole("button", { name: `Ta bort ${name}` });
        action.focus();
        fireEvent.click(action, { detail: 0 });
      });

    await keyboardRemove("Mjölk");
    expect(screen.getByRole("button", { name: "Smör 250 g" })).toHaveFocus();
    await keyboardRemove("Smör");
    expect(screen.getByText("Inget i kylen än.")).toBeInTheDocument();
    const add = screen.getAllByRole("button", { name: "Lägg till vara" }).find((button) => button.textContent === "Lägg till vara");
    expect(add).toHaveFocus();
  });

  it("stays put after a tap on the swipe action", async () => {
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    expect(screen.getByRole("button", { name: "Smör 250 g" })).not.toHaveFocus();
  });
});
