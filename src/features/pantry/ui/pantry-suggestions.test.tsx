import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import type { AiCallResult } from "@/lib/ai-client";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { AnalyzeResult, PantrySuggestion } from "../domain/pantry-suggestion";
import { PantryCamera } from "./pantry-camera";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { focusAfter, PantrySuggestionsProvider, putBack } from "./pantry-suggestions";

/** The place Hemma shows (Story 8.2). */
const testSite = { id: "55555555-5555-4555-8555-555555555555" };
/** The place a photo was taken for (Story 8.4): the one Hemma shows. */
const photoSite = { id: testSite.id, name: "Hemma" };

// The analysis as Hemma holds it (PantrySuggestionsProvider with the camera
// and the section), with the photo's resizing (downscaleImage) and
// /api/ai/analyze (postAiForm) stubbed: the client rows of Story 6.1's matrix.

type Call = {
  path: string;
  form: FormData;
  signal: AbortSignal;
  answer: (result: AiCallResult<unknown>) => void;
  reject: (error: unknown) => void;
};
let calls: Call[] = [];
vi.mock("@/lib/ai-client", () => ({
  postAiForm: (path: string, form: FormData, signal: AbortSignal) =>
    new Promise<AiCallResult<unknown>>((resolve, reject) => {
      calls.push({ path, form, signal, answer: resolve, reject });
      // Like fetch: an aborted call answers { aborted: true }.
      signal.addEventListener("abort", () => resolve({ ok: false, aborted: true }), { once: true });
    }),
}));

type Resize = { file: Blob; answer: (result: Result<Blob>) => void; reject: (error: unknown) => void };
let resizes: Resize[] = [];
vi.mock("@/lib/downscale-image", () => ({
  downscaleImage: (file: Blob) =>
    new Promise<Result<Blob>>((resolve, reject) => resizes.push({ file, answer: resolve, reject })),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
const confirmPantrySuggestions = vi.fn();
vi.mock("../actions/confirm-pantry-suggestions", () => ({
  confirmPantrySuggestions: (...args: unknown[]) => confirmPantrySuggestions(...args),
}));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));

const mjolkId = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const suggestion = (id: string, name: string, change: Partial<PantrySuggestion> = {}): PantrySuggestion => ({
  id,
  name,
  ingredient: { kind: "new", proposalId: `n-${id}`, name, section: "Mejeri", location: "Kyl", defaultUnit: "förp" },
  location: "Kyl",
  amount: 1,
  unit: "förp",
  current: null,
  change: null,
  replaces: [],
  ...change,
});
const fridge: AnalyzeResult = {
  site: photoSite,
  location: "Kyl",
  dropped: 0,
  inventory: { kind: "empty" },
  suggestions: [
    suggestion("s1", "grädde"),
    suggestion("s2", "mjölk", {
      ingredient: { kind: "existing", ingredientId: mjolkId },
      current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
    }),
  ],
};
const freezer: AnalyzeResult = { site: photoSite, location: "Frys", suggestions: [suggestion("s1", "ärtor", { location: "Frys" })], dropped: 0, inventory: { kind: "empty" } };

function Hemma({ location = "Kyl", shownSite = photoSite }: { location?: Location; shownSite?: { id: string; name: string } }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={testSite}>
          {/* Keyed like Hemma's <Suspense>: another card mounts them anew under the same provider. */}
          <div key={location}>
            <PantryCamera site={shownSite} location={location} />
            <PantrySuggestionList siteId={shownSite.id} />
          </div>
          <button type="button">Utanför</button>
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

const photo = (name = "IMG_1.jpg") => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });
const resized = (label = "small") => new Blob([label], { type: "image/jpeg" });
const picker = () => {
  const inputs = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
  return inputs[inputs.length - 1];
};
const choose = (file: File = photo()) => fireEvent.change(picker(), { target: { files: [file] } });
const lastResize = () => resizes[resizes.length - 1];
const lastCall = () => calls[calls.length - 1];
const resize = async (result: Result<Blob> = ok(resized())) => {
  await act(async () => lastResize().answer(result));
};
const answer = async (result: AiCallResult<unknown>) => {
  await act(async () => lastCall().answer(result));
};
const cardNames = () => screen.queryAllByTestId("pantry-suggestion").map((card) => within(card).getByRole("heading").textContent);
const heading = () => screen.queryByRole("heading", { level: 2 });

