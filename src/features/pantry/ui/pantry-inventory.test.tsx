import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { ConfirmedInventory } from "../actions/confirm-pantry-inventory";
import type { restorePantryRemoval as RestoreAction } from "../actions/restore-pantry-removal";
import type { AnalyzeResult, InventoryConfirmInput, PantrySuggestion } from "../domain/pantry-suggestion";
import { PantryCamera } from "./pantry-camera";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { NotSeenCard } from "./not-seen-card";
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";
import { addAllButton, confirmOnly, rejectRow } from "./suggestion-test-helpers";
import { chooseUnit } from "./unit-test-helpers";

/** An item that exists shows its place as a row "Ligger i … · Flytta" (Story 16.17); the radio is there once it is unfolded. */
function placeRadio(scope: HTMLElement, name: string) {
  const row = within(scope).queryByRole("button", { name: /^Ligger i/ });
  if (row?.getAttribute("aria-expanded") === "false") fireEvent.click(row);
  return within(scope).getByRole("radio", { name });
}

/** The place Hemma shows (Story 8.2). */
const testSite = { id: "55555555-5555-4555-8555-555555555555" };
/** The place a photo was taken for (Story 8.4): the one Hemma shows. */
const photoSite = { id: testSite.id, name: "Hemma" };

// Story 6.4: a photo compared with a place that has items. The section with
// the groups Nytt, Ändrat and Syns inte längre, filled through the camera
// with the AI jobs and the resizing stubbed, and confirmed, removed,
// kept or undone with confirmPantryInventory and restorePantryRemoval
// stubbed. A photo of an empty place goes the Story 6.2 way
// (pantry-suggestion-list.test.tsx).

vi.mock("@/lib/ai-jobs-client", async () => (await import("../../../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
/** Story 10.1: the forms of the photo saves, which never answer here. */
let photoPosts: FormData[] = [];
vi.mock("./photo-post", () => ({
  postPlacePhoto: (form: FormData) => new Promise(() => photoPosts.push(form)),
}));
vi.mock("../actions/save-place-photo-points", () => ({ savePlacePhotoPoints: vi.fn() }));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: async (file: Blob): Promise<Result<Blob>> => ok(file) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn(async () => ok([])) }));
const confirmPantrySuggestions = vi.fn();
vi.mock("../actions/confirm-pantry-suggestions", () => ({
  confirmPantrySuggestions: (...args: unknown[]) => confirmPantrySuggestions(...args),
}));
type Saved = {
  input: InventoryConfirmInput;
  answer: (result: Result<ConfirmedInventory>) => void;
  reject: (error: unknown) => void;
};
let saves: Saved[] = [];
vi.mock("../actions/confirm-pantry-inventory", () => ({
  confirmPantryInventory: (input: InventoryConfirmInput) =>
    new Promise<Result<ConfirmedInventory>>((resolve, reject) => saves.push({ input, answer: resolve, reject })),
}));
const restorePantryRemoval = vi.fn<typeof RestoreAction>();
vi.mock("../actions/restore-pantry-removal", () => ({
  restorePantryRemoval: (operationId: string) => restorePantryRemoval(operationId),
}));
const removePantryItem = vi.fn();
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: (id: string) => removePantryItem(id) }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));

const uuid = (n: number) => `6f1c1b7e-3c1a-4c55-9a59-${String(n).padStart(12, "0")}`;
const mjolkId = uuid(1);
const smorId = uuid(2);
const aggId = uuid(3);
const yoghurtId = uuid(4);
const senapId = uuid(5);
const yoghurtRow = uuid(14);
const senapRow = uuid(15);
const mjolkForpRow = uuid(20);
const mjolkLiterRow = uuid(21);

