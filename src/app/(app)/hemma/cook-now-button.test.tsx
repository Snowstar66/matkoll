import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { RecipeDraft } from "@/features/recipes";
import { AiJobActionsContext } from "@/lib/ai-jobs-client";
import { fail, ok, type Result } from "@/lib/errors";
import { createFakeAiJobsServer } from "../../../../tests/support/ai-jobs-fake";
import { CookNowButton, cookNowReuseMs, resetCookNowKept, type CookNowData } from "./cook-now-button";

// "Vad kan jag laga nu?" (Story 25.2): the card and the sheet "Kan lagas nu",
// with the real AI jobs client against a stand-in server; readCookNow and
// saveRecipe are stubbed.

const server = createFakeAiJobsServer();

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const library: CookNowData = {
  own: [
    { id: "r1", title: "Pannkakor", imageUrl: null, totalMinutes: 25, servings: 4, uses: ["ägg", "mellanmjölk", "smör"] },
    { id: "r2", title: "Purjolökspaj", imageUrl: null, totalMinutes: 50, servings: 4, uses: ["grädde", "purjolök"] },
  ],
  oneMissing: [{ id: "r3", title: "Köttbullar och potatismos", missing: "lingon" }],
  tip: { name: "Grädde", days: 6 },
  siteId: null,
};
const readCookNow = vi.fn<() => Promise<Result<CookNowData>>>();
const saveRecipe = vi.fn<(draft: RecipeDraft, recipeId: string) => Promise<Result<{ id: string }>>>();

const dish = (title: string, toBuy: string[] = []) => ({
  draft: {
    title,
    servings: 4,
    totalMinutes: 30,
    imageUrl: null,
    sourceKind: "ai" as const,
    sourceUrl: null,
    steps: ["Skiva purjolöken.", "Fräs i smör."],
    lines: [
      {
        originalText: "2 purjolökar",
        amount: 2,
        unit: null,
        isVague: false,
        ingredient: { kind: "match" as const, ingredientId: "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01", confidence: "hint" as const },
        stepIndexes: [0],
      },
      {
        originalText: "2 dl grädde",
        amount: 2,
        unit: "dl" as const,
        isVague: false,
        ingredient: { kind: "match" as const, ingredientId: "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02", confidence: "hint" as const },
        stepIndexes: [1],
      },
    ],
  },
  ingredientNames: {},
  onOffer: [],
  atHome: { have: 2, total: 2 },
  toBuy,
  oldUsed: [],
});
const recipeResult = (suggestions: ReturnType<typeof dish>[]) => ({ suggestions, mode: "now", siteId: null, storeName: null });
const idea = (name: string, how: string, kind = "sås", missing: string[] = []) => ({ name, how, kind, uses: ["dressing"], missing });
const result = (ideas: ReturnType<typeof idea>[], intro = "Det är tunt i kylen, men det här går:") => ({ intro, ideas, siteId: null });
const burger = idea("Burgersås", "dressing + ketchup och lite senap");
const dip = idea("Dipp", "dressing + Tabasco eller chilisås för lite värme");

function renderButton() {
  return render(
    <ToastProvider>
      <AiJobActionsContext.Provider value={server.actions}>
        <CookNowButton readCookNow={readCookNow} saveRecipe={saveRecipe} />
      </AiJobActionsContext.Provider>
    </ToastProvider>,
  );
}

const card = () => screen.getByRole("button", { name: /Vad kan jag laga nu\?/ });
const sheet = () => screen.getByTestId("cook-now-sheet");

/** The run of the model is done with `data`, and the client reads the list. */
async function finish(data: unknown) {
  server.finish(server.latest.id, data, 1);
  await server.read();
}

