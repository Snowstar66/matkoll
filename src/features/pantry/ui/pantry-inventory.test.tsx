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
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";

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
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
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

const section = () => screen.getByRole("region", { name: "Lagerförslag från kylen" });
const button = (name: string) => within(section()).getByRole("button", { name });
const toast = () => screen.getByTestId("toast");
const cameraButton = () => within(screen.getByTestId("pantry-camera")).getByRole("button", { name: "Fotografera kylen" });
const lastSave = () => saves[saves.length - 1];
/** The names of the cards in a group, by its h3. */
function groupNames(title: string): string[] {
  const heading = within(section()).queryByRole("heading", { level: 3, name: title });
  if (!heading) return [];
  return within(heading.parentElement!)
    .getAllByRole("heading", { level: 4 })
    .map((name) => name.textContent ?? "");
}
const removedRow = (id: string, ingredientId: string) => ({
  id,
  ingredientId,
  location: "Kyl" as const,
  amount: null,
  unit: null,
});
const answered = (data: Partial<ConfirmedInventory> = {}): Result<ConfirmedInventory> =>
  ok({ set: 0, removed: [], removedCount: 0, undoable: 0, setIngredientIds: [], operationId: null, ...data });
async function answerSave(result: Result<ConfirmedInventory> = answered()) {
  await act(async () => lastSave().answer(result));
}

beforeEach(() => {
  fakeAi.reset();
  photoPosts = [];
  saves = [];
  refresh.mockReset();
  confirmPantrySuggestions.mockReset();
  restorePantryRemoval.mockReset().mockResolvedValue(ok({ restoredIds: [], rows: [], skipped: 0 }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the groups", () => {
  it("shows Nytt, Ändrat and Syns inte längre, counts the unchanged ones, and saves nothing", async () => {
    render(<Hemma />);
    await analyze();
    expect(within(section()).getByRole("heading", { level: 2 })).toHaveTextContent("Lagerförslag från kylen");
    expect(within(section()).getByText("2 varor stämmer med matvarorna.")).toBeInTheDocument();
    expect(within(section()).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Nytt",
      "Ändrat",
      "Syns inte längre",
    ]);
    expect(groupNames("Nytt")).toEqual(["grädde", "gurka", "ketchup"]);
    expect(groupNames("Ändrat")).toEqual(["mjölk"]);
    expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]);
    // No card for smör and ägg, which match.
    expect(within(section()).queryByRole("heading", { name: "smör" })).toBeNull();
    await waitFor(() => expect(within(section()).getByRole("heading", { level: 2 })).toHaveFocus());
    expect(saves).toEqual([]);
  });

  it("shows the change on an Ändrat card, with the arrow hidden and a sentence for screen readers", async () => {
    render(<Hemma />);
    await analyze();
    const mjolk = screen.getAllByTestId("pantry-suggestion").find((card) => card.textContent?.startsWith("mjölk"))!;
    const visible = within(mjolk).getByText("nu: 2 förp → bilden: 1 förp");
    expect(visible).toHaveAttribute("aria-hidden", "true");
    expect(within(mjolk).getByText("I kylen nu: 2 förp. På bilden: 1 förp.")).toHaveClass("sr-only");
    expect(within(mjolk).queryByText(/^I kylen nu: 2 förp$/)).toBeNull();
    expect(within(mjolk).getAllByRole("button").map((shown) => shown.getAttribute("aria-label"))).toEqual([
      "Bekräfta mjölk",
      "Rätta mjölk",
      "Avvisa mjölk",
    ]);
  });

  it("gives a Syns inte längre card what the place has, Ta bort and Behåll, and no Rätta", async () => {
    render(<Hemma />);
    await analyze();
    const [senap, yoghurt] = screen.getAllByTestId("pantry-missing");
    expect(senap).toHaveTextContent("senapI kylen nu: finns hemmaTa bortBehåll");
    expect(yoghurt).toHaveTextContent("yoghurtI kylen nu: 2 förpTa bortBehåll");
    expect(within(yoghurt).getAllByRole("button").map((shown) => shown.getAttribute("aria-label"))).toEqual([
      "Ta bort yoghurt",
      "Behåll yoghurt",
    ]);
    // Ta bort is primary, like Bekräfta; there is no text under the group heading.
    expect(within(yoghurt).getByRole("button", { name: "Ta bort yoghurt" }).className).toBe(
      within(section()).getByRole("button", { name: "Bekräfta mjölk" }).className,
    );
    expect(within(section()).queryByText(/gick inte att tolka/)).toBeNull();
  });

  it("leaves out an empty group, and says to check before removing when items could not be read", async () => {
    render(<Hemma />);
    await analyze({
      ...fridge,
      dropped: 2,
      suggestions: fridge.suggestions.slice(3),
      inventory: { ...fridge.inventory, incomplete: true } as AnalyzeResult["inventory"],
    });
    expect(within(section()).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Ändrat",
      "Syns inte längre",
    ]);
    const missing = within(section()).getByRole("heading", { level: 3, name: "Syns inte längre" }).parentElement!;
    expect(within(missing).getByText("Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort.")).toBeInTheDocument();
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
    fireEvent.click(button("Bekräfta mjölk"));
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
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });
});

