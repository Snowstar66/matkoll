import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import type { AiCallResult } from "@/lib/ai-client";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { PantryIngredientHit } from "../actions/search-ingredients";
import type { AnalyzeResult, ConfirmItemInput, PantrySuggestion } from "../domain/pantry-suggestion";
import { PantryCamera } from "./pantry-camera";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { PantrySuggestionsProvider } from "./pantry-suggestions";

// Lagerförslag: the section with one card per suggestion, filled through the
// camera with /api/ai/analyze and the resizing stubbed, and confirmed,
// corrected in the sheet Lagervara or rejected (Story 6.2) with
// confirmPantrySuggestions stubbed.

let answers: ((result: AiCallResult<unknown>) => void)[] = [];
vi.mock("@/lib/ai-client", () => ({
  postAiForm: () => new Promise<AiCallResult<unknown>>((resolve) => answers.push(resolve)),
}));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: async (file: Blob): Promise<Result<Blob>> => ok(file) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
const searchPantryIngredients = vi.fn<(query: string) => Promise<Result<PantryIngredientHit[]>>>();
vi.mock("../actions/search-ingredients", () => ({
  searchPantryIngredients: (query: string) => searchPantryIngredients(query),
}));
type Confirm = {
  items: ConfirmItemInput[];
  answer: (result: Result<{ count: number }>) => void;
  reject: (error: unknown) => void;
};
let confirms: Confirm[] = [];
vi.mock("../actions/confirm-pantry-suggestions", () => ({
  confirmPantrySuggestions: (items: ConfirmItemInput[]) =>
    new Promise<Result<{ count: number }>>((resolve, reject) => confirms.push({ items, answer: resolve, reject })),
}));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
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

function Hemma({ location = "Kyl", away = false }: { location?: Location; away?: boolean }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location}>
          {/* Keyed like Hemma's <Suspense>: another card mounts them anew under the same provider. `away`: its fallback. */}
          {away ? (
            <p>Laddar</p>
          ) : (
            <div key={location}>
              <PantryCamera location={location} />
              <PantrySuggestionList />
            </div>
          )}
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

/** Chooses a photo; resolves once its analysis has been sent, with the function that answers it. */
async function startPhoto() {
  const sent = answers.length;
  const inputs = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
  fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(answers.length).toBe(sent + 1));
  const answer = answers[sent];
  return async (result: AnalyzeResult) => act(async () => answer(ok(result)));
}

async function analyze(result: AnalyzeResult = fridge) {
  await (await startPhoto())(result);
}

const section = () => screen.getByRole("region", { name: "Lagerförslag från kylen" });
const cards = () => within(section()).getAllByTestId("pantry-suggestion");

