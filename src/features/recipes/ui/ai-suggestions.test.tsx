import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { DishSuggestion } from "@/features/suggestions";
import { AiJobActionsContext } from "@/lib/ai-jobs-client";
import { errorMessages, fail, ok, type ErrorCode, type Result } from "@/lib/errors";
import { createFakeAiJobsServer } from "../../../../tests/support/ai-jobs-fake";
import type { RecipeDraft } from "../domain/recipe-draft";
import { AiSuggestions } from "./ai-suggestions";
import { useDishSuggestions } from "./use-dish-suggestions";

// AI-förslag as the library holds them (useDishSuggestions + AiSuggestions),
// as AI jobs (Story 12.4): the client is the real one, and a stand-in for the
// server (tests/support/ai-jobs-fake.ts) answers its fetches and the Server
// Actions; saveRecipe is stubbed. The client rows of Story 5.2's matrix, and
// the rows of Story 12.4's.

const server = createFakeAiJobsServer();

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
// An image address from the model, which a card must never load.
const pasta: DishSuggestion = {
  draft: { ...draft("Krämig pasta", [fresh("400 g pasta", "pasta")], 20), imageUrl: "https://www.koket.se/fran-modellen.jpg" },
  ingredientNames: {},
};
const omelett: DishSuggestion = { draft: draft("Ugnsomelett", [fresh("6 ägg", "ägg")], null), ingredientNames: {} };
const three = { suggestions: [gryta, pasta, omelett] };

function Harness({
  shownSiteId = null,
  visible = true,
  siteNames,
}: {
  shownSiteId?: string | null;
  visible?: boolean;
  siteNames?: Record<string, string>;
}) {
  const dishes = useDishSuggestions(shownSiteId, { visible, siteNames });
  return <AiSuggestions dishes={dishes} searchIngredients={searchIngredients} />;
}

function Tree(props: Parameters<typeof Harness>[0]) {
  return (
    <ToastProvider>
      <AiJobActionsContext.Provider value={server.actions}>
        <Harness {...props} />
      </AiJobActionsContext.Provider>
    </ToastProvider>
  );
}

function renderSuggestions(props: Parameters<typeof Harness>[0] = {}) {
  return render(<Tree {...props} />);
}

/** The section's own status region (the toast has one too). */
const progress = () => within(screen.getByTestId("ai-suggestions")).getByRole("status");
const suggestButton = () => screen.getByRole("button", { name: "Föreslå rätter med AI" });
const section = () => screen.getByRole("region", { name: "AI-förslag" });
const cards = () => within(section()).getAllByRole("listitem");

/** The codes that POST /api/ai/jobs answers itself, before a job is made; the others are a job that did not go. */
const refusals: ReadonlySet<ErrorCode> = new Set(["validation", "suggest_empty_pantry", "pantry_unavailable", "unauthorized", "ai_queue_full"]);

/** The latest job is done with `result` (or did not go), and the client reads the list. */
async function answer(result: Result<unknown>) {
  const { id } = server.latest;
  if (result.ok) {
    server.finish(id, result.data, 1);
    await server.read();
    // The suggestions are shown, and the job is marked as seen.
    await waitFor(() => expect(server.actions.markSeen.mock.calls.some(([seen]) => seen === id) || server.actions.dismiss.mock.calls.some(([gone]) => gone === id)).toBe(true));
  } else {
    server.failJob(id, result.error.code);
    await server.read();
    await waitFor(() => expect(server.actions.dismiss.mock.calls.some(([gone]) => gone === id)).toBe(true));
  }
}

/** Asks for suggestions and answers with `result`. */
async function suggestWith(user: ReturnType<typeof userEvent.setup>, result: Result<unknown> = ok(three)) {
  if (!result.ok && refusals.has(result.error.code)) {
    server.failNextStart(result.error.code);
    await user.click(suggestButton());
    return;
  }
  await user.click(suggestButton());
  await answer(result);
}