const fresh = (id: string, name: string, amount: number | null, unit: PantrySuggestion["unit"]): PantrySuggestion => ({
  id,
  name,
  ingredient: { kind: "new", proposalId: `n-${name}`, name, section: "Mejeri", location: "Kyl", defaultUnit: null },
  location: "Kyl",
  amount,
  unit,
  current: null,
  change: "new",
  replaces: [],
});
const known = (
  id: string,
  name: string,
  ingredientId: string,
  change: Partial<PantrySuggestion>,
): PantrySuggestion => ({
  id,
  name,
  ingredient: { kind: "existing", ingredientId },
  location: "Kyl",
  amount: 1,
  unit: "förp",
  current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
  change: "changed",
  replaces: [],
  ...change,
});

/** The matrix's fridge: kyl.png against mjölk 2 förp, smör, ägg 6 st, yoghurt 2 förp and senap. */
const fridge: AnalyzeResult = {
  site: photoSite,
  location: "Kyl",
  dropped: 0,
  suggestions: [
    fresh("s1", "grädde", 1, "förp"),
    fresh("s2", "gurka", 2, "st"),
    fresh("s3", "ketchup", null, null),
    known("s4", "mjölk", mjolkId, { replaces: [mjolkLiterRow], placeRowIds: [mjolkForpRow, mjolkLiterRow] }),
    known("s5", "smör", smorId, {
      amount: null,
      unit: null,
      current: { unlimited: true, amounts: [] },
      change: "unchanged",
    }),
    known("s6", "ägg", aggId, {
      amount: 6,
      unit: "st",
      current: { unlimited: false, amounts: [{ amount: 6, unit: "st" }] },
      change: "unchanged",
    }),
  ],
  inventory: {
    kind: "compared",
    incomplete: false,
    missing: [
      {
        id: "missing:m1",
        ingredientId: senapId,
        name: "senap",
        location: "Kyl",
        rows: [{ id: senapRow, amount: null, unit: null }],
        stock: { unlimited: true, amounts: [] },
      },
      {
        id: "missing:m2",
        ingredientId: yoghurtId,
        name: "yoghurt",
        location: "Kyl",
        rows: [{ id: yoghurtRow, amount: 2, unit: "förp" }],
        stock: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
      },
    ],
  },
};

function Hemma({ location = "Kyl", shownSite = photoSite }: { location?: Location; shownSite?: { id: string; name: string } }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={testSite}>
          <div key={location}>
            <PantryCamera site={shownSite} location={location} />
            <PantrySuggestionList siteId={shownSite.id} />
            <NotSeenCard siteId={shownSite.id} location={location} />
          </div>
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

async function analyze(result: AnalyzeResult = fridge) {
  const sent = fakeAi.calls.length;
  const inputs = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
  fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(fakeAi.calls.length).toBe(sent + 1));
  await act(async () => fakeAi.calls[sent].answer(ok(result)));
}

const section = () => screen.getByRole("region", { name: "Förslag från fotot av kylen" });
const button = (name: string) => within(section()).getByRole("button", { name });
const toast = () => screen.getByTestId("toast");
const cameraButton = () => within(screen.getByTestId("pantry-camera")).getByRole("button", { name: "Fota" });
const lastSave = () => saves[saves.length - 1];
/** The names of the cards in a group, by its h3; Kylfoto D: "Syns inte längre", folded or not. */
function groupNames(title: string): string[] {
  if (title === "Syns inte längre") {
    return screen.queryAllByTestId("pantry-missing").map((item) => item.querySelector("h4")?.textContent ?? "");
  }
  const heading = within(section()).queryByRole("heading", { level: 3, name: title });
  if (!heading) return [];
  return within(heading.parentElement!)
    .getAllByRole("heading", { level: 4 })
    .map((name) => name.textContent ?? "");
}
/** The names of the suggestion rows (Nytt and Ändrat are one list now). */
const rowNames = () =>
  screen
    .queryAllByTestId("pantry-suggestion")
    .map((row) => within(row).getByRole("heading", { level: 3 }).querySelector("span")?.textContent ?? "");
