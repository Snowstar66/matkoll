import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { DishSuggestionsState, ShownSuggestion } from "@/features/recipes/ui/use-dish-suggestions";
import { OfferIdeas } from "./offer-ideas";

// "Nya idéer med extrapris": the friend's intro, a why per dish, "+" opens the
// preview. The AI job itself is the hook's (mocked here, as the other UI tests do).

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const state = vi.hoisted(() => ({ current: null as unknown }));
const hookArgs = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/features/recipes/ui/use-dish-suggestions", () => ({
  useDishSuggestions: (...args: unknown[]) => {
    hookArgs.calls.push(args);
    return state.current;
  },
}));
const sheet = vi.hoisted(() => ({ props: [] as { suggestion: { draft: { title: string } } | null }[] }));
vi.mock("@/features/recipes/ui/ai-suggestion-sheet", () => ({
  AiSuggestionSheet: (props: { suggestion: { draft: { title: string } } | null }) => {
    sheet.props.push(props);
    return props.suggestion ? <div role="dialog" aria-label="Spara AI-förslag">{props.suggestion.draft.title}</div> : null;
  },
}));

const idea = (key: number, title: string, why: string, onOffer: string[] = ["Fläskfilé"]): ShownSuggestion =>
  ({
    key,
    recipeId: `recipe-${key}`,
    draft: { title, servings: 4, totalMinutes: 35, imageUrl: null, sourceKind: "ai", sourceUrl: null, steps: [], lines: [] },
    ingredientNames: {},
    why,
    onOffer,
  }) as unknown as ShownSuggestion;

const suggest = vi.fn();
const cancel = vi.fn();
function setState(overrides: Partial<DishSuggestionsState> = {}) {
  state.current = {
    suggestions: [],
    intro: "",
    loading: false,
    waiting: null,
    error: null,
    arrivals: 0,
    suggest,
    cancel,
    remove: vi.fn(),
    ...overrides,
  };
}

function renderIdeas() {
  return render(
    <ToastProvider>
      <OfferIdeas weekStart="2026-11-02" addToWeek={vi.fn()} searchIngredients={async () => ok([])} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  suggest.mockReset();
  cancel.mockReset();
  hookArgs.calls.length = 0;
  sheet.props.length = 0;
  setState();
});

describe("OfferIdeas", () => {
  it("starts with the button Nya idéer med extrapris, a tap target of at least 44 px, and asks for the offers mode", async () => {
    renderIdeas();
    const button = screen.getByRole("button", { name: "Nya idéer med extrapris" });
    expect(button.className).toContain("min-h-tap");
    expect(hookArgs.calls[0][1]).toMatchObject({ mode: "offers" });
    await userEvent.setup().click(button);
    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it("shows the intro and each idea with its why and the extrapris line", () => {
    setState({
      arrivals: 1,
      intro: "Fläskfilé och broccoli är billigt i veckan, och du har ris hemma.",
      suggestions: [idea(1, "Fläskfilé med broccoli", "Fläskfilén är billig och riset finns hemma."), idea(2, "Broccolisoppa", "Soppan går fort.", [])],
    });
    renderIdeas();
    expect(screen.getByTestId("offer-ideas-intro")).toHaveTextContent("Fläskfilé och broccoli är billigt i veckan, och du har ris hemma.");
    const rows = screen.getAllByTestId("ai-option");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByTestId("plan-option-note")).toHaveTextContent("Fläskfilén är billig och riset finns hemma.");
    expect(within(rows[0]).getByTestId("plan-option-deal")).toHaveTextContent("Fläskfilé på extrapris");
    expect(within(rows[0]).getByText("AI-förslag · 35 min")).toBeInTheDocument();
    expect(within(rows[1]).queryByTestId("plan-option-deal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Andra idéer med extrapris" })).toBeInTheDocument();
  });

  it("shows no intro line when the server cleared it", () => {
    setState({ arrivals: 1, suggestions: [idea(1, "Fläskfilé med broccoli", "")] });
    renderIdeas();
    expect(screen.queryByTestId("offer-ideas-intro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-option-note")).not.toBeInTheDocument();
  });

  it("opens the preview with + (a button of at least 44 px) so the idea is saved there, not on the tap", async () => {
    setState({ arrivals: 1, suggestions: [idea(1, "Fläskfilé med broccoli", "Billig.")] });
    renderIdeas();
    const plus = screen.getByRole("button", { name: "Granska och spara: Fläskfilé med broccoli" });
    expect(plus.className).toContain("size-tap");
    await userEvent.setup().click(plus);
    expect(screen.getByRole("dialog", { name: "Spara AI-förslag" })).toHaveTextContent("Fläskfilé med broccoli");
  });

  it("shows at most three ideas", () => {
    setState({ arrivals: 1, suggestions: [1, 2, 3, 4].map((key) => idea(key, `Rätt ${key}`, "")) });
    renderIdeas();
    expect(screen.getAllByTestId("ai-option")).toHaveLength(3);
  });

  it("shows the wait with Avbryt while the job runs, and says why when it failed, with Försök igen", async () => {
    setState({ loading: true });
    const { unmount } = renderIdeas();
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nya idéer med extrapris" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Avbryt" }));
    expect(cancel).toHaveBeenCalled();
    unmount();

    setState({ error: fail("ai_unavailable").error });
    renderIdeas();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(suggest).toHaveBeenCalled();
  });
});
