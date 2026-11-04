import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { PantryIngredientHit } from "../actions/search-ingredients";
import type { AnalyzeResult, ConfirmItemInput, PantrySuggestion } from "../domain/pantry-suggestion";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";
import { PantryCamera } from "./pantry-camera";
import { keptPhoto, releaseAllPhotos } from "./photo-store";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import type { PhotoPostAnswer } from "./photo-post";
import { unitOf } from "./unit-test-helpers";

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

// Lagerförslag: the section with one card per suggestion, filled through the
// camera with the AI jobs (tests/mocks/fake-ai-jobs.ts) and the resizing stubbed, and confirmed,
// corrected in the sheet Lagervara or rejected (Story 6.2) with
// confirmPantrySuggestions stubbed.

/** Story 10.1: the saves of the photo, kept apart too. */
let photoPosts: { form: FormData; answer: (result: PhotoPostAnswer) => void }[] = [];
vi.mock("./photo-post", () => ({
  postPlacePhoto: (form: FormData) => new Promise<PhotoPostAnswer>((answer) => photoPosts.push({ form, answer })),
}));
const savePlacePhotoPoints = vi.fn();
vi.mock("../actions/save-place-photo-points", () => ({
  savePlacePhotoPoints: (input: unknown) => savePlacePhotoPoints(input),
}));
vi.mock("@/lib/ai-jobs-client", async () => (await import("../../../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: async (file: Blob): Promise<Result<Blob>> => ok(file) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
const searchPantryIngredients = vi.fn<(query: string) => Promise<Result<PantryIngredientHit[]>>>();
vi.mock("../actions/search-ingredients", () => ({
  searchPantryIngredients: (query: string) => searchPantryIngredients(query),
}));
type Confirm = {
  /** The photo's place the confirmation was sent for (Story 8.4). */
  siteId: string | null;
  items: ConfirmItemInput[];
  answer: (result: Result<{ count: number }>) => void;
  reject: (error: unknown) => void;
};
let confirms: Confirm[] = [];
vi.mock("../actions/confirm-pantry-suggestions", () => ({
  confirmPantrySuggestions: ({ siteId, items }: { siteId: string | null; items: ConfirmItemInput[] }) =>
    new Promise<Result<{ count: number }>>((resolve, reject) => confirms.push({ siteId, items, answer: resolve, reject })),
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
  site: photoSite,
  location: "Kyl",
  dropped: 0,
  inventory: { kind: "empty" },
  suggestions: [
    { id: "s1", name: "gurka", ingredient: fresh("gurka"), location: "Kyl", amount: 2, unit: "st", current: null, change: null, replaces: [] },
    { id: "s2", name: "ketchup", ingredient: fresh("ketchup"), location: "Kyl", amount: null, unit: null, current: null, change: null, replaces: [] },
    {
      id: "s3",
      name: "mjölk",
      ingredient: { kind: "existing", ingredientId: mjolkId },
      location: "Kyl",
      amount: 1,
      unit: "förp",
      current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
      change: null,
      replaces: [],
    },
    {
      id: "s4",
      name: "smör",
      ingredient: { kind: "existing", ingredientId: smorId },
      location: "Kyl",
      amount: null,
      unit: null,
      current: { unlimited: true, amounts: [] },
      change: null,
      replaces: [],
    },
  ],
};

function Hemma({ location = "Kyl", away = false }: { location?: Location; away?: boolean }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={testSite}>
          {/* Keyed like Hemma's <Suspense>: another card mounts them anew under the same provider. `away`: its fallback. */}
          {away ? (
            <p>Laddar</p>
          ) : (
            <div key={location}>
              <PantryCamera site={photoSite} location={location} />
              <PantrySuggestionList siteId={testSite.id} />
            </div>
          )}
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

/** Chooses a photo; resolves once its analysis has been sent, with the function that answers it. */
async function startPhoto(file: File = new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })) {
  const sent = fakeAi.calls.length;
  const inputs = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
  fireEvent.change(inputs[inputs.length - 1], { target: { files: [file] } });
  await waitFor(() => expect(fakeAi.calls.length).toBe(sent + 1));
  const call = fakeAi.calls[sent];
  return async (result: AnalyzeResult) => act(async () => call.answer(ok(result)));
}

async function analyze(result: AnalyzeResult = fridge) {
  await (await startPhoto())(result);
}

const section = () => screen.getByRole("region", { name: "Lagerförslag från kylen" });
const cards = () => within(section()).getAllByTestId("pantry-suggestion");

beforeEach(() => {
  fakeAi.reset();
  releaseAllPhotos();
  photoPosts = [];
  savePlacePhotoPoints.mockReset().mockResolvedValue(ok({ saved: true }));
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

  it("shows a compact row per suggestion with name, line under it, amount and a tick box", async () => {
    render(<Hemma />);
    await analyze();
    expect(within(section()).getByRole("heading", { level: 2 })).toHaveTextContent("Lagerförslag från kylen");
    const shown = cards().map((card) => ({
      name: within(card).getByRole("heading", { level: 3 }).textContent,
      text: card.textContent,
    }));
    expect(shown).toEqual([
      { name: "gurka", text: "gurkaKyl2 st" },
      { name: "ketchup", text: "ketchupKylFinns hemma" },
      { name: "mjölk", text: "mjölkfinns redan 2 förp · Kyl1 förp" },
      { name: "smör", text: "smörfinns redan · KylFinns hemma" },
    ]);
  });

  it("gives each row Rätta and Ta med named after it, and the section one button under the rows, nothing saved before a tap", async () => {
    render(<Hemma />);
    await analyze();
    for (const card of cards()) {
      const name = within(card).getByRole("heading", { level: 3 }).textContent;
      // "Finns hemma" has no amount to change.
      const hasAmount = !card.textContent?.includes("Finns hemma");
      expect(within(card).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
        `Rätta ${name}`,
        ...(hasAmount ? [expect.stringMatching(new RegExp(`^Ändra mängd för ${name}, `))] : []),
      ]);
      expect(within(card).getByRole("checkbox", { name: `Ta med ${name}` })).toBeChecked();
    }
    expect(within(section()).getByTestId("pantry-suggestions-summary")).toHaveTextContent("2 nya · 2 uppdateras");
    const all = addButton();
    expect(all).toHaveTextContent("Lägg till 4 varor");
    expect(cards()[3].compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section()).queryByRole("button", { name: /^(Bekräfta|Avvisa)/ })).toBeNull();
    expect(confirms).toEqual([]);
  });

  it("follows the ticks in the summary and the button, and starts an unsure row unticked", async () => {
    render(<Hemma />);
    await analyze({
      ...fridge,
      suggestions: [...fridge.suggestions.slice(0, 3), { ...fridge.suggestions[3], uncertain: true }],
    });
    expect(box("smör")).not.toBeChecked();
    expect(cards()[3]).toHaveTextContent("?");
    expect(cards()[3]).toHaveTextContent(", osäker");
    expect(addButton()).toHaveTextContent("Lägg till 3 varor");
    expect(within(section()).getByTestId("pantry-suggestions-summary")).toHaveTextContent("2 nya · 1 uppdateras");
    fireEvent.click(box("smör"));
    expect(addButton()).toHaveTextContent("Lägg till 4 varor");
    fireEvent.click(box("gurka"));
    fireEvent.click(box("ketchup"));
    fireEvent.click(box("mjölk"));
    expect(within(section()).getByTestId("pantry-suggestions-summary")).toHaveTextContent("1 uppdateras");
    expect(addButton()).toHaveTextContent("Lägg till 1 vara");
    fireEvent.click(box("smör"));
    expect(within(section()).getByTestId("pantry-suggestions-summary")).toHaveTextContent("Inget valt");
    expect(addButton()).toBeDisabled();
  });

  it("turns the amount into − / + in the row, saves the changed amount, and closes on a tap outside", async () => {
    render(<Hemma />);
    await analyze();
    const gurka = cards()[0];
    fireEvent.click(within(gurka).getByRole("button", { name: "Ändra mängd för gurka, 2 st" }));
    // No sheet opened; the group has accessible names and the value is read out politely.
    expect(screen.queryByRole("dialog")).toBeNull();
    const group = within(gurka).getByRole("group", { name: "Mängd för gurka" });
    expect(within(group).getByRole("status")).toHaveTextContent("2 st");
    fireEvent.click(within(group).getByRole("button", { name: "Öka mängd för gurka" }));
    fireEvent.click(within(group).getByRole("button", { name: "Öka mängd för gurka" }));
    expect(within(group).getByRole("status")).toHaveTextContent("4 st");
    fireEvent.click(within(group).getByRole("button", { name: "Minska mängd för gurka" }));
    expect(within(group).getByRole("status")).toHaveTextContent("3 st");
    // A tap outside closes it, and the row shows the new amount.
    fireEvent.pointerDown(document.body);
    expect(within(gurka).queryByRole("group")).toBeNull();
    expect(within(gurka).getByRole("button", { name: "Ändra mängd för gurka, 3 st" })).toBeInTheDocument();
    fireEvent.click(addButton());
    await waitFor(() => expect(confirms).toHaveLength(1));
    expect(confirms[0].items.find((item) => item.ingredient.kind === "new" && item.ingredient.name === "gurka")).toMatchObject({
      amount: 3,
      unit: "st",
    });
  });

  it("closes the open amount with Escape, and stops − at zero", async () => {
    render(<Hemma />);
    await analyze();
    const gurka = cards()[0];
    fireEvent.click(within(gurka).getByRole("button", { name: "Ändra mängd för gurka, 2 st" }));
    fireEvent.click(screen.getByRole("button", { name: "Minska mängd för gurka" }));
    expect(screen.getByRole("button", { name: "Minska mängd för gurka" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("group", { name: "Mängd för gurka" }), { key: "Escape" });
    expect(within(gurka).queryByRole("group")).toBeNull();
    expect(within(gurka).getByRole("button", { name: "Ändra mängd för gurka, 1 st" })).toHaveFocus();
  });

  it("opens Rätta from a tap elsewhere on the row", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta gurka"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens the camera's file picker from Fota igen", async () => {
    render(<Hemma />);
    await analyze();
    const input = screen.getByTestId("pantry-camera").querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, "click");
    fireEvent.click(button("Fota igen"));
    expect(click).toHaveBeenCalled();
  });

  it("throws the whole reading away with Förkasta inläsningen, closes its job, and brings it back with Ångra", async () => {
    render(<Hemma />);
    await analyze();
    const discard = button("Förkasta inläsningen");
    // Under "Fota igen", quiet and muted red.
    expect(button("Fota igen").compareDocumentPosition(discard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(discard).toHaveClass("text-danger");
    const jobId = fakeAi.jobs[0].id;
    fireEvent.click(discard);
    expect(screen.queryByRole("region", { name: "Lagerförslag från kylen" })).toBeNull();
    expect(confirms).toEqual([]);
    // The job is closed, so no badge or "Förslag klara" stays.
    await waitFor(() => expect(fakeAi.dismissed).toContain(jobId));
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    expect(toast()).toHaveTextContent("Förkastade inläsningen.");

    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    expect(confirms).toEqual([]);
  });

  it("does not bring a discarded reading back over a newer one", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Förkasta inläsningen"));
    const undo = within(toast()).getByRole("button", { name: "Ångra" });
    await analyze({ ...fridge, suggestions: fridge.suggestions.slice(0, 1) });
    fireEvent.click(undo);
    expect(cardNames()).toEqual(["gurka"]);
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
    expect(cards()[0]).toHaveTextContent("Kyl");
  });
});

const button = (name: string, index?: number) =>
  index === undefined
    ? within(section()).getByRole("button", { name })
    : within(section()).getAllByRole("button", { name })[index];
const cardNames = () =>
  screen.queryAllByTestId("pantry-suggestion").map((card) => within(card).getByRole("heading", { level: 3 }).querySelector("span")?.textContent);
const toast = () => screen.getByTestId("toast");
const lastConfirm = () => confirms[confirms.length - 1];
const answerConfirm = async (result: Result<{ count: number }> = ok({ count: 1 })) => {
  await act(async () => lastConfirm().answer(result));
};
const sheet = () => screen.getByRole("dialog");
const cameraButton = () => within(screen.getByTestId("pantry-camera")).getByRole("button", { name: "Fotografera kylen" });

const addButton = () => within(section()).getByRole("button", { name: /^(Lägg till \d+ var(a|or)|Sparar …)$/ });
const box = (name: string) => within(section()).getByRole("checkbox", { name: `Ta med ${name}` });
/** Ticks exactly this one row, then adds it. */
const confirmOnly = (name: string, index = 0) => {
  const target = within(section()).getAllByRole("checkbox", { name: `Ta med ${name}` })[index];
  for (const other of within(section()).getAllByRole("checkbox")) {
    const wanted = other === target;
    if ((other.getAttribute("aria-checked") === "true") !== wanted && !(other as HTMLButtonElement).disabled) fireEvent.click(other);
  }
  fireEvent.click(addButton());
};
/** Opens the row and says "Inte en vara" in the sheet. */
const reject = (name: string) => {
  fireEvent.click(button(`Rätta ${name}`));
  fireEvent.click(within(sheet()).getByRole("button", { name: "Inte en vara" }));
};
describe("Bekräfta", () => {
  it("saves the suggestion as it is, at once, and takes its card out with a short confirmation", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("mjölk");
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
    confirmOnly("gurka");
    const saving = cards()[0];
    expect(saving).toHaveTextContent("Sparar …");
    expect(within(saving).getByRole("checkbox")).toBeDisabled();
    expect(addButton()).toBeDisabled();
    for (const shown of within(section()).getAllByRole("button")) {
      // Only the photo can still be looked at: it changes nothing.
      if (shown.dataset.testid === "pantry-analyzed-photo") expect(shown).toBeEnabled();
      else expect(shown).toBeDisabled();
    }
    // A second tap saves nothing more.
    fireEvent.click(addButton());
    expect(confirms).toHaveLength(1);
    await answerConfirm();
    await waitFor(() => expect(button("Rätta ketchup")).toBeEnabled());
  });

  it("moves focus to the camera button after a save, also with rows left", async () => {
    render(<Hemma />);
    await analyze();
    // A bulk save always gives focus to the camera button, also with rows left.
    confirmOnly("ketchup");
    await answerConfirm();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    expect(cardNames()).toEqual(["gurka", "mjölk", "smör"]);

    confirmOnly("smör");
    await answerConfirm();
    await waitFor(() => expect(cameraButton()).toHaveFocus());

    confirmOnly("mjölk");
    await answerConfirm();
    await waitFor(() => expect(cameraButton()).toHaveFocus());

    confirmOnly("gurka");
    await answerConfirm();
    // The last one: the section goes, and the camera button takes focus.
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    expect(toast()).toHaveTextContent("gurka är sparad i kylen.");
  });

  it("keeps the suggestions after a failure, says so at the top of the section, and gives focus back", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("mjölk");
    await answerConfirm(fail("pantry_confirm_failed"));
    const alert = await within(section()).findByRole("alert");
    expect(alert).toHaveTextContent("Det gick inte att lägga förslagen i Matvaror. Försök igen.");
    expect(section().firstElementChild).toContainElement(alert);
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    await waitFor(() => expect(addButton()).toHaveFocus());
    expect(button("Rätta mjölk")).toBeEnabled();

    // Trying again: the notice goes while saving, and for good once it works.
    confirmOnly("mjölk");
    expect(within(section()).queryByRole("alert")).toBeNull();
    await answerConfirm();
    expect(cardNames()).toEqual(["gurka", "ketchup", "smör"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the same text when the call gets no answer", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("mjölk");
    await act(async () => lastConfirm().reject(new Error("offline")));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
    expect(cardNames()).toHaveLength(4);
  });

  it("reads the page again for an expired session, and keeps the suggestions", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("mjölk");
    await answerConfirm(fail("unauthorized"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(cardNames()).toHaveLength(4);
  });

  it("takes nothing out of newer suggestions when an older confirmation answers after them", async () => {
    render(<Hemma />);
    await analyze();
    confirmOnly("mjölk");
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
    fireEvent.click(addButton());
    expect(confirms).toHaveLength(1);
    expect(lastConfirm().items.map((item) => item.ingredient)).toEqual(fridge.suggestions.map(({ ingredient }) => ingredient));
    // The button says Sparar … and nothing else works.
    expect(addButton()).toBeDisabled();
    expect(within(section()).getAllByText("Sparar …")).toHaveLength(5);
    await answerConfirm(ok({ count: 4 }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(toast()).toHaveTextContent("Lagt 4 varor i Matvaror.");
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });

  it("leaves out the rejected suggestions, and is there while one suggestion is left", async () => {
    render(<Hemma />);
    await analyze();
    for (const name of ["gurka", "ketchup", "mjölk"]) reject(name);
    expect(addButton()).toBeInTheDocument();
    fireEvent.click(addButton());
    expect(lastConfirm().items).toEqual([
      { ingredient: { kind: "existing", ingredientId: smorId }, location: "Kyl", amount: null, unit: null },
    ]);
    await answerConfirm();
    expect(toast()).toHaveTextContent("smör är sparad i kylen.");
  });

  it("keeps the suggestions after a failure, with focus back on Bekräfta alla", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(addButton());
    await answerConfirm(fail("pantry_confirm_failed"));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
    expect(cardNames()).toHaveLength(4);
    await waitFor(() => expect(addButton()).toHaveFocus());
  });
});

describe("Avvisa", () => {
  it("takes the card out at once without asking the server, with Ångra in the short confirmation", async () => {
    render(<Hemma />);
    await analyze();
    reject("ketchup");
    expect(cardNames()).toEqual(["gurka", "mjölk", "smör"]);
    expect(confirms).toEqual([]);
    expect(toast()).toHaveTextContent("Tog bort ketchup.");
    await waitFor(() => expect(button("Rätta mjölk")).toHaveFocus());

    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    await waitFor(() => expect(button("Rätta ketchup")).toHaveFocus());
    expect(confirms).toEqual([]);
  });

  it("undoes only the latest rejection", async () => {
    render(<Hemma />);
    await analyze();
    reject("gurka");
    reject("smör");
    expect(toast()).toHaveTextContent("Tog bort smör.");
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["ketchup", "mjölk", "smör"]);
  });

  it("gives focus to the camera button after the last card, and Ångra brings the section back", async () => {
    render(<Hemma />);
    await analyze({ ...fridge, suggestions: fridge.suggestions.slice(1, 2) });
    reject("ketchup");
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(cameraButton()).toHaveFocus());
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["ketchup"]);
  });

  it("puts nothing back into newer suggestions", async () => {
    render(<Hemma />);
    await analyze();
    reject("ketchup");
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
    expect(unitOf(sheet())).toBe("förp");
    expect(placeRadio(sheet(), "Kyl")).toHaveAttribute("aria-checked", "true");

    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "2,5" } });
    fireEvent.click(placeRadio(sheet(), "Frys"));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(within(sheet()).getByRole("button", { name: "Sparar …" })).toBeDisabled();
    expect(lastConfirm().items).toEqual([
      { ingredient: { kind: "existing", ingredientId: mjolkId }, location: "Frys", amount: 2.5, unit: "förp" },
    ]);
    // Story 8.4: a plain photo's Rätta saves on the photo's place.
    expect(confirms.at(-1)?.siteId).toBe(photoSite.id);
    await answerConfirm();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cardNames()).toEqual(["gurka", "ketchup", "smör"]);
    expect(toast()).toHaveTextContent("mjölk är sparad i frysen.");
    await waitFor(() => expect(button("Rätta smör")).toHaveFocus());
  });

  it("saves the photo once on the photo's place and location after Rätta's Bekräfta, also when the item moves to Frys (Story 10.1)", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    fireEvent.click(placeRadio(sheet(), "Frys"));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(photoPosts).toHaveLength(0);
    await answerConfirm();
    await waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0].form.get("site")).toBe(photoSite.id);
    expect(photoPosts[0].form.get("location")).toBe("Kyl");
    confirmOnly("smör");
    await answerConfirm();
    expect(photoPosts).toHaveLength(1);
  });

  it("swaps a new suggestion for another new ingredient, saved as new with the form's place", async () => {
    searchPantryIngredients.mockResolvedValue(ok([]));
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta gurka"));
    expect(within(sheet()).getByText("Ny")).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Byt vara" }));
    const field = within(sheet()).getByRole("searchbox", { name: "Sök ingrediens" });
    fireEvent.change(field, { target: { value: "slanggurka" } });
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Lägg till Slanggurka som ny" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(lastConfirm().items).toEqual([
      {
        ingredient: { kind: "new", name: "Slanggurka", section: "Övrigt", location: "Kyl", defaultUnit: "st" },
        location: "Kyl",
        amount: 2,
        unit: "st",
      },
    ]);
    await answerConfirm();
    expect(toast()).toHaveTextContent("Slanggurka är sparad i kylen.");
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
    fireEvent.click(within(sheet()).getByRole("button", { name: "Inte en vara" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cardNames()).toEqual(["gurka", "mjölk", "smör"]);
    expect(toast()).toHaveTextContent("Tog bort ketchup.");
    expect(confirms).toEqual([]);
  });

  it("closing the sheet unchanged keeps the suggestion as it was", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta mjölk"));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cardNames()).toHaveLength(4);
    expect(cards()[2]).toHaveTextContent("1 förp");
  });
});

