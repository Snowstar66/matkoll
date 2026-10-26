import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import type { PantryItem } from "../domain/pantry-item";
import type { PantryItemFormInput, PantryRow } from "../domain/pantry-item-form";
import { AddPantryItemButton, PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { PantryPlace } from "./pantry-place";
import { applyPantryChanges } from "./pantry-removal";
import { SiteSwitchProvider, useLiveUndo } from "./site-switching";

// Removing items on Hemma with "Ångra" (Story 2.3). The actions are stubbed;
// `serverUpdate` changes the server's items, as a revalidation would.

const removePantryItem = vi.fn<(id: string) => Promise<Result<PantryRow | null>>>();
const restorePantryItem = vi.fn<(row: PantryRow) => Promise<Result<PantryRow>>>();
const savePantryItem = vi.fn<(form: PantryItemFormInput) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: (id: string) => removePantryItem(id) }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: (row: PantryRow) => restorePantryItem(row) }));
type Emptied = { removed: number; removedIds: string[] };
type Restored = { restoredIds: string[]; rows: PantryRow[]; skipped: number };
const emptyPantryPlace = vi.fn<(location: Location, operationId: string) => Promise<Result<Emptied>>>();
const restorePantryRemoval = vi.fn<(operationId: string) => Promise<Result<Restored>>>();
vi.mock("../actions/empty-pantry-place", () => ({
  emptyPantryPlace: (location: Location, operationId: string) => emptyPantryPlace(location, operationId),
}));
vi.mock("../actions/restore-pantry-removal", () => ({
  restorePantryRemoval: (operationId: string) => restorePantryRemoval(operationId),
}));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: (form: PantryItemFormInput) => savePantryItem(form) }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/** The places (Story 8.2): Hemma, shown unless a test switches, and Stugan. */
const hemmaSite = { id: "99999999-9999-4999-8999-999999999999", name: "Hemma", siteCount: 2 };
const stuganSite = { id: "77777777-7777-4777-8777-777777777777", name: "Stugan", siteCount: 2 };

