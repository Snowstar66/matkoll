import {
  act,
  createEvent,
  fireEvent,
  render as renderBare,
  type RenderOptions,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, type ReactElement, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { CheckChange } from "../domain/check";
import type { ShoppingLine } from "../domain/compute-list";
import { ToastProvider } from "@/components/toast";
import { resetQueues } from "./offline-checks";
import { announcementMs, checkTimeoutMs, doubleTapGuardMs, ShoppingList, type ShoppingListProps } from "./shopping-list";

/** The list needs a ToastProvider above, as the app layout gives it. */
const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: ToastProvider, ...options });

const setChecked = vi.fn<(change: CheckChange) => Promise<Result<CheckChange>>>();
vi.mock("../actions/set-checked", () => ({ setChecked: (change: CheckChange) => setChecked(change) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  // These tests start from I korgen folded; Story 3.9 opens it by default.
  window.localStorage.setItem("matkoll:basket-open", "0");
  setChecked.mockReset().mockImplementation(async (change) => ok(change));
  refresh.mockReset();
  resetQueues();
});

afterEach(() => {
  vi.useRealTimers();
});

// Inköpslista's view (UX-DR9, Story 11.4): the summary under the title, the
// progress row, the categories in the store's order, the line under a name,
// the amount variants, I korgen, the empty states and the live regions for a
// recount and for a check that moves a line.

const line = (overrides: Partial<ShoppingLine> & Pick<ShoppingLine, "key" | "label" | "section">): ShoppingLine => ({
  amount: null,
  unit: null,
  isVague: false,
  coverage: { kind: "missing" },
  origins: ["d1"],
  checked: false,
  isCustom: false,
  ...overrides,
});

const plan: NonNullable<ShoppingListProps["plan"]> = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Vecka 44",
  dishCount: 2,
  skippedCount: 0,
  dishTitles: { d1: "Krämig kycklinggryta", d2: "Paj" },
};
const lines: ShoppingLine[] = [
  line({ key: "r:paprika:st", label: "Paprika", section: "Frukt och grönt", amount: 1, unit: "st" }),
  line({ key: "r:gradde:dl", label: "Grädde", section: "Mejeri", amount: 3, unit: "dl", origins: ["d1", "d2"] }),
  line({
    key: "r:mjol:dl",
    label: "Mjöl",
    section: "Skafferi",
    amount: 2,
    unit: "dl",
    pantryNote: "hemma: 1 kg",
    coverage: { kind: "other-unit", amounts: [{ unit: "kg", amount: 1 }] },
    origins: ["d2"],
  }),
  line({ key: "r:salt:-", label: "Salt", section: "Skafferi", isVague: true, coverage: { kind: "vague-missing" } }),
  line({ key: "t:en näve persilja", label: "En näve persilja", section: "Övrigt", coverage: { kind: "unlinked" } }),
  line({
    key: "t:2 citroner",
    label: "2 citroner",
    section: "Övrigt",
    coverage: { kind: "unlinked" },
    multiplier: 2,
    origins: ["d1", "d2"],
  }),
];

/** What a row shows, without the "Ta bort" a swipe reveals. */
const rowText = (row: HTMLElement) => (row.querySelector('[data-testid="swipe-row-front"]') ?? row).textContent;

/** Waits until a click on another line counts again (the double tap guard also covers a mouse). */
const pastGuard = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, doubleTapGuardMs + 20)));