/** Chooses a photo, resizes it and answers the analysis with `result`. */
async function analyzeWith(result: AiCallResult<unknown> = ok(fridge)) {
  choose();
  await resize();
  await answer(result);
}

beforeEach(() => {
  calls = [];
  resizes = [];
  refresh.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("PantrySuggestionsProvider", () => {
  it("resizes the photo, posts it with the place, and shows the suggestions with focus on the heading", async () => {
    render(<Hemma />);
    const file = photo();
    choose(file);
    expect(lastResize().file).toBe(file);
    // Nothing is sent before the photo is small.
    expect(calls).toHaveLength(0);
    const small = resized();
    await resize(ok(small));

    expect(lastCall().path).toBe("/api/ai/analyze");
    expect(lastCall().form.get("location")).toBe("Kyl");
    const image = lastCall().form.get("image");
    expect(image).toBeInstanceOf(Blob);
    expect(await (image as Blob).text()).toBe("small");

    await answer(ok(fridge));
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
    await waitFor(() => expect(heading()).toHaveFocus());
    expect(heading()).toHaveTextContent("Lagerförslag från kylen");
  });

  it("never sends a photo that cannot be read, and offers no Försök igen for it", async () => {
    render(<Hemma />);
    choose();
    await resize(fail("image_unsupported"));
    expect(calls).toHaveLength(0);
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.image_unsupported);
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Fotografera kylen" })).toBeInTheDocument();
  });

  it("treats an answer that does not pass analyzeResultSchema as ai_invalid", async () => {
    render(<Hemma />);
    await analyzeWith(ok({ site: photoSite, location: "Kyl", suggestions: [{ id: "s1", name: "mjölk" }], dropped: 0 }));
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.ai_invalid);
    expect(cardNames()).toEqual([]);
  });

  it("sends the same resized photo again with Försök igen, for the place it shows", async () => {
    const { rerender } = render(<Hemma />);
    await analyzeWith(fail("ai_unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.ai_unavailable);

    // Another card meanwhile: the photo is still the fridge's.
    rerender(<Hemma location="Frys" />);
    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(calls).toHaveLength(2);
    expect(resizes).toHaveLength(1);
    // The kept photo, not a new one: nothing was resized again.
    expect(await (lastCall().form.get("image") as Blob).text()).toBe("small");
    expect(lastCall().form.get("location")).toBe("Kyl");
    await answer(ok(fridge));
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the earlier suggestions until new ones arrive, and replaces them then", async () => {
    render(<Hemma />);
    await analyzeWith(ok(fridge));
    choose();
    await resize();
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
    await answer(ok(freezer));
    expect(cardNames()).toEqual(["ärtor"]);
    expect(heading()).toHaveTextContent("Lagerförslag från frysen");
  });

  it("keeps the earlier suggestions after Avbryt and after an error", async () => {
    render(<Hemma />);
    await analyzeWith(ok(fridge));

    choose();
    await resize();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(lastCall().signal.aborted).toBe(true);
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
    expect(screen.queryByRole("alert")).toBeNull();

    await analyzeWith(fail("ai_rejected"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI-tjänsten tog inte emot bilden. Ta en ny bild eller försök igen senare.",
    );
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
  });

  it("stops the analysis while the photo is resized too, and never sends it", async () => {
    render(<Hemma />);
    choose();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    await resize();
    expect(calls).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Fotografera kylen" })).toBeInTheDocument();
  });

  it("lets a new photo stop the one on its way, whose late answer is not used", async () => {
    render(<Hemma />);
    choose();
    await resize();
    const first = lastCall();
    choose(photo("IMG_2.jpg"));
    expect(first.signal.aborted).toBe(true);
    await resize();
    await act(async () => first.answer(ok(freezer)));
    await answer(ok(fridge));
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
  });

  it("shows the empty text for an empty answer, the earlier suggestions go, and the camera button takes focus", async () => {
    render(<Hemma />);
    await analyzeWith(ok(fridge));
    await analyzeWith(ok({ site: photoSite, location: "Kyl", suggestions: [], dropped: 0, inventory: { kind: "unread" } }));
    expect(screen.getByText("Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand.")).toBeInTheDocument();
    expect(cardNames()).toEqual([]);
    expect(heading()).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Fotografera kylen" })).toHaveFocus());
  });

  it("says so when the AI named items but none could be used", async () => {
    render(<Hemma />);
    await analyzeWith(ok({ site: photoSite, location: "Kyl", suggestions: [], dropped: 4, inventory: { kind: "unread" } }));
    expect(
      screen.getByText("Det gick inte att tolka varorna på bilden. Ta en ny bild eller lägg till för hand."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Hittade inga varor/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
  });

  it("moves focus to the camera button after an error, while focus has nowhere else to be", async () => {
    render(<Hemma />);
    await analyzeWith(fail("ai_unavailable"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Fotografera kylen" })).toHaveFocus());
  });

  it("leaves focus where Pontus put it, and says the suggestions came through the live region", async () => {
    render(<Hemma />);
    choose();
    await resize();
    screen.getByRole("button", { name: "Utanför" }).focus();
    await answer(ok(fridge));
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
    expect(screen.getByRole("button", { name: "Utanför" })).toHaveFocus();
    await waitFor(() =>
      expect(within(screen.getByTestId("pantry-camera")).getByRole("status")).toHaveTextContent("2 lagerförslag från kylen."),
    );

    // An error later does not take focus either.
    choose();
    await resize();
    screen.getByRole("button", { name: "Utanför" }).focus();
    await answer(fail("ai_unavailable"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Utanför" })).toHaveFocus();
  });

  it("shows nothing when a newer analysis of the same person took over (ai_superseded), like Avbryt", async () => {
    render(<Hemma />);
    await analyzeWith(ok(fridge));
    await analyzeWith(fail("ai_superseded"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Fotografera kylen" })).toBeInTheDocument();
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
  });

  it("finishes with image_unsupported when resizing throws, and sends nothing", async () => {
    render(<Hemma />);
    choose();
    await act(async () => lastResize().reject(new Error("decoder crashed")));
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.image_unsupported);
    expect(calls).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Fotografera kylen" })).toBeInTheDocument();
  });

  it("finishes with ai_unavailable when the call throws, and keeps the photo for Försök igen", async () => {
    render(<Hemma />);
    choose();
    await resize();
    await act(async () => lastCall().reject(new TypeError("boom")));
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.ai_unavailable);
    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(calls).toHaveLength(2);
  });

  it("keeps the photo only while Försök igen can help: not after Avbryt of a new try", async () => {
    render(<Hemma />);
    await analyzeWith(fail("ai_invalid"));
    fireEvent.click(await screen.findByRole("button", { name: "Försök igen" }));
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reads the page again when the session has expired", async () => {
    render(<Hemma />);
    await analyzeWith(fail("unauthorized"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.unauthorized);
  });

  it("stops the analysis when Hemma goes away", async () => {
    const { unmount } = render(<Hemma />);
    choose();
    await resize();
    unmount();
    expect(lastCall().signal.aborted).toBe(true);
  });
});

describe("focusAfter", () => {
  const list = ["s1", "s2", "s3", "s4"].map((id) => suggestion(id, id));

  it("goes to the next card that stays, else the previous one, else the camera button", () => {
    expect(focusAfter(list, "s2", new Set(["s2"]))).toEqual({ kind: "confirm", id: "s3" });
    expect(focusAfter(list, "s2", new Set(["s2", "s3"]))).toEqual({ kind: "confirm", id: "s4" });
    expect(focusAfter(list, "s4", new Set(["s4"]))).toEqual({ kind: "confirm", id: "s3" });
    expect(focusAfter(list, "s4", new Set(["s3", "s4"]))).toEqual({ kind: "confirm", id: "s2" });
    expect(focusAfter(list, "s1", new Set(["s1", "s2", "s3", "s4"]))).toEqual({ kind: "camera" });
    expect(focusAfter([], "s1", new Set(["s1"]))).toEqual({ kind: "camera" });
  });
});

describe("putBack", () => {
  const [s1, s2, s3, s4] = ["s1", "s2", "s3", "s4"].map((id) => suggestion(id, id));
  const names = (list: PantrySuggestion[]) => list.map(({ id }) => id);

  it("puts a suggestion back after the one before it, else before the one after it, else where it was", () => {
    expect(names(putBack([s1, s3, s4], s2, { before: "s1", after: "s3", index: 1 }))).toEqual(["s1", "s2", "s3", "s4"]);
    expect(names(putBack([s3, s4], s2, { before: "s1", after: "s3", index: 1 }))).toEqual(["s2", "s3", "s4"]);
    expect(names(putBack([s4], s2, { before: "s1", after: "s3", index: 1 }))).toEqual(["s4", "s2"]);
    expect(names(putBack([s3, s4], s1, { before: null, after: "s2", index: 0 }))).toEqual(["s1", "s3", "s4"]);
    expect(names(putBack([s1, s2], s2, { before: "s1", after: null, index: 1 }))).toEqual(["s1", "s2"]);
  });
});

describe("the photo's place (Story 8.4)", () => {
  const stugan = { id: "66666666-6666-4666-8666-666666666666", name: "Stugan" };

  it("sends the place Hemma shows with the photo, and the same place with Försök igen", async () => {
    render(<Hemma shownSite={stugan} />);
    choose();
    await resize();
    expect(lastCall().form.get("site")).toBe(stugan.id);
    await answer(fail("ai_unavailable"));
    fireEvent.click(await screen.findByRole("button", { name: "Försök igen" }));
    expect(calls).toHaveLength(2);
    expect(lastCall().form.get("site")).toBe(stugan.id);
  });

  it("shows pantry_site_gone in the camera area without Försök igen, and reads the page again", async () => {
    render(<Hemma />);
    await analyzeWith(fail("pantry_site_gone"));
    expect(await within(screen.getByTestId("pantry-camera")).findByRole("alert")).toHaveTextContent(
      "Stället finns inte längre. Välj ett annat ställe.",
    );
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says which place the suggestions are for while Hemma shows another, and saves on the photo's place", async () => {
    confirmPantrySuggestions.mockReset().mockResolvedValue(ok({ count: 1 }));
    const { rerender } = render(<Hemma shownSite={stugan} />);
    await analyzeWith(ok({ ...fridge, site: stugan }));
    expect(screen.getByTestId("pantry-suggestions-site")).toBeEmptyDOMElement();

    // Pontus selects Hemma while the suggestions show: they stay, with a line about their place.
    rerender(<Hemma shownSite={photoSite} />);
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
    expect(screen.getByTestId("pantry-suggestions-site")).toHaveTextContent("Förslagen gäller Stugan.");
    expect(screen.getByTestId("pantry-suggestions-site")).toHaveAttribute("role", "status");

    fireEvent.click(screen.getByRole("button", { name: "Bekräfta grädde" }));
    await waitFor(() => expect(confirmPantrySuggestions).toHaveBeenCalledTimes(1));
    expect(confirmPantrySuggestions.mock.calls[0][0]).toMatchObject({ siteId: stugan.id });
  });

  it("refuses an answer for another place than the one sent as ai_invalid", async () => {
    render(<Hemma shownSite={stugan} />);
    await analyzeWith(ok({ ...fridge, site: photoSite }));
    expect(cardNames()).toEqual([]);
    expect(await within(screen.getByTestId("pantry-camera")).findByRole("alert")).toHaveTextContent(errorMessages.ai_invalid);
  });

  it("keeps the place it sent when an answer has none (a server of before Story 8.4), and saves there", async () => {
    confirmPantrySuggestions.mockReset().mockResolvedValue(ok({ count: 1 }));
    const { rerender } = render(<Hemma shownSite={stugan} />);
    const withoutSite: Partial<AnalyzeResult> = { ...fridge };
    delete withoutSite.site;
    await analyzeWith(ok(withoutSite));
    expect(cardNames()).toEqual(["grädde", "mjölk"]);
    rerender(<Hemma shownSite={photoSite} />);
    expect(screen.getByTestId("pantry-suggestions-site")).toHaveTextContent("Förslagen gäller Stugan.");
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta grädde" }));
    await waitFor(() => expect(confirmPantrySuggestions).toHaveBeenCalledTimes(1));
    expect(confirmPantrySuggestions.mock.calls[0][0]).toMatchObject({ siteId: stugan.id });
  });

  it("drops the suggestions when a confirmation finds their place gone, and says so in the camera area", async () => {
    confirmPantrySuggestions.mockReset().mockResolvedValue(fail("pantry_site_gone"));
    render(<Hemma />);
    await analyzeWith();
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta grädde" }));
    await waitFor(() => expect(cardNames()).toEqual([]));
    expect(within(screen.getByTestId("pantry-camera")).getByRole("alert")).toHaveTextContent(errorMessages.pantry_site_gone);
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
  });
});
