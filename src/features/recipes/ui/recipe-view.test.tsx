import { act, render as renderElement, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { recipeStatus, toSnapshot, type PantrySnapshot } from "@/features/pantry";
import { fail, ok, type Result } from "@/lib/errors";
import type { FavoriteChange } from "../domain/recipe-list";
import type { SavedRecipe, SavedRecipeLine } from "../domain/saved-recipe";
import type { AddToPlan, RecipeWeek } from "./recipe-body";
import { lineCoverage } from "./ingredient-row";
import { RecipeView } from "./recipe-view";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const setFavorite = vi.fn<(change: FavoriteChange) => Promise<Result<FavoriteChange>>>();
vi.mock("../actions/set-favorite", () => ({ setFavorite: (change: FavoriteChange) => setFavorite(change) }));

const render = (element: ReactElement) => renderElement(<ToastProvider>{element}</ToastProvider>);

beforeAll(() => {
  // FixedAction measures itself; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

let lineId = 0;
const line = (overrides: Partial<SavedRecipeLine> & Pick<SavedRecipeLine, "originalText">): SavedRecipeLine => ({
  id: `line-${lineId}`,
  position: lineId++,
  amount: null,
  unit: null,
  isVague: true,
  ingredientId: null,
  ingredientName: null,
  stepId: null,
  ...overrides,
});

const recipe: SavedRecipe = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Krämig kycklinggryta",
  servings: 4,
  totalMinutes: 35,
  imageUrl: null,
  sourceKind: "url",
  sourceUrl: "https://www.koket.se/kramig-kycklinggryta",
  isFavorite: false,
  updatedAt: "2026-10-26T10:00:00.123456+00:00",
  steps: [
    { id: "step-0", position: 0, text: "Skär kycklingen i bitar." },
    { id: "step-1", position: 1, text: "Låt puttra i 20 minuter." },
  ],
  lines: [
    line({
      originalText: "600 g kycklinglårfilé",
      amount: 600,
      unit: "g",
      isVague: false,
      ingredientId: "22222222-2222-4222-8222-222222222222",
      ingredientName: "Kycklinglårfilé",
    }),
    // Pontus swapped the ingredient: the original text says more than the name.
    line({
      originalText: "1 lök, finhackad",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredientId: "33333333-3333-4333-8333-333333333333",
      ingredientName: "Rödlök",
    }),
    // An amount but no catalog ingredient.
    line({ originalText: "2 nävar spenat", amount: 2, isVague: false }),
    line({
      originalText: "salt och peppar",
      ingredientId: "44444444-4444-4444-8444-444444444444",
      ingredientName: "Salt",
    }),
  ],
};

const rows = () => screen.getAllByTestId("recipe-view-line");

const [kyckling, rodlok, , salt] = recipe.lines.map((line) => line.ingredientId ?? "");
/** Everything at home for the recipe's own servings, for the tests that are not about the status. */
const allHome = toSnapshot([
  { ingredientId: kyckling, amount: 600, unit: "g" },
  { ingredientId: rodlok, amount: 2, unit: "st" },
  { ingredientId: salt, amount: null, unit: null },
]);
const stepper = {
  value: () => screen.getByText(/^\d+ portion(er)?$/),
  fewer: () => screen.getByRole("button", { name: "Färre portioner" }),
  more: () => screen.getByRole("button", { name: "Fler portioner" }),
};
const marks = () => rows().map((row) => within(row).queryByRole("img")?.getAttribute("aria-label") ?? null);
const atHome = () => screen.queryByTestId("recipe-at-home");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecipeView", () => {
  it("shows the title, the time alone on the meta line, the servings in the portion selector and the source as a link", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    expect(screen.getByRole("heading", { level: 1, name: "Krämig kycklinggryta" })).toBeInTheDocument();
    expect(screen.getByTestId("recipe-meta")).toHaveTextContent(/^35 min · koket\.se ↗/);
    expect(stepper.value()).toHaveTextContent("4 portioner");
    expect(screen.getByRole("link", { name: /^koket\.se/ })).toHaveAttribute("href", recipe.sourceUrl);
  });

  it("shows a thumbnail tile with the dish emoji on mint, and the line for a recipe saved from the offers", () => {
    render(<RecipeView recipe={{ ...recipe, offerNames: ["Falukorv", "Grädde"] }} snapshot={allHome} />);
    expect(screen.getByTestId("recipe-illustration")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-image-placeholder")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-offers")).toHaveTextContent("Sparad från veckans erbjudanden: Falukorv, Grädde");
  });

  it("has a visible Recept link with an arrow, at every width (Story 11.6)", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    const back = screen.getByRole("link", { name: "Recept" });
    expect(back).toHaveAttribute("href", "/recept");
    expect(back.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(back).toHaveClass("min-h-tap");
    expect(back.className).not.toMatch(/\bhidden\b/);
  });

  it("says portion for one and has no meta line without a time", () => {
    render(<RecipeView recipe={{ ...recipe, servings: 1, totalMinutes: 0 }} snapshot={allHome} />);
    expect(stepper.value()).toHaveTextContent(/^1 portion$/);
    expect(screen.getByTestId("recipe-meta")).not.toHaveTextContent(/min/);
  });

  it("shows amounts, and the original text where the name does not say it all", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    expect(rows()).toHaveLength(4);
    expect(rows()[0]).toHaveTextContent(/^Kycklinglårfilé600 g$/);
    expect(within(rows()[1]).getByText("Rödlök")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("1 lök, finhackad")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("1 st")).toBeInTheDocument();
    // No ingredient: the original text, without a separate amount or factor.
    expect(rows()[2]).toHaveTextContent(/^2 nävar spenat$/);
    // Vague: the original text.
    expect(rows()[3]).toHaveTextContent(/^salt och peppar$/);
  });

  it("has no group headings or step headings for a recipe without them", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    expect(screen.getAllByTestId("recipe-line-group")).toHaveLength(1);
    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([]);
  });

  it("lists the lines under their group's heading, scaled, and the steps with their headings (the Linas Matkasse format)", async () => {
    const user = userEvent.setup();
    const grouped: SavedRecipe = {
      ...recipe,
      steps: [{ ...recipe.steps[0], title: "Kyckling" }, recipe.steps[1]],
      lines: [
        { ...recipe.lines[0], group: "Kyckling" },
        { ...recipe.lines[1], group: "Gryta" },
        { ...recipe.lines[2], group: "Kyckling" },
        { ...recipe.lines[3], group: "Gryta", isStapleMarked: true },
      ],
    };
    render(<RecipeView recipe={grouped} snapshot={allHome} />);
    const groups = screen.getAllByTestId("recipe-line-group");
    expect(groups.map((group) => within(group).getByRole("heading", { level: 3 }).textContent)).toEqual(["Kyckling", "Gryta"]);
    expect(within(groups[0]).getByRole("heading", { level: 3 })).toHaveClass("text-section-label");
    expect(within(groups[0]).getAllByTestId("recipe-view-line").map((row) => row.textContent)).toEqual([
      "Kycklinglårfilé600 g",
      "2 nävar spenat",
    ]);
    expect(within(groups[1]).getAllByTestId("recipe-view-line")).toHaveLength(2);
    const stepTitles = screen.getAllByTestId("recipe-step-title");
    expect(stepTitles.map((title) => title.textContent)).toEqual(["Kyckling"]);
    expect(stepTitles[0]).toHaveClass("text-headline");
    await user.click(stepper.more());
    expect(within(groups[0]).getAllByTestId("recipe-view-line")[0]).toHaveTextContent(/^Kycklinglårfilé750 g/);
  });

  it("says Kan lagas nu and X av Y hemma, and ticks every line when everything is at home; a line without ingredient is neutral", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    expect(atHome()).toHaveClass("bg-mint", "text-mint-ink");
    // Chicken, red onion and salt: the spinach has no catalog ingredient.
    expect(atHome()).toHaveTextContent(/^3 av 3 hemma$/);
    expect(screen.queryByText(/Saknar/)).not.toBeInTheDocument();
    expect(marks()).toEqual(["finns hemma", "finns hemma", "jämförs inte med matvarorna", "finns hemma"]);
    expect(within(rows()[0]).getByText("600 g")).toHaveClass("text-ink-2");
  });

  it("says Saknar N varor, rings what is short, and shows what is at home in another unit", () => {
    // Chicken only in kg, no onion, and no salt: the vague salt is ringed but not counted in N.
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([{ ingredientId: kyckling, amount: 1, unit: "kg" }])} />);
    // The old status box ("Saknar 2 varor", "+N st till") is gone: the rows say it (Story 25.1).
    expect(screen.queryByText(/^Saknar/)).not.toBeInTheDocument();
    expect(within(rows()[0]).getByRole("img", { name: "saknas" })).toHaveClass("text-sky-ink");
    expect(within(rows()[1]).getByRole("img", { name: "saknas" })).toBeInTheDocument();
    expect(within(rows()[3]).getByRole("img", { name: "saknas" })).toBeInTheDocument();
    // The salt is not at home either, so none of the three is.
    expect(atHome()).toHaveTextContent(/^0 av 3 hemma$/);
    // The vague salt is ringed too, though it never counts in the buy list.
    expect(marks()).toEqual(["saknas", "saknas", "jämförs inte med matvarorna", "saknas"]);
    expect(within(rows()[0]).getByText("600 g")).toHaveClass("text-sky-ink");
    expect(within(rows()[0]).getByText("hemma: 1 kg")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("1 st")).toHaveClass("text-sky-ink");
    expect(within(rows()[1]).queryByText(/^hemma:/)).not.toBeInTheDocument();
  });

  it("says Saknas on the one missing row only, and nothing on the rows at home", () => {
    render(
      <RecipeView
        recipe={recipe}
        snapshot={toSnapshot([
          { ingredientId: kyckling, amount: 600, unit: "g" },
          { ingredientId: salt, amount: null, unit: null },
        ])}
      />,
    );
    expect(screen.getAllByRole("img", { name: "saknas" })).toHaveLength(1);
    expect(within(rows()[1]).getByRole("img", { name: "saknas" })).toBeInTheDocument();
    expect(atHome()).toHaveTextContent(/^2 av 3 hemma$/);
  });

  it("shows the offer on a missing row with the saving in kronor, or in percent when kronor cannot be counted", () => {
    const offers = {
      [kyckling]: { store: "ICA Maxi", price: "99 kr/st", savingKr: 12, savingPercent: null },
      [rodlok]: { store: "Coop", price: null, savingKr: null, savingPercent: 20 },
    };
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} offers={offers} />);
    expect(within(rows()[0]).getByTestId("recipe-line-offer")).toHaveTextContent("Erbjudande ICA Maxi · 99 kr/st, spara 12 kr");
    expect(within(rows()[1]).getByTestId("recipe-line-offer")).toHaveTextContent("Erbjudande Coop, spara 20 %");
    expect(screen.getByTestId("recipe-on-offer")).toHaveTextContent("2 på erbjudande · spara 12 kr");
  });

  it("has no offer on a row that is at home", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} offers={{ [kyckling]: { store: "ICA", price: null, savingKr: 5, savingPercent: null } }} />);
    expect(screen.queryByTestId("recipe-line-offer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recipe-on-offer")).not.toBeInTheDocument();
  });

  it("says På listan on rows whose ingredient is on the list, and counts them in a chip", () => {
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} listedIds={[kyckling]} />);
    expect(within(rows()[0]).getByText("På listan")).toBeInTheDocument();
    expect(within(rows()[0]).getByRole("img")).toHaveAccessibleName("på inköpslistan");
    expect(within(rows()[1]).getByRole("img", { name: "saknas" })).toBeInTheDocument();
    expect(screen.getByTestId("recipe-listed")).toHaveTextContent("1 på inköpslistan");
  });

  it("shows everything at home beside a line with too little: every unit of the ingredient", () => {
    const cream = line({
      originalText: "3 dl matlagningsgrädde",
      amount: 3,
      unit: "dl",
      isVague: false,
      ingredientId: "55555555-5555-4555-8555-555555555555",
      ingredientName: "Matlagningsgrädde",
    });
    const snapshot = toSnapshot([
      { ingredientId: cream.ingredientId!, amount: 2, unit: "dl" },
      { ingredientId: cream.ingredientId!, amount: 1, unit: "l" },
    ]);
    render(<RecipeView recipe={{ ...recipe, lines: [cream] }} snapshot={snapshot} />);
    expect(within(rows()[0]).getByRole("img")).toHaveAccessibleName("saknas");
    expect(within(rows()[0]).getByText("3 dl")).toHaveClass("text-sky-ink");
    expect(within(rows()[0]).getByText("hemma: 2 dl, 1 l")).toBeInTheDocument();
  });

  it("shows the amount, its colour and what is at home for a line whose ingredient has no name", () => {
    const nameless = line({
      originalText: "2 dl vetemjöl",
      amount: 2,
      unit: "dl",
      isVague: false,
      ingredientId: "66666666-6666-4666-8666-666666666666",
      ingredientName: null,
    });
    const snapshot = toSnapshot([{ ingredientId: nameless.ingredientId!, amount: 1, unit: "kg" }]);
    render(<RecipeView recipe={{ ...recipe, lines: [nameless] }} snapshot={snapshot} />);
    expect(within(rows()[0]).getByText("2 dl vetemjöl")).toBeInTheDocument();
    expect(within(rows()[0]).getByText("2 dl")).toHaveClass("text-sky-ink");
    expect(within(rows()[0]).getByText("hemma: 1 kg")).toBeInTheDocument();
  });

  it("says Kan lagas nu without X av Y hemma when no line has a catalog ingredient", () => {
    const unlinked = [line({ originalText: "2 citroner", amount: 2, isVague: false }), line({ originalText: "lite vatten" })];
    render(<RecipeView recipe={{ ...recipe, lines: unlinked }} snapshot={allHome} />);
    expect(atHome()).not.toBeInTheDocument();
    expect(marks()).toEqual(["jämförs inte med matvarorna", "jämförs inte med matvarorna"]);
  });

  it("shows the recipe without badge, marks or X av Y hemma when the pantry could not be read, and still scales it", async () => {
    const user = userEvent.setup();
    render(<RecipeView recipe={recipe} snapshot={null} />);
    expect(screen.queryByTestId("recipe-chips")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "saknas" })).not.toBeInTheDocument();
    expect(atHome()).not.toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(rows()).toHaveLength(4);
    expect(within(rows()[0]).getByText("600 g")).toHaveClass("text-ink-2");

    await user.click(stepper.more());
    await user.click(stepper.more());
    expect(stepper.value()).toHaveTextContent("6 portioner");
    expect(within(rows()[0]).getByText("900 g")).toHaveClass("text-ink-2");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("names the boende in the at-home text itself, \"X av Y hemma i Stugan\" (Story 19.2), with no line of its own", () => {
    const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };
    render(<RecipeView recipe={recipe} snapshot={allHome} site={stugan} />);
    expect(atHome()).toHaveTextContent(/ hemma i Stugan$/);
    expect(screen.queryByText(/^Boende:/)).not.toBeInTheDocument();
  });

  it("names no boende with one place, or without a status", () => {
    const hemma = { id: "55555555-5555-4555-8555-555555555555", name: "Hemma", siteCount: 1 };
    const { unmount } = render(<RecipeView recipe={recipe} snapshot={allHome} site={hemma} />);
    expect(atHome()).not.toHaveTextContent(/ i Hemma/);
    unmount();
    render(<RecipeView recipe={recipe} snapshot={null} site={{ ...hemma, name: "Stugan", siteCount: 2 }} />);
    expect(screen.queryByText(/Stugan/)).not.toBeInTheDocument();
  });

  it("numbers the steps", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    const steps = within(screen.getByRole("region", { name: "Steg" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(["1Skär kycklingen i bitar.", "2Låt puttra i 20 minuter."]);
  });

  it("has the heart beside the title; a tap shows it at once, and a failed save puts it back", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<FavoriteChange>) => void = () => {};
    setFavorite.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    await user.click(screen.getByRole("button", { name: "Favorit", pressed: false }));
    expect(setFavorite).toHaveBeenCalledWith({ id: recipe.id, isFavorite: true });
    expect(screen.getByRole("button", { name: "Favorit", pressed: true })).toBeInTheDocument();
    await act(async () => answer(fail("recipe_favorite_failed")));
    expect(screen.getByRole("button", { name: "Favorit", pressed: false })).toBeInTheDocument();
    expect(screen.getByTestId("toast")).toHaveTextContent("Det gick inte att spara favoriten.");
  });
});