describe("Review patches", () => {
  it("Rätta and Bekräfta on a new suggestion keep its proposal, default place and unit while the ingredient is the same", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(button("Rätta gurka"));
    fireEvent.change(within(sheet()).getByLabelText("Mängd"), { target: { value: "3" } });
    fireEvent.click(placeRadio(sheet(), "Frys"));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Bekräfta" }));
    expect(lastConfirm().items).toEqual([
      { ingredient: fridge.suggestions[0].ingredient, location: "Frys", amount: 3, unit: "st" },
    ]);
    await answerConfirm();
  });

  it.each(["Bekräfta", "Inte en vara"])(
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
    reject("ketchup");
    // A card's Bekräfta while the rejection's Ångra still shows.
    confirmOnly("gurka");
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    // Not yet: the confirmation is on its way.
    expect(cardNames()).toEqual(["gurka", "mjölk", "smör"]);
    await answerConfirm();
    // gurka, before ketchup, is gone: ketchup goes back before mjölk, the one after it.
    expect(cardNames()).toEqual(["ketchup", "mjölk", "smör"]);
    await waitFor(() => expect(button("Rätta ketchup")).toHaveFocus());
  });

  it("updates I kylen nu on the suggestions left for the same ingredient and place", async () => {
    const mjolkLiter: PantrySuggestion = { ...fridge.suggestions[2], id: "s5", amount: 1, unit: "l" };
    render(<Hemma />);
    await analyze({ ...fridge, suggestions: [...fridge.suggestions, mjolkLiter] });
    confirmOnly("mjölk", 0);
    await answerConfirm();
    expect(cardNames()).toEqual(["gurka", "ketchup", "smör", "mjölk"]);
    // 2 förp was set to 1 förp; the place has no litres yet.
    expect(cards()[3]).toHaveTextContent("finns redan 1 förp");
  });

  it("marks the suggestions the server refuses, and Bekräfta alla leaves them out next time", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(addButton());
    await answerConfirm(fail("validation", { "1": "Förslaget går inte att spara som det är. Rätta eller avvisa det." }));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.validation);
    const refused = cards()[1];
    expect(refused).toHaveTextContent("Förslaget går inte att spara som det är. Rätta eller avvisa det.");
    expect(within(refused).getByRole("checkbox", { name: "Ta med ketchup" })).toBeDisabled();
    expect(within(refused).getByRole("checkbox", { name: "Ta med ketchup" })).not.toBeChecked();
    expect(within(refused).getByRole("button", { name: "Rätta ketchup" })).toBeEnabled();

    fireEvent.click(addButton());
    expect(lastConfirm().items).toHaveLength(3);
    await answerConfirm(ok({ count: 3 }));
    expect(cardNames()).toEqual(["ketchup"]);
    expect(toast()).toHaveTextContent("Lagt 3 varor i Matvaror.");
  });

  it("counts a confirmation without an answer in 30 s as failed, so the buttons work again", async () => {
    render(<Hemma />);
    await analyze();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      confirmOnly("mjölk");
      await act(async () => vi.advanceTimersByTime(29_999));
      expect(addButton()).toBeDisabled();
      await act(async () => vi.advanceTimersByTime(1));
      expect(within(section()).getByRole("alert")).toHaveTextContent(errorMessages.pantry_confirm_failed);
      expect(button("Rätta mjölk")).toBeEnabled();
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
    confirmOnly("mjölk");
    rerender(<Hemma away />);
    await answerConfirm();
    expect(document.activeElement).toBe(document.body);
    rerender(<Hemma />);
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });
});