describe("ShoppingList", () => {
  it("shows the summary, the progress row and the lines per category in the store's order", () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-progress")).toHaveTextContent("6 varor kvar 0 av 6 i korgen");
    // The categories of Matvaror (Story 11.4): salt is a seasoning.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Frukt & grönt",
      "Mejeri & ägg",
      "Skafferi",
      "Såser & smaksättare",
      "Övrigt",
    ]);
    const mejeri = within(screen.getByRole("list", { name: "Mejeri & ägg" }));
    expect(mejeri.getByText("Grädde")).toBeInTheDocument();
    // Story 19.7: "Till 2 rätter" for a line from two dishes, the amount to the right in grey.
    expect(mejeri.getByText("Till 2 rätter")).toBeInTheDocument();
    expect(mejeri.getByText("3 dl")).toHaveClass("text-ink-2");
    expect(within(screen.getByRole("list", { name: "Skafferi" })).getAllByTestId("shopping-line").map(rowText)).toEqual([
      "Mjöl Till Paj2 dl (hemma: 1 kg)",
    ]);
    // A vague line: no amount, and "Saknas i Matvaror" before the dishes; no "Finns hemma?".
    expect(
      within(screen.getByRole("list", { name: "Såser & smaksättare" })).getAllByTestId("shopping-line").map(rowText),
    ).toEqual(["Salt Saknas i Matvaror · Till Krämig kycklinggryta"]);
    expect(screen.queryByText(/Finns hemma\?/)).not.toBeInTheDocument();
    // No amount for a line without a catalog ingredient: its text says how much, times its dishes.
    expect(within(screen.getByRole("list", { name: "Övrigt" })).getAllByTestId("shopping-line").map(rowText)).toEqual([
      "En näve persilja Till Krämig kycklinggryta",
      "2 citroner Till 2 rätter×2",
    ]);
    // Nothing checked off: no basket row, and no product chips without a store.
    expect(screen.queryByTestId("basket-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-chip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("list-skipped")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says to put dishes on the plan without a plan, or with an empty one", () => {
    const { rerender } = render(<ShoppingList plan={null} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
  });

  it("says everything is at home when the dishes need nothing", () => {
    render(<ShoppingList plan={plan} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument();
    expect(screen.queryByTestId("list-progress")).not.toBeInTheDocument();
  });

  it("says nothing is taken off when the pantry could not be read, as a status, and only with dishes", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable />);
    const notice = screen.getByText("Det gick inte att läsa matvarorna, så inget är avdraget från listan.");
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[]} pantryUnavailable />);
    expect(screen.queryByText("Det gick inte att läsa matvarorna, så inget är avdraget från listan.")).not.toBeInTheDocument();
    rerender(<ShoppingList plan={null} lines={[]} pantryUnavailable />);
    expect(screen.queryByText("Det gick inte att läsa matvarorna, så inget är avdraget från listan.")).not.toBeInTheDocument();
  });

  it("counts only dishes with a recipe, and says how many were left out", () => {
    const { rerender } = render(<ShoppingList plan={{ ...plan, dishCount: 1, skippedCount: 1 }} lines={lines} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-skipped")).toHaveTextContent("1 rätt med borttaget recept räknas inte.");
    // No dish counted: the empty plan's text, never "Allt finns hemma.".
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0, skippedCount: 2 }} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
    expect(screen.queryByText("Allt finns hemma.")).not.toBeInTheDocument();
    expect(screen.getByTestId("list-skipped")).toHaveTextContent("2 rätter med borttagna recept räknas inte.");
  });

  it("announces a recount while the list is shown, but not the list it starts with", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    const live = screen.getByTestId("list-announcement");
    expect(live).toHaveTextContent("");
    rerender(<ShoppingList plan={plan} lines={lines.slice(1)} pantryUnavailable={false} />);
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 5 varor kvar.");
    rerender(<ShoppingList plan={plan} lines={[...lines.slice(1)]} pantryUnavailable={false} />);
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 5 varor kvar.");
  });

  it("announces a change of any shown field, and clears the text after a while", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    const live = screen.getByTestId("list-announcement");
    rerender(<ShoppingList plan={plan} lines={lines.map((item) => ({ ...item, origins: ["d2"] }))} pantryUnavailable={false} />);
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 6 varor kvar.");
    act(() => vi.advanceTimersByTime(announcementMs));
    expect(live).toHaveTextContent("");
    rerender(
      <ShoppingList
        plan={plan}
        lines={lines.map((item) => ({ ...item, origins: ["d2"], label: `${item.label}!` }))}
        pantryUnavailable={false}
      />,
    );
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 6 varor kvar.");
  });

  it("does not announce a list counted again while it was hidden", async () => {
    const view = (mode: "visible" | "hidden", shown: ShoppingLine[]) => (
      <Activity mode={mode}>
        <ShoppingList plan={plan} lines={shown} pantryUnavailable={false} />
      </Activity>
    );
    const { rerender } = render(view("visible", lines));
    rerender(view("visible", lines.slice(1)));
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("Inköpslistan är omräknad.");
    // Hiding the list clears what was announced.
    await act(async () => rerender(view("hidden", lines.slice(1))));
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("");
    await act(async () => rerender(view("hidden", lines.slice(2))));
    await act(async () => rerender(view("visible", lines.slice(2))));
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("");
    rerender(view("visible", lines.slice(3)));
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("Inköpslistan är omräknad. 3 varor kvar.");
  });
});