const removedRow = (id: string, ingredientId: string) => ({
  id,
  ingredientId,
  location: "Kyl" as const,
  amount: null,
  unit: null,
});
const answered = (data: Partial<ConfirmedInventory> = {}): Result<ConfirmedInventory> =>
  ok({ set: 0, removed: [], removedCount: 0, undoable: 0, setIngredientIds: [], setRows: [], operationId: null, ...data });
async function answerSave(result: Result<ConfirmedInventory> = answered()) {
  await act(async () => lastSave().answer(result));
}

beforeEach(() => {
  fakeAi.reset();
  photoPosts = [];
  saves = [];
  refresh.mockReset();
  confirmPantrySuggestions.mockReset();
  removePantryItem.mockReset().mockResolvedValue(ok(null));
  restorePantryRemoval.mockReset().mockResolvedValue(ok({ restoredIds: [], rows: [], skipped: 0 }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the groups", () => {
  it("shows one list of rows and Syns inte längre, counts the unchanged ones, and saves nothing", async () => {
    render(<Hemma />);
    await analyze();
    expect(within(section()).getByRole("heading", { level: 2 })).toHaveTextContent("Förslag från fotot av kylen");
    expect(within(section()).getByText("2 varor stämmer med matvarorna.")).toBeInTheDocument();
    expect(rowNames()).toEqual(["grädde", "gurka", "ketchup", "mjölk"]);
    expect(within(section()).queryByRole("heading", { name: "Nytt" })).toBeNull();
    expect(within(section()).queryByRole("heading", { name: "Ändrat" })).toBeNull();
    // UX-08: what the photo did not show is asked about on its own card afterwards, not in the review.
    expect(screen.queryByTestId("pantry-missing")).toBeNull();
    expect(within(section()).getByTestId("pantry-suggestions-summary")).toHaveTextContent("3 nya · 1 uppdateras");
    expect(addAllButton()).toHaveTextContent("Lägg till 4 varor");
    // No card for smör and ägg, which match.
    expect(within(section()).queryByRole("heading", { name: "smör" })).toBeNull();
    await waitFor(() => expect(within(section()).getByRole("heading", { level: 2 })).toHaveFocus());
    expect(saves).toEqual([]);
  });

  it("shows what the place already has on a changed row, and only Rätta and the tick box as controls", async () => {
    render(<Hemma />);
    await analyze();
    const mjolk = screen.getAllByTestId("pantry-suggestion").find((card) => card.textContent?.startsWith("mjölk"))!;
    expect(mjolk).toHaveTextContent("finns redan 2 förp · Kyl");
    expect(mjolk).toHaveTextContent("1 förp");
    expect(mjolk).not.toHaveTextContent("→");
    expect(within(mjolk).getAllByRole("button").map((shown) => shown.getAttribute("aria-label"))).toEqual(["Rätta mjölk", "Ändra mängd för mjölk, 1 förp"]);
    expect(within(mjolk).getByRole("checkbox", { name: "Ta med mjölk" })).toBeChecked();
  });

  it("shows the plain list with a line under the heading when the place could not be read", async () => {
    render(<Hemma />);
    await analyze({
      ...fridge,
      suggestions: fridge.suggestions.map((suggestion) => ({ ...suggestion, change: null, replaces: [], current: null })),
      inventory: { kind: "unread" },
    });
    expect(within(section()).getByText("Det gick inte att jämföra med matvarorna i kylen.")).toBeInTheDocument();
    expect(within(section()).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "grädde",
      "gurka",
      "ketchup",
      "mjölk",
      "smör",
      "ägg",
    ]);
    expect(screen.queryByTestId("pantry-missing")).toBeNull();
    confirmOnly("mjölk");
    await waitFor(() => expect(confirmPantrySuggestions).toHaveBeenCalledTimes(1));
    expect(saves).toEqual([]);
  });

  it("says everything matches in the camera area, without a section, when nothing changed or is missing", async () => {
    render(<Hemma />);
    await analyze({
      ...fridge,
      suggestions: fridge.suggestions.slice(4),
      inventory: { kind: "compared", incomplete: false, missing: [] },
    });
    const status = within(screen.getByTestId("pantry-camera")).getByText("Allt i kylen stämmer med bilden.");
    expect(status).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("pantry-suggestions")).toBeNull();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });
});