beforeEach(() => {
  answers = [];
  confirms = [];
  refresh.mockReset();
  searchPantryIngredients.mockReset().mockResolvedValue(ok([]));
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
    ].map(({ text, ...rest }) => ({ ...rest, text: `${text}BekräftaRättaAvvisa` })));
  });

  it("gives each card Bekräfta, Rätta and Avvisa named after the suggestion, and the section Bekräfta alla under the heading", async () => {
    render(<Hemma />);
    await analyze();
    for (const card of cards()) {
      const name = within(card).getByRole("heading", { level: 3 }).textContent;
      expect(within(card).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
        `Bekräfta ${name}`,
        `Rätta ${name}`,
        `Avvisa ${name}`,
      ]);
      expect(within(card).getByRole("button", { name: `Bekräfta ${name}` })).toHaveTextContent("Bekräfta");
    }
    const all = within(section()).getByRole("button", { name: "Bekräfta alla" });
    const heading = within(section()).getByRole("heading", { level: 2 });
    expect(heading.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(all.compareDocumentPosition(cards()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing is saved before a tap.
    expect(confirms).toEqual([]);
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

const button = (name: string, index?: number) =>
  index === undefined
    ? within(section()).getByRole("button", { name })
    : within(section()).getAllByRole("button", { name })[index];
const cardNames = () =>
  screen.queryAllByTestId("pantry-suggestion").map((card) => within(card).getByRole("heading", { level: 3 }).textContent);
const toast = () => screen.getByTestId("toast");
const lastConfirm = () => confirms[confirms.length - 1];
const answerConfirm = async (result: Result<{ count: number }> = ok({ count: 1 })) => {
  await act(async () => lastConfirm().answer(result));
};
const sheet = () => screen.getByRole("dialog", { name: "Lagervara" });
const cameraButton = () => within(screen.getByTestId("pantry-camera")).getByRole("button", { name: "Fotografera kylen" });

describe("Bekräfta", () => {
  it("saves the suggestion as it is, at once, and takes its card out with a short confirmation", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
    expect(confirms).toHaveLength(1);
    expect(lastConfirm().items).toEqual([
      { ingredient: { kind: "existing", ingredientId: mjolkId }, location: "Kyl", amount: 1, unit: "förp" },
    ]);
    await answerConfirm();
    expect(cardNames()).toEqual(["gurka", "ketchup", "smör"]);
    expect(toast()).toHaveTextContent("mjölk är sparad i kylen.");
  });

  it("disables every suggestion button while saving, and the card says Sparar …", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta gurka"));
    const saving = cards()[0];
    expect(within(saving).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    expect(within(cards()[1]).getByRole("button", { name: "Bekräfta ketchup" })).toHaveTextContent("Bekräfta");
    for (const shown of within(section()).getAllByRole("button")) expect(shown).toBeDisabled();
    // A second tap saves nothing more.
    fireEvent.click(within(cards()[1]).getByRole("button", { name: "Bekräfta ketchup" }));
    fireEvent.click(within(saving).getByRole("button", { name: "Sparar …" }));
    expect(confirms).toHaveLength(1);
    await answerConfirm();
    await waitFor(() => expect(button("Bekräfta ketchup")).toBeEnabled());
  });

  it("moves focus to the next card's Bekräfta, else the previous card's, else the camera button", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta ketchup"));
    await answerConfirm();
    await waitFor(() => expect(button("Bekräfta mjölk")).toHaveFocus());

    fireEvent.click(button("Bekräfta smör"));
    await answerConfirm();
    await waitFor(() => expect(button("Bekräfta mjölk")).toHaveFocus());

    fireEvent.click(button("Bekräfta mjölk"));
    await answerConfirm();
    await waitFor(() => expect(button("Bekräfta gurka")).toHaveFocus());

    fireEvent.click(button("Bekräfta gurka"));
    await answerConfirm();
    // The last one: the section goes, and the camera button takes focus.
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    expect(toast()).toHaveTextContent("gurka är sparad i kylen.");
  });

  it("keeps the suggestions after a failure, says so at the top of the section, and gives focus back", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
    await answerConfirm(fail("pantry_confirm_failed"));
    const alert = await within(section()).findByRole("alert");
    expect(alert).toHaveTextContent("Det gick inte att lägga förslagen i lagret. Försök igen.");
    expect(section().firstElementChild).toContainElement(alert);
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    await waitFor(() => expect(button("Bekräfta mjölk")).toHaveFocus());
    expect(button("Bekräfta mjölk")).toBeEnabled();

    // Trying again: the notice goes while saving, and for good once it works.
    fireEvent.click(button("Bekräfta mjölk"));
    expect(within(section()).queryByRole("alert")).toBeNull();
    await answerConfirm();
    expect(cardNames()).toEqual(["gurka", "ketchup", "smör"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the same text when the call gets no answer", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
    await act(async () => lastConfirm().reject(new Error("offline")));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
    expect(cardNames()).toHaveLength(4);
  });

  it("reads the page again for an expired session, and keeps the suggestions", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
    await answerConfirm(fail("unauthorized"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(cardNames()).toHaveLength(4);
  });

  it("takes nothing out of newer suggestions when an older confirmation answers after them", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
    await analyze({ ...fridge, suggestions: fridge.suggestions.slice(2) });
    expect(cardNames()).toEqual(["mjölk", "smör"]);
    await answerConfirm();
    expect(cardNames()).toEqual(["mjölk", "smör"]);
  });
});

describe("Bekräfta alla", () => {
  it("saves every suggestion left in one call, says how many, and gives focus to the camera button", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta alla"));
    expect(confirms).toHaveLength(1);
    expect(lastConfirm().items.map((item) => item.ingredient)).toEqual(fridge.suggestions.map(({ ingredient }) => ingredient));
    // "Bekräfta alla" and every card say Sparar ….
    const savingButtons = within(section()).getAllByRole("button", { name: "Sparar …" });
    expect(savingButtons).toHaveLength(5);
    for (const saving of savingButtons) expect(saving).toBeDisabled();
    await answerConfirm(ok({ count: 4 }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(toast()).toHaveTextContent("Lagt 4 varor i lagret.");
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });

  it("leaves out the rejected suggestions, and is there while one suggestion is left", async () => {
    render(<Hemma />);
    await analyze();
    for (const name of ["gurka", "ketchup", "mjölk"]) fireEvent.click(button(`Avvisa ${name}`));
    expect(button("Bekräfta alla")).toBeInTheDocument();
    fireEvent.click(button("Bekräfta alla"));
    expect(lastConfirm().items).toEqual([
      { ingredient: { kind: "existing", ingredientId: smorId }, location: "Kyl", amount: null, unit: null },
    ]);
    await answerConfirm();
    expect(toast()).toHaveTextContent("smör är sparad i kylen.");
  });

  it("keeps the suggestions after a failure, with focus back on Bekräfta alla", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta alla"));
    await answerConfirm(fail("pantry_confirm_failed"));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
    expect(cardNames()).toHaveLength(4);
    await waitFor(() => expect(button("Bekräfta alla")).toHaveFocus());
  });
});

describe("Avvisa", () => {
  it("takes the card out at once without asking the server, with Ångra in the short confirmation", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Avvisa ketchup"));
    expect(cardNames()).toEqual(["gurka", "mjölk", "smör"]);
    expect(confirms).toEqual([]);
    expect(toast()).toHaveTextContent("ketchup är avvisad.");
    await waitFor(() => expect(button("Bekräfta mjölk")).toHaveFocus());

    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    await waitFor(() => expect(button("Bekräfta ketchup")).toHaveFocus());
    expect(confirms).toEqual([]);
  });

  it("undoes only the latest rejection", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Avvisa gurka"));
    fireEvent.click(button("Avvisa smör"));
    expect(toast()).toHaveTextContent("smör är avvisad.");
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["ketchup", "mjölk", "smör"]);
  });

  it("gives focus to the camera button after the last card, and Ångra brings the section back", async () => {
    render(<Hemma />);
    await analyze({ ...fridge, suggestions: fridge.suggestions.slice(1, 2) });
    fireEvent.click(button("Avvisa ketchup"));
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["ketchup"]);
  });

  it("puts nothing back into newer suggestions", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Avvisa ketchup"));
    await analyze({ ...fridge, suggestions: fridge.suggestions.slice(2) });
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["mjölk", "smör"]);
  });
});