beforeEach(() => {
  server.install();
  server.actions.cancel.mockClear();
  server.actions.markSeen.mockClear();
  server.actions.dismiss.mockClear();
  readCookNow.mockReset().mockResolvedValue(ok(library));
  saveRecipe.mockReset().mockResolvedValue(ok({ id: "saved-1" }));
  push.mockReset();
  resetCookNowKept();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CookNowButton", () => {
  it("is a primary card with the sparkle, the question and the line under it, and opens the sheet in place", async () => {
    renderButton();
    expect(card()).toHaveTextContent("Med det du har i kyl, frys och skafferi");
    expect(screen.queryByTestId("cook-now-sheet")).toBeNull();
    await userEvent.setup().click(card());
    expect(await screen.findByRole("dialog", { name: "Kan lagas nu" })).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Allt finns hemma. Basvaror räknas som hemma.")).toBeVisible();
  });
});

describe("the sheet Kan lagas nu", () => {
  it("shows the library at once in its sections, and asks the model for ideas in the mode ideas with a calm loading row", async () => {
    renderButton();
    await userEvent.setup().click(card());
    expect(await screen.findByText("Pannkakor")).toBeVisible();
    const own = within(sheet()).getAllByTestId("cook-now-own");
    expect(own.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Pannkakor"),
      expect.stringContaining("Purjolökspaj"),
    ]);
    expect(own[0]).toHaveTextContent("25 min · 4 portioner");
    expect(own[0]).toHaveTextContent("Allt hemma");
    expect(screen.getByText("DINA RECEPT")).toBeVisible();
    // The tip line replaces the row "Ät det här först".
    expect(screen.getByTestId("cook-now-tip")).toHaveTextContent("Grädde har legat i 6 dagar. Rätterna med den står först.");
    await waitFor(() => expect(server.started).toHaveLength(1));
    expect(server.started[0].body).toMatchObject({ kind: "suggest", mode: "ideas", avoidTitles: [] });
    expect(await screen.findByTestId("cook-now-loading")).toBeVisible();
    // The loading row is in a live region of its own.
    expect(screen.getByTestId("cook-now-loading").parentElement).toHaveAttribute("role", "status");
  });

  it("shows Saknar bara en vara expanded from the start, with the title and what is missing", async () => {
    renderButton();
    await userEvent.setup().click(card());
    const group = await screen.findByTestId("cook-now-one-missing");
    expect(group).toHaveAttribute("open");
    expect(group).toHaveTextContent("Saknar bara en vara (1)");
    expect(group).toHaveTextContent("Köttbullar och potatismos");
    expect(group).toHaveTextContent("Saknar lingon");
  });

  it("expands a library row to what it uses and Öppna receptet, one row at a time", async () => {
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    const [first, second] = await screen.findAllByTestId("cook-now-own");
    await user.click(within(first).getByRole("button"));
    expect(within(first).getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveTextContent("Använder ägg, mellanmjölk och smör.");
    expect(within(first).getByRole("link", { name: "Öppna receptet" })).toHaveAttribute("href", "/recept/r1");
    await user.click(within(second).getByRole("button"));
    expect(within(first).getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveTextContent("Använder grädde och purjolök.");
    await user.click(within(second).getByRole("button"));
    expect(second).not.toHaveTextContent("Öppna receptet");
  });

  it("shows the intro and the ideas as compact text rows under IDÉER, and the ones that miss one thing in Saknar bara en vara", async () => {
    renderButton();
    await userEvent.setup().click(card());
    await screen.findByTestId("cook-now-loading");
    await finish(result([burger, dip, idea("Macka", "ost på bröd", "mellanmål", ["bröd"])]));

    const rows = await screen.findAllByTestId("cook-now-idea");
    expect(screen.getByText("IDÉER")).toBeVisible();
    expect(screen.getByTestId("cook-now-intro")).toHaveTextContent("Det är tunt i kylen, men det här går:");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Burgersåssåsdressing + ketchup och lite senap"),
      expect.stringContaining("Dippsåsdressing + Tabasco eller chilisås för lite värme"),
    ]);
    // No image and nothing to expand: a name, a small kind and a sentence.
    expect(within(rows[0]).queryByRole("img")).toBeNull();
    expect(within(rows[0]).queryByRole("button", { name: /Burgersås/ })).toBeNull();
    expect(within(rows[0]).getByRole("button", { name: "Gör ett recept av den" })).toBeEnabled();
    expect(screen.queryByTestId("cook-now-loading")).toBeNull();
    const group = screen.getByTestId("cook-now-one-missing");
    expect(group).toHaveTextContent("Saknar bara en vara (2)");
    expect(group).toHaveTextContent("Macka");
    expect(group).toHaveTextContent("Saknar bröd");
    // No bin on any row: the ideas are temporary.
    expect(screen.queryByRole("button", { name: /Ta bort/ })).toBeNull();
  });

  it("writes the recipe of one idea as a job of the mode now with that idea, and shows it with Spara som recept, which saves nothing before the tap", async () => {
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    await screen.findByTestId("cook-now-loading");
    await finish(result([burger, dip]));
    const [row] = await screen.findAllByTestId("cook-now-idea");
    expect(saveRecipe).not.toHaveBeenCalled();

    await user.click(within(row).getByRole("button", { name: "Gör ett recept av den" }));
    await waitFor(() => expect(server.started).toHaveLength(2));
    expect(server.started[1].body).toMatchObject({
      kind: "suggest",
      mode: "now",
      avoidTitles: [],
      dish: "Burgersås: dressing + ketchup och lite senap",
    });
    expect(await within(row).findByTestId("cook-now-recipe")).toBeVisible();
    // Another recipe waits for this one.
    expect(screen.getAllByRole("button", { name: "Gör ett recept av den" })[0]).toBeDisabled();
    await finish(recipeResult([dish("Burgersås")]));
    expect(await within(row).findByText("2 purjolökar")).toBeVisible();
    expect(within(row).getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      expect.arrayContaining(["Skiva purjolöken.", "Fräs i smör."]),
    );
    expect(saveRecipe).not.toHaveBeenCalled();
    await user.click(within(row).getByRole("button", { name: "Spara som recept" }));
    await waitFor(() => expect(saveRecipe).toHaveBeenCalledTimes(1));
    const [draft, recipeId] = saveRecipe.mock.calls[0];
    expect(draft.title).toBe("Burgersås");
    expect(recipeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await within(row).findByRole("button", { name: "Sparad i Recept" })).toBeDisabled();
    expect((await screen.findAllByText("Burgersås finns nu i Recept.")).length).toBeGreaterThan(0);
  });

  it("says so and offers another try when the recipe cannot be written", async () => {
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    await screen.findByTestId("cook-now-loading");
    await finish(result([burger]));
    const [row] = await screen.findAllByTestId("cook-now-idea");
    await user.click(within(row).getByRole("button", { name: "Gör ett recept av den" }));
    await waitFor(() => expect(server.started).toHaveLength(2));
    server.failJob(server.latest.id, "ai_invalid");
    await server.read();
    expect(await within(row).findByText("Det blev inget recept av den här gången.")).toBeVisible();
    expect(within(row).getByRole("button", { name: "Försök igen" })).toBeVisible();
  });

  it("says so and saves nothing more when saving fails", async () => {
    saveRecipe.mockResolvedValue(fail("recipe_save_failed"));
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    await screen.findByTestId("cook-now-loading");
    await finish(result([burger]));
    const [row] = await screen.findAllByTestId("cook-now-idea");
    await user.click(within(row).getByRole("button", { name: "Gör ett recept av den" }));
    await waitFor(() => expect(server.started).toHaveLength(2));
    await finish(recipeResult([dish("Burgersås")]));
    await user.click(await within(row).findByRole("button", { name: "Spara som recept" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(within(row).getByRole("button", { name: "Spara som recept" })).toBeEnabled();
  });

  it("closes the job at once when its result is taken, so nothing piles up in the AI jobs", async () => {
    renderButton();
    await userEvent.setup().click(card());
    await screen.findByTestId("cook-now-loading");
    const { id } = server.latest;
    await finish(result([burger]));
    await screen.findAllByTestId("cook-now-idea");
    await waitFor(() => expect(server.actions.dismiss).toHaveBeenCalledWith(id));
    expect(server.jobs).toEqual([]);
  });

  it("cancels the run when the sheet is closed while the model works", async () => {
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    await screen.findByTestId("cook-now-loading");
    const { id } = server.latest;
    await user.click(screen.getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(server.actions.cancel).toHaveBeenCalledWith(id));
    expect(server.jobs).toEqual([]);
  });

  it("shows the same result when the sheet is opened again within 30 minutes, without a new run", async () => {
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    await screen.findByTestId("cook-now-loading");
    await finish(result([burger]));
    await screen.findAllByTestId("cook-now-idea");
    await user.click(screen.getByRole("button", { name: "Klar" }));
    expect(server.started).toHaveLength(1);

    await user.click(card());
    expect(await screen.findByText("Burgersås")).toBeVisible();
    expect(screen.getByTestId("cook-now-intro")).toBeVisible();
    expect(server.started).toHaveLength(1);
    expect(screen.queryByTestId("cook-now-loading")).toBeNull();
    // The library is read anew each time, so it is never old.
    expect(readCookNow).toHaveBeenCalledTimes(2);
  });

  it("makes a fresh run when the sheet is opened after 30 minutes", async () => {
    const now = Date.now();
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    await screen.findByTestId("cook-now-loading");
    await finish(result([burger]));
    await screen.findAllByTestId("cook-now-idea");
    await user.click(screen.getByRole("button", { name: "Klar" }));

    vi.spyOn(Date, "now").mockReturnValue(now + cookNowReuseMs + 1000);
    await user.click(card());
    await waitFor(() => expect(server.started).toHaveLength(2));
  });

  it("asks for other dishes with Andra förslag, avoiding the titles shown, and says the dishes go away by themselves", async () => {
    renderButton();
    const user = userEvent.setup();
    await user.click(card());
    await screen.findByTestId("cook-now-loading");
    await finish(result([burger, dip]));
    await screen.findAllByTestId("cook-now-idea");
    expect(screen.getByText("Förslagen försvinner av sig själva. Spara den du vill ha kvar.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Andra förslag" }));
    await waitFor(() => expect(server.started).toHaveLength(2));
    expect(server.started[1].body).toMatchObject({ mode: "ideas", avoidTitles: ["Burgersås", "Dipp"] });
    // The old dishes make room for the loading row.
    expect(screen.queryByTestId("cook-now-idea")).toBeNull();
    expect(await screen.findByTestId("cook-now-loading")).toBeVisible();
  });

  it("keeps the library's recipes and says calmly that there are no new ideas when nothing passed the check", async () => {
    renderButton();
    await userEvent.setup().click(card());
    await screen.findByTestId("cook-now-loading");
    server.failJob(server.latest.id, "ai_invalid");
    await server.read();
    expect(await screen.findByText("Inga nya idéer just nu. Prova Andra förslag.")).toBeVisible();
    expect(screen.getAllByTestId("cook-now-own")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeVisible();
  });

  it("says why when the model is away, and keeps the library", async () => {
    renderButton();
    await userEvent.setup().click(card());
    await screen.findByTestId("cook-now-loading");
    server.failJob(server.latest.id, "ai_unavailable");
    await server.read();
    await waitFor(() => expect(screen.queryByTestId("cook-now-loading")).toBeNull());
    expect(screen.getAllByTestId("cook-now-own")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeVisible();
  });

  it("says why when the pantry cannot be read", async () => {
    readCookNow.mockResolvedValue(fail("pantry_unavailable"));
    renderButton();
    await userEvent.setup().click(card());
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(server.started).toHaveLength(0);
  });

  it("shows a calm sentence when nothing can be cooked at all", async () => {
    readCookNow.mockResolvedValue(ok({ own: [], oneMissing: [], tip: null, siteId: null }));
    renderButton();
    await userEvent.setup().click(card());
    await screen.findByTestId("cook-now-loading");
    server.failJob(server.latest.id, "ai_invalid");
    await server.read();
    expect(await screen.findByText("Inget går att laga med bara det du har just nu.")).toBeVisible();
    expect(screen.queryByTestId("cook-now-tip")).toBeNull();
  });
});
