import { fireEvent, render as renderBare, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteGraceMs, startDeleteGrace } from "@/components/confirm-delete";
import { ToastProvider } from "@/components/toast";
import { ok, type Result } from "@/lib/errors";
import type { ShoppingLine } from "../domain/compute-list";
import type { CustomItemRow } from "../domain/custom-item";
import { ShoppingList, type ShoppingListProps } from "./shopping-list";

// Inköpslistan asks before the first removal and then removes at once for 60 s.

const removeCustomItem = vi.fn<(id: string) => Promise<Result<CustomItemRow | null>>>();
vi.mock("../actions/remove-custom-item", () => ({ removeCustomItem: (id: string) => removeCustomItem(id) }));
vi.mock("../actions/restore-custom-item", () => ({ restoreCustomItem: async (row: CustomItemRow) => ok(row) }));
vi.mock("../actions/set-checked", () => ({ setChecked: async (change: unknown) => ok(change) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const render = (ui: ReactNode) => renderBare(<ToastProvider>{ui}</ToastProvider>);

const planId = "33333333-3333-4333-8333-333333333333";
const plan: NonNullable<ShoppingListProps["plan"]> = { id: planId, name: "Vecka 44", dishCount: 0, skippedCount: 0, dishTitles: {} };
const own = (id: string, label: string): ShoppingLine => ({
  key: `c:${id}`,
  label,
  amount: null,
  unit: null,
  isVague: false,
  coverage: { kind: "unlinked" },
  section: "Övrigt",
  origins: [],
  checked: false,
  isCustom: true,
});
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "44444444-4444-4444-8444-444444444444"];
const lines = [own(ids[0], "diskmedel"), own(ids[1], "Kaffe"), own(ids[2], "svamp")];
const row = (id: string, label: string): CustomItemRow => ({ id, planId, label, ingredientId: null, amount: null, unit: null });

// A keyboard press (`detail` 0) is never held back by the bin's double-tap guard.
const bin = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Ta bort ${name}` }));
const question = (name: string) => screen.queryByRole("dialog", { name: `Ta bort ${name} från inköpslistan?` });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  removeCustomItem.mockReset().mockImplementation(async (id) => ok(row(id, "x")));
  window.localStorage.setItem("matkoll:basket-open", "0");
});
afterEach(() => vi.useRealTimers());

describe("Inköpslistan asks before the first removal", () => {
  it("asks 'Ta bort X från inköpslistan?' without the cannot-undo line, and removes nothing before Ta bort", () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    bin("diskmedel");
    const dialog = question("diskmedel");
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("Det går inte att ångra.");
    expect(removeCustomItem).not.toHaveBeenCalled();
  });

  it("Avbryt keeps the line and starts no window: the next bin asks again", () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    bin("diskmedel");
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(removeCustomItem).not.toHaveBeenCalled();
    bin("Kaffe");
    expect(question("Kaffe")).toBeInTheDocument();
  });

  it("Ta bort removes with Ångra, then every removal within 60 s goes at once and restarts the window", async () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    bin("diskmedel");
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    await waitFor(() => expect(removeCustomItem).toHaveBeenCalledWith(ids[0]));
    expect((await screen.findAllByText(/^Tog bort /)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ångra" })).toBeInTheDocument();

    vi.setSystemTime(Date.now() + deleteGraceMs - 1000);
    bin("Kaffe");
    expect(question("Kaffe")).not.toBeInTheDocument();
    await waitFor(() => expect(removeCustomItem).toHaveBeenCalledWith(ids[1]));

    // The window started again with that removal: 59 s later is still inside it.
    vi.setSystemTime(Date.now() + deleteGraceMs - 1000);
    bin("svamp");
    expect(question("svamp")).not.toBeInTheDocument();
    await waitFor(() => expect(removeCustomItem).toHaveBeenCalledWith(ids[2]));
  });

  it("asks again once 60 s have passed without a removal", () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    startDeleteGrace("shopping-list");
    vi.setSystemTime(Date.now() + deleteGraceMs + 1000);
    bin("Kaffe");
    expect(question("Kaffe")).toBeInTheDocument();
  });

  it("is not opened by a removal elsewhere: another window key does not skip the list's question", () => {
    startDeleteGrace("pantry");
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    bin("diskmedel");
    expect(question("diskmedel")).toBeInTheDocument();
  });
});
