import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { DishSuggestion } from "@/features/suggestions";
import type { AiCallResult } from "@/lib/ai-client";
import { errorMessages, fail, ok, type ErrorCode, type Result } from "@/lib/errors";
import type { RecipeDraft } from "../domain/recipe-draft";
import { AiSuggestions } from "./ai-suggestions";
import { useDishSuggestions } from "./use-dish-suggestions";

// AI-förslag as the library holds them (useDishSuggestions + AiSuggestions),
// with /api/ai/suggest (postAi) and saveRecipe stubbed: the client rows of
// Story 5.2's matrix.

type Call = { body: unknown; signal: AbortSignal; answer: (result: AiCallResult<unknown>) => void };
let calls: Call[] = [];
vi.mock("@/lib/ai-client", () => ({
  postAi: (path: string, body: unknown, signal: AbortSignal) => {
    if (path !== "/api/ai/suggest") throw new Error(`unexpected ${path}`);
    return new Promise<AiCallResult<unknown>>((resolve) => {
      const call: Call = { body, signal, answer: resolve };
      calls.push(call);
      // Like fetch: an aborted call answers { aborted: true }.
      signal.addEventListener("abort", () => resolve({ ok: false, aborted: true }), { once: true });
    });
  },
}));

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

const saveRecipe = vi.fn<(draft: RecipeDraft, recipeId: string) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/save-recipe", () => ({
  saveRecipe: (draft: RecipeDraft, recipeId: string) => saveRecipe(draft, recipeId),
}));

const searchIngredients = vi.fn(async () => ok([]));

const lokId = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const graddeId = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02";

const hint = (name: string) => ({ name, section: "Övrigt", location: "Skafferi", defaultUnit: "st" });
const matched = (text: string, id: string, name: string): RecipeDraft["lines"][number] => ({
  originalText: text,
  amount: 1,
  unit: "st",
  isVague: false,
  ingredient: { kind: "match", ingredientId: id, confidence: "hint" },
  stepIndexes: [0],
  hint: hint(name),
});
const fresh = (text: string, name: string): RecipeDraft["lines"][number] => ({
  originalText: text,
  amount: 1,
  unit: "st",
  isVague: false,
  ingredient: { kind: "new", proposal: { name, section: "Övrigt", location: "Skafferi", defaultUnit: "st" } },
  stepIndexes: [0],
  hint: hint(name),
});
const draft = (title: string, lines: RecipeDraft["lines"], totalMinutes: number | null = 35): RecipeDraft => ({
  title,
  servings: 4,
  totalMinutes,
  imageUrl: null,
  sourceKind: "ai",
  sourceUrl: null,
  steps: ["Laga maten."],
  lines,
});

const gryta: DishSuggestion = {
  draft: draft("Kycklinggryta", [
    matched("1 gul lök", lokId, "gul lök"),
    fresh("600 g kycklingfilé", "kycklingfilé"),
    matched("2 dl grädde", graddeId, "grädde"),
    fresh("1 förp krossade tomater", "krossade tomater"),
    fresh("4 dl ris", "ris"),
    fresh("1 msk olivolja", "olivolja"),
    // The same ingredient again is named once.
    matched("1 gul lök till", lokId, "gul lök"),
  ]),
  ingredientNames: { [lokId]: "Gul lök", [graddeId]: "Grädde" },
};
const pasta: DishSuggestion = { draft: draft("Krämig pasta", [fresh("400 g pasta", "pasta")], 20), ingredientNames: {} };
const omelett: DishSuggestion = { draft: draft("Ugnsomelett", [fresh("6 ägg", "ägg")], null), ingredientNames: {} };
const three = { suggestions: [gryta, pasta, omelett] };

function Harness() {
  const dishes = useDishSuggestions();
  return <AiSuggestions dishes={dishes} searchIngredients={searchIngredients} />;
}

function renderSuggestions() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

/** The section's own status region (the toast has one too). */
const progress = () => within(screen.getByTestId("ai-suggestions")).getByRole("status");
const suggestButton = () => screen.getByRole("button", { name: "Föreslå rätter med AI" });
const section = () => screen.getByRole("region", { name: "AI-förslag" });
const cards = () => within(section()).getAllByRole("listitem");
const lastCall = () => calls[calls.length - 1];
const answer = async (result: AiCallResult<unknown>) => {
  await act(async () => lastCall().answer(result));
};