describe("Bekräfta on a compared photo", () => {
  it("saves an Ändrat card with the rows it replaces and no removal, and takes it out", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("mjölk");
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input).toEqual({
      siteId: photoSite.id,
      location: "Kyl",
      items: [{ ingredient: { kind: "existing", ingredientId: mjolkId }, location: "Kyl", amount: 1, unit: "förp" }],
      replaceRowIds: [mjolkLiterRow],
      removeRowIds: [],
      operationId: null,
      joinsOperation: false,
    });
    expect(within(section()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    for (const shown of within(section()).getAllByRole("button")) {
      // Only the photo and the fold of Syns inte längre can still be used: they change nothing.
      if (shown.dataset.testid === "pantry-analyzed-photo" || shown.dataset.testid === "pantry-missing-toggle") {
        expect(shown).toBeEnabled();
      } else {
        expect(shown).toBeDisabled();
      }
    }
    await answerSave(answered({ set: 1 }));
    // UX-08: "Lägg till N varor" closes the review, also for the rows that were left unticked.
    expect(rowNames()).toEqual([]);
    expect(screen.queryByTestId("pantry-suggestions")).toBeNull();
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 1 ändrad.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
    // A save from "Lägg till" gives focus to the camera button.
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });

  it("keeps the cards after a failure and says so at the top of the section", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("grädde");
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(fail("pantry_inventory_failed"));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(
      "Det gick inte att uppdatera matvarorna. Försök igen.",
    );
    expect(rowNames()).toEqual(["grädde", "gurka", "ketchup", "mjölk"]);
    await waitFor(() => expect(addAllButton()).toHaveFocus());
  });

  it("counts a call without an answer as failed, with the same text", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("grädde");
    await waitFor(() => expect(saves).toHaveLength(1));
    await act(async () => lastSave().reject(new Error("offline")));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_inventory_failed);
  });

  it("saves the sheet's Bekräfta through the inventory, with the replaced rows only for the suggestion's own ingredient and place", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Mängd"), { target: { value: "3" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input).toMatchObject({
      items: [{ ingredient: { kind: "existing", ingredientId: mjolkId }, location: "Kyl", amount: 3, unit: "förp" }],
      replaceRowIds: [mjolkLiterRow],
      removeRowIds: [],
    });
    await answerSave(answered({ set: 1 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(groupNames("Ändrat")).toEqual([]);

    // Another place: the fridge's rows stay.
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    const moved = screen.getByRole("dialog");
    fireEvent.click(placeRadio(moved, "Frys"));
    fireEvent.click(within(moved).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(lastSave().input).toMatchObject({ items: [{ location: "Frys" }], replaceRowIds: [] });
  });
});