describe("Story 6.5: labels and unsure suggestions", () => {
  const labelled: AnalyzeResult = {
    ...fridge,
    suggestions: [
      { ...fridge.suggestions[0], labels: ["Gurka"] },
      { ...fridge.suggestions[1], name: "senap", ingredient: fresh("senap"), labels: ["Gul flaska, troligen senap"], uncertain: true },
      { ...fridge.suggestions[2], labels: ["Arla mellanmjölk 1,5 l", "ICA mellanmjölk"], uncertain: false },
      fridge.suggestions[3],
    ],
  };

  it("titles a card with the label, the catalog ingredient under it, and marks an unsure one", async () => {
    render(<Hemma />);
    await analyze(labelled);
    expect(cardNames()).toEqual(["gurka", "Gul flaska, troligen senap", "Arla mellanmjölk 1,5 l, ICA mellanmjölk", "smör"]);
    const [gurka, senap, mjolk] = cards();
    expect(gurka.textContent).toBe("gurkaKyl2 st");
    expect(senap).toHaveTextContent(", osäker");
    expect(senap).toHaveTextContent("Senap · Kyl");
    expect(box("senap")).not.toBeChecked();
    expect(mjolk).toHaveTextContent("Mjölk · finns redan 2 förp · Kyl");
    expect(mjolk).not.toHaveTextContent("osäker");
    // The buttons keep the catalog name: it is what is saved.
    expect(button("Rätta senap")).toBeEnabled();
    expect(button("Rätta mjölk")).toBeEnabled();
  });

  it("leaves the unticked unsure suggestion out of Lägg till, keeps its row, and saves it once ticked", async () => {
    render(<Hemma />);
    await analyze(labelled);
    fireEvent.click(addButton());
    expect(lastConfirm().items.map((item) => item.ingredient)).toEqual(
      [labelled.suggestions[0], labelled.suggestions[2], labelled.suggestions[3]].map(({ ingredient }) => ingredient),
    );
    await answerConfirm(ok({ count: 3 }));
    expect(toast()).toHaveTextContent("Lagt 3 varor i Matvaror.");
    expect(cardNames()).toEqual(["Gul flaska, troligen senap"]);
    // The unsure row starts unticked: with it left alone nothing more is added.
    expect(within(section()).getByTestId("pantry-suggestions-summary")).toHaveTextContent("Inget valt");
    expect(addButton()).toBeDisabled();

    fireEvent.click(box("senap"));
    fireEvent.click(addButton());
    expect(lastConfirm().items.map((item) => item.ingredient)).toEqual([labelled.suggestions[1].ingredient]);
    await answerConfirm();
    expect(screen.queryByRole("region")).toBeNull();
    expect(toast()).toHaveTextContent("senap är sparad i kylen.");
  });

  it("does not count an unsure card the server refused, and gives focus to the camera button when none is left", async () => {
    render(<Hemma />);
    await analyze(labelled);
    fireEvent.click(box("senap"));
    fireEvent.click(addButton());
    expect(lastConfirm().items).toHaveLength(4);
    await answerConfirm(fail("validation", { "1": "Förslaget går inte att spara som det är. Rätta eller avvisa det." }));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(errorMessages.validation);
    expect(box("senap")).toBeDisabled();
    expect(box("senap")).not.toBeChecked();
    expect(button("Rätta senap")).toBeEnabled();

    fireEvent.click(addButton());
    expect(lastConfirm().items).toHaveLength(3);
    await answerConfirm(ok({ count: 3 }));
    // The refused card is still there, and stays unticked.
    expect(cardNames()).toEqual(["Gul flaska, troligen senap"]);
    expect(toast()).toHaveTextContent(/^Lagt 3 varor i Matvaror\.$/);
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });
});