/** Asks for suggestions and answers with `result`. */
async function suggestWith(user: ReturnType<typeof userEvent.setup>, result: AiCallResult<unknown> = ok(three)) {
  await user.click(suggestButton());
  await answer(result);
}

beforeEach(() => {
  calls = [];
  refresh.mockReset();
  push.mockReset();
  saveRecipe.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AiSuggestions", () => {
  it("shows nothing without the library's state", () => {
    const { container } = render(<AiSuggestions searchIngredients={searchIngredients} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks /api/ai/suggest with no titles, and shows Letar efter idéer … with Avbryt in the button's place", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    expect(calls).toHaveLength(0);
    const status = progress();
    expect(status).toBeEmptyDOMElement();

    await user.click(suggestButton());
    expect(calls).toHaveLength(1);
    expect(lastCall().body).toEqual({ avoidTitles: [] });
    expect(status).toHaveTextContent("Letar efter idéer …");
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
  });

  it("shows three cards in a section of their own and moves focus to its heading", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user);

    const heading = screen.getByRole("heading", { level: 2, name: "AI-förslag" });
    expect(heading).toHaveFocus();
    expect(cards()).toHaveLength(3);
    const first = within(cards()[0]);
    expect(first.getByRole("heading", { level: 3, name: "Kycklinggryta" })).toBeInTheDocument();
    expect(first.getByText("35 min · 4 portioner")).toBeInTheDocument();
    expect(first.getByText("AI-förslag")).toHaveClass("bg-sand", "text-sand-ink");
    // A recipe card: the mint placeholder on top with the AI label on it, and no heart.
    expect(first.getByTestId("recipe-image-placeholder").parentElement).toHaveClass("h-card-image");
    expect(first.queryByRole("button", { name: /Favorit/ })).not.toBeInTheDocument();
    // The catalog's name for a linked line, the AI's otherwise; at most five, each once.
    expect(first.getByText("Med: gul lök, kycklingfilé, grädde, krossade tomater, ris")).toBeInTheDocument();
    expect(first.getByRole("button", { name: "Spara Kycklinggryta" })).toHaveTextContent("Spara");
    expect(within(cards()[2]).getByText("4 portioner")).toBeInTheDocument();
    // No status before saving, and no link: a suggestion has no recipe view.
    expect(within(section()).queryByText(/Kan lagas nu|Saknar/)).not.toBeInTheDocument();
    expect(within(section()).queryAllByRole("link")).toHaveLength(0);
    expect(progress()).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Föreslå andra rätter" })).toBeInTheDocument();
  });

  it("Avbryt stops the call without an error, with the button back in focus and the suggestions from before", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user);
    await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
    const { signal } = lastCall();
    await user.click(screen.getByRole("button", { name: "Avbryt" }));

    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Föreslå andra rätter" })).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(progress()).toBeEmptyDOMElement();
    expect(cards()).toHaveLength(3);
  });

  it("Avbryt before the first answer gives the first button back in focus", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await user.click(suggestButton());
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(suggestButton()).toHaveFocus();
    expect(screen.queryByRole("region", { name: "AI-förslag" })).not.toBeInTheDocument();
  });

  it("sends titles cleaned the way the server takes them", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, ok({ suggestions: [{ draft: draft("Gryta   med\tris", [fresh("1 ägg", "ägg")]), ingredientNames: {} }] }));
    await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
    expect(lastCall().body).toEqual({ avoidTitles: ["Gryta med ris"] });
  });

  it("Föreslå andra rätter sends the titles shown and replaces them only when the new ones are here", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user);
    await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
    expect(lastCall().body).toEqual({ avoidTitles: ["Kycklinggryta", "Krämig pasta", "Ugnsomelett"] });
    expect(cards()).toHaveLength(3);

    const other = { suggestions: [{ draft: draft("Fiskgratäng", [fresh("400 g torsk", "torsk")]), ingredientNames: {} }] };
    await answer(ok(other));
    expect(cards()).toHaveLength(1);
    expect(within(cards()[0]).getByRole("heading", { name: "Fiskgratäng" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "AI-förslag" })).toHaveFocus();
  });

  it("shows an error over the suggestions from before, which stay", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user);
    await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
    await answer(fail("ai_unavailable"));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(errorMessages.ai_unavailable);
    expect(cards()).toHaveLength(3);
    expect(alert.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each<[ErrorCode, string]>([
    ["ai_unavailable", "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?"],
    ["ai_invalid", "Det gick inte att tolka svaret. Försök igen."],
    ["ai_rejected", "AI-tjänsten tog inte emot förfrågan. Försök igen senare."],
    ["pantry_unavailable", "Det gick inte att läsa lagret. Försök igen."],
    ["catalog_unavailable", "Det gick inte att läsa ingredienskatalogen. Försök igen."],
    ["validation", "Det gick inte att be om förslag. Försök igen."],
  ])("shows %s with Försök igen, which asks again", async (code, text) => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, fail(code));
    expect(screen.getByRole("alert")).toHaveTextContent(text);

    await user.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(calls).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(progress()).toHaveTextContent("Letar efter idéer …");
    await answer(ok(three));
    expect(cards()).toHaveLength(3);
  });

  it("treats an answer that is not the suggestions' shape as ai_invalid", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, ok({ suggestions: [{ draft: { title: "" }, ingredientNames: {} }] }));
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att tolka svaret. Försök igen.");
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  it("says the pantry is empty with Öppna Lagersaldo and no Försök igen", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, fail("suggest_empty_pantry"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Lagret är tomt. Lägg till varor i Lagersaldo, så kan AI:n föreslå rätter.",
    );
    expect(screen.getByRole("link", { name: "Öppna Lagersaldo" })).toHaveAttribute("href", "/hemma");
    expect(screen.queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
  });

  it("refreshes the page when the session has expired, so it can send Pontus to sign in", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, fail("unauthorized"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
  });

  it("stops the call when the component goes away", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSuggestions();
    await user.click(suggestButton());
    const { signal } = lastCall();
    unmount();
    expect(signal.aborted).toBe(true);
  });

  describe("Spara AI-förslag", () => {
    const dialog = () => screen.getByRole("dialog", { name: "Spara AI-förslag" });

    it("opens the preview with the AI label, no source line, and Ny on a new catalog ingredient", async () => {
      const user = userEvent.setup();
      renderSuggestions();
      await suggestWith(user);
      await user.click(screen.getByRole("button", { name: "Spara Kycklinggryta" }));

      const sheet = within(dialog());
      expect(sheet.getByText("AI-förslag")).toBeInTheDocument();
      expect(sheet.getByLabelText("Titel")).toHaveValue("Kycklinggryta");
      expect(sheet.queryByText(/^Källa:/)).not.toBeInTheDocument();
      expect(sheet.getAllByText("Ny").length).toBeGreaterThan(0);
      expect(sheet.getByRole("button", { name: "Spara recept" })).toBeEnabled();
    });

    it("saves with saveRecipe, removes the suggestion, opens the recipe and says so", async () => {
      const user = userEvent.setup();
      saveRecipe.mockResolvedValue(ok({ id: "11111111-2222-4333-8444-555555555555" }));
      renderSuggestions();
      await suggestWith(user);
      await user.click(screen.getByRole("button", { name: "Spara Kycklinggryta" }));
      await user.click(within(dialog()).getByRole("button", { name: "Spara recept" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/recept/11111111-2222-4333-8444-555555555555"));
      const [saved, recipeId] = saveRecipe.mock.calls[0];
      expect(saved).toEqual(gryta.draft);
      expect(recipeId).toMatch(/^[0-9a-f-]{36}$/);
      // The sheet closes, the card goes and the toast shows once the save has settled.
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Spara AI-förslag" })).not.toBeInTheDocument());
      expect(screen.getByTestId("toast")).toHaveTextContent("Receptet är sparat.");
      expect(cards().map((card) => within(card).getByRole("heading").textContent)).toEqual(["Krämig pasta", "Ugnsomelett"]);
    });

    it("keeps the sheet with the save error when saving fails, and saves again with the same id", async () => {
      const user = userEvent.setup();
      saveRecipe.mockResolvedValueOnce(fail("recipe_save_failed"));
      renderSuggestions();
      await suggestWith(user);
      await user.click(screen.getByRole("button", { name: "Spara Krämig pasta" }));
      await user.click(within(dialog()).getByRole("button", { name: "Spara recept" }));

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent(errorMessages.recipe_save_failed);
      expect(push).not.toHaveBeenCalled();
      expect(cards()).toHaveLength(3);

      saveRecipe.mockResolvedValueOnce(ok({ id: "11111111-2222-4333-8444-555555555555" }));
      // The button reads "Sparar …" until the failed save has settled.
      await user.click(await within(dialog()).findByRole("button", { name: "Spara recept" }));
      await waitFor(() => expect(push).toHaveBeenCalled());
      expect(saveRecipe.mock.calls[1][1]).toBe(saveRecipe.mock.calls[0][1]);
    });

    it("saves with the suggestion's own id also from a sheet opened anew after a lost save", async () => {
      const user = userEvent.setup();
      // The save reached the server, but the answer was lost.
      saveRecipe.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      renderSuggestions();
      await suggestWith(user);
      await user.click(screen.getByRole("button", { name: "Spara Krämig pasta" }));
      await user.click(within(dialog()).getByRole("button", { name: "Spara recept" }));
      expect(await within(dialog()).findByRole("alert")).toHaveTextContent(errorMessages.recipe_save_failed);
      // The sheet cannot be closed until the failed save has settled ("Sparar …").
      await within(dialog()).findByRole("button", { name: "Spara recept" });
      await user.click(within(dialog()).getByRole("button", { name: "Stäng" }));

      saveRecipe.mockResolvedValueOnce(ok({ id: "11111111-2222-4333-8444-555555555555" }));
      await user.click(screen.getByRole("button", { name: "Spara Krämig pasta" }));
      await user.click(within(dialog()).getByRole("button", { name: "Spara recept" }));
      await waitFor(() => expect(push).toHaveBeenCalled());
      expect(saveRecipe.mock.calls[1][1]).toBe(saveRecipe.mock.calls[0][1]);
      // Another suggestion has an id of its own.
      saveRecipe.mockResolvedValueOnce(ok({ id: "22222222-2222-4333-8444-555555555555" }));
      await user.click(screen.getByRole("button", { name: "Spara Ugnsomelett" }));
      await user.click(within(dialog()).getByRole("button", { name: "Spara recept" }));
      await waitFor(() => expect(saveRecipe).toHaveBeenCalledTimes(3));
      expect(saveRecipe.mock.calls[2][1]).not.toBe(saveRecipe.mock.calls[0][1]);
    });

    it("avoids a saved suggestion's title too when asking for other dishes", async () => {
      const user = userEvent.setup();
      saveRecipe.mockResolvedValue(ok({ id: "11111111-2222-4333-8444-555555555555" }));
      renderSuggestions();
      await suggestWith(user);
      await user.click(screen.getByRole("button", { name: "Spara Kycklinggryta" }));
      await user.click(within(dialog()).getByRole("button", { name: "Spara recept" }));
      await waitFor(() => expect(push).toHaveBeenCalled());
      // The saved card leaves the list once the save has settled.
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Spara AI-förslag" })).not.toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
      expect(lastCall().body).toEqual({ avoidTitles: ["Krämig pasta", "Ugnsomelett", "Kycklinggryta"] });
    });

    it("asks Släng ändringarna? when an edited suggestion is closed, and keeps the suggestion as it was", async () => {
      const user = userEvent.setup();
      renderSuggestions();
      await suggestWith(user);
      await user.click(screen.getByRole("button", { name: "Spara Kycklinggryta" }));
      const title = within(dialog()).getByLabelText("Titel");
      await user.clear(title);
      await user.type(title, "Min gryta");
      await user.click(within(dialog()).getByRole("button", { name: "Stäng" }));

      expect(within(dialog()).getByRole("alert")).toHaveTextContent("Släng ändringarna?");
      await user.click(within(dialog()).getByRole("button", { name: "Släng ändringarna" }));
      expect(screen.queryByRole("dialog", { name: "Spara AI-förslag" })).not.toBeInTheDocument();
      expect(within(cards()[0]).getByRole("heading", { name: "Kycklinggryta" })).toBeInTheDocument();

      // Opened again, it starts from the suggestion.
      await user.click(screen.getByRole("button", { name: "Spara Kycklinggryta" }));
      expect(within(dialog()).getByLabelText("Titel")).toHaveValue("Kycklinggryta");
    });

    it("closes an unchanged suggestion without asking", async () => {
      const user = userEvent.setup();
      renderSuggestions();
      await suggestWith(user);
      await user.click(screen.getByRole("button", { name: "Spara Ugnsomelett" }));
      await user.click(within(dialog()).getByRole("button", { name: "Stäng" }));
      expect(screen.queryByRole("dialog", { name: "Spara AI-förslag" })).not.toBeInTheDocument();
      expect(saveRecipe).not.toHaveBeenCalled();
    });
  });
});