const item = (id: string, name: string, overrides: Partial<PantryItem> = {}): PantryItem => ({
  id,
  siteId: hemmaSite.id,
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

const rowOf = ({ id, siteId, ingredientId, location, amount, unit }: PantryItem): PantryRow => ({
  id,
  siteId,
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

/** Switches the place the page shows, with its items, as the page would after a selection. */
let serverSwitch: (site: typeof hemmaSite, items: PantryItem[]) => void = () => {};

/** The server's items for Kyl as last rendered. */
let serverItems: readonly PantryItem[] = [];

function Hemma({ initial, initialSite = hemmaSite }: { initial: PantryItem[]; initialSite?: typeof hemmaSite }) {
  const [items, setItems] = useState(initial);
  const [site, setSite] = useState(initialSite);
  useEffect(() => {
    serverUpdate = (update) => setItems(update);
    serverSwitch = (next, nextItems) => {
      setSite(next);
      setItems(nextItems);
    };
  }, []);
  useEffect(() => {
    serverItems = items;
  }, [items]);
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location="Kyl" site={site}>
          <AddPantryItemButton variant="icon" />
          <PantryPlace site={site} location="Kyl" counts={{ Kyl: items.length, Frys: 2, Skafferi: 0 }} items={items} />
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
  // By default the server empties Kyl, keeps the rows by operation id, and its items change right after the answer.
  removals.clear();
  emptyPantryPlace.mockReset().mockImplementation(async (_location, operationId) => {
    const rows = removals.get(operationId) ?? serverItems.map(rowOf);
    removals.set(operationId, rows);
    queueMicrotask(() => serverUpdate(() => []));
    return ok({ removed: rows.length, removedIds: rows.map((row) => row.id) });
  });
  restorePantryRemoval.mockReset().mockImplementation(async (operationId) => {
    const rows = removals.get(operationId) ?? [];
    removals.delete(operationId);
    queueMicrotask(() =>
      serverUpdate((items) => [...items, ...rows.map((row) => everything.find((other) => other.id === row.id)!)].sort(byName)),
    );
    return ok({ restoredIds: rows.map((row) => row.id), rows, skipped: 0 });
  });
});

/** The rows the fake server keeps per operation id. */
const removals = new Map<string, PantryRow[]>();

describe("applyPantryChanges", () => {
  it("leaves out removed items and puts restored ones of the location back in order", () => {
    expect(applyPantryChanges([mjolk, smor], hemmaSite.id, "Kyl", [])).toEqual([mjolk, smor]);
    expect(applyPantryChanges([mjolk, smor], hemmaSite.id, "Kyl", [{ kind: "remove", item: mjolk }])).toEqual([smor]);
    expect(applyPantryChanges([smor], hemmaSite.id, "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolk, smor]);
    // Already back from the server, or of another location: nothing to add.
    expect(applyPantryChanges([mjolk, smor], hemmaSite.id, "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolk, smor]);
    expect(applyPantryChanges([smor], hemmaSite.id, "Frys", [{ kind: "restore", item: mjolk }])).toEqual([smor]);
  });

  it("does not restore over a row the location has now: the same unit, or either one unlimited", () => {
    const mjolkAgain = { ...mjolk, id: "55555555-5555-4555-8555-555555555555", amount: 3 };
    const mjolkUnlimited = { ...mjolkAgain, amount: null, unit: null };
    const mjolkInDl = { ...mjolkAgain, unit: "dl" as const };
    expect(applyPantryChanges([mjolkAgain], hemmaSite.id, "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolkAgain]);
    expect(applyPantryChanges([mjolkUnlimited], hemmaSite.id, "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolkUnlimited]);
    expect(applyPantryChanges([mjolk], hemmaSite.id, "Kyl", [{ kind: "restore", item: mjolkUnlimited }])).toEqual([mjolk]);
    expect(applyPantryChanges([mjolkInDl], hemmaSite.id, "Kyl", [{ kind: "restore", item: mjolk }])).toEqual([mjolkInDl, mjolk]);
  });

  it("shows a restored row only on its own place, and hides a removed one by id on any place", () => {
    const stuganMjolk = { ...mjolk, siteId: stuganSite.id };
    expect(applyPantryChanges([smor], hemmaSite.id, "Kyl", [{ kind: "restore", item: stuganMjolk }])).toEqual([smor]);
    expect(applyPantryChanges([], stuganSite.id, "Kyl", [{ kind: "restore", item: stuganMjolk }])).toEqual([stuganMjolk]);
    expect(applyPantryChanges([stuganMjolk], stuganSite.id, "Kyl", [{ kind: "remove", item: stuganMjolk }])).toEqual([]);
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

describe("removing on one place and Ångra after another is selected (Story 8.2)", () => {
  it("puts the row back on its own place, and the list of the place shown now never shows it", async () => {
    const stuganMjolk = { ...mjolk, siteId: stuganSite.id };
    const hemmaSmor = { ...smor };
    removePantryItem.mockImplementation(async () => ok(rowOf(stuganMjolk)));
    restorePantryItem.mockImplementation(async (row) => ok(row));
    render(<Hemma initial={[stuganMjolk]} initialSite={stuganSite} />);

    await tapRemove("Mjölk");
    expect(rowNames()).toEqual([]);
    // Hemma is selected now; its list is what the server gives for Hemma.
    act(() => serverSwitch(hemmaSite, [hemmaSmor]));
    expect(rowNames()).toEqual(["Smör 250 g"]);

    await undo();
    await waitFor(() => expect(restorePantryItem).toHaveBeenCalledWith(expect.objectContaining({ siteId: stuganSite.id })));
    expect(rowNames()).toEqual(["Smör 250 g"]);
    expect(kylCard()).toHaveTextContent("Kyl 1 vara");
  });

  it("says so as an alert when the row's place is gone", async () => {
    restorePantryItem.mockResolvedValue(fail("pantry_site_gone"));
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    await undo();
    await waitFor(() => expect(toast()).toHaveTextContent("Stället finns inte längre. Välj ett annat ställe."));
    expect(rowNames()).toEqual(["Smör 250 g"]);
  });
});

describe("the places a live Ångra needs (Story 8.2)", () => {
  function Probe() {
    const { liveUndoSites } = useLiveUndo();
    return <p data-testid="live-undo">{[...liveUndoSites].join(",")}</p>;
  }

  it("marks the row's place while its confirmation shows, and releases it once Ångra has answered", async () => {
    render(
      <SiteSwitchProvider>
        <Hemma initial={[mjolk, smor]} />
        <Probe />
      </SiteSwitchProvider>,
    );
    expect(screen.getByTestId("live-undo")).toHaveTextContent("");
    await tapRemove("Mjölk");
    await waitFor(() => expect(screen.getByTestId("live-undo")).toHaveTextContent(hemmaSite.id));
    await undo();
    await waitFor(() => expect(screen.getByTestId("live-undo")).toHaveTextContent(""));
  });

  it("marks the place of an emptied location too", async () => {
    render(
      <SiteSwitchProvider>
        <Hemma initial={[mjolk, smor]} />
        <Probe />
      </SiteSwitchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Töm kylen" }));
    await act(async () =>
      fireEvent.click(within(screen.getByRole("dialog", { name: "Töm kylen" })).getByRole("button", { name: "Töm kylen" })),
    );
    await waitFor(() => expect(screen.getByTestId("live-undo")).toHaveTextContent(hemmaSite.id));
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
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lagervara" })).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "Mjölk 2 l" }));
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

describe("emptying a location", () => {
  /** "Töm kylen" under the list, then the sheet's "Töm kylen". */
  const emptyKyl = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Töm kylen" }));
    const sheet = screen.getByRole("dialog", { name: "Töm kylen" });
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Töm kylen" })));
  };
  const operationOf = (call = 0) => emptyPantryPlace.mock.calls[call][1];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("empties the list at once after the answer, before the server's list has caught up", async () => {
    emptyPantryPlace.mockResolvedValueOnce(ok({ removed: 4, removedIds: everything.map((one) => one.id) }));
    render(<Hemma initial={everything} />);
    await emptyKyl();
    expect(emptyPantryPlace).toHaveBeenCalledTimes(1);
    expect(emptyPantryPlace).toHaveBeenCalledWith("Kyl", expect.stringMatching(uuid));
    expect(removePantryItem).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([]);
    expect(tagNames()).toEqual([]);
    expect(screen.getByText("Inget i kylen än.")).toBeInTheDocument();
    expect(kylCard()).toHaveTextContent("Kyl 0 varor");
    expect(toast()).toHaveTextContent("Tog bort 4 varor ur kylen.");
    expect(within(toast()).getByRole("button", { name: "Ångra" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Töm kylen" })).toBeNull();
  });

  it("puts every row back with one call by operation id on Ångra", async () => {
    render(<Hemma initial={[mjolk, smor, salt]} />);
    await emptyKyl();
    await waitFor(() => expect(serverItems).toEqual([]));
    await undo();
    expect(restorePantryRemoval).toHaveBeenCalledTimes(1);
    expect(restorePantryRemoval).toHaveBeenCalledWith(operationOf());
    expect(restorePantryItem).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]);
    expect(tagNames()).toEqual(["Salt"]);
    expect(kylCard()).toHaveTextContent("Kyl 3 varor");
    expect(await screen.findByRole("button", { name: "Töm kylen" })).toBeInTheDocument();
  });

  it("counts the actual rows removed, and Ångra shows also the rows the list did not show", async () => {
    render(<Hemma initial={[mjolk]} />);
    // Another tab added Ägg; the server removes it too.
    emptyPantryPlace.mockImplementationOnce(async (_location, operationId) => {
      removals.set(operationId, [rowOf(mjolk), rowOf(agg)]);
      queueMicrotask(() => serverUpdate(() => []));
      return ok({ removed: 2, removedIds: [mjolk.id, agg.id] });
    });
    await emptyKyl();
    expect(toast()).toHaveTextContent("Tog bort 2 varor ur kylen.");
    await waitFor(() => expect(serverItems).toEqual([]));
    await undo();
    // Ägg's removal goes with Ångra, so the server's list shows it.
    await waitFor(() => expect(rowNames()).toEqual(["Mjölk 1 l", "Ägg 6 st"]));
  });

  it("keeps the others and tells how many could not be put back when Ångra skips rows", async () => {
    const mjolkAgain = { ...mjolk, id: "55555555-5555-4555-8555-555555555555", amount: 3 };
    render(<Hemma initial={[mjolk, smor]} />);
    await emptyKyl();
    await waitFor(() => expect(serverItems).toEqual([]));
    // Pontus adds mjölk again before Ångra.
    serverAdds(mjolkAgain);
    restorePantryRemoval.mockImplementationOnce(async () => {
      queueMicrotask(() => serverUpdate((items) => [...items, smor].sort(byName)));
      return ok({ restoredIds: [smor.id], rows: [rowOf(smor)], skipped: 1 });
    });
    await undo();
    await waitFor(() => expect(rowNames()).toEqual(["Mjölk 3 l", "Smör 250 g"]));
    expect(screen.getByRole("alert")).toHaveTextContent("1 vara gick inte att ångra.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("takes a skipped row the list would show away again once the answer comes", async () => {
    restorePantryRemoval.mockImplementationOnce(async () => ok({ restoredIds: [smor.id], rows: [rowOf(smor)], skipped: 1 }));
    render(<Hemma initial={[mjolk, smor]} />);
    await emptyKyl();
    await waitFor(() => expect(serverItems).toEqual([]));
    await undo();
    expect(rowNames()).toEqual(["Smör 250 g"]);
    expect(toast()).toHaveTextContent("1 vara gick inte att ångra.");
  });

  it("leaves the items removed and says so as an alert when Ångra fails", async () => {
    restorePantryRemoval.mockResolvedValueOnce(fail("pantry_restore_failed"));
    render(<Hemma initial={[mjolk, smor]} />);
    await emptyKyl();
    await waitFor(() => expect(serverItems).toEqual([]));
    await undo();
    expect(rowNames()).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads the page again when Ångra gets no answer", async () => {
    restorePantryRemoval.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Hemma initial={[mjolk, smor]} />);
    await emptyKyl();
    await waitFor(() => expect(serverItems).toEqual([]));
    await undo();
    expect(rowNames()).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says the location is empty already, without Ångra, when there was nothing to remove", async () => {
    emptyPantryPlace.mockImplementationOnce(async () => {
      queueMicrotask(() => serverUpdate(() => []));
      return ok({ removed: 0, removedIds: [] });
    });
    render(<Hemma initial={[mjolk]} />);
    await emptyKyl();
    expect(toast()).toHaveTextContent("Kylen är redan tom.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull();
  });

  it("offers Ångra by operation id when the answer is lost but the location is empty when read again", async () => {
    // The server emptied Kyl, but the answer never came.
    emptyPantryPlace.mockImplementationOnce(async (_location, operationId) => {
      removals.set(operationId, serverItems.map(rowOf));
      throw new TypeError("Failed to fetch");
    });
    render(<Hemma initial={[mjolk, smor]} />);
    await emptyKyl();
    const sheet = screen.getByRole("dialog", { name: "Töm kylen" });
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Det gick inte att ta bort varorna. Försök igen.");
    expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]);
    expect(refresh).toHaveBeenCalledTimes(1);

    // The page as read again: Kyl is empty, so the sheet closes and Ångra is offered.
    act(() => serverUpdate(() => []));
    await waitFor(() => expect(toast()).toHaveTextContent("Kylen kan ha tömts."));
    expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull();
    await undo();
    expect(restorePantryRemoval).toHaveBeenCalledWith(operationOf());
    await waitFor(() => expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g"]));
  });

  it("offers nothing when the answer is lost and the location still has its items, and tries again with the same operation id", async () => {
    emptyPantryPlace.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Hemma initial={[mjolk, smor]} />);
    await emptyKyl();
    // The page as read again: nothing was removed.
    act(() => serverUpdate((items) => [...items]));
    expect(screen.queryByText("Kylen kan ha tömts.")).toBeNull();
    expect(screen.queryByTestId("toast")).toBeNull();

    const sheet = screen.getByRole("dialog", { name: "Töm kylen" });
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Töm kylen" })));
    expect(emptyPantryPlace).toHaveBeenCalledTimes(2);
    expect(operationOf(1)).toBe(operationOf(0));
    expect(toast()).toHaveTextContent("Tog bort 2 varor ur kylen.");
  });

  it("reads the page again for an expired session", async () => {
    emptyPantryPlace.mockResolvedValueOnce(fail("unauthorized"));
    render(<Hemma initial={[mjolk]} />);
    await emptyKyl();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(rowNames()).toEqual(["Mjölk 1 l"]);
  });

  it("joins a removal still showing its Ångra, and Ångra puts back both", async () => {
    render(<Hemma initial={[mjolk, smor, agg]} />);
    await tapRemove("Mjölk");
    expect(toast()).toHaveTextContent("Mjölk är borttagen.");
    await waitFor(() => expect(serverItems.map((one) => one.id)).toEqual([smor.id, agg.id]));
    await emptyKyl();
    expect(toast()).toHaveTextContent("Tog bort 3 varor ur kylen.");
    await waitFor(() => expect(serverItems).toEqual([]));
    await undo();
    expect(restorePantryItem).toHaveBeenCalledWith(rowOf(mjolk));
    expect(restorePantryRemoval).toHaveBeenCalledWith(operationOf());
    await waitFor(() => expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g", "Ägg 6 st"]));
  });

  it("keeps the emptying's Ångra when a single item is removed while it shows", async () => {
    render(<Hemma initial={[mjolk, smor]} />);
    await emptyKyl();
    await waitFor(() => expect(serverItems).toEqual([]));
    // Another tab added Ägg meanwhile, and Pontus removes it too.
    serverAdds(agg);
    await tapRemove("Ägg");
    expect(toast()).toHaveTextContent("Tog bort 3 varor ur kylen.");
    await waitFor(() => expect(serverItems).toEqual([]));
    await undo();
    expect(restorePantryRemoval).toHaveBeenCalledWith(operationOf());
    expect(restorePantryItem).toHaveBeenCalledWith(rowOf(agg));
    await waitFor(() => expect(rowNames()).toEqual(["Mjölk 1 l", "Smör 250 g", "Ägg 6 st"]));
  });

  it("makes Töm kylen unavailable while a removal in the location is on its way", async () => {
    const pending = deferred<Result<PantryRow | null>>();
    removePantryItem.mockImplementationOnce(() => pending.promise);
    render(<Hemma initial={[mjolk, smor]} />);
    await tapRemove("Mjölk");
    expect(screen.getByRole("button", { name: "Töm kylen" })).toBeDisabled();
    await act(async () => pending.resolve(ok(rowOf(mjolk))));
    expect(screen.getByRole("button", { name: "Töm kylen" })).toBeEnabled();
  });
});
