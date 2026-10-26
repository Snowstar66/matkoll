import { act, fireEvent, render as renderBare, type RenderOptions, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, type ReactElement, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { CheckChange } from "../domain/check";
import type { ShoppingLine } from "../domain/compute-list";
import { ToastProvider } from "@/components/toast";
import { announcementMs, checkTimeoutMs, ShoppingList, type ShoppingListProps } from "./shopping-list";

/** The list needs a ToastProvider above, as the app layout gives it. */
const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: ToastProvider, ...options });

const setChecked = vi.fn<(change: CheckChange) => Promise<Result<CheckChange>>>();
vi.mock("../actions/set-checked", () => ({ setChecked: (change: CheckChange) => setChecked(change) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  setChecked.mockReset().mockImplementation(async (change) => ok(change));
  refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// Inköpslista's view (UX-DR9): the summary under the title, sections in the
// fixed order, "från [rätt]", the amount variants, the empty states and the
// live region for a recount.

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

describe("ShoppingList", () => {
  it("shows the summary and the lines per section in the fixed order", () => {
    render(<ShoppingList plan={plan} lines={lines} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-summary")).toHaveTextContent("Vecka 44 · 2 rätter · 6 varor kvar");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Frukt och grönt",
      "Mejeri",
      "Skafferi",
      "Övrigt",
    ]);
    const mejeri = within(screen.getByRole("region", { name: "Mejeri" }));
    expect(mejeri.getByText("Grädde")).toBeInTheDocument();
    expect(mejeri.getByText("från Krämig kycklinggryta, Paj")).toBeInTheDocument();
    expect(mejeri.getByText("3 dl")).toBeInTheDocument();
    const rows = within(screen.getByRole("region", { name: "Skafferi" })).getAllByTestId("shopping-line");
    expect(rows.map(rowText)).toEqual(["Mjöl från Paj 2 dl (hemma: 1 kg)", "Salt från Krämig kycklinggryta Finns hemma?"]);
    // No amount for a line without a catalog ingredient: its text says how much, times its dishes.
    expect(within(screen.getByRole("region", { name: "Övrigt" })).getAllByTestId("shopping-line").map(rowText)).toEqual([
      "En näve persilja från Krämig kycklinggryta",
      "2 citroner från Krämig kycklinggryta, Paj ×2",
    ]);
    expect(screen.queryByTestId("list-skipped")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says to put dishes on the plan without a plan, or with an empty one", () => {
    const { rerender } = render(<ShoppingList plan={null} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
    expect(screen.queryByTestId("list-summary")).not.toBeInTheDocument();
  });

  it("says everything is at home when the dishes need nothing", () => {
    render(<ShoppingList plan={plan} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument();
    expect(screen.getByTestId("list-summary")).toHaveTextContent("Vecka 44 · 2 rätter · 0 varor kvar");
  });

  it("says nothing is taken off when the pantry could not be read, as a status, and only with dishes", () => {
    const { rerender } = render(<ShoppingList plan={plan} lines={lines} pantryUnavailable />);
    const notice = screen.getByText("Det gick inte att läsa lagret, så inget är avdraget från listan.");
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0 }} lines={[]} pantryUnavailable />);
    expect(screen.queryByText("Det gick inte att läsa lagret, så inget är avdraget från listan.")).not.toBeInTheDocument();
    rerender(<ShoppingList plan={null} lines={[]} pantryUnavailable />);
    expect(screen.queryByText("Det gick inte att läsa lagret, så inget är avdraget från listan.")).not.toBeInTheDocument();
  });

  it("counts only dishes with a recipe, and says how many were left out", () => {
    const { rerender } = render(<ShoppingList plan={{ ...plan, dishCount: 1, skippedCount: 1 }} lines={lines} pantryUnavailable={false} />);
    expect(screen.getByTestId("list-summary")).toHaveTextContent("Vecka 44 · 1 rätt · 6 varor kvar");
    expect(screen.getByTestId("list-skipped")).toHaveTextContent("1 rätt med borttaget recept räknas inte.");
    // No dish counted: the empty plan's text, never "Allt finns hemma.".
    rerender(<ShoppingList plan={{ ...plan, dishCount: 0, skippedCount: 2 }} lines={[]} pantryUnavailable={false} />);
    expect(screen.getByText("Lägg rätter på matsedeln så räknas listan fram.")).toBeInTheDocument();
    expect(screen.queryByText("Allt finns hemma.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("list-summary")).not.toBeInTheDocument();
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
    expect(screen.getByText("Allt finns i lagret för Stugan.")).toBeInTheDocument();
    rerender(<ShoppingList plan={plan} lines={[]} pantryUnavailable={false} site={hemma} />);
    expect(screen.getByText("Allt finns i lagret för Hemma.")).toBeInTheDocument();
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

  it("keeps the checks of lines that stay, and shows a check again when its line comes back", () => {
    const checked = lines.map((item) => (item.key === "r:paprika:st" ? { ...item, checked: true } : item));
    const { rerender } = render(<ShoppingList plan={plan} lines={checked} pantryUnavailable={false} site={hemma} />);
    expect(screen.getByRole("checkbox", { name: /^Paprika/ })).toBeChecked();
    // On Stugan the paprika is covered: the line is gone, its check stays on the server.
    rerender(<ShoppingList plan={plan} lines={checked.slice(1)} pantryUnavailable={false} site={stugan} />);
    expect(screen.queryByRole("checkbox", { name: /^Paprika/ })).toBeNull();
    rerender(<ShoppingList plan={plan} lines={checked} pantryUnavailable={false} site={hemma} />);
    expect(screen.getByRole("checkbox", { name: /^Paprika/ })).toBeChecked();
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

  it("names each check by the line and what it shows, with its state", () => {
    render(<ShoppingList plan={plan} lines={[...lines, { ...lines[0], key: "r:x:st", label: "X", checked: true }]} pantryUnavailable={false} />);
    expect(screen.getByRole("checkbox", { name: "Paprika, 1 st" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mjöl, 2 dl (hemma: 1 kg)" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Salt, finns hemma?" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "En näve persilja" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "X, 1 st" })).toBeChecked();
    // A checked line does not count as left.
    expect(screen.getByTestId("list-summary")).toHaveTextContent("Vecka 44 · 2 rätter · 6 varor kvar");
  });

  it("checks a line off at once, keeps it in its place struck through, and takes the check off again", async () => {
    const user = userEvent.setup();
    render(<ServerList initial={lines} />);
    const order = () => screen.getAllByTestId("shopping-line").map((row) => row.getAttribute("data-line-key"));
    const before = order();
    const box = screen.getByRole("checkbox", { name: "Grädde, 3 dl" });

    await user.click(box);
    expect(box).toBeChecked();
    expect(setChecked).toHaveBeenCalledWith({ planId: plan.id, key: "r:gradde:dl", checked: true });
    expect(screen.getByTestId("list-summary")).toHaveTextContent("Vecka 44 · 2 rätter · 5 varor kvar");
    expect(order()).toEqual(before);
    const row = screen.getAllByTestId("shopping-line").find((item) => item.dataset.lineKey === "r:gradde:dl")!;
    expect(within(row).getByText("Grädde")).toHaveClass("line-through", "text-ink-3");
    expect(within(row).getByText("3 dl")).toHaveClass("line-through", "text-ink-3");
    // Pontus's own check is not a recount.
    expect(screen.getByTestId("list-announcement")).toHaveTextContent("");

    await user.click(box);
    expect(box).not.toBeChecked();
    expect(setChecked).toHaveBeenLastCalledWith({ planId: plan.id, key: "r:gradde:dl", checked: false });
    expect(screen.getByTestId("list-summary")).toHaveTextContent("Vecka 44 · 2 rätter · 6 varor kvar");
    expect(within(row).getByText("Grädde")).not.toHaveClass("line-through");
  });

  it("does not check the line from its name, a tap target of its own", async () => {
    const user = userEvent.setup();
    render(<ServerList initial={lines} />);
    await user.click(screen.getByText("Grädde"));
    expect(setChecked).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Grädde, 3 dl" })).not.toBeChecked();
  });

  it("puts the check back and says so in a notice when it cannot be saved, until a check is saved", async () => {
    const user = userEvent.setup();
    setChecked.mockResolvedValueOnce(fail("shopping_check_failed"));
    render(<ServerList initial={lines} />);
    const box = screen.getByRole("checkbox", { name: "Paprika, 1 st" });
    await user.click(box);
    // The answer settles in a transition after the click, so wait for it.
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara bocken.");
    await waitFor(() => expect(box).not.toBeChecked());
    expect(screen.getByTestId("list-summary")).toHaveTextContent("6 varor kvar");
    expect(refresh).not.toHaveBeenCalled();

    await user.click(box);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(box).toBeChecked();
  });

  it("puts the check back when the action gets no answer", async () => {
    const user = userEvent.setup();
    setChecked.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ServerList initial={lines} />);
    const box = screen.getByRole("checkbox", { name: "Paprika, 1 st" });
    await user.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara bocken.");
    await waitFor(() => expect(box).not.toBeChecked());
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
    const box = screen.getByRole("checkbox", { name: "Paprika, 1 st" });
    await user.click(box);
    await user.click(box);
    expect(box).not.toBeChecked();
    // The second write waits for the first.
    expect(setChecked.mock.calls.map(([change]) => change.checked)).toEqual([true]);
    await act(async () => answers.shift()!());
    expect(setChecked.mock.calls.map(([change]) => change.checked)).toEqual([true, false]);
    await act(async () => answers.shift()!());
    expect(box).not.toBeChecked();
    expect(screen.getByTestId("list-summary")).toHaveTextContent("6 varor kvar");
  });

  it("keeps a failure's notice when another line is saved, and announces a repeated failure again", async () => {
    const user = userEvent.setup();
    setChecked.mockResolvedValueOnce(fail("shopping_check_failed"));
    render(<ServerList initial={lines} />);
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    const first = await screen.findByRole("alert");
    await user.click(screen.getByRole("checkbox", { name: "Grädde, 3 dl" }));
    expect(screen.getByRole("checkbox", { name: "Grädde, 3 dl" })).toBeChecked();
    expect(screen.getByRole("alert")).toBe(first);

    setChecked.mockResolvedValueOnce(fail("shopping_check_failed"));
    await user.click(screen.getByRole("checkbox", { name: "Paprika, 1 st" }));
    // A new element, so screen readers announce the same text again (once the failure has settled).
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(first));
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att spara bocken.");
  });

  it("gives up on a check without an answer after a while, so later taps are not stuck behind it", async () => {
    // Time moves only when the test moves it. fireEvent, not user-event, whose
    // async wrapper waits for a real timer that fake timers never run.
    vi.useFakeTimers();
    const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    setChecked.mockImplementationOnce(() => new Promise(() => {}));
    render(<ServerList initial={lines} />);
    const box = screen.getByRole("checkbox", { name: "Paprika, 1 st" });
    act(() => void fireEvent.click(box));
    await flush();
    expect(box).toBeChecked();
    await act(async () => void (await vi.advanceTimersByTimeAsync(checkTimeoutMs)));
    await flush();
    expect(box).not.toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att spara bocken.");
    expect(refresh).toHaveBeenCalled();

    act(() => void fireEvent.click(box));
    await flush();
    expect(setChecked).toHaveBeenCalledTimes(2);
    expect(box).toBeChecked();
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
    expect(screen.getByTestId("list-summary")).toHaveTextContent("6 varor kvar");
  });
});