describe("the photo's place (Story 8.4)", () => {
  const stugan = { id: "66666666-6666-4666-8666-666666666666", name: "Stugan" };

  it("saves Rätta's Bekräfta and Lägg till on the photo's place while Hemma shows another", async () => {
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyze({ ...fridge, site: stugan });
    rerender(<Hemma shownSite={photoSite} />);
    expect(screen.getByTestId("pantry-suggestions-site")).toHaveTextContent("Förslagen gäller Stugan.");

    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input.siteId).toBe(stugan.id);
    await answerSave(answered({ set: 1 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(lastSave().input).toMatchObject({ siteId: stugan.id, removeRowIds: [] });
  });

  it("drops the suggestions when their place is gone, and says so in the camera area", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(fail("pantry_site_gone"));
    await waitFor(() => expect(screen.queryByTestId("pantry-suggestions")).toBeNull());
    expect(within(screen.getByTestId("pantry-camera")).getByRole("alert")).toHaveTextContent(
      "Boendet finns inte längre. Välj ett annat boende.",
    );
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });
});

describe("syntes inte på fotot (UX-08)", () => {
  const card = () => screen.getByTestId("pantry-not-seen");
  /** Lägg till N varor, answered: the review closes and the card comes. */
  async function addAll() {
    await analyze();
    expect(screen.queryByTestId("pantry-not-seen")).toBeNull();
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 4 }));
  }

  it("closes the review after Lägg till, and the card names what was not seen with Behåll and Välj vilka", async () => {
    render(<Hemma />);
    await addAll();
    expect(screen.queryByTestId("pantry-suggestions")).toBeNull();
    expect(card()).toHaveTextContent("2 varor syntes inte på fotot. Ta bort dem?");
    expect(card()).toHaveTextContent("senap och yoghurt");
    expect(within(card()).getByRole("button", { name: "Behåll" })).toBeInTheDocument();
    expect(within(card()).getByRole("button", { name: "Välj vilka" })).toBeInTheDocument();
  });

  it("offers Ångra for the rows that were added new, and takes them out again", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    const [first, second] = [uuid(901), uuid(902)];
    // gurka and grädde are new; mjölk is "Ändrat" and keeps its row as it is.
    await answerSave(
      answered({
        set: 4,
        setRows: [
          { id: first, ingredientId: uuid(31) },
          { id: second, ingredientId: uuid(32) },
          { id: uuid(903), ingredientId: mjolkId },
        ],
      }),
    );
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 3 nya och 1 ändrad.");
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(removePantryItem).toHaveBeenCalledTimes(2));
    expect(removePantryItem.mock.calls.map(([id]) => id).sort()).toEqual([first, second].sort());
  });

  it("Behåll takes the card away and removes nothing", async () => {
    render(<Hemma />);
    await addAll();
    fireEvent.click(within(card()).getByRole("button", { name: "Behåll" }));
    expect(screen.queryByTestId("pantry-not-seen")).toBeNull();
    expect(saves).toHaveLength(1);
  });

  it("Välj vilka opens a sheet with empty tick boxes, and Ta bort N varor removes only the ticked, with Ångra", async () => {
    render(<Hemma />);
    await addAll();
    fireEvent.click(within(card()).getByRole("button", { name: "Välj vilka" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getAllByRole("checkbox")).toHaveLength(2);
    for (const box of within(sheet).getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(within(sheet).getByRole("button", { name: "Ta bort 0 varor" })).toBeDisabled();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Ta bort yoghurt" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort 1 vara" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    const operationId = lastSave().input.operationId;
    expect(lastSave().input).toMatchObject({ siteId: photoSite.id, items: [], removeRowIds: [yoghurtRow], replaceRowIds: [] });
    expect(operationId).toEqual(expect.any(String));
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1, operationId }));
    await waitFor(() => expect(screen.queryByTestId("pantry-not-seen")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(toast()).toHaveTextContent("Tog bort Yoghurt."));
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restorePantryRemoval).toHaveBeenCalledWith(operationId));
  });

  it("says why in the sheet when the removal fails, and keeps the card", async () => {
    render(<Hemma />);
    await addAll();
    fireEvent.click(within(card()).getByRole("button", { name: "Välj vilka" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Ta bort senap" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort 1 vara" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    await answerSave(fail("pantry_inventory_failed"));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(errorMessages.pantry_inventory_failed);
    expect(screen.getByTestId("pantry-not-seen")).toBeInTheDocument();
  });

  it("goes with the next photo", async () => {
    render(<Hemma />);
    await addAll();
    expect(card()).toBeInTheDocument();
    const inputs = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(["x"], "IMG_2.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.queryByTestId("pantry-not-seen")).toBeNull());
  });

  it("is only there for the place and location of the photo", async () => {
    const { rerender } = render(<Hemma />);
    await addAll();
    rerender(<Hemma location="Frys" />);
    expect(screen.queryByTestId("pantry-not-seen")).toBeNull();
    rerender(<Hemma location="Kyl" />);
    expect(card()).toBeInTheDocument();
  });

  it("says to check first when the comparison is incomplete", async () => {
    render(<Hemma />);
    const incompleteFridge: AnalyzeResult = {
      ...fridge,
      inventory: { ...(fridge.inventory as Extract<AnalyzeResult["inventory"], { kind: "compared" }>), incomplete: true },
    };
    await analyze(incompleteFridge);
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 4 }));
    expect(card()).toHaveTextContent("Kontrollera innan du tar bort.");
  });
});

