import { act, render as renderBare, type RenderOptions, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { MoveUnpackedItemInput } from "../actions/move-unpacked-item";
import type { PutInPantryInput, PutInPantryResult } from "../actions/put-checked-in-pantry";
import type { CheckChange } from "../domain/check";
import type { ShoppingLine } from "../domain/compute-list";
import { ShoppingList, type ShoppingListProps } from "./shopping-list";

// "Lägg till i Matvaror" in Inköpslista (Story 3.7): the primary button shows while
// a line is checked off, puts the checked lines in the pantry with one tap,
// is off while that runs, confirms with a short confirmation, and shows a
// blue notice on failure.

const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: ToastProvider, ...options });

const setChecked = vi.fn<(change: CheckChange) => Promise<Result<CheckChange>>>();
vi.mock("../actions/set-checked", () => ({ setChecked: (change: CheckChange) => setChecked(change) }));
const putCheckedInPantry = vi.fn<(input: PutInPantryInput) => Promise<Result<PutInPantryResult>>>();
vi.mock("../actions/put-checked-in-pantry", () => ({
  putCheckedInPantry: (input: PutInPantryInput) => putCheckedInPantry(input),
}));
const moveUnpackedItem = vi.fn<(input: MoveUnpackedItemInput) => Promise<Result<null>>>();
vi.mock("../actions/move-unpacked-item", () => ({
  moveUnpackedItem: (input: MoveUnpackedItemInput) => moveUnpackedItem(input),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const line = (overrides: Partial<ShoppingLine> & Pick<ShoppingLine, "key" | "label">): ShoppingLine => ({
  amount: null,
  unit: null,
  isVague: false,
  coverage: { kind: "missing" },
  section: "Övrigt",
  origins: ["d1"],
  checked: false,
  isCustom: false,
  ...overrides,
});

const plan: NonNullable<ShoppingListProps["plan"]> = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Vecka 44",
  dishCount: 1,
  skippedCount: 0,
  dishTitles: { d1: "Krämig kycklinggryta" },
};
const lines = [
  line({ key: "r:gradde:dl", ingredientId: "gradde", label: "Grädde", section: "Mejeri", amount: 3, unit: "dl" }),
  line({ key: "r:paprika:st", ingredientId: "paprika", label: "Paprika", section: "Frukt och grönt", amount: 2, unit: "st" }),
];
const textLine = line({ key: "t:en näve persilja", label: "En näve persilja", coverage: { kind: "unlinked" } });

/** The list as the server gives it: a saved check shows, and "Lägg till i Matvaror" takes the checked lines off. */
const server: { save: (change: CheckChange) => void; put: () => void } = { save: () => {}, put: () => {} };
function ServerList({ initial }: { initial: ShoppingLine[] }) {
  const [shown, setShown] = useState(initial);
  useEffect(() => {
    server.save = ({ key, checked }) =>
      setShown((before) => before.map((item) => (item.key === key ? { ...item, checked } : item)));
    server.put = () => setShown((before) => before.filter((item) => !item.checked));
  }, []);
  return <ShoppingList plan={plan} lines={shown} pantryUnavailable={false} />;
}

const button = () => screen.queryByRole("button", { name: "Lägg till i Matvaror" });

beforeEach(() => {
  // These tests start from I korgen folded; Story 3.9 opens it by default.
  window.localStorage.setItem("matkoll:basket-open", "0");
  setChecked.mockReset().mockImplementation(async (change) => {
    server.save(change);
    return ok(change);
  });
  putCheckedInPantry.mockReset().mockImplementation(async () => {
    server.put();
    return ok({ added: 1, removed: 0, skipped: 0, siteName: null });
  });
  refresh.mockReset();
  moveUnpackedItem.mockReset().mockResolvedValue(ok(null));
});

describe("Lägg till i Matvaror", () => {
  it("shows the button only while a line is checked off, from the tap on", async () => {
    const user = userEvent.setup();
    render(<ServerList initial={lines} />);
    expect(button()).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    expect(button()).toBeInTheDocument();
    // The checked line is in I korgen (Story 11.4); a check there takes it back.
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    expect(button()).not.toBeInTheDocument();
  });

  it("shows the button from the tap on, off until the check is saved", async () => {
    const user = userEvent.setup();
    setChecked.mockImplementation(() => new Promise(() => {}));
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    expect(screen.getByRole("checkbox", { name: "Grädde, 3 dl" })).toBeChecked();
    expect(button()).toBeInTheDocument();
    expect(button()).toBeDisabled();
    await user.click(button()!);
    expect(putCheckedInPantry).not.toHaveBeenCalled();
  });

  it("does not show the button for a checked text line, which cannot go to the pantry", () => {
    render(<ShoppingList plan={plan} lines={[{ ...textLine, checked: true }]} pantryUnavailable={false} />);
    expect(button()).not.toBeInTheDocument();
  });

  it("shows the button for checks an interrupted run left behind, without a checked line", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} pendingClear={1} />);
    await user.click(button()!);
    expect(putCheckedInPantry).toHaveBeenCalledWith({ planId: plan.id, siteId: null });
  });

  it("sends the place the list is counted against, so the items go there", async () => {
    const user = userEvent.setup();
    const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };
    putCheckedInPantry.mockResolvedValue(ok({ added: 1, removed: 0, skipped: 0, siteName: "Stugan" }));
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} site={stugan} />);
    await user.click(button()!);
    expect(putCheckedInPantry).toHaveBeenCalledWith({ planId: plan.id, siteId: stugan.id });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Lagt 1 vara i Matvaror för Stugan.");
  });

  it("keeps the checks when the place is gone, and reads the list again", async () => {
    const user = userEvent.setup();
    putCheckedInPantry.mockResolvedValue(fail("pantry_site_gone", { site: "Hemma" }));
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} />);
    await user.click(button()!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Boendet finns inte längre. Listan har räknats om mot Hemma. Tryck Lägg till i Matvaror igen.",
    );
    expect(screen.getByText("I korgen (1)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    expect(screen.getByRole("checkbox", { name: "Grädde, 3 dl" })).toBeChecked();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says what could not go to the pantry beside the confirmation", async () => {
    const user = userEvent.setup();
    putCheckedInPantry.mockResolvedValue(ok({ added: 1, removed: 0, skipped: 1, siteName: null }));
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} />);
    await user.click(button()!);
    expect(await screen.findByTestId("toast")).toHaveTextContent("Lagt 1 vara i Matvaror.");
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att lägga allt i Matvaror.");
  });

  it("does not show the button when the checks could not be read", () => {
    render(
      <ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} checksUnavailable />,
    );
    expect(button()).not.toBeInTheDocument();
  });

  it("puts the checked lines in the pantry for the plan, and confirms", async () => {
    const user = userEvent.setup();
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    // "Lägg till i Matvaror" is off until the check's save has settled.
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button()!);
    expect(putCheckedInPantry).toHaveBeenCalledWith({ planId: plan.id, siteId: null });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Lagt 1 vara i Matvaror.");
    expect(screen.queryByText("Grädde")).not.toBeInTheDocument();
    expect(button()).not.toBeInTheDocument();
    // The confirmation says it: the lines going is not announced as a recount.
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("");
  });

  it.each([
    [{ added: 8, removed: 1, skipped: 0, siteName: null }, "Lagt 8 varor i Matvaror."],
    [{ added: 8, removed: 0, skipped: 0, siteName: "Stugan" }, "Lagt 8 varor i Matvaror för Stugan."],
    [{ added: 0, removed: 1, skipped: 0, siteName: null }, "Tog bort 1 vara från listan."],
    [{ added: 0, removed: 2, skipped: 0, siteName: null }, "Tog bort 2 varor från listan."],
  ])("confirms %j with %s", async (answer, text) => {
    const user = userEvent.setup();
    putCheckedInPantry.mockResolvedValue(ok(answer));
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} />);
    await user.click(button()!);
    expect(await screen.findByTestId("toast")).toHaveTextContent(text);
  });

  it("is off while the flow runs, so a second tap does nothing", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<PutInPantryResult>) => void = () => {};
    putCheckedInPantry.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} />);
    await user.click(button()!);
    expect(button()).toBeDisabled();
    await user.click(button()!);
    expect(putCheckedInPantry).toHaveBeenCalledTimes(1);
    await act(async () => answer(ok({ added: 1, removed: 0, skipped: 0, siteName: null })));
    expect(button()).toBeEnabled();
  });

  it.each([
    [fail("pantry_add_failed"), "Det gick inte att lägga varorna i Matvaror. Försök igen.", false],
    [fail("shopping_put_in_pantry_failed"), "Det gick inte att lägga allt i Matvaror. Försök igen.", false],
    [fail("shopping_plan_changed"), "Matsedeln har bytts. Listan är uppdaterad.", true],
    [fail("shopping_put_in_pantry_plan_changed"), "Varorna är lagda i Matvaror, men matsedeln har bytts.", true],
    [fail("pantry_site_gone"), "Boendet finns inte längre. Listan har räknats om. Tryck Lägg till i Matvaror igen.", true],
    [
      fail("pantry_site_gone", { site: "Hemma" }),
      "Boendet finns inte längre. Listan har räknats om mot Hemma. Tryck Lägg till i Matvaror igen.",
      true,
    ],
  ])("shows a blue notice for %j", async (result, text, reads) => {
    const user = userEvent.setup();
    putCheckedInPantry.mockResolvedValue(result);
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} />);
    await user.click(button()!);
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(refresh).toHaveBeenCalledTimes(reads ? 1 : 0);
    expect(button()).toBeEnabled();
  });

  it("reads the list again after a failure without an answer, and takes the notice away after a success", async () => {
    const user = userEvent.setup();
    putCheckedInPantry.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} />);
    await user.click(button()!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att nå servern. Försök igen.");
    expect(refresh).toHaveBeenCalled();
    putCheckedInPantry.mockResolvedValue(ok({ added: 1, removed: 0, skipped: 0, siteName: null }));
    await user.click(button()!);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("reads the list again, without a notice, when the session has ended", async () => {
    const user = userEvent.setup();
    putCheckedInPantry.mockResolvedValue(fail("unauthorized"));
    render(<ShoppingList plan={plan} lines={[{ ...lines[0]!, checked: true }]} pantryUnavailable={false} />);
    await user.click(button()!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Packa upp kassarna (Story 16.18)", () => {
  const siteId = "55555555-5555-4555-8555-555555555555";
  const placed = [
    { key: "c1", ingredientId: "gradde", amount: 3, unit: "dl" as const, name: "Grädde", location: "Kyl" as const },
    { key: "c2", ingredientId: "paprika", amount: 2, unit: "st" as const, name: "Paprika", location: "Kyl" as const },
    { key: "c3", ingredientId: "mjol", amount: 1, unit: "kg" as const, name: "Mjöl", location: "Skafferi" as const },
  ];

  async function putAll() {
    const user = userEvent.setup();
    putCheckedInPantry.mockResolvedValue(ok({ added: 3, removed: 0, skipped: 0, siteName: null, placed, siteId }));
    render(<ShoppingList plan={plan} lines={lines.map((each) => ({ ...each, checked: true }))} pantryUnavailable={false} />);
    await user.click(button()!);
    return user;
  }

  it("says where things went, with Ändra beside it", async () => {
    await putAll();
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Lagt 3 varor: 2 i kyl, 1 i skafferi.");
    expect(screen.getByRole("button", { name: "Ändra" })).toBeInTheDocument();
  });

  it("moves one item with one tap on its place, and keeps the rest as it was", async () => {
    const user = await putAll();
    await user.click(await screen.findByRole("button", { name: "Ändra" }));
    expect(screen.getAllByTestId("unpack-item")).toHaveLength(3);
    const paprika = screen.getByRole("radiogroup", { name: "Plats för Paprika" });
    await user.click(within(paprika).getByRole("radio", { name: "Frys" }));
    expect(moveUnpackedItem).toHaveBeenCalledTimes(1);
    expect(moveUnpackedItem).toHaveBeenCalledWith({
      siteId,
      ingredientId: "paprika",
      amount: 2,
      unit: "st",
      from: "Kyl",
      to: "Frys",
    });
    expect(within(paprika).getByRole("radio", { name: "Frys" })).toBeChecked();
    const gradde = screen.getByRole("radiogroup", { name: "Plats för Grädde" });
    expect(within(gradde).getByRole("radio", { name: "Kyl" })).toBeChecked();
  });

  it("puts an item back where it was and says so when the move fails", async () => {
    const user = await putAll();
    moveUnpackedItem.mockResolvedValue(fail("pantry_move_failed"));
    await user.click(await screen.findByRole("button", { name: "Ändra" }));
    const mjol = screen.getByRole("radiogroup", { name: "Plats för Mjöl" });
    await user.click(within(mjol).getByRole("radio", { name: "Frys" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att flytta varan.");
    expect(within(mjol).getByRole("radio", { name: "Skafferi" })).toBeChecked();
  });
});