describe("Bekräfta on a compared photo", () => {
  it("saves an Ändrat card with the rows it replaces and no removal, and takes it out", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
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
      // Only the photo can still be looked at: it changes nothing.
      if (shown.dataset.testid === "pantry-analyzed-photo") expect(shown).toBeEnabled();
      else expect(shown).toBeDisabled();
    }
    await answerSave(answered({ set: 1 }));
    expect(groupNames("Ändrat")).toEqual([]);
    expect(toast()).toHaveTextContent("mjölk är sparad i kylen.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
    // Focus follows the cards: Nytt, Ändrat, then Syns inte längre.
    await waitFor(() => expect(button("Ta bort senap")).toHaveFocus());
  });

  it("keeps the cards after a failure and says so at the top of the section", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta grädde"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(fail("pantry_inventory_failed"));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(
      "Det gick inte att uppdatera matvarorna. Försök igen.",
    );
    expect(groupNames("Nytt")).toEqual(["grädde", "gurka", "ketchup"]);
    await waitFor(() => expect(button("Bekräfta grädde")).toHaveFocus());
  });

  it("counts a call without an answer as failed, with the same text", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta grädde"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await act(async () => lastSave().reject(new Error("offline")));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_inventory_failed);
  });

  it("saves the sheet's Bekräfta through the inventory, with the replaced rows only for the suggestion's own ingredient and place", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog", { name: "Lagervara" });
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
    const moved = screen.getByRole("dialog", { name: "Lagervara" });
    fireEvent.click(placeRadio(moved, "Frys"));
    fireEvent.click(within(moved).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(lastSave().input).toMatchObject({ items: [{ location: "Frys" }], replaceRowIds: [] });
  });
});