describe("Lägg till on a compared photo", () => {
  it("saves the ticked rows in one call without the removals, counts them, and leaves Syns inte längre alone", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    const { input } = lastSave();
    expect(input.items.map((item) => item.ingredient)).toEqual(fridge.suggestions.slice(0, 4).map(({ ingredient }) => ingredient));
    expect(input.replaceRowIds).toEqual([mjolkLiterRow]);
    // Nothing in Syns inte längre is ticked, so nothing is removed.
    expect(input.removeRowIds).toEqual([]);
    expect(input.operationId).toBeNull();
    expect(addAllButton()).toHaveTextContent("Sparar …");
    expect(within(section()).getAllByText("Sparar …")).toHaveLength(5);
    await answerSave(answered({ set: 4 }));
    expect(rowNames()).toEqual([]);
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 3 nya och 1 ändrad.");
    expect(within(toast()).queryByRole("button", { name: /^Ångra/ })).toBeNull();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    // UX-08: the review is closed; the two items the photo did not show wait for their card.
    expect(screen.queryByTestId("pantry-suggestions")).toBeNull();
    expect(screen.getByTestId("pantry-not-seen")).toHaveTextContent("2 varor syntes inte på fotot. Ta bort dem?");
  });

  it("leaves out rejected rows, and offers no Ångra", async () => {
    render(<Hemma />);
    await analyze();
    rejectRow("ketchup");
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input).toMatchObject({ removeRowIds: [], operationId: null });
    expect(lastSave().input.items).toHaveLength(3);
    await answerSave(answered({ set: 3 }));
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 2 nya och 1 ändrad.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
  });

  it("keeps everything after a failure, with focus back on Lägg till", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(fail("pantry_inventory_failed"));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_inventory_failed);
    expect(rowNames()).toHaveLength(4);
    expect(screen.queryByTestId("pantry-not-seen")).toBeNull();
    await waitFor(() => expect(addAllButton()).toHaveFocus());
  });
});

