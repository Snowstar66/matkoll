import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import type { PlanRecipeRow } from "@/features/mealplan";
import type { PlanOption } from "@/features/suggestions";
import { OfferDishesCard } from "./offer-dishes-card";

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
  meta: "",
  deal: { text: deal, savingKr: 21, savingPercent: 20 },
});

const korv = option("r1", "Korvstroganoff", "Falukorv och grädde på extrapris · spara 21 kr");
const lax = option("r2", "Laxpasta", "Laxfilé på extrapris · spara 12 kr");

const addToWeek = vi.fn();

function renderCard(onWeek: Record<string, number | null> = {}, dishes: PlanOption[] = [korv, lax]) {
  return render(
    <ToastProvider>
      <OfferDishesCard dishes={dishes} onWeek={onWeek} weekStart="2026-11-02" addToWeek={addToWeek} searchIngredients={async () => ok([])} />
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
    expect(screen.getByRole("heading", { name: "Rätter med extrapris" })).toBeInTheDocument();
    expect(screen.getByText("Förslag för att varorna har extrapris den här veckan.")).toBeInTheDocument();
    const rows = screen.getAllByTestId("offer-dish");
    expect(within(rows[0]).getByTestId("plan-option-deal")).toHaveTextContent("Falukorv och grädde på extrapris · spara 21 kr");
    expect(screen.getByRole("link", { name: "Visa alla" })).toHaveAttribute("href", "/recept?filter=erbjudanden");
  });

  it("shows the ideas under the dishes", () => {
    renderCard();
    expect(screen.getByTestId("offer-ideas")).toBeInTheDocument();
  });

  it("without dishes shows the card with the ideas and no list or Visa alla", () => {
    renderCard({}, []);
    expect(screen.getByRole("heading", { name: "Rätter med extrapris" })).toBeInTheDocument();
    expect(screen.getByTestId("offer-ideas")).toBeInTheDocument();
    expect(screen.queryByTestId("offer-dish")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Visa alla" })).not.toBeInTheDocument();
  });

  it("adds a dish to the week on +, then shows its day", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" }));
    expect(addToWeek).toHaveBeenCalledWith(expect.objectContaining({ recipeId: "r1", weekStart: "2026-11-02", servings: 4 }));
    expect(within(screen.getAllByTestId("offer-dish")[0]).getByTestId("on-week")).toHaveTextContent("Ons");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the day instead of + for a dish already on the week", () => {
    renderCard({ r2: 5 });
    const rows = screen.getAllByTestId("offer-dish");
    expect(within(rows[1]).getByTestId("on-week")).toHaveTextContent("Fre");
    expect(within(rows[1]).queryByRole("button")).not.toBeInTheDocument();
  });
});