describe("the photo's place (Story 8.4)", () => {
  const stugan = { id: "66666666-6666-4666-8666-666666666666", name: "Stugan" };

  it("saves Rätta's Bekräfta, Ta bort and Bekräfta alla on the photo's place while Hemma shows another", async () => {
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyze({ ...fridge, site: stugan });
    rerender(<Hemma shownSite={photoSite} />);
    expect(screen.getByTestId("pantry-suggestions-site")).toHaveTextContent("Förslagen gäller Stugan.");

    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog", { name: "Lagervara" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input.siteId).toBe(stugan.id);
    await answerSave(answered({ set: 1 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(lastSave().input).toMatchObject({ siteId: stugan.id, removeRowIds: [yoghurtRow] });
  });

  it("never sends the operation id of one place's failed removal with another place's", async () => {
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyze({ ...fridge, site: stugan });
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    const stuganOperation = lastSave().input.operationId;
    // No answer: the id is kept for the next removal on the same place and location only.
    await answerSave(fail("pantry_inventory_failed"));

    rerender(<Hemma shownSite={photoSite} />);
    await analyze({ ...fridge, site: photoSite });
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(lastSave().input.siteId).toBe(testSite.id);
    expect(lastSave().input.operationId).not.toBe(stuganOperation);
  });

  it("keeps separate batches per place: a Hemma photo's removal never joins Stugan's confirmation that shows", async () => {
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyze({ ...fridge, site: stugan });
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    const stuganOperation = lastSave().input.operationId;
    expect(lastSave().input.joinsOperation).toBe(false);
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1, operationId: stuganOperation }));
    // Stugan's confirmation with Ångra still shows.
    expect(within(toast()).getByRole("button", { name: "Ångra" })).toBeInTheDocument();

    rerender(<Hemma shownSite={photoSite} />);
    await analyze({ ...fridge, site: photoSite });
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(lastSave().input).toMatchObject({ siteId: photoSite.id, joinsOperation: false });
    expect(lastSave().input.operationId).not.toBe(stuganOperation);
  });

  it("sends the batch it joins with joinsOperation, so a taken id is never swapped in silence", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    const operation = lastSave().input.operationId;
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1, operationId: operation }));
    fireEvent.click(button("Ta bort senap"));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(lastSave().input).toMatchObject({ operationId: operation, joinsOperation: true });
  });

  it("drops the suggestions when their place is gone, and says so in the camera area", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(fail("pantry_site_gone"));
    await waitFor(() => expect(screen.queryByTestId("pantry-suggestions")).toBeNull());
    expect(within(screen.getByTestId("pantry-camera")).getByRole("alert")).toHaveTextContent(
      "Boendet finns inte längre. Välj ett annat boende.",
    );
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });
});

describe("Ta bort, Behåll and Ångra", () => {
  it("removes the rows at once with Ångra, which puts them back by the operation id", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    const { input } = lastSave();
    expect(input).toMatchObject({ location: "Kyl", items: [], replaceRowIds: [], removeRowIds: [yoghurtRow] });
    expect(input.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(within(section()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1 }));
    expect(groupNames("Syns inte längre")).toEqual(["senap"]);
    expect(toast()).toHaveTextContent("Yoghurt är borttagen.");

    restorePantryRemoval.mockResolvedValueOnce(ok({ restoredIds: [yoghurtRow], rows: [], skipped: 0 }));
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restorePantryRemoval).toHaveBeenCalledExactlyOnceWith(input.operationId));
    // The card comes back while the suggestions are the same.
    await waitFor(() => expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]));
  });

  it("joins removals while the confirmation shows, and one Ångra puts them all back", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1 }));
    fireEvent.click(button("Ta bort senap"));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1].input.operationId).toBe(saves[0].input.operationId);
    await answerSave(answered({ removed: [removedRow(senapRow, senapId)], removedCount: 1, undoable: 2 }));
    expect(toast()).toHaveTextContent("Yoghurt och senap är borttagna.");
    restorePantryRemoval.mockResolvedValueOnce(ok({ restoredIds: [yoghurtRow], rows: [], skipped: 1 }));
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("1 vara gick inte att ångra."));
    expect(restorePantryRemoval).toHaveBeenCalledTimes(1);
    // Only the card whose rows came back returns.
    expect(groupNames("Syns inte längre")).toEqual(["yoghurt"]);
  });

  it("says an item was gone already, without Ångra", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered());
    expect(toast()).toHaveTextContent("yoghurt är redan borttagen.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
    expect(groupNames("Syns inte längre")).toEqual(["senap"]);
  });

  it("sends the same operation id again after a removal without an answer, so Ångra finds what it took", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await act(async () => lastSave().reject(new Error("offline")));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_inventory_failed);
    expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]);
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1].input.operationId).toBe(saves[0].input.operationId);
    // The rows went with the first call: nothing more now, but the server keeps them for Ångra.
    await answerSave(answered({ undoable: 1 }));
    expect(toast()).toHaveTextContent("Yoghurt är borttagen.");
    expect(within(toast()).getByRole("button", { name: "Ångra" })).toBeInTheDocument();
  });

  it("Behåll takes the card out without saving, and Ångra puts it back with focus on its Ta bort", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Behåll senap"));
    expect(groupNames("Syns inte längre")).toEqual(["yoghurt"]);
    expect(toast()).toHaveTextContent("senap står kvar i kylen.");
    await waitFor(() => expect(button("Ta bort yoghurt")).toHaveFocus());
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]);
    await waitFor(() => expect(button("Ta bort senap")).toHaveFocus());
    expect(saves).toEqual([]);
  });
});