describe("RecipeView: the portion selector", () => {
  it("scales the amounts at once with + and −, without rounding to whole pieces", async () => {
    const user = userEvent.setup();
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    await user.click(stepper.more());
    await user.click(stepper.more());
    expect(stepper.value()).toHaveTextContent("6 portioner");
    expect(within(rows()[0]).getByText("900 g")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("1,5 st")).toBeInTheDocument();

    for (let i = 0; i < 5; i++) await user.click(stepper.fewer());
    expect(stepper.value()).toHaveTextContent(/^1 portion$/);
    expect(within(rows()[0]).getByText("150 g")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("0,25 st")).toBeInTheDocument();
  });

  it("never scales a vague line or the text of a line without ingredient, which shows the factor instead", async () => {
    const user = userEvent.setup();
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    for (let i = 0; i < 4; i++) await user.click(stepper.more());
    expect(stepper.value()).toHaveTextContent("8 portioner");
    expect(rows()[2]).toHaveTextContent(/^2 nävar spenat×2$/);
    expect(within(rows()[2]).getByRole("img")).toHaveAccessibleName("jämförs inte med matvarorna");
    expect(rows()[3]).toHaveTextContent(/^salt och peppar$/);

    await user.click(stepper.fewer());
    expect(within(rows()[2]).getByText("×1,75")).toBeInTheDocument();
  });

  it("stops at 1: − is aria-disabled there and the value stays", async () => {
    const user = userEvent.setup();
    render(<RecipeView recipe={{ ...recipe, servings: 1 }} snapshot={allHome} />);
    expect(stepper.fewer()).toHaveAttribute("aria-disabled", "true");
    await user.click(stepper.fewer());
    expect(stepper.value()).toHaveTextContent(/^1 portion$/);
    expect(within(rows()[0]).getByText("600 g")).toBeInTheDocument();
  });

  it("stops at 1000, and starts a recipe for more at 1000, scaled", () => {
    const { unmount } = render(<RecipeView recipe={{ ...recipe, servings: 1000 }} snapshot={allHome} />);
    expect(stepper.value()).toHaveTextContent("1000 portioner");
    expect(stepper.more()).toHaveAttribute("aria-disabled", "true");
    unmount();
    render(<RecipeView recipe={{ ...recipe, servings: 1200 }} snapshot={allHome} />);
    expect(stepper.value()).toHaveTextContent("1000 portioner");
    expect(stepper.more()).toHaveAttribute("aria-disabled", "true");
    expect(within(rows()[0]).getByText("500 g")).toBeInTheDocument();
    expect(within(rows()[2]).getByText("×0,83")).toBeInTheDocument();
  });

  it("never rings a line whose amount reads the same as what is at home", async () => {
    const user = userEvent.setup();
    const cream = line({
      originalText: "1 dl grädde",
      amount: 1,
      unit: "dl",
      isVague: false,
      ingredientId: "88888888-8888-4888-8888-888888888888",
      ingredientName: "Grädde",
    });
    const snapshot = toSnapshot([{ ingredientId: cream.ingredientId!, amount: 3.33, unit: "dl" }]);
    render(<RecipeView recipe={{ ...recipe, servings: 3, lines: [cream] }} snapshot={snapshot} />);
    for (let i = 0; i < 7; i++) await user.click(stepper.more());
    expect(stepper.value()).toHaveTextContent("10 portioner");
    // 3,333… dl needed reads 3,33 dl, as much as is at home.
    expect(within(rows()[0]).getByText("3,33 dl")).toHaveClass("text-ink-2");
    expect(within(rows()[0]).getByRole("img")).toHaveAccessibleName("finns hemma");
    expect(screen.queryByRole("img", { name: "saknas" })).not.toBeInTheDocument();

    await user.click(stepper.more());
    expect(within(rows()[0]).getByText("3,67 dl")).toHaveClass("text-sky-ink");
    expect(within(rows()[0]).getByText("hemma: 3,33 dl")).toBeInTheDocument();
  });

  it("announces the chips together when they change", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} />);
    const live = screen.getByTestId("recipe-chips");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(atHome()?.parentElement).toBe(live);
  });

  it("follows the servings with the badge, X, the ring, the colour and what is at home", async () => {
    const user = userEvent.setup();
    const cream = line({
      originalText: "2 dl grädde",
      amount: 2,
      unit: "dl",
      isVague: false,
      ingredientId: "77777777-7777-4777-8777-777777777777",
      ingredientName: "Grädde",
    });
    const withCream = { ...recipe, lines: [...recipe.lines, cream] };
    const snapshot: PantrySnapshot = toSnapshot([
      { ingredientId: kyckling, amount: 6, unit: "kg" },
      { ingredientId: rodlok, amount: 10, unit: "st" },
      { ingredientId: salt, amount: null, unit: null },
      { ingredientId: cream.ingredientId!, amount: 4, unit: "dl" },
    ]);
    render(<RecipeView recipe={withCream} snapshot={snapshot} />);
    const creamRow = () => rows()[4];
    // Chicken is at home only in kg: one short at the recipe's own servings.
    expect(within(rows()[0]).getByRole("img", { name: "saknas" })).toBeInTheDocument();
    expect(atHome()).toHaveTextContent(/^3 av 4 hemma$/);

    // 8 portions need exactly the 4 dl at home.
    for (let i = 0; i < 4; i++) await user.click(stepper.more());
    expect(within(creamRow()).getByRole("img")).toHaveAccessibleName("finns hemma");
    expect(within(creamRow()).getByText("4 dl")).toHaveClass("text-ink-2");

    // 10 portions need 5 dl: the line is short.
    await user.click(stepper.more());
    await user.click(stepper.more());
    expect(stepper.value()).toHaveTextContent("10 portioner");
    expect(within(creamRow()).getByRole("img")).toHaveAccessibleName("saknas");
    expect(within(creamRow()).getByText("5 dl")).toHaveClass("text-sky-ink");
    expect(within(creamRow()).getByText("hemma: 4 dl")).toBeInTheDocument();
    expect(within(rows()[0]).getByRole("img", { name: "saknas" })).toBeInTheDocument();
    expect(within(creamRow()).getByRole("img", { name: "saknas" })).toBeInTheDocument();
    expect(atHome()).toHaveTextContent(/^2 av 4 hemma$/);

    await user.click(stepper.fewer());
    await user.click(stepper.fewer());
    expect(within(creamRow()).getByRole("img")).toHaveAccessibleName("finns hemma");
    expect(atHome()).toHaveTextContent(/^3 av 4 hemma$/);
  });

  it("starts again from the recipe's servings when the recipe changes, and keeps the choice when only the pantry does", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RecipeView recipe={recipe} snapshot={allHome} />);
    await user.click(stepper.more());
    expect(stepper.value()).toHaveTextContent("5 portioner");

    rerender(
      <ToastProvider>
        <RecipeView recipe={recipe} snapshot={toSnapshot([])} />
      </ToastProvider>,
    );
    expect(stepper.value()).toHaveTextContent("5 portioner");
    expect(within(rows()[1]).getByRole("img", { name: "saknas" })).toBeInTheDocument();

    rerender(
      <ToastProvider>
        <RecipeView recipe={{ ...recipe, servings: 2, updatedAt: "2026-10-26T11:00:00.654321+00:00" }} snapshot={toSnapshot([])} />
      </ToastProvider>,
    );
    expect(stepper.value()).toHaveTextContent("2 portioner");
    expect(within(rows()[0]).getByText("600 g")).toBeInTheDocument();
  });

  it("starts again when a line's amount changes, though the servings do not", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RecipeView recipe={recipe} snapshot={allHome} />);
    await user.click(stepper.more());
    const [chicken, ...rest] = recipe.lines;
    rerender(
      <ToastProvider>
        <RecipeView recipe={{ ...recipe, lines: [{ ...chicken, amount: 800 }, ...rest] }} snapshot={allHome} />
      </ToastProvider>,
    );
    expect(stepper.value()).toHaveTextContent("4 portioner");
    expect(within(rows()[0]).getByText("800 g")).toBeInTheDocument();
  });

  it("keeps the chosen servings when the heart is tapped, although the recipe gets a new updatedAt", async () => {
    const user = userEvent.setup();
    setFavorite.mockResolvedValueOnce(ok({ id: recipe.id, isFavorite: true }));
    const { rerender } = render(<RecipeView recipe={recipe} snapshot={allHome} />);
    await user.click(stepper.more());
    await user.click(stepper.more());
    await user.click(screen.getByRole("button", { name: "Favorit", pressed: false }));
    await vi.waitFor(() => expect(setFavorite).toHaveBeenCalledWith({ id: recipe.id, isFavorite: true }));
    // The save bumps updated_at, and the server's next render brings the recipe again.
    rerender(
      <ToastProvider>
        <RecipeView
          recipe={{ ...recipe, isFavorite: true, updatedAt: "2026-10-26T12:00:00.000001+00:00" }}
          snapshot={allHome}
        />
      </ToastProvider>,
    );
    expect(await screen.findByRole("button", { name: "Favorit", pressed: true })).toBeInTheDocument();
    expect(stepper.value()).toHaveTextContent("6 portioner");
    expect(within(rows()[0]).getByText("900 g")).toBeInTheDocument();
  });

  it("calls nothing on the server for − and +", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>();
    render(<RecipeView recipe={recipe} snapshot={allHome} addToPlan={addToPlan} />);
    await user.click(stepper.more());
    await user.click(stepper.fewer());
    await user.click(stepper.fewer());
    expect(addToPlan).not.toHaveBeenCalled();
    expect(setFavorite).not.toHaveBeenCalled();
  });

  it("puts the recipe on the first free day with the servings shown, with one tap", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish", weekday: 4 }));
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} addToPlan={addToPlan} setWeekday={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Krämig kycklinggryta ligger på torsdag. Kycklinglårfilé och rödlök står på inköpslistan.");
    // Only the pinned button says Byt dag (UX-12); the toast does not repeat it.
    expect(screen.getAllByRole("button", { name: "Byt dag" })).toHaveLength(1);
    expect(addToPlan).toHaveBeenLastCalledWith({ recipeId: recipe.id, servings: 4, id: expect.any(String) });
    expect(screen.getByTestId("recipe-planned")).toHaveTextContent("På matsedeln på torsdag");
  });

  it("says the week is full when the dish got no day, and offers Välj dag", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish", weekday: null }));
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} addToPlan={addToPlan} setWeekday={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("ligger på veckan. Alla dagar har en rätt. Kycklinglårfilé och rödlök står på inköpslistan.");
    expect(addToPlan).toHaveBeenLastCalledWith({ recipeId: recipe.id, servings: 4, id: expect.any(String) });
    // The rows flip to På listan and the button asks for the day, which is optional.
    expect(screen.getAllByText("På listan")).toHaveLength(2);
    expect(screen.getByTestId("recipe-planned")).toHaveTextContent("På matsedeln denna vecka");
    expect(screen.getAllByRole("button", { name: "Välj dag" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Köp det som saknas/ })).not.toBeInTheDocument();
  });

  it("sends the servings shown when the recipe is put on the week", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish", weekday: 2 }));
    render(<RecipeView recipe={recipe} snapshot={allHome} addToPlan={addToPlan} />);
    await user.click(stepper.more());
    await user.click(stepper.more());
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    await vi.waitFor(() => expect(addToPlan).toHaveBeenCalledTimes(1));
    expect(addToPlan).toHaveBeenLastCalledWith({ recipeId: recipe.id, servings: 6, id: expect.any(String) });
    expect(await screen.findByTestId("toast")).toHaveTextContent("ligger på tisdag. Kycklinglårfilé står på inköpslistan.");
  });

  it("shows a failed add as an alert and keeps the button", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(fail("mealplan_add_failed"));
    render(<RecipeView recipe={recipe} snapshot={allHome} addToPlan={addToPlan} />);
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg på matsedeln" })).toBeInTheDocument();
  });

  it("asks for a day only when asked: Byt dag with a day, and Ingen dag takes it back", async () => {
    const user = userEvent.setup();
    const setWeekday = vi.fn().mockResolvedValue(ok({ id: "dish", weekday: 3 }));
    render(
      <RecipeView recipe={recipe} snapshot={allHome} addToPlan={vi.fn<AddToPlan>()} setWeekday={setWeekday} dish={{ id: "dish", weekday: null }} />,
    );
    expect(screen.getByTestId("recipe-planned")).toHaveTextContent("På matsedeln denna vecka");
    await user.click(screen.getByRole("button", { name: "Välj dag" }));
    await user.click(screen.getByRole("button", { name: "Onsdag" }));
    expect(setWeekday).toHaveBeenCalledWith({ id: "dish", weekday: 3 });
    expect(await screen.findByRole("button", { name: "Byt dag" })).toBeInTheDocument();
    expect(screen.getByTestId("recipe-planned")).toHaveTextContent("På matsedeln på onsdag");
    await user.click(screen.getByRole("button", { name: "Byt dag" }));
    await user.click(screen.getByRole("button", { name: "Ingen dag" }));
    expect(setWeekday).toHaveBeenLastCalledWith({ id: "dish", weekday: null });
  });

  describe("the week picker", () => {
    const weeks: RecipeWeek[] = [
      { weekStart: "2026-11-02", offset: 0, number: 45, dish: null },
      { weekStart: "2026-11-09", offset: 1, number: 46, dish: null },
      { weekStart: "2026-11-16", offset: 2, number: 47, dish: null },
    ];
    const options = () => screen.getAllByTestId("recipe-week-option");

    it("starts on next week and plans that week with one tap", async () => {
      const user = userEvent.setup();
      const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish", weekday: 1 }));
      render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} addToPlan={addToPlan} setWeekday={vi.fn()} weeks={weeks} />);
      expect(options().map((option) => option.textContent)).toEqual(["Denna vecka", "Nästa vecka", "Om 2 veckor"]);
      expect(options()[1]).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("recipe-week-line")).toHaveTextContent("Matsedel för vecka 46");

      await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
      expect(addToPlan).toHaveBeenLastCalledWith({ recipeId: recipe.id, servings: 4, id: expect.any(String), weekStart: "2026-11-09" });
      expect(await screen.findByTestId("toast")).toHaveTextContent(
        "Krämig kycklinggryta ligger på måndag nästa vecka. Kycklinglårfilé och rödlök står på inköpslistan.",
      );
      expect(screen.getByTestId("recipe-planned")).toHaveTextContent("På matsedeln på måndag nästa vecka");
    });

    it("plans the picked week, with the sheet naming it, and keeps a week's state apart from the others", async () => {
      const user = userEvent.setup();
      const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish", weekday: 2 }));
      const setWeekday = vi.fn().mockResolvedValue(ok({ id: "dish", weekday: 5 }));
      render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} addToPlan={addToPlan} setWeekday={setWeekday} weeks={weeks} />);
      await user.click(options()[2]);
      expect(screen.getByTestId("recipe-week-line")).toHaveTextContent("Matsedel för vecka 47");
      await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
      expect(addToPlan).toHaveBeenLastCalledWith(expect.objectContaining({ weekStart: "2026-11-16" }));
      expect(await screen.findByTestId("toast")).toHaveTextContent("ligger på tisdag om 2 veckor.");

      await user.click(screen.getByRole("button", { name: "Byt dag" }));
      expect(screen.getByRole("dialog", { name: "Vilken dag?" })).toHaveTextContent("Vecka 47, om 2 veckor");
      await user.click(screen.getByRole("button", { name: "Fredag" }));
      expect(setWeekday).toHaveBeenCalledWith({ id: expect.any(String), weekday: 5 });

      // Next week is still empty.
      await user.click(options()[1]);
      expect(screen.getByRole("button", { name: "Lägg på matsedeln" })).toBeInTheDocument();
      expect(screen.queryByTestId("recipe-planned")).not.toBeInTheDocument();
    });

    it("shows the day the recipe has on the selected week", async () => {
      const user = userEvent.setup();
      const planned = weeks.map((week) => (week.offset === 1 ? { ...week, dish: { id: "d1", weekday: 4 } } : week));
      render(<RecipeView recipe={recipe} snapshot={allHome} addToPlan={vi.fn<AddToPlan>()} setWeekday={vi.fn()} weeks={planned} />);
      expect(screen.getByRole("button", { name: "Byt dag" })).toBeInTheDocument();
      expect(screen.getByTestId("recipe-planned")).toHaveTextContent("På matsedeln på torsdag nästa vecka");
      await user.click(options()[0]);
      expect(screen.getByRole("button", { name: "Lägg på matsedeln" })).toBeInTheDocument();
    });
  });
});

