import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { dayOptions } from "@/features/mealplan";
import type { OwnRecipeMatch } from "@/features/suggestions";
import { AiJobActionsContext } from "@/lib/ai-jobs-client";
import { fail, ok } from "@/lib/errors";
import { createFakeAiJobsServer } from "../../../../tests/support/ai-jobs-fake";
import { SuggestionsFromOffers } from "./suggestions-from-offers";

// Story 9.6: the row on Matsedel, the cards from the library first and
// "Lägg på en dag" on a card. Nothing is added without a tap on a day.

const server = createFakeAiJobsServer();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const gryta: OwnRecipeMatch = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Kycklinggryta",
  isFavorite: true,
  imageUrl: null,
  totalMinutes: 35,
  servings: 4,
  onOffer: ["Kycklingfilé"],
  have: 6,
  total: 8,
  toBuy: ["grädde"],
};
const ris: OwnRecipeMatch = { ...gryta, id: "22222222-2222-4222-8222-222222222222", title: "Ugnsris", isFavorite: false, onOffer: [], have: 3, total: 4, toBuy: [] };

const searchIngredients = vi.fn(async () => ok([]));

function renderRow(read = vi.fn(async () => ok([gryta, ris])), addToPlan = vi.fn(async () => ok({}))) {
  render(
    <ToastProvider>
      <AiJobActionsContext.Provider value={server.actions}>
        <SuggestionsFromOffers read={read} addToPlan={addToPlan} searchIngredients={searchIngredients} />
      </AiJobActionsContext.Provider>
    </ToastProvider>,
  );
  return { read, addToPlan };
}

afterEach(() => vi.clearAllMocks());

describe("SuggestionsFromOffers", () => {
  it("reads nothing until the row is opened, then shows the library first with 'X av Y hemma'", async () => {
    const user = userEvent.setup();
    const { read } = renderRow();
    expect(read).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Förslag från erbjudanden och lagret/ }));
    const cards = await screen.findAllByTestId("suggestion-recipe");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("6 av 8 hemma")).toBeInTheDocument();
    expect(within(cards[0]).getByTestId("suggestion-recipe-why")).toHaveTextContent("köp till: grädde");
    expect(within(cards[0]).getByTestId("suggestion-recipe-why")).toHaveTextContent("Erbjudanden:");
    expect(within(cards[1]).getByTestId("suggestion-recipe-why")).not.toHaveTextContent("Erbjudanden:");
    expect(within(cards[0]).getByRole("link", { name: "Öppna Kycklinggryta" })).toHaveAttribute("href", `/recept/${gryta.id}`);
    // The AI part waits for its own button.
    expect(screen.getByRole("button", { name: "Föreslå rätter med AI" })).toBeInTheDocument();
  });

  it("adds the dish to the day picked, and to nothing before that", async () => {
    const user = userEvent.setup();
    const { addToPlan } = renderRow();
    await user.click(screen.getByRole("button", { name: /Förslag från erbjudanden och lagret/ }));
    await user.click(await screen.findByRole("button", { name: "Lägg på en dag: Kycklinggryta" }));
    expect(addToPlan).not.toHaveBeenCalled();
    const days = await screen.findAllByTestId("suggestion-day");
    const options = dayOptions();
    expect(days).toHaveLength(options.length);
    // Pick the last day (next week's Sunday): the week and weekday go along with the dish.
    await user.click(days[days.length - 1]);
    await waitFor(() => expect(addToPlan).toHaveBeenCalledTimes(1));
    expect(addToPlan).toHaveBeenCalledWith({
      recipeId: gryta.id,
      servings: 4,
      id: expect.any(String),
      weekStart: options.at(-1)?.weekStart,
      weekday: 7,
    });
    expect((await screen.findAllByText("Lagt på matsedeln, söndag.")).length).toBeGreaterThan(0);
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the sheet and says so when adding fails", async () => {
    const user = userEvent.setup();
    const { addToPlan } = renderRow(undefined, vi.fn(async () => fail("mealplan_add_failed")));
    await user.click(screen.getByRole("button", { name: /Förslag från erbjudanden och lagret/ }));
    await user.click(await screen.findByRole("button", { name: "Lägg på en dag: Ugnsris" }));
    await user.click((await screen.findAllByTestId("suggestion-day"))[0]);
    await waitFor(() => expect(addToPlan).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("says so when no recipe fits, and keeps the AI button", async () => {
    const user = userEvent.setup();
    renderRow(vi.fn(async () => ok([])));
    await user.click(screen.getByRole("button", { name: /Förslag från erbjudanden och lagret/ }));
    expect(await screen.findByTestId("suggestions-none")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Föreslå rätter med AI" })).toBeInTheDocument();
  });
});