describe("Bekräfta alla on a compared photo", () => {
  it("saves Nytt, Ändrat and the removals in one call, counts them, and Ångra puts back the removals", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(1));
    const { input } = lastSave();
    expect(input.items.map((item) => item.ingredient)).toEqual(fridge.suggestions.slice(0, 4).map(({ ingredient }) => ingredient));
    expect(input.replaceRowIds).toEqual([mjolkLiterRow]);
    expect(input.removeRowIds).toEqual([senapRow, yoghurtRow]);
    expect(input.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(within(section()).getAllByRole("button", { name: "Sparar …" })).toHaveLength(7);
    await answerSave(
      answered({
        set: 4,
        removed: [removedRow(senapRow, senapId), removedRow(yoghurtRow, yoghurtId)],
        removedCount: 2,
        undoable: 2,
      }),
    );
    expect(screen.queryByRole("region")).toBeNull();
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 3 nya, 1 ändrad och 2 borttagna.");
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    // The undo puts back only the removals, and says so.
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
    restorePantryRemoval.mockResolvedValueOnce(ok({ restoredIds: [senapRow, yoghurtRow], rows: [], skipped: 0 }));
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra borttagning" }));
    await waitFor(() => expect(restorePantryRemoval).toHaveBeenCalledExactlyOnceWith(input.operationId));
    // Their cards are back; what was added and changed stays.
    await waitFor(() => expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]));
    expect(groupNames("Nytt")).toEqual([]);
  });

  it("leaves out rejected and kept cards, and offers no Ångra without removals", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Avvisa ketchup"));
    fireEvent.click(button("Behåll senap"));
    fireEvent.click(button("Behåll yoghurt"));
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input).toMatchObject({ removeRowIds: [], operationId: null });
    expect(lastSave().input.items).toHaveLength(3);
    await answerSave(answered({ set: 3 }));
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 2 nya och 1 ändrad.");
    expect(within(toast()).queryByRole("button", { name: "Ångra" })).toBeNull();
  });

  it("keeps everything after a failure, with focus back on Bekräfta alla", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(fail("pantry_inventory_failed"));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_inventory_failed);
    expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]);
    await waitFor(() => expect(button("Bekräfta alla")).toHaveFocus());
  });
});