describe("Rätta", () => {
  it("opens the sheet Lagervara filled in, and its Bekräfta saves the corrected suggestion", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    expect(within(sheet()).getByTestId("pantry-sheet-ingredient")).toHaveTextContent("mjölk");
    expect(within(sheet()).getByLabelText("Mängd")).toHaveValue("1");
    expect(within(sheet()).getByLabelText("Enhet")).toHaveValue("förp");
    expect(within(sheet()).getByRole("radio", { name: "Kyl" })).toHaveAttribute("aria-checked", "true");

    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2,5" } });
    fireEvent.click(within(sheet()).getByRole("radio", { name: "Frys" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(within(sheet()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    expect(lastConfirm().items).toEqual([
      { ingredient: { kind: "existing", ingredientId: mjolkId }, location: "Frys", amount: 2.5, unit: "förp" },
    ]);
    await answerConfirm();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cardNames()).toEqual(["gurka", "ketchup", "smör"]);
    expect(toast()).toHaveTextContent("mjölk är sparad i frysen.");
    await waitFor(() => expect(button("Bekräfta smör")).toHaveFocus());
  });

  it("swaps a new suggestion for another new ingredient, saved as new with the form's place", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta gurka"));
    expect(within(sheet()).getByText("Ny")).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Byt ingrediens" }));
    const field = within(sheet()).getByRole("searchbox", { name: "Sök ingrediens" });
    fireEvent.change(field, { target: { value: "slanggurka" } });
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Lägg till slanggurka som ny" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(lastConfirm().items).toEqual([
      {
        ingredient: { kind: "new", name: "slanggurka", section: "Övrigt", location: "Kyl", defaultUnit: "st" },
        location: "Kyl",
        amount: 2,
        unit: "st",
      },
    ]);
    await answerConfirm();
    expect(toast()).toHaveTextContent("slanggurka är sparad i kylen.");
  });

  it("keeps the sheet and the suggestion after a failure, with the text in the sheet", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    await answerConfirm(fail("pantry_confirm_failed"));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
    expect(cardNames()).toHaveLength(4);
  });

  it("Avvisa in the sheet closes it without asking and rejects the suggestion", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta ketchup"));
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avvisa" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cardNames()).toEqual(["gurka", "mjölk", "smör"]);
    expect(toast()).toHaveTextContent("ketchup är avvisad.");
    expect(confirms).toEqual([]);
  });

  it("closing the sheet unchanged keeps the suggestion as it was", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cardNames()).toHaveLength(4);
    expect(cards()[2]).toHaveTextContent("1 förp · Kyl");
  });
});

