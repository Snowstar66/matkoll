import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import type { AiCallResult } from "@/lib/ai-client";
import { ok, type Result } from "@/lib/errors";
import type { AnalyzeResult, PantrySuggestion } from "../domain/pantry-suggestion";
import { PantryCamera } from "./pantry-camera";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { PantrySuggestionsProvider } from "./pantry-suggestions";

// Lagerförslag: the section with one card per suggestion, filled through the
// camera with /api/ai/analyze and the resizing stubbed.

let answers: ((result: AiCallResult<unknown>) => void)[] = [];
vi.mock("@/lib/ai-client", () => ({
  postAiForm: () => new Promise<AiCallResult<unknown>>((resolve) => answers.push(resolve)),
}));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: async (file: Blob): Promise<Result<Blob>> => ok(file) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));

const mjolkId = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const smorId = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02";
const fresh = (name: string): PantrySuggestion["ingredient"] => ({
  kind: "new",
  proposalId: `n-${name}`,
  name,
  section: "Mejeri",
  location: "Kyl",
  defaultUnit: null,
});
const fridge: AnalyzeResult = {
  location: "Kyl",
  dropped: 0,
  suggestions: [
    { id: "s1", name: "gurka", ingredient: fresh("gurka"), location: "Kyl", amount: 2, unit: "st", current: null },
    { id: "s2", name: "ketchup", ingredient: fresh("ketchup"), location: "Kyl", amount: null, unit: null, current: null },
    {
      id: "s3",
      name: "mjölk",
      ingredient: { kind: "existing", ingredientId: mjolkId },
      location: "Kyl",
      amount: 1,
      unit: "förp",
      current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
    },
    {
      id: "s4",
      name: "smör",
      ingredient: { kind: "existing", ingredientId: smorId },
      location: "Kyl",
      amount: null,
      unit: null,
      current: { unlimited: true, amounts: [] },
    },
  ],
};

function Hemma({ location = "Kyl" }: { location?: Location }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location}>
          {/* Keyed like Hemma's <Suspense>: another card mounts them anew under the same provider. */}
          <div key={location}>
            <PantryCamera location={location} />
            <PantrySuggestionList />
          </div>
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

async function analyze(result: AnalyzeResult = fridge) {
  const inputs = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
  fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(answers.length).toBeGreaterThan(0));
  await act(async () => answers[answers.length - 1](ok(result)));
}

const section = () => screen.getByRole("region", { name: "Lagerförslag från kylen" });
const cards = () => within(section()).getAllByTestId("pantry-suggestion");

beforeEach(() => {
  answers = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("PantrySuggestionList", () => {
  it("shows nothing before a photo", () => {
    render(<Hemma />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows a card per suggestion with name, amount and place, Ny for a new ingredient and what the place has now", async () => {
    render(<Hemma />);
    await analyze();
    expect(within(section()).getByRole("heading", { level: 2 })).toHaveTextContent("Lagerförslag från kylen");
    const shown = cards().map((card) => ({
      name: within(card).getByRole("heading", { level: 3 }).textContent,
      text: card.textContent,
      isNew: within(card).queryByText("Ny") !== null,
    }));
    expect(shown).toEqual([
      { name: "gurka", text: "gurkaNy2 st · Kyl", isNew: true },
      { name: "ketchup", text: "ketchupNyFinns hemma · Kyl", isNew: true },
      { name: "mjölk", text: "mjölk1 förp · KylI kylen nu: 2 förp", isNew: false },
      { name: "smör", text: "smörFinns hemma · KylI kylen nu: finns hemma", isNew: false },
    ]);
    // No buttons yet: confirming, correcting and rejecting come with Story 6.2.
    expect(within(section()).queryAllByRole("button")).toEqual([]);
  });

  it("moves focus to the heading when suggestions arrive, but not again when it mounts under another card", async () => {
    const { rerender } = render(<Hemma />);
    await analyze();
    const heading = within(section()).getByRole("heading", { level: 2 });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute("tabindex", "-1");

    heading.blur();
    rerender(<Hemma location="Frys" />);
    // The photographed place stays in the heading and on the cards.
    expect(within(section()).getByRole("heading", { level: 2 })).not.toHaveFocus();
    expect(cards()[0]).toHaveTextContent("2 st · Kyl");
  });
});