describe("review patches", () => {
  const incomplete = (result: AnalyzeResult): AnalyzeResult => ({
    ...result,
    inventory: { ...(result.inventory as Extract<AnalyzeResult["inventory"], { kind: "compared" }>), incomplete: true },
  });

  it("keeps Syns inte längre after every other card is confirmed, with focus on its first Ta bort", async () => {
    render(<Hemma />);
    await analyze();
    for (const name of ["grädde", "gurka", "ketchup", "mjölk"]) {
      fireEvent.click(button(`Bekräfta ${name}`));
      await waitFor(() => expect(saves.length).toBeGreaterThan(0));
      await answerSave(answered({ set: 1 }));
    }
    expect(groupNames("Nytt")).toEqual([]);
    expect(groupNames("Ändrat")).toEqual([]);
    expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]);
    await waitFor(() => expect(button("Ta bort senap")).toHaveFocus());
  });

  it("shows a photo without usable items of a place with items as Syns inte längre, with the warning, not the empty notice", async () => {
    render(<Hemma />);
    await analyze({ ...incomplete(fridge), dropped: 3, suggestions: [] });
    expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]);
    expect(within(section()).getByText(/gick inte att tolka\. Kontrollera innan du tar bort\./)).toBeInTheDocument();
    expect(screen.queryByText(/Det gick inte att tolka varorna på bilden/)).toBeNull();
    // Only Ta bort removes from an incomplete comparison.
    expect(button("Bekräfta alla")).toBeDisabled();
  });

  it("leaves an unsure Ändrat card out of Bekräfta alla, with its badge, and says it is left (Story 6.5)", async () => {
    render(<Hemma />);
    const unsure = { ...fridge.suggestions[3], labels: ["Vit förpackning, troligen mjölk"], uncertain: true };
    await analyze({ ...fridge, suggestions: [...fridge.suggestions.slice(0, 3), unsure, ...fridge.suggestions.slice(4)] });
    expect(groupNames("Ändrat")).toEqual(["Vit förpackning, troligen mjölk"]);
    expect(within(section()).getByText("Osäker")).toBeInTheDocument();
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(1));
    const { input } = lastSave();
    expect(input.items.map((item) => item.ingredient)).toEqual(fridge.suggestions.slice(0, 3).map(({ ingredient }) => ingredient));
    // The unsure card's rows in other units are not replaced either.
    expect(input.replaceRowIds).toEqual([]);
    expect(input.removeRowIds).toEqual([senapRow, yoghurtRow]);
    await answerSave(
      answered({
        set: 3,
        removed: [removedRow(senapRow, senapId), removedRow(yoghurtRow, yoghurtId)],
        removedCount: 2,
        undoable: 2,
      }),
    );
    expect(toast()).toHaveTextContent(
      "Kylen är uppdaterad: 3 nya och 2 borttagna. 1 osäker vara är kvar att bekräfta eller rätta.",
    );
    expect(groupNames("Ändrat")).toEqual(["Vit förpackning, troligen mjölk"]);
    await waitFor(() => expect(button("Bekräfta mjölk")).toHaveFocus());
  });

  it("leaves the removals out of Bekräfta alla when the comparison is incomplete", async () => {
    render(<Hemma />);
    await analyze(incomplete(fridge));
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input).toMatchObject({ removeRowIds: [], operationId: null });
    await answerSave(answered({ set: 4 }));
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 3 nya och 1 ändrad.");
    expect(groupNames("Syns inte längre")).toEqual(["senap", "yoghurt"]);
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

  it("takes an ingredient the confirmation set out of Syns inte längre", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta mjölk"));
    await waitFor(() => expect(saves).toHaveLength(1));
    // The server set yoghurt too (e.g. a new name that is the catalog's yoghurt).
    await answerSave(answered({ set: 1, setIngredientIds: [mjolkId, yoghurtId] }));
    expect(groupNames("Syns inte längre")).toEqual(["senap"]);
  });

  it("replaces every row of the ingredient in the place when the sheet changes the unit", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog", { name: "Lagervara" });
    fireEvent.change(within(sheet).getByLabelText("Enhet"), { target: { value: "l" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input).toMatchObject({
      items: [{ amount: 1, unit: "l" }],
      replaceRowIds: [mjolkForpRow, mjolkLiterRow],
    });
  });

  it("keeps Bekräfta alla within the replace limit and leaves the rest as cards, saying so", async () => {
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
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSave().input.replaceRowIds).toHaveLength(30);
    expect(lastSave().input.items).toHaveLength(1);
    await answerSave(answered({ set: 1 }));
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 1 ändrad. 1 ändring är kvar att bekräfta.");
    expect(groupNames("Ändrat")).toEqual(["smör"]);
  });

  it("waits with Ångra tapped while a removal is saved, and puts back once, after the answer", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1 }));
    fireEvent.click(button("Ta bort senap"));
    await waitFor(() => expect(saves).toHaveLength(2));
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(restorePantryRemoval).not.toHaveBeenCalled();
    await answerSave(answered({ removed: [removedRow(senapRow, senapId)], removedCount: 1, undoable: 2 }));
    await waitFor(() => expect(restorePantryRemoval).toHaveBeenCalledExactlyOnceWith(saves[0].input.operationId));
  });

  it("joins Bekräfta alla to a removal whose confirmation shows: the same id, its own count, and one Ångra", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1 }));
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1].input.operationId).toBe(saves[0].input.operationId);
    expect(saves[1].input.removeRowIds).toEqual([senapRow]);
    await answerSave(answered({ set: 4, removed: [removedRow(senapRow, senapId)], removedCount: 1, undoable: 2 }));
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 3 nya, 1 ändrad och 1 borttagen.");
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra borttagning" }));
    await waitFor(() => expect(restorePantryRemoval).toHaveBeenCalledExactlyOnceWith(saves[0].input.operationId));
  });

  it("joins Bekräfta alla without removals left to the removals' confirmation", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1 }));
    fireEvent.click(button("Ta bort senap"));
    await waitFor(() => expect(saves).toHaveLength(2));
    await answerSave(answered({ removed: [removedRow(senapRow, senapId)], removedCount: 1, undoable: 2 }));
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(3));
    expect(saves[2].input).toMatchObject({ removeRowIds: [], operationId: saves[0].input.operationId });
    await answerSave(answered({ set: 4, undoable: 2 }));
    expect(toast()).toHaveTextContent("Kylen är uppdaterad: 3 nya och 1 ändrad.");
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra borttagning" }));
    await waitFor(() => expect(restorePantryRemoval).toHaveBeenCalledExactlyOnceWith(saves[0].input.operationId));
  });
});