describe("Review patches", () => {
  it("Rätta and Bekräfta on a new suggestion keep its proposal, default place and unit while the ingredient is the same", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta gurka"));
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    fireEvent.click(within(sheet()).getByRole("radio", { name: "Frys" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(lastConfirm().items).toEqual([
      { ingredient: fridge.suggestions[0].ingredient, location: "Frys", amount: 3, unit: "st" },
    ]);
    await answerConfirm();
  });

  it.each(["Bekräfta", "Avvisa"])(
    "%s in the sheet sends and takes out nothing when a newer photo replaced its suggestion",
    async (verb) => {
      render(<Hemma />);
      await analyze();
      const answerPhoto = await startPhoto();
      fireEvent.click(button("Rätta mjölk"));
      await answerPhoto(fridge);
      expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
      await act(async () => fireEvent.click(within(sheet()).getByRole("button", { name: verb })));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(toast()).toHaveTextContent("Förslaget finns inte längre.");
      expect(confirms).toEqual([]);
      expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    },
  );

  it("Ångra while a confirmation is saved waits for it, and puts the suggestion back by its neighbours", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Avvisa ketchup"));
    // A card's Bekräfta while the rejection's Ångra still shows.
    fireEvent.click(button("Bekräfta gurka"));
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    // Not yet: the confirmation is on its way.
    expect(cardNames()).toEqual(["gurka", "mjölk", "smör"]);
    await answerConfirm();
    // gurka, before ketchup, is gone: ketchup goes back before mjölk, the one after it.
    expect(cardNames()).toEqual(["ketchup", "mjölk", "smör"]);
    await waitFor(() => expect(button("Bekräfta ketchup")).toHaveFocus());
  });

  it("updates I kylen nu on the suggestions left for the same ingredient and place", async () => {
    const mjolkLiter: PantrySuggestion = { ...fridge.suggestions[2], id: "s5", amount: 1, unit: "l" };
    render(<Hemma />);
    await analyze({ ...fridge, suggestions: [...fridge.suggestions, mjolkLiter] });
    fireEvent.click(button("Bekräfta mjölk", 0));
    await answerConfirm();
    expect(cardNames()).toEqual(["gurka", "ketchup", "smör", "mjölk"]);
    // 2 förp was set to 1 förp; the place has no litres yet.
    expect(within(cards()[3]).getByText(/^I kylen nu:/)).toHaveTextContent("I kylen nu: 1 förp");
  });

  it("marks the suggestions the server refuses, and Bekräfta alla leaves them out next time", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta alla"));
    await answerConfirm(fail("validation", { "1": "Förslaget går inte att spara som det är. Rätta eller avvisa det." }));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.validation);
    const refused = cards()[1];
    expect(refused).toHaveTextContent("Förslaget går inte att spara som det är. Rätta eller avvisa det.");
    expect(within(refused).getByRole("button", { name: "Bekräfta ketchup" })).toBeDisabled();
    expect(within(refused).getByRole("button", { name: "Rätta ketchup" })).toBeEnabled();

    fireEvent.click(button("Bekräfta alla"));
    expect(lastConfirm().items).toHaveLength(3);
    await answerConfirm(ok({ count: 3 }));
    expect(cardNames()).toEqual(["ketchup"]);
    expect(toast()).toHaveTextContent("Lagt 3 varor i lagret.");
  });

  it("counts a confirmation without an answer in 30 s as failed, so the buttons work again", async () => {
    render(<Hemma />);
    await analyze();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(button("Bekräfta mjölk"));
      await act(async () => vi.advanceTimersByTime(29_999));
      expect(button("Sparar …")).toBeDisabled();
      await act(async () => vi.advanceTimersByTime(1));
      expect(within(section()).getByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
      expect(button("Bekräfta mjölk")).toBeEnabled();
      // A late answer changes nothing.
      await answerConfirm();
      expect(cardNames()).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves focus once the list is back, when it was away as the confirmation answered", async () => {
    const { rerender } = render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
    rerender(<Hemma away />);
    await answerConfirm();
    expect(document.activeElement).toBe(document.body);
    rerender(<Hemma />);
    await waitFor(() => expect(button("Bekräfta smör")).toHaveFocus());
  });
});
