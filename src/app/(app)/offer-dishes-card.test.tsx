import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import type { PlanRecipeRow } from "@/features/mealplan";
import type { PlanOption } from "@/features/suggestions";
import { OfferDishesCard, type OfferWeek } from "./offer-dishes-card";

vi.mock("./offer-ideas", () => ({ OfferIdeas: () => <div data-testid="offer-ideas" /> }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const option = (id: string, title: string, deal: string): PlanOption => ({
  id,
  title,
  isFavorite: false,
  imageUrl: null,
  totalMinutes: 30,
  servings: 4,
  cookedTimes: 0,
  buy: 2,
  buyNames: ["falukorv", "grädde"],
  meta: "",
  deal: { text: deal, savingKr: 21, savingPercent: 20 },
});

const korv = option("r1", "Korvstroganoff", "Falukorv och grädde på erbjudande · −21 kr");
const lax = option("r2", "Laxpasta", "Laxfilé på erbjudande · −12 kr");

const addToWeek = vi.fn();

const weeksWith = (now: Record<string, number | null>, next: Record<string, number | null> = {}): OfferWeek[] => [
  { weekStart: "2026-11-02", offset: 0, number: 45, onWeek: now },
  { weekStart: "2026-11-09", offset: 1, number: 46, onWeek: next },
  { weekStart: "2026-11-16", offset: 2, number: 47, onWeek: {} },
];

function renderCard(
  onWeek: Record<string, number | null> = {},
  dishes: PlanOption[] = [korv, lax],
  onNextWeek: Record<string, number | null> = {},
  defaultWeekStart = "2026-11-09",
) {
  return render(
    <ToastProvider>
      <OfferDishesCard dishes={dishes} weeks={weeksWith(onWeek, onNextWeek)} defaultWeekStart={defaultWeekStart} addToWeek={addToWeek} searchIngredients={async () => ok([])} ideas={null} startIdeas={vi.fn()} readIdeas={vi.fn()} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  addToWeek.mockReset().mockResolvedValue(ok({ id: "d1", weekday: 3 } as unknown as PlanRecipeRow));
});

describe("OfferDishesCard", () => {
  it("explains why the dishes are suggested, with the deal line and a link to the filter", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Rätter med erbjudanden" })).toBeInTheDocument();
    expect(screen.getByText("Förslag för att varorna är på erbjudande den här veckan.")).toBeInTheDocument();
    const rows = screen.getAllByTestId("offer-dish");
    expect(within(rows[0]).getByTestId("plan-option-deal")).toHaveTextContent("Falukorv och grädde på erbjudande · −21 kr");
    expect(screen.getByRole("link", { name: "Visa alla" })).toHaveAttribute("href", "/recept?filter=erbjudanden");
  });

  it("shows the ideas under the dishes", () => {
    renderCard();
    expect(screen.getByTestId("offer-ideas")).toBeInTheDocument();
  });

  it("without dishes shows the card with the ideas and no list or Visa alla", () => {
    renderCard({}, []);
    expect(screen.getByRole("heading", { name: "Rätter med erbjudanden" })).toBeInTheDocument();
    expect(screen.getByTestId("offer-ideas")).toBeInTheDocument();
    expect(screen.queryByTestId("offer-dish")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Visa alla" })).not.toBeInTheDocument();
  });

  it("has no week buttons and no line about which week the menu is for (UX-04)", () => {
    renderCard();
    expect(screen.queryByTestId("offer-week-option")).not.toBeInTheDocument();
    expect(screen.queryByText(/Matsedel för vecka/)).not.toBeInTheDocument();
  });

  it("adds a dish to the remembered week on +, names the week in the toast, then shows its day", async () => {
    const user = userEvent.setup();
    addToWeek.mockResolvedValue(ok({ id: "d1", weekday: 1 } as unknown as PlanRecipeRow));
    renderCard();
    await user.click(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" }));
    expect(addToWeek).toHaveBeenCalledWith(expect.objectContaining({ recipeId: "r1", weekStart: "2026-11-09", servings: 4 }));
    expect((await screen.findAllByText("Korvstroganoff på måndag nästa vecka. Falukorv och grädde står på inköpslistan.")).length).toBeGreaterThan(0);
    expect(within(screen.getAllByTestId("offer-dish")[0]).getByTestId("on-week")).toHaveTextContent("Mån");
    expect(refresh).toHaveBeenCalled();
  });

  it("adds to this week when nothing else is remembered", async () => {
    const user = userEvent.setup();
    renderCard({}, [korv, lax], {}, "");
    await user.click(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" }));
    expect(addToWeek).toHaveBeenLastCalledWith(expect.objectContaining({ weekStart: "2026-11-02" }));
    expect((await screen.findAllByText("Korvstroganoff på onsdag. Falukorv och grädde står på inköpslistan.")).length).toBeGreaterThan(0);
  });

  it("shows the day on the remembered week only", () => {
    renderCard({ r2: 5 }, [korv, lax], { r1: 2 });
    const rows = screen.getAllByTestId("offer-dish");
    // Next week is remembered: Korvstroganoff is on Tue, Laxpasta is not on it.
    expect(within(rows[0]).getByTestId("on-week")).toHaveTextContent("Tis");
    expect(within(rows[1]).queryByTestId("on-week")).not.toBeInTheDocument();
  });

  it("keeps the old add test: adds to the week on +", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" }));
    expect(within(screen.getAllByTestId("offer-dish")[0]).getByTestId("on-week")).toHaveTextContent("Ons");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the day instead of + for a dish already on the week", () => {
    renderCard({}, [korv, lax], { r2: 5 });
    const rows = screen.getAllByTestId("offer-dish");
    expect(within(rows[1]).getByTestId("on-week")).toHaveTextContent("Fre");
    expect(within(rows[1]).queryByRole("button")).not.toBeInTheDocument();
  });
});