describe("the photo during review", () => {
  // jsdom's object URLs stand in as blob:photo-1, blob:photo-2, …; every revoked one is remembered.
  let created: string[] = [];
  let revoked = new Set<string>();
  let create: MockInstance<typeof URL.createObjectURL>;
  let revoke: MockInstance<typeof URL.revokeObjectURL>;
  beforeEach(() => {
    created = [];
    revoked = new Set();
    create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const url = `blob:photo-${created.length + 1}`;
      created.push(url);
      return url;
    });
    revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.add(url);
    });
  });

  /** No image in the document shows a URL that has been revoked. */
  const expectNoRevokedImage = () => {
    for (const image of document.querySelectorAll("img")) expect(revoked.has(image.getAttribute("src") ?? "")).toBe(false);
  };
  const thumbnail = () => within(section()).getByRole("button", { name: "Fotot av kylen, visa större" });
  // Kylfoto D: the photo on top of the review; its image sits beside the button that opens it full screen.
  const reviewImage = () => within(section()).getByTestId("pantry-review-photo").querySelector("img")!;
  const thumbnailSrc = () => reviewImage().getAttribute("src");
  const photoSheet = () => screen.getByRole("dialog", { name: "Fotot av kylen" });
  const ketchupOnly = { ...fridge, suggestions: fridge.suggestions.slice(1, 2) };

  /** A PNG of `width` × `height` px as far as its header goes, which is all the size is read from. */
  const pngOf = (width: number, height: number) => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return new File([bytes], "IMG_2.png", { type: "image/png" });
  };

  it("shows a thumbnail of the analysed photo under the heading once the suggestions are here", async () => {
    render(<Hemma />);
    const answer = await startPhoto();
    expect(screen.queryByTestId("pantry-analyzed-photo")).toBeNull();
    await answer(fridge);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(thumbnail()).toHaveAttribute("aria-haspopup", "dialog");
    expect(thumbnailSrc()).toBe("blob:photo-1");
    // Right under the heading (and the place's line, Story 8.4, empty and hidden here), before "Bekräfta alla".
    const placeLine = within(section()).getByRole("heading", { level: 2 }).nextElementSibling;
    expect(placeLine).toHaveAttribute("data-testid", "pantry-suggestions-site");
    expect(placeLine).toBeEmptyDOMElement();
    // First in the photo's column (two columns on a desktop), after an empty line that tells when the photo sticks.
    const photoColumn = placeLine?.nextElementSibling?.firstElementChild;
    expect(photoColumn?.firstElementChild?.nextElementSibling).toBe(within(section()).getByTestId("pantry-review-photo"));
    expect(within(section()).getByTestId("pantry-review-photo")).toContainElement(thumbnail());
    expectNoRevokedImage();
  });

  it("shows no thumbnail for an answer without cards, and makes no URL for it", async () => {
    render(<Hemma />);
    await analyze({ ...fridge, suggestions: [] });
    expect(screen.queryByTestId("pantry-analyzed-photo")).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("opens the photo larger in a sheet, which closes with Klar and Esc and gives focus back to the thumbnail", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(thumbnail());
    expect(photoSheet()).toHaveAccessibleDescription(
      "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något.",
    );
    expect(within(photoSheet()).getByRole("img", { name: "Fotot av kylen som förslagen kommer från" })).toHaveAttribute(
      "src",
      "blob:photo-1",
    );
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(thumbnail()).toHaveFocus();

    fireEvent.click(thumbnail());
    fireEvent.keyDown(photoSheet(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(thumbnail()).toHaveFocus();
    expectNoRevokedImage();
  });

  it("switches the large photo between fitting the screen and full size, with its size known before it is decoded", async () => {
    render(<Hemma />);
    await (await startPhoto(pngOf(1536, 2048)))(fridge);
    fireEvent.click(thumbnail());
    const toggle = within(photoSheet()).getByRole("button", { name: "Visa i full storlek" });
    const image = within(photoSheet()).getByRole("img", { name: "Fotot av kylen som förslagen kommer från" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(image).toHaveAttribute("width", "1536");
    expect(image).toHaveAttribute("height", "2048");
    // The box around the photo has its size (Story 6.6: the markers sit on it); the photo fills it.
    const frame = within(photoSheet()).getByTestId("pantry-photo-frame");
    expect(frame).toContainElement(image);
    expect(frame.style.aspectRatio).toBe("1536 / 2048");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(frame.style.width).toBe("1536px");
    expect(frame.style.height).toBe("2048px");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    // Closed and opened again: fitted.
    fireEvent.click(toggle);
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(thumbnail());
    expect(within(photoSheet()).getByRole("button", { name: "Visa i full storlek" })).toHaveAttribute("aria-pressed", "false");
  });

  it("says so in text when the photo cannot be shown", async () => {
    render(<Hemma />);
    await analyze();
    fireEvent.click(thumbnail());
    fireEvent.error(within(photoSheet()).getByRole("img"));
    expect(within(photoSheet()).getByText("Fotot kunde inte visas.")).toBeVisible();
    expect(within(photoSheet()).queryByRole("img")).toBeNull();
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.error(within(section()).getByTestId("pantry-review-photo").querySelector("img")!);
    expect(within(section()).getByText("Fotot kunde inte visas.")).toBeVisible();
    expect(screen.queryByTestId("pantry-analyzed-photo")).toBeNull();
  });

  it("hides the photo with the last card without revoking it, and Ångra brings it back with the card", async () => {
    render(<Hemma />);
    await analyze(ketchupOnly);
    reject("ketchup");
    expect(screen.queryByTestId("pantry-analyzed-photo")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["ketchup"]);
    expect(thumbnailSrc()).toBe("blob:photo-1");
    expectNoRevokedImage();
  });

  it("keeps the sheet open while the last card's save ends, and moves focus on once it is closed", async () => {
    render(<Hemma />);
    await analyze(ketchupOnly);
    confirmOnly("ketchup");
    // The photo can still be looked at while the card is being saved.
    fireEvent.click(thumbnail());
    expect(photoSheet()).toBeInTheDocument();
    await answerConfirm();
    expect(screen.queryByTestId("pantry-suggestion")).toBeNull();
    expect(photoSheet()).toBeInTheDocument();
    expect(within(photoSheet()).getByRole("img")).toHaveAttribute("src", "blob:photo-1");
    expect(cameraButton()).not.toHaveFocus();
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The move to the camera button that waited for the sheet.
    await waitFor(() => expect(cameraButton()).toHaveFocus());
  });

  it("revokes the photo's URL after a new photo's suggestions have replaced it, and shows the new one", async () => {
    render(<Hemma />);
    await analyze();
    const answer = await startPhoto();
    // The suggestions from before, and their photo, stay while the new photo is analysed.
    expect(thumbnailSrc()).toBe("blob:photo-1");
    expect(revoke).not.toHaveBeenCalled();
    await answer({ ...fridge, suggestions: fridge.suggestions.slice(2) });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:photo-1");
    expect(thumbnailSrc()).toBe("blob:photo-2");
    expectNoRevokedImage();
  });

  it("closes an open sheet when a new photo's suggestions arrive, and never shows the new photo in it", async () => {
    render(<Hemma />);
    await analyze();
    const answer = await startPhoto();
    fireEvent.click(thumbnail());
    expect(within(photoSheet()).getByRole("img")).toHaveAttribute("src", "blob:photo-1");
    await answer({ ...fridge, suggestions: fridge.suggestions.slice(2) });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(thumbnailSrc()).toBe("blob:photo-2");
    expectNoRevokedImage();
  });

  it("revokes the photo's URL when an answer without cards replaces it", async () => {
    render(<Hemma />);
    await analyze();
    await analyze({ ...fridge, suggestions: [] });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:photo-1");
    expect(screen.queryByTestId("pantry-analyzed-photo")).toBeNull();
    expect(created).toEqual(["blob:photo-1"]);
    expectNoRevokedImage();
  });

  it("revokes the photo's URL when Hemma is left", async () => {
    const { unmount } = render(<Hemma />);
    await analyze();
    unmount();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:photo-1");
  });

  it("revokes every URL it made exactly once under StrictMode", async () => {
    const { unmount } = render(
      <StrictMode>
        <Hemma />
      </StrictMode>,
    );
    await analyze();
    expectNoRevokedImage();
    await analyze({ ...fridge, suggestions: fridge.suggestions.slice(2) });
    expectNoRevokedImage();
    expect(thumbnailSrc()).toBe("blob:photo-2");
    unmount();
    expect(created).toEqual(["blob:photo-1", "blob:photo-2"]);
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(created);
  });
});

describe("numbers on the photo (Story 6.6)", () => {
  let created: string[] = [];
  let revoke: MockInstance<typeof URL.revokeObjectURL>;
  beforeEach(() => {
    created = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const url = `blob:photo-${created.length + 1}`;
      created.push(url);
      return url;
    });
    revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  const reading = ["Mellanmjölk 1,5 %", "Smör 500 g", "Gurka", "Ketchup"];
  const numbersOf: Record<string, number[]> = { gurka: [3], ketchup: [4], mjölk: [1], smör: [2] };
  const numbered: AnalyzeResult = {
    ...fridge,
    reading,
    suggestions: fridge.suggestions.map((suggestion) => ({ ...suggestion, itemNumbers: numbersOf[suggestion.name] })),
  };
  const located = {
    positions: [
      { n: 1, x: 193, y: 193 },
      { n: 2, x: 661, y: 258 },
      { n: 3, x: 694, y: 583 },
      { n: 4, x: 146, y: 813 },
    ],
  };
  const missingSmor = {
    id: "missing:m1",
    ingredientId: smorId,
    name: "smör",
    location: "Kyl" as const,
    rows: [{ id: "7a1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02", amount: null, unit: null }],
    stock: { unlimited: true, amounts: [] },
  };

  /** A PNG of 720 × 900 px as far as its header goes; without a header its size is unknown. */
  const png = () => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, 720);
    new DataView(bytes.buffer).setUint32(20, 900);
    return new File([bytes], "IMG_3.png", { type: "image/png" });
  };
  const status = () => within(section()).getByTestId("pantry-photo-numbers-status");
  /** The numbers to see on the cards, in their order. */
  const badges = () => within(section()).queryAllByTestId("pantry-photo-number").map((badge) => badge.textContent);
  const slots = () => within(section()).queryAllByTestId("pantry-photo-number-slot");
  const unpointed = () =>
    within(section())
      .queryAllByTestId("pantry-photo-number")
      .filter((badge) => badge.dataset.pointed === "false")
      .map((badge) => badge.textContent);
  const thumbnail = () => within(section()).getByRole("button", { name: "Fotot av kylen, visa större" });
  const photoSheet = () => screen.getByRole("dialog", { name: "Fotot av kylen" });
  const markers = () => within(photoSheet()).queryAllByTestId("pantry-photo-marker");
  const largePhoto = () => within(photoSheet()).getByRole("img", { name: "Fotot av kylen som förslagen kommer från" });
  /** The large photo as the browser decodes it, `width` × `height` px. */
  const decode = (width = 720, height = 900) => {
    const image = largePhoto();
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: height });
    fireEvent.load(image);
  };
  /** The job of the photo ends (Story 12.5): with the points of the numbers, or without them. */
  const answerLocate = async (result: Result<unknown>, index = fakeAi.calls.length - 1) => {
    await act(async () => fakeAi.calls[index].finish(result.ok ? result.data : "failed"));
  };
  /** Analyses a photo with a known size and answers it. */
  const analyzeNumbered = async (result: AnalyzeResult = numbered) => (await startPhoto(png()))(result);

  it("shows the cards first, keeps the numbers' places, then numbers the cards when the job has looked up the points", async () => {
    render(<Hemma />);
    const file = png();
    await (await startPhoto(file))(numbered);
    // The cards are there at once, without numbers but with their places kept, and the lookup is on its way.
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    expect(badges()).toEqual([]);
    expect(slots()).toHaveLength(4);
    for (const slot of slots()) expect(slot).toHaveClass("invisible");
    await waitFor(() => expect(status()).toHaveTextContent("Letar upp varorna på fotot …"));
    // The numbers are the second step of the same job, with the same photo (the resizing is stubbed to give the file back).
    const sent = fakeAi.calls[0].form.get("image") as File;
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
    // Confirming never waits for the numbers.
    expect(button("Rätta gurka")).toBeEnabled();
    expect(addButton()).toBeEnabled();

    await answerLocate(ok(located));
    await waitFor(() => expect(badges()).toEqual(["3", "4", "1", "2"]));
    expect(slots()).toHaveLength(0);
    // The number seen is hidden from screen readers; the heading says it, after the title.
    for (const badge of within(section()).getAllByTestId("pantry-photo-number")) expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(within(section()).getByRole("heading", { level: 3, name: /^gurka ?Nummer 3 på fotot$/ })).toBeInTheDocument();
    expect(within(section()).getByRole("heading", { level: 3, name: /^smör ?Nummer 2 på fotot$/ })).toBeInTheDocument();
    await waitFor(() => expect(status()).toHaveTextContent("Numren på korten visar var varorna är på fotot."));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has the status region, empty, whenever the section is shown, and writes its text after it is there", async () => {
    render(<Hemma />);
    await analyze(fridge);
    expect(status()).toHaveAttribute("role", "status");
    expect(status()).toBeEmptyDOMElement();
  });

  it("puts a marker hidden from screen readers on each card's item, once the photo is decoded, kept inside it", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    await answerLocate(ok(located));
    fireEvent.click(thumbnail());
    // Laid out from the file's header, but no marker before the photo is decoded.
    expect(markers()).toEqual([]);
    decode();
    expect(markers().map((marker) => marker.textContent)).toEqual(["3", "4", "1", "2"]);
    for (const marker of markers()) expect(marker).toHaveAttribute("aria-hidden", "true");
    expect(markers()[0].style.left).toMatch(/^clamp\(14px, 69.4%, (calc\()?100% - 14px\)?\)$/);
    expect(markers()[0].style.top).toMatch(/^clamp\(14px, 58.3%, (calc\()?100% - 14px\)?\)$/);
    // See-through when fitted, so the package under it shows; whole in full size.
    expect(markers()[0]).toHaveClass("opacity-85");
    const frame = within(photoSheet()).getByTestId("pantry-photo-frame");
    expect(frame).toContainElement(markers()[0]);
    expect(largePhoto()).toHaveClass("object-contain");
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Visa i full storlek" }));
    expect(frame.style.width).toBe("720px");
    expect(markers()[0]).not.toHaveClass("opacity-85");
    expect(markers()[0].style.left).toMatch(/^clamp\(14px, 69.4%, (calc\()?100% - 14px\)?\)$/);
  });

  it("lays the photo out by its decoded size, not the header's, so the markers sit on what the model saw", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    await answerLocate(ok(located));
    fireEvent.click(thumbnail());
    const frame = within(photoSheet()).getByTestId("pantry-photo-frame");
    expect(frame.style.aspectRatio).toBe("720 / 900");
    decode(900, 720);
    expect(frame.style.aspectRatio).toBe("900 / 720");
    expect(largePhoto()).toHaveAttribute("width", "900");
  });

  it("drops the numbers from the cards, the photo and the status when the photo cannot be shown", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    await answerLocate(ok(located));
    await waitFor(() => expect(badges()).toHaveLength(4));
    fireEvent.click(thumbnail());
    fireEvent.error(largePhoto());
    expect(within(photoSheet()).getByText("Fotot kunde inte visas.")).toBeVisible();
    await waitFor(() => expect(badges()).toEqual([]));
    expect(slots()).toHaveLength(0);
    await waitFor(() => expect(status()).toBeEmptyDOMElement());
    expect(within(section()).getByRole("heading", { level: 3, name: "gurka" })).toBeInTheDocument();
  });

  it("drops the numbers when the thumbnail cannot be shown", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    fireEvent.error(within(section()).getByTestId("pantry-review-photo").querySelector("img")!);
    expect(slots()).toHaveLength(0);
    await waitFor(() => expect(status()).toBeEmptyDOMElement());
  });

  it("looks nothing up for a photo whose size is unknown, and still shows it, without markers", async () => {
    render(<Hemma />);
    await analyze(numbered);
    expect(status()).toBeEmptyDOMElement();
    expect(slots()).toHaveLength(0);
    fireEvent.click(thumbnail());
    expect(largePhoto()).toBeVisible();
    expect(within(photoSheet()).queryByTestId("pantry-photo-frame")).toBeNull();
    expect(markers()).toEqual([]);
  });

  it("drops a card's number and marker when the card is handled, and leaves the others", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    await answerLocate(ok(located));
    reject("gurka");
    expect(badges()).toEqual(["4", "1", "2"]);
    fireEvent.click(thumbnail());
    decode();
    expect(markers().map((marker) => marker.textContent)).toEqual(["4", "1", "2"]);
  });

  it("numbers a card by its first item with a point, so the number is on a marker of its own item", async () => {
    render(<Hemma />);
    await analyzeNumbered({
      ...numbered,
      reading: [...reading, "ICA gurka"],
      suggestions: numbered.suggestions.map((suggestion) =>
        suggestion.name === "gurka" ? { ...suggestion, itemNumbers: [3, 5] } : suggestion,
      ),
    });
    await answerLocate(ok({ positions: [{ n: 5, x: 500, y: 500 }, located.positions[0]] }));
    // Kylfoto: the rows without a point keep their number, with a dashed ring, and no marker.
    await waitFor(() => expect(badges()).toEqual(["5", "4", "1", "2"]));
    expect(unpointed()).toEqual(["4", "2"]);
    expect(within(cards()[1]).getByRole("heading", { level: 3 })).toHaveTextContent("Nummer 4, inte utpekad på fotot");
    expect(within(cards()[0]).getByRole("heading", { level: 3 })).toHaveTextContent("Nummer 5 på fotot");
    fireEvent.click(thumbnail());
    decode();
    expect(markers().map((marker) => marker.textContent)).toEqual(["5", "1"]);
  });

  it("ignores the point of an item whose label was only the placeholder", async () => {
    render(<Hemma />);
    await analyzeNumbered({ ...numbered, reading: ["Mellanmjölk 1,5 %", "Smör 500 g", "vara", "Ketchup"] });
    await answerLocate(ok(located));
    // Kylfoto: the placeholder item's row keeps its number, not pointed out.
    await waitFor(() => expect(badges()).toEqual(["3", "4", "1", "2"]));
    expect(unpointed()).toEqual(["3"]);
  });

  it.each([
    ["the lookup fails", fail("ai_unavailable")],
    ["the job ends without them", ok("skipped")],
    ["the answer is not the schema's", ok({ positions: [{ n: 0, x: 1, y: 1 }] })],
  ])("shows no numbers and no error when %s", async (_name, result) => {
    render(<Hemma />);
    await analyzeNumbered();
    await answerLocate(result as Result<unknown>);
    await waitFor(() => expect(slots()).toHaveLength(0));
    expect(badges()).toEqual([]);
    await waitFor(() => expect(status()).toBeEmptyDOMElement());
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(thumbnail());
    decode();
    expect(markers()).toEqual([]);
  });

  it("keeps the cards from before, without numbers, while a new photo is read, and numbers the new cards with the new job's points", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    const answerNew = await startPhoto(png());
    // The cards from before stay while the new photo is read: a new photo of the place replaces its job.
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    await answerNew({ ...numbered, suggestions: numbered.suggestions.slice(2) });
    expect(cardNames()).toEqual(["mjölk", "smör"]);
    // The first job was closed when the new cards came: its points are not for them.
    expect(fakeAi.dismissed).toEqual([fakeAi.calls[0].job.id]);
    await answerLocate(ok(located), 0);
    expect(badges()).toEqual([]);
    await answerLocate(ok(located), 1);
    await waitFor(() => expect(badges()).toEqual(["1", "2"]));
  });

  it("keeps the old cards when a new photo is cancelled or fails", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    await startPhoto(png());
    fireEvent.click(within(screen.getByTestId("pantry-camera")).getByRole("button", { name: "Avbryt" }));
    expect(cardNames()).toEqual(["gurka", "ketchup", "mjölk", "smör"]);
    await answerLocate(ok(located), 0);
    await waitFor(() => expect(badges()).toEqual(["3", "4", "1", "2"]));
  });

  it("does not look up again numbers that had already come", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    await answerLocate(ok(located));
    await startPhoto(png());
    fireEvent.click(within(screen.getByTestId("pantry-camera")).getByRole("button", { name: "Avbryt" }));
    expect(badges()).toEqual(["3", "4", "1", "2"]);
  });

  it("closes the job when every card is handled, which stops the numbers, and lets the photo go from memory (Story 12.5)", async () => {
    render(<Hemma />);
    await analyzeNumbered({ ...numbered, suggestions: numbered.suggestions.slice(1, 2) });
    const { id } = fakeAi.calls[0].job;
    expect(keptPhoto(id)).not.toBeNull();
    reject("ketchup");
    expect(fakeAi.dismissed).toEqual([id]);
    expect(keptPhoto(id)).toBeNull();
    // "Ångra" brings the card back from the result held here, without the job.
    fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" }));
    expect(cardNames()).toEqual(["ketchup"]);
  });

  it("keeps the photo's URL lifecycle when Hemma is left", async () => {
    const { unmount } = render(<Hemma />);
    await analyzeNumbered();
    expect(revoke).not.toHaveBeenCalled();
    unmount();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:photo-1");
  });

  it("makes no new URL for the numbers, and revokes the photo once when a new answer replaces it", async () => {
    render(<Hemma />);
    await analyzeNumbered();
    await answerLocate(ok(located));
    expect(created).toEqual(["blob:photo-1"]);
    expect(revoke).not.toHaveBeenCalled();
    await analyzeNumbered({ ...numbered, suggestions: numbered.suggestions.slice(2) });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:photo-1");
    expect(created).toEqual(["blob:photo-1", "blob:photo-2"]);
  });

  it("looks nothing up without a reading, for an answer without cards, or for Syns inte längre and unchanged items alone", async () => {
    render(<Hemma />);
    await (await startPhoto(png()))(fridge);
    expect(status()).toBeEmptyDOMElement();
    await analyzeNumbered({ ...numbered, suggestions: [] });
    await analyzeNumbered({
      ...numbered,
      suggestions: numbered.suggestions.slice(3).map((suggestion) => ({ ...suggestion, change: "unchanged" as const })),
      inventory: { kind: "compared", incomplete: false, missing: [missingSmor] },
    });
    expect(within(section()).getAllByTestId("pantry-missing")).toHaveLength(1);
    expect(status()).toBeEmptyDOMElement();
    expect(slots()).toHaveLength(0);
    expect(badges()).toEqual([]);
  });

  it("gives unchanged items and Syns inte längre cards no number and no marker", async () => {
    render(<Hemma />);
    await analyzeNumbered({
      ...numbered,
      suggestions: [
        { ...numbered.suggestions[0], change: "new" as const },
        { ...numbered.suggestions[3], change: "unchanged" as const },
      ],
      inventory: { kind: "compared", incomplete: false, missing: [missingSmor] },
    });
    await answerLocate(ok(located));
    await waitFor(() => expect(badges()).toEqual(["3"]));
    expect(within(within(section()).getByTestId("pantry-missing")).queryByTestId("pantry-photo-number")).toBeNull();
    fireEvent.click(thumbnail());
    decode();
    // Smör (item 2) is unchanged: it has a point, but no card and so no marker.
    expect(markers().map((marker) => marker.textContent)).toEqual(["3"]);
  });

  describe("the photo and the rows are linked (Kylfoto D)", () => {
    const reviewPhoto = () => within(section()).getByTestId("pantry-review-photo");
    const reviewMarkers = () => within(reviewPhoto()).queryAllByTestId("pantry-review-marker");
    const marker = (name: string) => within(reviewPhoto()).getByRole("button", { name });
    const row = (name: string) =>
      within(section())
        .getAllByTestId("pantry-suggestion")
        .find((shown) => within(shown).getByRole("heading", { level: 3 }).querySelector("span:not([aria-hidden])")?.textContent === name)!;
    /** The review photo as the browser decodes it. */
    const decodeReview = (width = 720, height = 900) => {
      const image = reviewPhoto().querySelector("img")!;
      Object.defineProperty(image, "naturalWidth", { configurable: true, value: width });
      Object.defineProperty(image, "naturalHeight", { configurable: true, value: height });
      fireEvent.load(image);
    };
    const scrollIntoView = vi.fn();
    beforeEach(() => {
      scrollIntoView.mockReset();
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("shows the photos of a reading of several as a strip, the chosen one large with its own markers (Kylfoto, flera foton)", async () => {
      render(<Hemma />);
      const inputs = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
      fireEvent.change(inputs[inputs.length - 1], { target: { files: [png(), png()] } });
      await waitFor(() => expect(fakeAi.calls).toHaveLength(1));
      // The shelves: mjölk and smör; the door: gurka and ketchup.
      const shelves = numbered.suggestions.filter((one) => one.name === "mjölk" || one.name === "smör");
      await act(async () => fakeAi.calls[0].answer(ok({ ...numbered, reading: reading.slice(0, 2), suggestions: shelves })));
      await answerLocate(ok({ positions: located.positions.slice(0, 2) }), 0);
      await waitFor(() => expect(fakeAi.calls).toHaveLength(2));
      const door = numbered.suggestions
        .filter((one) => one.name === "gurka" || one.name === "ketchup")
        .map((one) => ({ ...one, itemNumbers: one.itemNumbers!.map((n) => n - 2) }));
      await act(async () => fakeAi.calls[1].answer(ok({ ...numbered, reading: reading.slice(2), suggestions: door })));
      await answerLocate(ok({ positions: [{ n: 1, x: 694, y: 583 }, { n: 2, x: 146, y: 813 }] }), 1);

      await waitFor(() => expect(cardNames()).toEqual(["mjölk", "smör", "gurka", "ketchup"]));
      expect(badges()).toEqual(["1", "2", "3", "4"]);
      const thumbs = within(reviewPhoto()).getAllByTestId("pantry-review-thumb");
      expect(thumbs.map((thumb) => thumb.getAttribute("aria-label"))).toEqual(["Foto 1 av 2", "Foto 2 av 2"]);
      expect(thumbs[0]).toHaveAttribute("aria-pressed", "true");
      decodeReview();
      expect(reviewMarkers().map((shown) => shown.textContent)).toEqual(["1", "2"]);

      // A tap on a row of the door shows the door large, with its markers, and lights up the row's.
      fireEvent.click(button("Rätta gurka"));
      fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
      const [, doorThumb] = within(reviewPhoto()).getAllByTestId("pantry-review-thumb");
      expect(doorThumb).toHaveAttribute("aria-pressed", "true");
      decodeReview();
      expect(reviewMarkers().map((shown) => shown.textContent)).toEqual(["3", "4"]);
      expect(marker("Vara 3: Gurka")).toHaveAttribute("aria-pressed", "true");

      // A tap on the strip shows the shelves again.
      fireEvent.click(within(reviewPhoto()).getAllByTestId("pantry-review-thumb")[0]);
      decodeReview();
      expect(reviewMarkers().map((shown) => shown.textContent)).toEqual(["1", "2"]);
    });

    it("puts the rows' numbers on the photo as buttons named after their row, once it is decoded", async () => {
      render(<Hemma />);
      await analyzeNumbered();
      await answerLocate(ok(located));
      expect(reviewMarkers()).toEqual([]);
      decodeReview();
      expect(reviewMarkers().map((shown) => shown.getAttribute("aria-label"))).toEqual([
        "Vara 3: Gurka",
        "Vara 4: Ketchup",
        "Vara 1: Mjölk",
        "Vara 2: Smör",
      ]);
      expect(marker("Vara 3: Gurka").tagName).toBe("BUTTON");
      expect(marker("Vara 3: Gurka")).toHaveAttribute("aria-pressed", "false");
      expect(marker("Vara 3: Gurka").style.left).toMatch(/^clamp\(14px, 69.4%, (calc\()?100% - 14px\)?\)$/);
      // Accent while ticked; dark grey once the row is not.
      expect(marker("Vara 4: Ketchup")).toHaveAttribute("data-tone", "on");
      fireEvent.click(within(row("ketchup")).getByRole("checkbox", { name: "Ta med ketchup" }));
      expect(marker("Vara 4: Ketchup")).toHaveAttribute("data-tone", "off");
    });

    it("lights up the row of a tapped marker, scrolls it into view and says so; a second tap puts it out", async () => {
      render(<Hemma />);
      await analyzeNumbered();
      await answerLocate(ok(located));
      decodeReview();
      fireEvent.click(marker("Vara 3: Gurka"));
      expect(marker("Vara 3: Gurka")).toHaveAttribute("aria-pressed", "true");
      expect(marker("Vara 3: Gurka")).toHaveClass("scale-140");
      expect(marker("Vara 4: Ketchup")).toHaveClass("opacity-35");
      expect(row("gurka")).toHaveAttribute("data-selected", "true");
      expect(row("gurka")).toHaveClass("bg-mint/60");
      expect(row("ketchup")).not.toHaveAttribute("data-selected");
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(row("gurka"));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
      expect(within(section()).getByTestId("pantry-review-selected")).toHaveTextContent("Vara 3: Gurka är markerad i listan.");
      expect(within(section()).getByTestId("pantry-review-selected")).toHaveAttribute("role", "status");
      // No sheet opens from the photo.
      expect(screen.queryByRole("dialog")).toBeNull();

      fireEvent.click(marker("Vara 3: Gurka"));
      expect(marker("Vara 3: Gurka")).toHaveAttribute("aria-pressed", "false");
      expect(row("gurka")).not.toHaveAttribute("data-selected");
      expect(marker("Vara 4: Ketchup")).not.toHaveClass("opacity-35");
    });

    it("jumps to the row without animation when less motion is asked for", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      render(<Hemma />);
      await analyzeNumbered();
      await answerLocate(ok(located));
      decodeReview();
      fireEvent.click(marker("Vara 1: Mjölk"));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    });

    it("lights up the marker of a tapped row and opens the sheet with the photo around the item", async () => {
      render(<Hemma />);
      await analyzeNumbered();
      await answerLocate(ok(located));
      decodeReview();
      fireEvent.click(button("Rätta gurka"));
      const dialog = screen.getByRole("dialog");
      const crop = within(dialog).getByTestId("pantry-sheet-crop");
      expect(crop).toHaveAttribute("aria-hidden", "true");
      expect(crop.style.backgroundImage).toContain("blob:photo-1");
      expect(crop.style.backgroundPosition).toBe("69.4% 58.3%");
      expect(crop).toHaveTextContent("3");
      // At the top of the sheet's form, before "Fel vara?".
      expect(crop.compareDocumentPosition(within(dialog).getByText(/Fel vara\?/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Avbryt" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(marker("Vara 3: Gurka")).toHaveAttribute("aria-pressed", "true");
      expect(row("gurka")).toHaveAttribute("data-selected", "true");
    });

    it("opens the sheet without a crop for a row without a number", async () => {
      render(<Hemma />);
      await analyzeNumbered();
      await answerLocate(fail("ai_unavailable"));
      fireEvent.click(button("Rätta gurka"));
      expect(within(screen.getByRole("dialog")).queryByTestId("pantry-sheet-crop")).toBeNull();
    });
  });

  describe("with the saved photo (Story 10.1)", () => {
    const photoId = "88888888-8888-4888-8888-888888888888";
    const confirmGurka = async () => {
      confirmOnly("gurka");
      await waitFor(() => expect(confirms).toHaveLength(1));
      await act(async () => confirms[0].answer(ok({ count: 1 })));
      await waitFor(() => expect(photoPosts).toHaveLength(1));
    };

    it("saves the photo without points while they are looked up, and adds them once when they come", async () => {
      render(<Hemma />);
      await analyzeNumbered();
      await confirmGurka();
      expect(photoPosts[0].form.get("points")).toBeNull();
      expect(JSON.parse(String(photoPosts[0].form.get("reading")))).toEqual(reading);
      await act(async () => photoPosts[0].answer({ kind: "saved", id: photoId }));

      await answerLocate(ok(located));
      await waitFor(() => expect(savePlacePhotoPoints).toHaveBeenCalledTimes(1));
      expect(savePlacePhotoPoints).toHaveBeenCalledWith({ id: photoId, points: located });
    });

    it("sends the points with the photo when they came before the first confirmation", async () => {
      render(<Hemma />);
      await analyzeNumbered();
      await answerLocate(ok(located));
      await waitFor(() => expect(badges()).toEqual(["3", "4", "1", "2"]));
      await confirmGurka();
      expect(JSON.parse(String(photoPosts[0].form.get("points")))).toEqual(located);
      await act(async () => photoPosts[0].answer({ kind: "saved", id: photoId }));
      expect(savePlacePhotoPoints).not.toHaveBeenCalled();
    });

    it("saves the photo without points, and sends nothing more, when the lookup fails", async () => {
      render(<Hemma />);
      await analyzeNumbered();
      await answerLocate(fail("ai_unavailable"));
      await confirmGurka();
      expect(photoPosts[0].form.get("points")).toBeNull();
      await act(async () => photoPosts[0].answer({ kind: "saved", id: photoId }));
      expect(savePlacePhotoPoints).not.toHaveBeenCalled();
    });
  });
});