describe("Senaste foto (Story 10.1)", () => {
  const stugan = { id: "66666666-6666-4666-8666-666666666666", name: "Stugan" };

  it("saves the photo on its place when Ta bort is the first write, once", async () => {
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyze({ ...fridge, site: stugan });
    rerender(<Hemma shownSite={photoSite} />);
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(photoPosts).toHaveLength(0);
    await answerSave(answered({ removed: [removedRow(yoghurtRow, yoghurtId)], removedCount: 1, undoable: 1 }));
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].get("site")).toBe(stugan.id);
    expect(photoPosts[0].get("location")).toBe("Kyl");

    fireEvent.click(button("Ta bort senap"));
    await waitFor(() => expect(saves).toHaveLength(2));
    await answerSave(answered({ removed: [removedRow(senapRow, senapId)], removedCount: 1, undoable: 2 }));
    expect(photoPosts).toHaveLength(1);
  });

  it("saves the photo when Rätta's Bekräfta is the first write", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    const sheet = screen.getByRole("dialog", { name: "Lagervara" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Bekräfta" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 1 }));
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].get("site")).toBe(photoSite.id);
  });

  it("saves the photo once on its place and location after a compared photo's Bekräfta", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Bekräfta grädde"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 1 }));
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].get("site")).toBe(photoSite.id);
    expect(photoPosts[0].get("location")).toBe("Kyl");
    fireEvent.click(button("Bekräfta gurka"));
    await waitFor(() => expect(saves).toHaveLength(2));
    await answerSave(answered({ set: 1 }));
    expect(photoPosts).toHaveLength(1);
  });

  it("saves the photo once on its place and location after a compared photo's Bekräfta alla", async () => {
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyze({ ...fridge, site: stugan });
    rerender(<Hemma shownSite={photoSite} />);
    fireEvent.click(button("Bekräfta alla"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(answered({ set: 4, removed: [removedRow(senapRow, senapId), removedRow(yoghurtRow, yoghurtId)], removedCount: 2, undoable: 2 }));
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].get("site")).toBe(stugan.id);
    expect(photoPosts[0].get("location")).toBe("Kyl");
  });

  it("saves nothing for Behåll, nor after a removal that failed", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Behåll senap"));
    fireEvent.click(button("Ta bort yoghurt"));
    await waitFor(() => expect(saves).toHaveLength(1));
    await answerSave(fail("pantry_inventory_failed"));
    await screen.findByText(errorMessages.pantry_inventory_failed);
    expect(photoPosts).toHaveLength(0);
  });
});
