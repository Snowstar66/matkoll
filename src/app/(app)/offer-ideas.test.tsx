import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import { noOfferIdeas, pollSetMs, type OfferIdea, type OfferIdeasView } from "@/features/suggestions";
import { OfferIdeaPreviewHost, OfferIdeas, type OfferIdeasProps } from "./offer-ideas";

// "Nya idéer": the saved set, shown without a button: ready (the friend's intro, a why per dish, "+" opens
// the preview), on its way (looked at again), failed (Försök igen) and "Andra idéer". The set itself is
// prepared by the server (Server Actions, passed in as props and mocked here).

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/features/recipes/ui/ai-suggestion-sheet", () => ({
  AiSuggestionSheet: (props: { suggestion: { draft: { title: string } } | null }) =>
    props.suggestion ? <div role="dialog" aria-label="Spara AI-förslag">{props.suggestion.draft.title}</div> : null,
}));

const idea = (n: number, title: string, why: string, onOffer: string[] = ["Fläskfilé"]): OfferIdea =>
  ({
    recipeId: `00000000-0000-4000-8000-00000000000${n}`,
    draft: { title, servings: 4, totalMinutes: 35, imageUrl: null, sourceKind: "ai", sourceUrl: null, steps: [], lines: [] },
    ingredientNames: {},
    why,
    onOffer,
  }) as unknown as OfferIdea;

const view = (overrides: Partial<OfferIdeasView> = {}): OfferIdeasView => ({ ...noOfferIdeas, hasOffers: true, ...overrides });
const ready = (ideas: OfferIdea[], intro = "Fläskfilé och broccoli är billigt i veckan, och du har ris hemma."): OfferIdeasView =>
  view({ state: "ready", intro, ideas });

const start = vi.fn();
const read = vi.fn();