beforeEach(() => {
  server.install();
  server.actions.cancel.mockClear();
  server.actions.markSeen.mockClear();
  server.actions.dismiss.mockClear();
  server.started.length = 0;
  refresh.mockReset();
  push.mockReset();
  saveRecipe.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiSuggestions", () => {
  it("shows nothing without the library's state", () => {
    const { container } = render(<AiSuggestions searchIngredients={searchIngredients} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts an AI job with no titles and a key of its own, and shows Letar efter idéer … with Avbryt in the button's place", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    expect(server.started).toHaveLength(0);
    const status = progress();
    expect(status).toBeEmptyDOMElement();

    await user.click(suggestButton());
    expect(server.started).toHaveLength(1);
    expect(server.started[0].path).toBe("/api/ai/jobs");
    expect(server.started[0].body).toEqual({ kind: "suggest", avoidTitles: [], clientKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(status).toHaveTextContent("Letar efter idéer …");
    expect(status).toHaveTextContent("Du kan göra annat under tiden.");
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
  });

  it("says I kö, 1 före. while the job waits behind another, and Letar efter idéer … when it runs", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await user.click(suggestButton());
    server.queue(server.latest.id, 1);
    await server.read();
    expect(progress()).toHaveTextContent("I kö, 1 före.");
    expect(progress()).not.toHaveTextContent("Letar efter idéer");
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeInTheDocument();

    server.queue(server.latest.id, 0);
    await server.read();
    expect(progress()).toHaveTextContent("Letar efter idéer …");
  });

  it("makes one job of a retry after a network error, with the same key, and a new key for the next tap", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    server.failNextStart("network");
    await user.click(suggestButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.ai_unavailable);
    await user.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(server.started).toHaveLength(2);
    expect(server.started[1].body.clientKey).toBe(server.started[0].body.clientKey);

    await answer(ok(three));
    await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
    expect(server.started[2].body.clientKey).not.toBe(server.started[0].body.clientKey);
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
    // A recipe card: a short mint strip on top with the AI label on it, and no heart.
    expect(first.getByTestId("recipe-image-placeholder").parentElement).toHaveClass("h-16");
    expect(first.queryByRole("button", { name: /Favorit/ })).not.toBeInTheDocument();
    // The label is read before "Spara", and no card loads an address from the model.
    expect(
      first.getByText("AI-förslag").compareDocumentPosition(first.getByRole("button", { name: "Spara Kycklinggryta" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(section().querySelector("img")).toBeNull();
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

  describe("dishes that come one at a time (Story 12.7)", () => {
    it("shows the first dish at once with Letar efter fler …, announces it, and shows the others under it", async () => {
      const user = userEvent.setup();
      renderSuggestions();
      await user.click(suggestButton());
      const { id } = server.latest;

      server.report(id, { suggestions: [gryta] }, 1);
      await server.read();
      await waitFor(() => expect(cards()).toHaveLength(1));
      expect(within(cards()[0]).getByRole("heading", { level: 3, name: "Kycklinggryta" })).toBeInTheDocument();
      expect(progress()).toHaveTextContent("Letar efter fler …");
      expect(progress()).toHaveTextContent("Ny rätt: Kycklinggryta.");
      expect(screen.getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
      // Focus is not taken from where Pontus is while the dishes come.
      expect(screen.getByRole("heading", { level: 2, name: "AI-förslag" })).not.toHaveFocus();

      server.report(id, { suggestions: [gryta, pasta] }, 2);
      await server.read();
      await waitFor(() => expect(cards()).toHaveLength(2));
      expect(within(cards()[1]).getByRole("heading", { level: 3, name: "Krämig pasta" })).toBeInTheDocument();
      expect(progress()).toHaveTextContent("Ny rätt: Krämig pasta.");
      expect(progress()).not.toHaveTextContent("Kycklinggryta");

      // The job is done: the same cards stay, with the third, and Letar efter fler … goes.
      server.finish(id, three, 3);
      await server.read();
      await waitFor(() => expect(cards()).toHaveLength(3));
      expect(progress()).toBeEmptyDOMElement();
      expect(screen.getByRole("button", { name: "Föreslå andra rätter" })).toBeInTheDocument();
    });

    it("can save the first dish before the others have come, and it does not come back with the whole result", async () => {
      const user = userEvent.setup();
      saveRecipe.mockResolvedValue(ok({ id: "recipe-1" }));
      renderSuggestions();
      await user.click(suggestButton());
      const { id } = server.latest;
      server.report(id, { suggestions: [gryta] }, 1);
      await server.read();
      await user.click(await screen.findByRole("button", { name: "Spara Kycklinggryta" }));
      await user.click(await screen.findByRole("button", { name: "Spara recept" }));
      await waitFor(() => expect(saveRecipe).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Spara Kycklinggryta" })).not.toBeInTheDocument());

      server.finish(id, three, 3);
      await server.read();
      await waitFor(() => expect(cards()).toHaveLength(2));
      expect(within(section()).queryByText("Kycklinggryta")).not.toBeInTheDocument();
    });

    it("Avbryt takes the shown dish away", async () => {
      const user = userEvent.setup();
      renderSuggestions();
      await user.click(suggestButton());
      server.report(server.latest.id, { suggestions: [gryta] }, 1);
      await server.read();
      await waitFor(() => expect(cards()).toHaveLength(1));
      await user.click(screen.getByRole("button", { name: "Avbryt" }));
      await waitFor(() => expect(screen.queryByRole("region", { name: "AI-förslag" })).not.toBeInTheDocument());
      expect(suggestButton()).toBeInTheDocument();
    });
  });

  it("Avbryt stops the call without an error, with the button back in focus and the suggestions from before", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user);
    await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
    const { id } = server.latest;
    await user.click(screen.getByRole("button", { name: "Avbryt" }));

    expect(server.actions.cancel).toHaveBeenCalledWith(id);
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
    expect(server.started[1].body.avoidTitles).toEqual(["Gryta med ris"]);
  });

  it("Föreslå andra rätter sends the titles shown and replaces them only when the new ones are here", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user);
    await user.click(screen.getByRole("button", { name: "Föreslå andra rätter" }));
    expect(server.started[1].body.avoidTitles).toEqual(["Kycklinggryta", "Krämig pasta", "Ugnsomelett"]);
    // The old result is closed once the new job has started, and its suggestions stay until the new ones are here.
    expect(server.actions.dismiss).toHaveBeenCalledTimes(1);
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

    const alert = await screen.findByRole("alert");
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
    expect(await screen.findByRole("alert")).toHaveTextContent(text);

    await user.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(server.started).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(progress()).toHaveTextContent("Letar efter idéer …");
    await answer(ok(three));
    expect(cards()).toHaveLength(3);
  });

  it.each<[ErrorCode, string]>([
    ["ai_queue_timeout", "AI:n hann inte börja med det här. Försök igen."],
    ["ai_job_lost", "AI-jobbet avbröts. Försök igen."],
  ])("shows %s with Försök igen (Story 12.4)", async (code, text) => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, fail(code));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  it("says the queue is full without Försök igen, and starts nothing", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, fail("ai_queue_full"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det finns redan tre AI-jobb. Vänta tills ett är klart.");
    expect(screen.queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
    expect(server.jobs).toHaveLength(0);
    // The button is back for the next tap.
    expect(suggestButton()).toBeInTheDocument();
  });

  it("treats an answer that is not the suggestions' shape as ai_invalid", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, ok({ suggestions: [{ draft: { title: "" }, ingredientNames: {} }] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att tolka svaret. Försök igen.");
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  it("says the pantry is empty with Öppna Lagersaldo and no Försök igen", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, fail("suggest_empty_pantry"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Lagret är tomt. Lägg till varor i Lagersaldo, så kan AI:n föreslå rätter.",
    );
    expect(screen.getByRole("link", { name: "Öppna Lagersaldo" })).toHaveAttribute("href", "/hemma");
    expect(screen.queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
  });

  it("refreshes the page when the session has expired, so it can send Pontus to sign in", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    await suggestWith(user, fail("unauthorized"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
  });

  it("lets the job go on when the component goes away, and shows its result when it comes back (Story 12.4)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSuggestions();
    await user.click(suggestButton());
    const { id } = server.latest;
    unmount();
    expect(server.actions.cancel).not.toHaveBeenCalled();

    server.finish(id, three, 3);
    // Pontus comes back: the app reads the list, and the section shows the suggestions at once.
    renderSuggestions();
    await server.read();
    expect(await screen.findByRole("region", { name: "AI-förslag" })).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
    await waitFor(() => expect(server.actions.markSeen).toHaveBeenCalledWith(id));
  });

  it("shows a finished job only when the section is on the screen, and then marks it as seen", async () => {
    server.add({ kind: "suggest", status: "done", count: 3 }, three);
    const { rerender } = renderSuggestions({ visible: false });
    await server.read();
    expect(screen.queryByRole("region", { name: "AI-förslag" })).not.toBeInTheDocument();
    expect(server.actions.markSeen).not.toHaveBeenCalled();

    rerender(<Tree visible />);
    expect(await screen.findByRole("region", { name: "AI-förslag" })).toBeInTheDocument();
    await waitFor(() => expect(server.actions.markSeen).toHaveBeenCalledTimes(1));
  });

  it("says Resultatet finns inte längre. for a result that is gone", async () => {
    const job = server.add({ kind: "suggest", status: "done", count: 3 });
    renderSuggestions();
    await server.read();
    expect(await screen.findByRole("alert")).toHaveTextContent("Resultatet finns inte längre.");
    expect(server.actions.markSeen).toHaveBeenCalledWith(job.id);
  });

  it("closes the result when the last suggestion is saved", async () => {
    const user = userEvent.setup();
    saveRecipe.mockResolvedValue(ok({ id: "11111111-2222-4333-8444-555555555555" }));
    renderSuggestions();
    await suggestWith(user, ok({ suggestions: [{ draft: draft("Ugnsomelett", [fresh("6 ägg", "ägg")]), ingredientNames: {} }] }));
    const { id } = server.latest;
    await user.click(screen.getByRole("button", { name: "Spara Ugnsomelett" }));
    await user.click(screen.getByRole("button", { name: "Spara recept" }));
    await waitFor(() => expect(server.actions.dismiss).toHaveBeenCalledWith(id));
  });

  describe("suggestions of another place (AD-24, Story 12.4)", () => {
    const hemma = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
    const stugan = "55555555-5555-4555-8555-555555555555";

    it("shows them with Förslagen bygger på lagret för Hemma. and Föreslå igen, and they can still be saved", async () => {
      const user = userEvent.setup();
      const view = renderSuggestions({ shownSiteId: hemma, siteNames: { [hemma]: "Hemma", [stugan]: "Stugan" } });
      await suggestWith(user, ok({ ...three, siteId: hemma }));
      expect(screen.queryByText(/Förslagen bygger på lagret/)).not.toBeInTheDocument();

      view.rerender(<Tree shownSiteId={stugan} siteNames={{ [hemma]: "Hemma", [stugan]: "Stugan" }} />);
      expect(screen.getByText("Förslagen bygger på lagret för Hemma.")).toBeInTheDocument();
      expect(cards()).toHaveLength(3);
      expect(screen.getByRole("button", { name: "Spara Kycklinggryta" })).toBeEnabled();

      // "Föreslå igen" starts a job for the place now shown, with nothing to avoid.
      await user.click(screen.getByRole("button", { name: "Föreslå igen" }));
      expect(server.started[1].body.avoidTitles).toEqual([]);
    });

    it("names no place when it is not known, and says nothing for the place that is shown or an unknown place", async () => {
      const user = userEvent.setup();
      const view = renderSuggestions({ shownSiteId: hemma });
      await suggestWith(user, ok({ ...three, siteId: hemma }));
      view.rerender(<Tree shownSiteId={stugan} />);
      expect(screen.getByText("Förslagen bygger på lagret för ett annat ställe.")).toBeInTheDocument();

      view.rerender(<Tree shownSiteId={null} />);
      expect(screen.queryByText(/Förslagen bygger på lagret/)).not.toBeInTheDocument();
      expect(cards()).toHaveLength(3);
    });
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
      expect(server.started[1].body.avoidTitles).toEqual(["Krämig pasta", "Ugnsomelett", "Kycklinggryta"]);
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