/** A promise resolved from the test, to see the list while an action waits. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ShoppingList and the place it is counted against (Story 8.5)", () => {
  const hemma = { id: "11111111-1111-4111-8111-111111111111", name: "Hemma", siteCount: 2 };
  const stugan = { id: "22222222-2222-4222-8222-222222222222", name: "Stugan", siteCount: 2 };

  it("names the place when everything is in stock with more than one place, also Hemma", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={[]} pantryUnavailable={false} site={stugan} />);
    expect(screen.getByText("Allt finns i Matvaror för Stugan.")).toBeInTheDocument();
    rerender(<ShoppingList plan={plan} lines={[]} pantryUnavailable={false} site={hemma} />);
    expect(screen.getByText("Allt finns i Matvaror för Hemma.")).toBeInTheDocument();
    // One place, or one that could not be read: as in 1.0.
    rerender(<ShoppingList plan={plan} lines={[]} pantryUnavailable={false} site={{ ...hemma, siteCount: 1 }} />);
    expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument();
    rerender(<ShoppingList plan={plan} lines={[]} pantryUnavailable={false} site={null} />);
    expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument();
    // Without dishes, the empty plan's text, whatever the place.
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[]} pantryUnavailable={false} site={stugan} />);
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
  });

  it("keeps quiet once for a switch made in the list's own sheet, and announces the next recount on that place", () => {
    const isQuietSwitch = vi.fn((siteId: string | null) => siteId === stugan.id);
    const view = (shown: ShoppingLine[], site: typeof hemma) => (
      <ShoppingList plan={plan} lines={shown} pantryUnavailable={false} site={site} isQuietSwitch={isQuietSwitch} />
    );
    const { rerender } = render(view(lines, hemma));
    const live = screen.getByTestId("list-announcement");
    expect(isQuietSwitch).not.toHaveBeenCalled();
    // Switched to Stugan from the sheet: other lines, but the switch's confirmation says it.
    rerender(view(lines.slice(2), stugan));
    expect(live).toHaveTextContent("");
    expect(isQuietSwitch).toHaveBeenCalledTimes(1);
    expect(isQuietSwitch).toHaveBeenCalledWith(stugan.id);
    // The same lines read again on Stugan: nothing to say, and nothing asked.
    rerender(view([...lines.slice(2)], stugan));
    expect(live).toHaveTextContent("");
    // Counted again on Stugan, e.g. after a change elsewhere: announced, compared with Stugan's list.
    rerender(view(lines.slice(3), stugan));
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 3 varor kvar.");
    expect(isQuietSwitch).toHaveBeenCalledTimes(1);
  });

  it("says which place the list is counted against after a switch made elsewhere", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} site={stugan} />);
    const live = screen.getByTestId("list-announcement");
    // Hemma selected on another device, or after a place that was gone: no sheet to say it.
    rerender(<ShoppingList plan={plan} lines={lines.slice(1)} pantryUnavailable={false} site={hemma} />);
    expect(live).toHaveTextContent("Listan räknas nu mot Hemma. 5 varor kvar.");
    // Also when nothing on the list changed.
    rerender(<ShoppingList plan={plan} lines={lines.slice(1)} pantryUnavailable={false} site={stugan} />);
    expect(live).toHaveTextContent("Listan räknas nu mot Stugan. 5 varor kvar.");
  });

  it("announces a recount without a place name when the place cannot be read, or is the only one", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} site={stugan} />);
    const live = screen.getByTestId("list-announcement");
    rerender(<ShoppingList plan={plan} lines={lines.slice(1)} pantryUnavailable site={null} />);
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 5 varor kvar.");
    // Stugan removed: Hemma is the only place, and the lines are the same.
    rerender(<ShoppingList plan={plan} lines={lines.slice(1)} pantryUnavailable={false} site={{ ...hemma, siteCount: 1 }} />);
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 5 varor kvar.");
    rerender(<ShoppingList plan={plan} lines={lines.slice(2)} pantryUnavailable={false} site={{ ...stugan, siteCount: 1 }} />);
    expect(live).toHaveTextContent("Inköpslistan är omräknad. 4 varor kvar.");
  });

  it("tells the page while a check is being saved, so Byt can wait", async () => {
    const answer = deferred<Result<CheckChange>>();
    setChecked.mockImplementation(() => answer.promise);
    const onBusyChange = vi.fn();
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} site={hemma} onBusyChange={onBusyChange} />);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole("checkbox", { name: /^Paprika/ }));
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    await act(async () => answer.resolve(ok({ planId: plan.id, key: "r:paprika:st", checked: true })));
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });

  it("keeps the checks of lines that stay, and shows a check again when its line comes back", async () => {
    const user = userEvent.setup();
    const checked = lines.map((item) => (item.key === "r:paprika:st" ? { ...item, checked: true } : item));
    const { rerender } = render(<ShoppingList plan={plan} lines={checked} pantryUnavailable={false} site={hemma} />);
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    expect(screen.getByRole("checkbox", { name: /^Paprika/ })).toBeChecked();
    // On Stugan the paprika is covered: the line is gone, its check stays on the server.
    rerender(<ShoppingList plan={plan} lines={checked.slice(1)} pantryUnavailable={false} site={stugan} />);
    expect(screen.queryByRole("checkbox", { name: /^Paprika/ })).toBeNull();
    expect(screen.queryByTestId("basket-row")).not.toBeInTheDocument();
    rerender(<ShoppingList plan={plan} lines={checked} pantryUnavailable={false} site={hemma} />);
    // Back in I korgen, which stays as it was left.
    expect(screen.getByRole("checkbox", { name: /^Paprika/ })).toBeChecked();
  });

  it("says Saknas i Stugan under a vague line with more than one place, and Saknas i Matvaror with one", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} site={stugan} />);
    const salt = () => screen.getAllByTestId("shopping-line").find((row) => row.dataset.lineKey === "r:salt:-")!;
    expect(rowText(salt())).toBe("Salt Saknas i Stugan · Till Krämig kycklinggryta");
    rerender(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} site={{ ...stugan, siteCount: 1 }} />);
    expect(rowText(salt())).toBe("Salt Saknas i Matvaror · Till Krämig kycklinggryta");
  });
});

/** The list as the server gives it; setChecked's stub saves a check here, as the server's revalidation would. */
const server: { save: (change: CheckChange) => void } = { save: () => {} };
const saveOnServer = (change: CheckChange) => server.save(change);
function ServerList({ initial }: { initial: ShoppingLine[] }) {
  const [shown, setShown] = useState(initial);
  useEffect(() => {
    server.save = ({ key, checked }) =>
      setShown((before) => before.map((item) => (item.key === key ? { ...item, checked } : item)));
  }, []);
  return <ShoppingList plan={plan} lines={shown} pantryUnavailable={false} />;
}

