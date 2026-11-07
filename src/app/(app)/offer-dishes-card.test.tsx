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

const option = (id: string, title: string, deal: string, tags: { name: string; price: string | null }[]): PlanOption => ({
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
  deal: { text: deal, savingKr: 21, savingPercent: 20, tags },
});

const korv = option("r1", "Korvstroganoff", "Falukorv och grädde på erbjudande · −21 kr", [
  { name: "Falukorv", price: "2 för 50 kr" },
  { name: "Grädde", price: "19 kr/st" },
  { name: "Gul lök", price: "10 kr/kg" },
]);
const lax = option("r2", "Laxpasta", "Laxfilé på erbjudande · −12 kr", [{ name: "Laxfilé", price: "129 kr/kg" }]);

const addToWeek = vi.fn();

const weeksWith = (now: Record<string, number | null>, next: Record<string, number | null> = {}): OfferWeek[] => [
  { weekStart: "2026-11-02", offset: 0, number: 45, onWeek: now },
  { weekStart: "2026-11-09", offset: 1, number: 46, onWeek: next },
  { weekStart: "2026-11-16", offset: 2, number: 47, onWeek: {} },
];

function renderCard(onWeek: Record<string, number | null> = {}, dishes: PlanOption[] = [korv, lax], onNextWeek: Record<string, number | null> = {}) {
  return render(
    <ToastProvider>
      <OfferDishesCard dishes={dishes} weeks={weeksWith(onWeek, onNextWeek)} addToWeek={addToWeek} searchIngredients={async () => ok([])} ideas={null} startIdeas={vi.fn()} readIdeas={vi.fn()} tagsByLabel={{}} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  addToWeek.mockReset().mockResolvedValue(ok({ id: "d1", weekday: 3 } as unknown as PlanRecipeRow));
});

describe("OfferDishesCard", () => {
  it("shows each dish with OfferTags (two at most, then +N), no hint line, and a link to the filter", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Rätter med erbjudanden" })).toBeInTheDocument();
    expect(screen.queryByText(/Förslag för att varorna/)).not.toBeInTheDocument();
    const rows = screen.getAllByTestId("offer-dish");
    expect(within(rows[0]).getAllByTestId("offer-tag").map((tag) => tag.textContent)).toEqual(["Falukorv 2 för 50 kr", "Grädde 19 kr/st"]);
    expect(within(rows[0]).getByTestId("offer-tags-more")).toHaveTextContent("+1");
    expect(within(rows[1]).getAllByTestId("offer-tag").map((tag) => tag.textContent)).toEqual(["Laxfilé 129 kr/kg"]);
    expect(within(rows[1]).queryByTestId("offer-tags-more")).not.toBeInTheDocument();
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

  it("preselects next week and says which week the menu is for", () => {
    renderCard();
    const options = screen.getAllByTestId("offer-week-option");
    expect(options.map((option) => option.textContent)).toEqual(["Denna vecka", "Nästa vecka", "Om 2 veckor"]);
    expect(options.map((option) => option.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(screen.getByTestId("offer-week-line")).toHaveTextContent("Matsedel för vecka 46");
  });

  it("adds a dish to next week on +, names the week in the toast, then shows its day", async () => {
    const user = userEvent.setup();
    addToWeek.mockResolvedValue(ok({ id: "d1", weekday: 1 } as unknown as PlanRecipeRow));
    renderCard();
    await user.click(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" }));
    expect(addToWeek).toHaveBeenCalledWith(expect.objectContaining({ recipeId: "r1", weekStart: "2026-11-09", servings: 4 }));
    expect((await screen.findAllByText("Korvstroganoff på måndag nästa vecka. Falukorv och grädde står på inköpslistan.")).length).toBeGreaterThan(0);
    expect(within(screen.getAllByTestId("offer-dish")[0]).getByTestId("on-week")).toHaveTextContent("Mån");
    expect(refresh).toHaveBeenCalled();
  });

  it("adds to this week or in two weeks when picked", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Denna vecka" }));
    expect(screen.getByTestId("offer-week-line")).toHaveTextContent("Matsedel för vecka 45");
    await user.click(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" }));
    expect(addToWeek).toHaveBeenLastCalledWith(expect.objectContaining({ weekStart: "2026-11-02" }));
    expect((await screen.findAllByText("Korvstroganoff på onsdag. Falukorv och grädde står på inköpslistan.")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Om 2 veckor" }));
    // Added on this week, still free on the week after next.
    expect(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lägg Korvstroganoff på veckan" }));
    expect(addToWeek).toHaveBeenLastCalledWith(expect.objectContaining({ weekStart: "2026-11-16" }));
    expect((await screen.findAllByText(/Korvstroganoff på onsdag om 2 veckor\./)).length).toBeGreaterThan(0);
  });

  it("shows the day of the chosen week only", async () => {
    const user = userEvent.setup();
    renderCard({ r2: 5 }, [korv, lax], { r1: 2 });
    const rows = () => screen.getAllByTestId("offer-dish");
    // Next week: Korvstroganoff is on Tue, Laxpasta is not on it.
    expect(within(rows()[0]).getByTestId("on-week")).toHaveTextContent("Tis");
    expect(within(rows()[1]).queryByTestId("on-week")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Denna vecka" }));
    expect(within(rows()[0]).queryByTestId("on-week")).not.toBeInTheDocument();
    expect(within(rows()[1]).getByTestId("on-week")).toHaveTextContent("Fre");
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