describe("review patches", () => {
  const incomplete = (result: AnalyzeResult): AnalyzeResult => ({
    ...result,
    inventory: { ...(result.inventory as Extract<AnalyzeResult["inventory"], { kind: "compared" }>), incomplete: true },
  });

  it("shows no review and no card for a photo without usable items, and says it could not be read", async () => {
    render(<Hemma />);
    await analyze({ ...incomplete(fridge), dropped: 3, suggestions: [] });
    // Nothing was read, so nothing is "not seen": the camera area says so, as for any photo that gave nothing.
    expect(screen.queryByTestId("pantry-suggestions")).toBeNull();
    expect(screen.queryByTestId("pantry-not-seen")).toBeNull();
    expect(screen.getByText(/Det gick inte att tolka varorna på bilden/)).toBeInTheDocument();
  });

  it("starts an unsure changed row unticked, with a ?, and saves it once ticked (Story 6.5)", async () => {
    render(<Hemma />);
    const unsure = { ...fridge.suggestions[3], labels: ["Vit förpackning, troligen mjölk"], uncertain: true };
    await analyze({ ...fridge, suggestions: [...fridge.suggestions.slice(0, 3), unsure, ...fridge.suggestions.slice(4)] });
    expect(rowNames()).toEqual(["grädde", "gurka", "ketchup", "Vit förpackning, troligen mjölk"]);
    expect(screen.getAllByTestId("pantry-suggestion")[3]).toHaveTextContent("?");
    expect(screen.getByRole("checkbox", { name: "Ta med mjölk" })).not.toBeChecked();
    expect(within(section()).getByTestId("pantry-suggestions-summary")).toHaveTextContent("3 nya");
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    const { input } = lastSave();
    expect(input.items.map((item) => item.ingredient)).toEqual(fridge.suggestions.slice(0, 3).map(({ ingredient }) => ingredient));
    // The unsure row's rows in other units are not replaced either.
    expect(input.replaceRowIds).toEqual([]);
    expect(input.removeRowIds).toEqual([]);
    await answerSave(answered({ set: 3 }));
    // UX-08: the review closes, and the unsure row that was left unticked goes with it.
    expect(rowNames()).toEqual([]);
  });

  it("says only part matches, not Allt i kylen stämmer, when items could not be read", async () => {
    render(<Hemma />);
    await analyze({
      ...fridge,
      dropped: 1,
      suggestions: fridge.suggestions.slice(4),
      inventory: { kind: "compared", incomplete: true, missing: [] },
    });
    expect(
      within(screen.getByTestId("pantry-camera")).getByText(
        "Det som syns på bilden stämmer med matvarorna i kylen, men några varor gick inte att tolka.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Allt i kylen stämmer med bilden.")).toBeNull();
  });

  it("replaces every row of the ingredient in the place when the sheet changes the unit", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog");
    chooseUnit("l", sheet);
    fireEvent.click(within(sheet).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input).toMatchObject({
      items: [{ amount: 1, unit: "l" }],
      replaceRowIds: [mjolkForpRow, mjolkLiterRow],
    });
  });

  it("keeps Lägg till within the replace limit and leaves the rest as cards, saying so", async () => {
    const rows = (from: number) => Array.from({ length: 30 }, (_, n) => uuid(1000 + from + n));
    render(<Hemma />);
    await analyze({
      ...fridge,
      suggestions: [
        known("s4", "mjölk", mjolkId, { replaces: rows(0) }),
        known("s7", "smör", smorId, { amount: 250, unit: "g", replaces: rows(100) }),
      ],
      inventory: { kind: "compared", incomplete: false, missing: [] },
    });
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input.replaceRowIds).toHaveLength(30);
    expect(lastSave().input.items).toHaveLength(1);
    await answerSave(answered({ set: 1 }));
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 1 ändrad. 1 ändring är kvar att bekräfta.");
    expect(rowNames()).toEqual(["smör"]);
  });

});

describe("Senaste foto (Story 10.1)", () => {
  const stugan = { id: "66666666-6666-4666-8666-666666666666", name: "Stugan" };

  it("saves the photo when Rätta's Bekräfta is the first write", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 1 }));
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].get("site")).toBe(photoSite.id);
  });

  it("saves the photo once on its place and location after a compared photo's Bekräfta", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("grädde");
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 1 }));
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].get("site")).toBe(photoSite.id);
    expect(photoPosts[0].get("location")).toBe("Kyl");
    // The review is closed after Lägg till: nothing more to save from it.
    expect(screen.queryByTestId("pantry-suggestions")).toBeNull();
    expect(saves).toHaveLength(1);
  });

  it("saves the photo once on its place and location after a compared photo's Lägg till", async () => {
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyze({ ...fridge, site: stugan });
    rerender(<Hemma shownSite={photoSite} />);
    fireEvent.click(addAllButton());
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 4 }));
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].get("site")).toBe(stugan.id);
    expect(photoPosts[0].get("location")).toBe("Kyl");
  });

});