describe("ShoppingList checks", () => {
  beforeEach(() => {
    setChecked.mockImplementation(async (change) => {
      saveOnServer(change);
      return ok(change);
    });
  });


  it("names each check by the line and its amount, with its state", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={[...lines, { ...lines[0], key: "r:x:st", label: "X", checked: true }]} pantryUnavailable={false} />);
    expect(screen.getByRole("checkbox", { name: "Paprika, 1 st" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mjöl, 2 dl (hemma: 1 kg)" })).not.toBeChecked();
    // A vague line's name alone (Story 11.4): no "finns hemma?".
    expect(screen.getByRole("checkbox", { name: "Salt" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "En näve persilja" })).not.toBeChecked();
    // A checked line does not count as left, and is in I korgen.
    expect(screen.getByTestId("list-progress")).toHaveTextContent("6 varor kvar 1 av 7 i korgen");
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    expect(screen.getByRole("checkbox", { name: "X, 1 st" })).toBeChecked();
  });

  it("moves a checked line at once to I korgen, struck through, and a check there takes it back", async () => {
    const user = userEvent.setup();
    render(<ServerList initial={lines} />);
    const mejeri = () => screen.queryByRole("list", { name: "Mejeri & ägg" });

    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    expect(setChecked).toHaveBeenCalledWith({ planId: plan.id, key: "r:gradde:dl", checked: true });
    // Gone from its category (Mejeri & ägg had only Grädde), counted in the progress row and the basket row.
    expect(mejeri()).not.toBeInTheDocument();
    expect(screen.getByTestId("list-progress")).toHaveTextContent("5 varor kvar 1 av 6 i korgen");
    expect(screen.getByTestId("basket-row")).toHaveTextContent("I korgen (1)");
    // Said a moment after focus has moved, so a screen reader reads both.
    expect(screen.getByTestId("check-announcement")).toHaveTextContent("");
    await waitFor(() => expect(screen.getByTestId("check-announcement")).toHaveTextContent("Grädde i korgen."));
    // Pontus's own check is not a recount.
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("");

    const show = screen.getByRole("button", { name: /^Visa I korgen/ });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await user.click(show);
    expect(screen.getByRole("button", { name: "Dölj I korgen" })).toHaveAttribute("aria-expanded", "true");
    const basket = within(screen.getByRole("list", { name: /^I korgen/ }));
    expect(screen.getByRole("heading", { level: 2, name: /^I korgen/ })).toBeInTheDocument();
    const box = basket.getByRole("checkbox", { name: "Grädde, 3 dl" });
    expect(box).toBeChecked();
    expect(basket.getByText("Grädde").parentElement).toHaveClass("line-through", "text-ink-3");
    // The amount takes the name's ink-3 and line.
    expect(basket.getByText("3 dl")).not.toHaveClass("text-ink-2");

    await user.click(box);
    expect(setChecked).toHaveBeenLastCalledWith({ planId: plan.id, key: "r:gradde:dl", checked: false });
    expect(within(mejeri()!).getByRole("checkbox", { name: "Grädde, 3 dl" })).not.toBeChecked();
    await waitFor(() => expect(screen.getByTestId("check-announcement")).toHaveTextContent("Grädde tillbaka på listan."));
    expect(screen.getByTestId("list-progress")).toHaveTextContent("6 varor kvar 0 av 6 i korgen");
    // The basket is empty: no basket row, and it is folded again.
    expect(screen.queryByTestId("basket-row")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /^I korgen/ })).not.toBeInTheDocument();
  });

  it("does not check the line from its name, a tap target of its own", async () => {
    const user = userEvent.setup();
    render(<ServerList initial={lines} />);
    await user.click(screen.getByText("Grädde"));
    expect(setChecked).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Grädde, 3 dl" })).not.toBeChecked();
  });

  it("puts the line back and says so in a notice when the check cannot be saved, until a check is saved", async () => {
    const user = userEvent.setup();
    setChecked.mockResolvedValueOnce(fail("shopping_check_failed"));
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    // The answer settles in a transition after the click, so wait for it.
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara bocken.");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Paprika, 1 st" })).not.toBeChecked());
    expect(screen.getByTestId("list-progress")).toHaveTextContent("6 varor kvar");
    expect(refresh).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByTestId("list-progress")).toHaveTextContent("5 varor kvar 1 av 6 i korgen");
  });

  it("keeps the check and says it waits when the action gets no answer, then sends it when the net is back (Story 17.8)", async () => {
    const user = userEvent.setup();
    setChecked.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    expect(await screen.findByText("Offline – sparas när nätet kommer tillbaka")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("list-progress")).toHaveTextContent("5 varor kvar 1 av 6 i korgen");

    setChecked.mockReset().mockImplementation(async (change) => ok(change));
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.queryByText("Offline – sparas när nätet kommer tillbaka")).not.toBeInTheDocument());
    expect(setChecked).toHaveBeenCalledWith({ planId: plan.id, key: "r:paprika:st", checked: true });
    expect(refresh).toHaveBeenCalled();
  });

  it("queues taps without calling the server while the browser is offline, the last state of a line winning", async () => {
    const user = userEvent.setup();
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      render(<ServerList initial={lines} />);
      await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
      expect(await screen.findByText("Offline – sparas när nätet kommer tillbaka")).toBeInTheDocument();
      expect(setChecked).not.toHaveBeenCalled();
      expect(screen.getByTestId("list-progress")).toHaveTextContent("5 varor kvar 1 av 6 i korgen");
    } finally {
      onLine.mockRestore();
    }
  });

  it("reads the list again and says so when the plan was switched elsewhere", async () => {
    const user = userEvent.setup();
    setChecked.mockResolvedValueOnce(fail("shopping_plan_changed"));
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Matsedeln har bytts. Listan är uppdaterad.");
    expect(refresh).toHaveBeenCalled();
  });

  it("reads the list again, without a notice, when the session has ended", async () => {
    const user = userEvent.setup();
    setChecked.mockResolvedValueOnce(fail("unauthorized"));
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves a line's taps one at a time, ending with the last state", async () => {
    const user = userEvent.setup();
    const answers: (() => void)[] = [];
    setChecked.mockImplementation(
      (change) =>
        new Promise((resolve) => {
          answers.push(() => {
            saveOnServer(change);
            resolve(ok(change));
          });
        }),
    );
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    // Taken back from I korgen before the first write has answered.
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    expect(screen.getByRole("checkbox", { name: "Paprika, 1 st" })).not.toBeChecked();
    // The second write waits for the first.
    expect(setChecked.mock.calls.map(([change]) => change.checked)).toEqual([true]);
    await act(async () => answers.shift()!());
    expect(setChecked.mock.calls.map(([change]) => change.checked)).toEqual([true, false]);
    await act(async () => answers.shift()!());
    expect(screen.getByRole("checkbox", { name: "Paprika, 1 st" })).not.toBeChecked();
    expect(screen.getByTestId("list-progress")).toHaveTextContent("6 varor kvar");
  });

  it("keeps a failure's notice when another line is saved, and announces a repeated failure again", async () => {
    const user = userEvent.setup();
    setChecked.mockResolvedValueOnce(fail("shopping_check_failed"));
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    const first = await screen.findByRole("alert");
    await pastGuard();
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    expect(screen.queryByRole("checkbox", { name: "Grädde, 3 dl" })).not.toBeInTheDocument();
    expect(screen.getByTestId("basket-row")).toHaveTextContent("I korgen (1)");
    expect(screen.getByRole("alert")).toBe(first);

    setChecked.mockResolvedValueOnce(fail("shopping_check_failed"));
    await pastGuard();
    await user.click(await screen.findByRole("checkbox", { name: "Paprika, 1 st" }));
    // A new element, so screen readers announce the same text again (once the failure has settled).
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(first));
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att spara bocken.");
  });

  it("treats a check without an answer after a while as waiting, so later taps are not stuck behind it", async () => {
    // Time moves only when the test moves it. fireEvent, not user-event, whose
    // async wrapper waits for a real timer that fake timers never run.
    vi.useFakeTimers();
    const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    const paprika = () => screen.queryByRole("checkbox", { name: "Paprika, 1 st" });
    setChecked.mockImplementation(() => new Promise(() => {}));
    render(<ServerList initial={lines} />);
    act(() => void fireEvent.click(paprika()!));
    await flush();
    // In I korgen, folded.
    expect(paprika()).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(checkTimeoutMs)));
    await flush();
    // Story 17.8: no answer is not a failure; the check stays and waits for the net.
    expect(paprika()).toBeNull();
    expect(screen.getByText("Offline – sparas när nätet kommer tillbaka")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores the answer for a plan the list no longer shows", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<CheckChange>) => void = () => {};
    setChecked.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    const other = { ...plan, id: "44444444-4444-4444-8444-444444444444" };
    rerender(<ShoppingList plan={other} lines={lines} pantryUnavailable={false} />);
    await act(async () => answer(fail("shopping_check_failed")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Paprika, 1 st" })).not.toBeChecked();
  });

  it("shows the list without checks, and checking off, when the checks could not be read", async () => {
    const user = userEvent.setup();
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} checksUnavailable />);
    const notice = screen.getByText("Det gick inte att läsa bockarna, så det går inte att bocka av just nu.");
    expect(notice).toHaveAttribute("role", "status");
    const box = screen.getByRole("checkbox", { name: "Paprika, 1 st" });
    expect(box).toBeDisabled();
    await user.click(box);
    expect(setChecked).not.toHaveBeenCalled();
    expect(screen.getByTestId("list-progress")).toHaveTextContent("6 varor kvar");
  });
});

