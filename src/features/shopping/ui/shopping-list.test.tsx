import { act, render, screen, within } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShoppingLine } from "../domain/compute-list";
import { announcementMs, ShoppingList, type ShoppingListProps } from "./shopping-list";

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

const plan: ShoppingListProps["plan"] = {
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

const rowText = (row: HTMLElement) => row.textContent;

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