describe("RecipeView: Köp det som saknas", () => {
  const buyArgs = (ids: string[]) => ({
    items: ids.map((id) => ({ key: `recipe:${recipe.id}:${id}`, label: id === kyckling ? "Kycklinglårfilé" : "Rödlök", ingredientId: id })),
  });

  it("opens a sheet with the missing items ticked and the offer's saving, and adds only those that stay ticked", async () => {
    const user = userEvent.setup();
    const buyMissing = vi.fn().mockResolvedValue(ok({ count: 1 }));
    const offers = { [kyckling]: { store: "ICA Maxi", price: "99 kr/st", savingKr: 12, savingPercent: null } };
    const addToPlan = vi.fn<AddToPlan>();
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} offers={offers} addToPlan={addToPlan} buyMissing={buyMissing} undoBuy={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Köp det som saknas (2)" }));
    const sheet = screen.getByRole("dialog", { name: "Lägg på inköpslistan" });
    expect(within(sheet).getByText("Bara listan. Receptet läggs inte på matsedeln.")).toBeInTheDocument();
    const boxes = within(sheet).getAllByRole("checkbox");
    expect(boxes.map((box) => box.getAttribute("aria-checked"))).toEqual(["true", "true"]);
    expect(within(sheet).getByText("Erbjudande · spara 12 kr")).toBeInTheDocument();
    await user.click(boxes[1]);
    await user.click(within(sheet).getByRole("button", { name: "Lägg 1 vara på listan" }));
    expect(buyMissing).toHaveBeenCalledWith(buyArgs([kyckling]));
    expect(addToPlan).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Köp det som saknas (1)" })).toBeInTheDocument();
  });

  it("flips the rows to På listan and the button to På listan ✓ · Ångra, which removes just those", async () => {
    const user = userEvent.setup();
    const buyMissing = vi.fn().mockResolvedValue(ok({ count: 2 }));
    const undoBuy = vi.fn().mockResolvedValue(ok({ removed: 2 }));
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} buyMissing={buyMissing} undoBuy={undoBuy} addToPlan={vi.fn<AddToPlan>()} />);
    await user.click(screen.getByRole("button", { name: "Köp det som saknas (2)" }));
    await user.click(screen.getByRole("button", { name: "Lägg 2 varor på listan" }));
    expect(await screen.findByRole("button", { name: "På listan ✓ · Ångra" })).toBeInTheDocument();
    expect(screen.getByTestId("toast")).toHaveTextContent("2 varor på inköpslistan.");
    expect(screen.getAllByText("På listan")).toHaveLength(2);
    // Only the vague salt is still ringed; it is never bought.
    expect(screen.getAllByRole("img", { name: "saknas" })).toHaveLength(1);
    expect(screen.getByTestId("recipe-listed")).toHaveTextContent("2 på inköpslistan");

    await user.click(screen.getByRole("button", { name: "På listan ✓ · Ångra" }));
    expect(undoBuy).toHaveBeenCalledWith({ keys: [`recipe:${recipe.id}:${kyckling}`, `recipe:${recipe.id}:${rodlok}`] });
    expect(await screen.findByRole("button", { name: "Köp det som saknas (2)" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "saknas" })).toHaveLength(3);
  });

  it("keeps the sheet and the rows when adding fails, and says so", async () => {
    const user = userEvent.setup();
    const buyMissing = vi.fn().mockResolvedValue(fail("shopping_save_failed"));
    render(<RecipeView recipe={recipe} snapshot={toSnapshot([])} buyMissing={buyMissing} undoBuy={vi.fn()} addToPlan={vi.fn<AddToPlan>()} />);
    await user.click(screen.getByRole("button", { name: "Köp det som saknas (2)" }));
    await user.click(screen.getByRole("button", { name: "Lägg 2 varor på listan" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "saknas" })).toHaveLength(3);
  });

  it("has no buy button when nothing is missing", () => {
    render(<RecipeView recipe={recipe} snapshot={allHome} buyMissing={vi.fn()} undoBuy={vi.fn()} addToPlan={vi.fn<AddToPlan>()} />);
    expect(screen.queryByRole("button", { name: /Köp det som saknas/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg på matsedeln" })).toBeInTheDocument();
  });
});

describe("lineCoverage", () => {
  it("logs a line the status has no coverage for once, and gives it unlinked", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = recipeStatus(recipe, recipe.servings, allHome);
    const rest = Object.fromEntries(Object.entries(status.lines).filter(([id]) => id !== recipe.lines[0].id));
    expect(lineCoverage({ ...status, lines: rest }, recipe.lines[0].id)).toEqual({ kind: "unlinked" });
    expect(lineCoverage({ ...status, lines: rest }, recipe.lines[0].id)).toEqual({ kind: "unlinked" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("recipe_line_status_missing", { lineId: recipe.lines[0].id });
  });
});