/** Fourteen lines, six of them checked: the list of the mockup (Story 11.4). */
const fourteen: ShoppingLine[] = [
  line({ key: "r:lok:st", label: "Gul lök", section: "Frukt och grönt", amount: 2, unit: "st", origins: ["d1"] }),
  line({ key: "r:vitlok:st", label: "Vitlök", section: "Frukt och grönt", amount: 1, unit: "st", origins: ["d2"] }),
  line({ key: "r:citron:st", label: "Citron", section: "Frukt och grönt", amount: 1, unit: "st" }),
  line({ key: "r:falukorv:g", ingredientId: "falukorv", label: "Falukorv", section: "Chark", amount: 800, unit: "g" }),
  line({ key: "r:lax:g", label: "Lax", section: "Kött och fisk", amount: 400, unit: "g" }),
  line({ key: "r:gradde:dl", label: "Matlagningsgrädde", section: "Mejeri", amount: 3, unit: "dl", origins: ["d1", "d2"] }),
  line({ key: "r:tomat:forp", label: "Krossade tomater", section: "Skafferi", amount: 1, unit: "förp" }),
  line({ key: "r:soja:-", label: "Sojasås", section: "Skafferi", isVague: true, coverage: { kind: "vague-missing" } }),
  ...["Mjölk", "Ägg", "Smör", "Bröd", "Kaffe", "Te"].map((label, index) =>
    line({ key: `r:${index}:st`, label, section: "Övrigt", amount: 1, unit: "st", checked: true }),
  ),
];