function renderIdeas(initial: OfferIdeasView | null, props: Partial<OfferIdeasProps> = {}) {
  return render(
    <ToastProvider>
      <OfferIdeas
        initial={initial}
        weekStart="2026-11-02"
        addToWeek={vi.fn()}
        searchIngredients={async () => ok([])}
        start={start}
        read={read}
        {...props}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  start.mockReset().mockResolvedValue(ok(view({ state: "pending" })));
  read.mockReset().mockResolvedValue(ok(view({ state: "pending" })));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OfferIdeas", () => {
  it("shows the ready ideas at once, with no start button: the intro, each why and the extrapris line", () => {
    renderIdeas(ready([idea(1, "Fläskfilé med broccoli", "Fläskfilén är billig och riset finns hemma."), idea(2, "Broccolisoppa", "Soppan går fort.", [])]));
    expect(screen.getByRole("heading", { name: "Nya idéer" })).toBeInTheDocument();
    expect(screen.getByTestId("offer-ideas-intro")).toHaveTextContent("Fläskfilé och broccoli är billigt i veckan, och du har ris hemma.");
    const rows = screen.getAllByTestId("ai-option");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByTestId("plan-option-note")).toHaveTextContent("Fläskfilén är billig och riset finns hemma.");
    expect(within(rows[0]).getByTestId("plan-option-deal")).toHaveTextContent("Fläskfilé på extrapris");
    expect(within(rows[0]).getByText("AI-förslag · 35 min")).toBeInTheDocument();
    expect(within(rows[1]).queryByTestId("plan-option-deal")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nya idéer med extrapris" })).not.toBeInTheDocument();
    expect(screen.queryByText("Idéerna förbereds …")).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("shows no intro line when the server cleared it", () => {
    renderIdeas(ready([idea(1, "Fläskfilé med broccoli", "")], ""));
    expect(screen.queryByTestId("offer-ideas-intro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-option-note")).not.toBeInTheDocument();
  });

  it("shows at most three ideas", () => {
    renderIdeas(ready([1, 2, 3, 4].map((n) => idea(n, `Rätt ${n}`, ""))));
    expect(screen.getAllByTestId("ai-option")).toHaveLength(3);
  });

  it("renders nothing without offers or when the set could not be read", () => {
    const first = renderIdeas(noOfferIdeas);
    expect(screen.queryByTestId("offer-ideas")).not.toBeInTheDocument();
    first.unmount();
    renderIdeas(null);
    expect(screen.queryByTestId("offer-ideas")).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it("opens the preview with + (a button of at least 44 px) so the idea is saved there, not on the tap", async () => {
    renderIdeas(ready([idea(1, "Fläskfilé med broccoli", "Billig.")]));
    const plus = screen.getByRole("button", { name: "Granska och spara: Fläskfilé med broccoli" });
    expect(plus.className).toContain("size-tap");
    await userEvent.setup().click(plus);
    expect(screen.getByRole("dialog", { name: "Spara AI-förslag" })).toHaveTextContent("Fläskfilé med broccoli");
  });

  it("inside another sheet, + opens the preview in the host, which stays when the card goes (one sheet shows at a time)", async () => {
    const props = { weekStart: "2026-11-02", addToWeek: vi.fn(), searchIngredients: async () => ok([]), start, read, previewOutside: true };
    const { rerender } = render(
      <ToastProvider>
        <OfferIdeas initial={ready([idea(1, "Fläskfilé med broccoli", "Billig.")])} {...props} />
        <OfferIdeaPreviewHost />
      </ToastProvider>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Granska och spara: Fläskfilé med broccoli" }));
    // The offers sheet closes when the preview opens: the card is gone, the preview is not.
    rerender(
      <ToastProvider>
        <OfferIdeaPreviewHost />
      </ToastProvider>,
    );
    expect(screen.queryByTestId("offer-ideas")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Spara AI-förslag" })).toHaveTextContent("Fläskfilé med broccoli");
  });

  it("says the ideas are being prepared while the set is pending, and looks again until it is ready", async () => {
    vi.useFakeTimers();
    read.mockResolvedValueOnce(ok(view({ state: "pending" }))).mockResolvedValueOnce(ok(ready([idea(1, "Fläskfilé med broccoli", "Billig.")])));
    renderIdeas(view({ state: "pending" }));
    expect(screen.getByText("Idéerna förbereds …")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-option")).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(pollSetMs));
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Idéerna förbereds …")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(pollSetMs));
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("ai-option")).toHaveLength(1);
    expect(screen.queryByText("Idéerna förbereds …")).not.toBeInTheDocument();
    // Ready: it is not looked at again.
    await act(() => vi.advanceTimersByTimeAsync(pollSetMs * 3));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("starts the ideas once on the first view when there is no set yet, and shows them as being prepared", async () => {
    renderIdeas(view({ state: "none" }));
    expect(await screen.findByText("Idéerna förbereds …")).toBeInTheDocument();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({});
  });

  it("says why it failed in a short line with Försök igen, which prepares a new set", async () => {
    renderIdeas(view({ state: "failed", errorCode: "ai_unavailable" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ta fram idéer just nu.");
    expect(start).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(start).toHaveBeenCalledWith({});
    expect(await screen.findByText("Idéerna förbereds …")).toBeInTheDocument();
  });

  it("shows a failure when the start gives no answer", async () => {
    start.mockResolvedValue(fail("offers_unavailable"));
    renderIdeas(view({ state: "failed" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ta fram idéer just nu.");
  });

  it("has Andra idéer (a tap target of at least 44 px) that asks for a replacing set and shows the wait meanwhile", async () => {
    renderIdeas(ready([idea(1, "Fläskfilé med broccoli", "Billig.")]));
    const other = screen.getByRole("button", { name: "Andra idéer" });
    expect(other.className).toContain("min-h-tap");
    await userEvent.setup().click(other);
    expect(start).toHaveBeenCalledWith({ replace: true });
    expect(await screen.findByText("Idéerna förbereds …")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-option")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Andra idéer" })).not.toBeInTheDocument();
  });
});