describe("ShoppingList in the new look (Story 11.4)", () => {
  beforeEach(() => {
    setChecked.mockImplementation(async (change) => {
      saveOnServer(change);
      return ok(change);
    });
  });

  it("shows how far the shopping has come, the categories of what is left and the basket row", () => {
    render(<ShoppingList plan={plan} lines={fourteen} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-progress")).toHaveTextContent("8 varor kvar 6 av 14 i korgen");
    // 6 of 14: the meter is 43 % full, and hidden from screen readers.
    const meter = screen.getByTestId("meter");
    expect(meter).toHaveAttribute("aria-hidden", "true");
    expect(Number.parseFloat((meter.firstElementChild as HTMLElement).style.width)).toBeCloseTo(42.86, 1);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Frukt & grönt",
      "Mejeri & ägg",
      "Kött, fisk & chark",
      "Skafferi",
      "Såser & smaksättare",
      // The folded basket row is a heading too, so heading navigation finds it.
      "I korgen (6)",
    ]);
    expect(
      within(screen.getByRole("list", { name: "Kött, fisk & chark" })).getAllByTestId("shopping-line").map((row) => row.dataset.lineKey),
    ).toEqual(["r:falukorv:g", "r:lax:g"]);
    expect(screen.getAllByTestId("shopping-line")).toHaveLength(8);
    expect(screen.getByTestId("basket-row")).toHaveTextContent("I korgen (6)");
    expect(screen.getByRole("button", { name: /^Visa I korgen/ })).toBeInTheDocument();
    // Plain text: no emoji in the basket row.
    expect(screen.getByTestId("basket-row").textContent).toMatch(/^[\p{L}\p{N} ()]+$/u);
  });

  it("says Allt ligger i korgen with every line checked off, and shows no categories", () => {
    render(<ShoppingList plan={plan} lines={fourteen.map((item) => ({ ...item, checked: true }))} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-progress")).toHaveTextContent(/^Allt ligger i korgen$/);
    // No category, only the basket row's heading.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["I korgen (14)"]);
    expect(screen.getByRole("button", { name: "Visa I korgen (14 varor)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Lägg till i Matvaror" })).toBeInTheDocument();
  });

  it("shows the product choice of the selected store as a chip, and none without a store", () => {
    const store = {
      id: "55555555-5555-4555-8555-555555555555",
      name: "ICA Maxi",
      chain: "ICA" as const,
      externalStoreId: null,
      address: null,
      url: null,
      offersUrl: null,
      isSelected: true,
    };
    const choice = {
      id: "66666666-6666-4666-8666-666666666666",
      ingredientId: "falukorv",
      storeId: store.id,
      productName: "Scan Falukorv 800 g",
      packageSize: null,
      url: null,
      updatedAt: "2026-10-26T05:12:29.123456+00:00",
    };
    const { rerender } = render(
      <ShoppingList plan={plan} lines={fourteen} pantryUnavailable={false} store={store} productChoices={{ falukorv: choice }} />,
    );
    const chips = screen.getAllByTestId("product-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("Scan Falukorv 800 g");
    expect(chips[0]).toHaveClass("truncate", "bg-sky", "text-sky-ink");
    // Beside the line, not in the button that opens its detail.
    const falukorv = screen.getAllByTestId("shopping-line").find((row) => row.dataset.lineKey === "r:falukorv:g")!;
    expect(within(falukorv).getByTestId("shopping-line-name")).not.toContainElement(chips[0]);
    expect(falukorv).toContainElement(chips[0]);
    rerender(<ShoppingList plan={plan} lines={fourteen} pantryUnavailable={false} store={null} productChoices={{ falukorv: choice }} />);
    expect(screen.queryByTestId("product-chip")).not.toBeInTheDocument();
  });

  it("says Egen under an own item", () => {
    const own = line({ key: "c:disk", label: "Diskmedel", section: "Övrigt", isCustom: true, origins: [], coverage: { kind: "unlinked" } });
    render(<ShoppingList plan={plan} lines={[own]} pantryUnavailable={false} />);
    expect(rowText(screen.getByTestId("shopping-line"))).toBe("Diskmedel Egen");
  });

  it("moves focus to the next line's check, else the one before, else the basket row's Visa", async () => {
    const user = userEvent.setup();
    render(<ServerList initial={lines.slice(0, 2)} />);
    // Paprika, then Grädde: the next line.
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    expect(screen.getByRole("checkbox", { name: "Grädde, 3 dl" })).toHaveFocus();
    // Grädde was the last line left: the basket row's Visa.
    await pastGuard();
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Visa I korgen/ })).toHaveFocus());
    expect(screen.getByTestId("list-progress")).toHaveTextContent("Allt ligger i korgen");

    // From I korgen, in the list's category order: the next checked line, else the one before, else the line back.
    await user.keyboard("{Enter}");
    expect(
      within(screen.getByRole("list", { name: /^I korgen/ })).getAllByRole("checkbox").map((box) => box.getAttribute("aria-label")),
    ).toEqual(["Paprika, 1 st", "Grädde, 3 dl"]);
    await pastGuard();
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    expect(within(screen.getByRole("list", { name: /^I korgen/ })).getByRole("checkbox", { name: "Grädde, 3 dl" })).toHaveFocus();
    await pastGuard();
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: "Mejeri & ägg" })).getByRole("checkbox", { name: "Grädde, 3 dl" })).toHaveFocus(),
    );
  });

  it("keeps the basket unfolded while the page is hidden and shown again", async () => {
    const user = userEvent.setup();
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <ShoppingList plan={plan} lines={fourteen} pantryUnavailable={false} />
      </Activity>
    );
    const { rerender } = render(view("visible"));
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    expect(screen.getByRole("list", { name: /^I korgen/ })).toBeInTheDocument();
    await act(async () => rerender(view("hidden")));
    await act(async () => rerender(view("visible")));
    expect(screen.getByRole("list", { name: /^I korgen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dölj I korgen" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Dölj I korgen" }));
    expect(screen.queryByRole("list", { name: /^I korgen/ })).not.toBeInTheDocument();
  });

  /** An event with a fixed timeStamp (and more), fired on `element` in act, with the save it starts. */
  const fire = async (element: HTMLElement, event: Event, fields: Record<string, unknown>) => {
    for (const [name, value] of Object.entries(fields)) Object.defineProperty(event, name, { value });
    await act(async () => void fireEvent(element, event));
  };
  /** A press with `pointerType` at `at` ms, then its click 50 ms later. */
  const tap = async (element: HTMLElement, at: number, pointerType = "touch", detail = 1) => {
    await fire(element, createEvent.pointerDown(element), { pointerType, timeStamp: at });
    await fire(element, createEvent.click(element, { detail }), { timeStamp: at + 50 });
  };

  it("ignores a finger's second tap of a double tap, which would land on the line that moved up, with a cue", async () => {
    render(<ServerList initial={lines} />);
    await tap(screen.getByRole("checkbox", { name: "Paprika, 1 st" }), 1000);
    // 200 ms later, where Paprika was: Grädde has moved up under the finger.
    await tap(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }), 1200);
    expect(setChecked).toHaveBeenCalledTimes(1);
    const gradde = screen.getByRole("checkbox", { name: "Grädde, 3 dl" });
    expect(gradde).not.toBeChecked();
    // The ignored tap's short cue, still with "Minska rörelse".
    expect(gradde).toHaveClass("motion-safe:animate-ignored-tap", "motion-reduce:outline-2");
    // A deliberate tap a moment later counts.
    await tap(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }), 1000 + doubleTapGuardMs + 50);
    expect(setChecked).toHaveBeenCalledTimes(2);
    expect(setChecked).toHaveBeenLastCalledWith({ planId: plan.id, key: "r:gradde:dl", checked: true });
  });

  it("guards a pen and a mouse double click too", async () => {
    render(<ServerList initial={lines} />);
    await tap(screen.getByRole("checkbox", { name: "Paprika, 1 st" }), 1000, "mouse");
    await tap(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }), 1150, "mouse", 2);
    await tap(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }), 1300, "pen");
    expect(setChecked).toHaveBeenCalledTimes(1);
  });

  it("lets a click without a fresh pointer press through: VoiceOver, Voice Control, Switch Control", async () => {
    render(<ServerList initial={lines} />);
    await tap(screen.getByRole("checkbox", { name: "Paprika, 1 st" }), 1000);
    // A click with no pointer press after the touch, e.g. VoiceOver's double tap on the next line.
    await fire(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }), createEvent.click(document.body, { detail: 0 }), {
      timeStamp: 1100,
    });
    // An earlier pointer press that is no longer fresh does not count either.
    await fire(screen.getByRole("checkbox", { name: "Mjöl, 2 dl (hemma: 1 kg)" }), createEvent.pointerDown(document.body), {
      pointerType: "touch",
      timeStamp: 1150,
    });
    await fire(screen.getByRole("checkbox", { name: "Mjöl, 2 dl (hemma: 1 kg)" }), createEvent.click(document.body), {
      timeStamp: 1150 + 1500,
    });
    expect(setChecked.mock.calls.map(([change]) => change.key)).toEqual(["r:paprika:st", "r:gradde:dl", "r:mjol:dl"]);
  });

  it("does not repeat a held Enter on a check", async () => {
    render(<ServerList initial={lines} />);
    const paprika = screen.getByRole("checkbox", { name: "Paprika, 1 st" });
    const held = createEvent.keyDown(paprika, { key: "Enter", repeat: true });
    await act(async () => void fireEvent(paprika, held));
    expect(held.defaultPrevented).toBe(true);
    const first = createEvent.keyDown(paprika, { key: "Enter" });
    await act(async () => void fireEvent(paprika, first));
    expect(first.defaultPrevented).toBe(false);
  });

  it("describes each check with the line under its name and its product", () => {
    const store = { id: "s", name: "ICA Maxi", chain: "ICA" as const, externalStoreId: null, address: null, url: null, offersUrl: null, isSelected: true };
    const choice = { id: "c", ingredientId: "falukorv", storeId: "s", productName: "Scan Falukorv 800 g", packageSize: null, url: null, updatedAt: "x" };
    render(<ShoppingList plan={plan} lines={fourteen} pantryUnavailable={false} store={store} productChoices={{ falukorv: choice }} />);
    expect(screen.getByRole("checkbox", { name: "Falukorv, 800 g" })).toHaveAccessibleDescription(
      "Till Krämig kycklinggryta Scan Falukorv 800 g",
    );
    expect(screen.getByRole("checkbox", { name: "Sojasås" })).toHaveAccessibleDescription("Saknas i Matvaror · Till Krämig kycklinggryta");
  });

  it("says Saknas in Dolda varor for a hidden vague line, which has no amount", async () => {
    const user = userEvent.setup();
    const salt = lines.find((item) => item.key === "r:salt:-")!;
    render(<ShoppingList plan={plan} lines={lines.slice(0, 2)} hiddenLines={[salt]} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Dolda varor (1)" }));
    expect(await screen.findByTestId("hidden-line")).toHaveTextContent(/^Salt\s*Saknas i Matvaror\s*Visa igen$/);
  });

  it("says nothing is missing when the pantry could not be read", () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable />);
    const salt = screen.getAllByTestId("shopping-line").find((row) => row.dataset.lineKey === "r:salt:-")!;
    expect(rowText(salt)).toBe("Salt Till Krämig kycklinggryta");
  });
});

describe("ShoppingList when a check goes back (Story 11.4 review)", () => {
  it("keeps a line in I korgen through a recount while its check is saved, without an announcement", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<CheckChange>) => void = () => {};
    setChecked.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    // Counted again (a dish added elsewhere), before the save has answered: the server does not have the check yet.
    const recounted = [...lines, line({ key: "r:lok:st", label: "Gul lök", section: "Frukt och grönt", amount: 1, unit: "st" })];
    rerender(<ShoppingList plan={plan} lines={recounted} pantryUnavailable={false} />);
    expect(screen.queryByRole("checkbox", { name: "Paprika, 1 st" })).toBeNull();
    expect(screen.getByTestId("basket-row")).toHaveTextContent("I korgen (1)");
    // The save answers and the server's list has the check.
    rerender(<ShoppingList plan={plan} lines={recounted.map((item) => (item.key === "r:paprika:st" ? { ...item, checked: true } : item))} pantryUnavailable={false} />);
    await act(async () => answer(ok({ planId: plan.id, key: "r:paprika:st", checked: true })));
    await waitFor(() => expect(screen.getByTestId("check-announcement")).toHaveTextContent("Paprika i korgen."));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByTestId("check-announcement")).toHaveTextContent("Paprika i korgen.");
    expect(screen.queryByRole("checkbox", { name: "Paprika, 1 st" })).toBeNull();
  });

  it("says a line went back, and focuses its check, when the server's list disagrees after the save", async () => {
    const user = userEvent.setup();
    // Saved, but the list read afterwards does not have the check (e.g. taken off on another device).
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    await waitFor(() => expect(screen.getByTestId("check-announcement")).toHaveTextContent("Paprika tillbaka på listan."));
    expect(screen.getByRole("checkbox", { name: "Paprika, 1 st" })).toHaveFocus();
  });

  it("puts a line back in I korgen, opened, when taking it back fails", async () => {
    const user = userEvent.setup();
    setChecked.mockResolvedValueOnce(fail("shopping_check_failed"));
    render(<ShoppingList plan={plan} lines={lines.map((item) => (item.key === "r:paprika:st" ? { ...item, checked: true } : item))} pantryUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara bocken.");
    await waitFor(() => expect(screen.getByTestId("check-announcement")).toHaveTextContent("Paprika i korgen."));
    const back = within(screen.getByRole("list", { name: /^I korgen/ })).getByRole("checkbox", { name: "Paprika, 1 st" });
    expect(back).toBeChecked();
    expect(back).toHaveFocus();
  });
});
