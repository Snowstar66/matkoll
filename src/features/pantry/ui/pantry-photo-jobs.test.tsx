import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";
import type { PantrySuggestion } from "../domain/pantry-suggestion";
import { LocationCards } from "./location-cards";
import { PantryCamera } from "./pantry-camera";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { PantrySuggestionsProvider, usePantrySuggestions } from "./pantry-suggestions";
import { keptPhoto, releaseAllPhotos } from "./photo-store";

// A photo as an AI job (Story 12.5), seen from Hemma: that a place waits in
// the queue while another can be photographed, that a result that came while
// Pontus was away is shown when Hemma is opened (without a photo, and with no
// latest photo saved), that a result for another place waits for the one on
// the screen and shows up on its place's card, and that a job that failed says
// so. The jobs are the stand-in of tests/mocks/fake-ai-jobs.ts.

const testSite = { id: "55555555-5555-4555-8555-555555555555" };
const photoSite = { id: testSite.id, name: "Hemma" };

vi.mock("@/lib/ai-jobs-client", async () => (await import("../../../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: async (file: Blob): Promise<Result<Blob>> => ok(file) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn(async () => ok([])) }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));
vi.mock("../actions/save-place-photo-points", () => ({ savePlacePhotoPoints: vi.fn() }));
const confirmPantrySuggestions = vi.fn();
vi.mock("../actions/confirm-pantry-suggestions", () => ({
  confirmPantrySuggestions: (...args: unknown[]) => confirmPantrySuggestions(...args),
}));
const photoPosts: FormData[] = [];
vi.mock("./photo-post", () => ({
  postPlacePhoto: (form: FormData) => new Promise(() => photoPosts.push(form)),
}));

const suggestion = (id: string, name: string, location: Location): PantrySuggestion => ({
  id,
  name,
  ingredient: { kind: "new", proposalId: `n-${id}`, name, section: "Mejeri", location, defaultUnit: null },
  location,
  amount: 1,
  unit: "förp",
  current: null,
  change: null,
  replaces: [],
});
const reading = (location: Location, suggestions: PantrySuggestion[], points: unknown = "skipped") => ({
  site: photoSite,
  location,
  dropped: 0,
  inventory: { kind: "empty" },
  suggestions,
  points,
});
const fridge = reading("Kyl", [suggestion("s1", "grädde", "Kyl"), suggestion("s2", "mjölk", "Kyl")]);
const freezer = reading("Frys", [suggestion("s1", "ärtor", "Frys")]);
const context = (location: Location) => ({ siteId: testSite.id, location, takenAt: "2026-10-28T12:00:00.000Z" });

function Ready({ siteId }: { siteId: string }) {
  const { readyLocations } = usePantrySuggestions();
  return <p data-testid="ready">{readyLocations(siteId).sort().join(",")}</p>;
}

function Hemma({ location = "Kyl" }: { location?: Location }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={testSite}>
          <PantryCamera site={photoSite} location={location} />
          <PantrySuggestionList siteId={testSite.id} />
          <Ready siteId={testSite.id} />
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

const cardNames = () => screen.queryAllByTestId("pantry-suggestion").map((card) => within(card).getByRole("heading").textContent);
const area = () => screen.getByTestId("pantry-camera");

beforeEach(() => {
  fakeAi.reset();
  releaseAllPhotos();
  photoPosts.length = 0;
  refresh.mockReset();
  confirmPantrySuggestions.mockReset().mockResolvedValue(ok({ count: 1 }));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a photo's job on Hemma", () => {
  it("shows that the photo of a place waits in the queue, and lets another location be photographed at once", () => {
    fakeAi.add({ status: "queued", ahead: 1, context: context("Kyl") });
    const { rerender } = render(<Hemma />);
    expect(within(area()).getByText("Du kan göra annat under tiden.")).toBeInTheDocument();
    expect(within(area()).getByText("I kö, 1 före.")).toBeInTheDocument();
    expect(within(area()).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fotografera kylen" })).toBeNull();

    // Another location of the same place has its own button: its photo is not waiting.
    rerender(<Hemma location="Frys" />);
    expect(screen.getByRole("button", { name: "Fotografera frysen" })).toBeInTheDocument();
    expect(screen.queryByText("I kö, 1 före.")).toBeNull();
  });

  it("cancels the waiting job with Avbryt, and only that place's", async () => {
    const waiting = fakeAi.add({ status: "queued", ahead: 0, context: context("Kyl") });
    fakeAi.add({ status: "queued", ahead: 1, context: context("Frys") });
    render(<Hemma />);
    fireEvent.click(within(area()).getByRole("button", { name: "Avbryt" }));
    await waitFor(() => expect(fakeAi.cancelled).toEqual([waiting.id]));
    expect(await screen.findByRole("button", { name: "Fotografera kylen" })).toHaveFocus();
  });

  it("posts the photo as a job with the place, the location and the time, and keeps the photo in memory only", async () => {
    render(<Hemma />);
    const inputs = area().querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(fakeAi.calls).toHaveLength(1));
    const [call] = fakeAi.calls;
    expect(call.path).toBe("/api/ai/jobs/photo");
    expect(call.form.get("kind")).toBe("analyze");
    expect(call.form.get("location")).toBe("Kyl");
    expect(call.form.get("site")).toBe(testSite.id);
    expect(new Date(String(call.form.get("takenAt"))).getTime()).toBeGreaterThan(0);
    expect(call.form.get("image")).toBeInstanceOf(Blob);
    await act(async () => call.answer(ok(fridge)));
    expect(keptPhoto(call.job.id)).not.toBeNull();
    // Nothing of the photo is in the browser's storage.
    expect(JSON.stringify({ ...localStorage })).not.toContain("IMG_1");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("IMG_1");
  });

  it("shows the cards of a result that came while Hemma was away, without a photo, and says so", async () => {
    const job = fakeAi.add({ status: "done", count: 2, context: context("Kyl"), result: fridge });
    render(<Hemma />);
    await waitFor(() => expect(cardNames()).toEqual(["grädde", "mjölk"]));
    expect(screen.getByText("Fotot finns inte kvar efter omladdningen.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fotot av kylen, visa större/ })).toBeNull();
    // The result is counted as seen when its cards have been shown.
    expect(fakeAi.seen).toEqual([job.id]);

    // Confirming saves the suggestion, but no latest photo: there is no photo to save (AD-26).
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta grädde" }));
    await waitFor(() => expect(confirmPantrySuggestions).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(photoPosts).toHaveLength(0);
  });

  it("shows a result whose reading is there while its numbers are still being looked up", async () => {
    fakeAi.add({ status: "running", count: 2, context: context("Kyl"), result: { ...fridge, points: null } });
    render(<Hemma />);
    await waitFor(() => expect(cardNames()).toEqual(["grädde", "mjölk"]));
    expect(screen.queryByRole("button", { name: "Avbryt" })).toBeNull();
  });

  it("holds a result for another place's photo taken before, shows its place on the card, and shows it when the cards before are handled", async () => {
    const first = fakeAi.add({ status: "done", count: 2, context: context("Kyl"), result: fridge });
    const second = fakeAi.add({ status: "done", count: 1, context: context("Frys"), result: freezer });
    render(<Hemma />);
    await waitFor(() => expect(cardNames()).toEqual(["grädde", "mjölk"]));
    expect(fakeAi.seen).toEqual([first.id]);
    // The freezer's cards wait, and its card says so.
    expect(screen.getByTestId("ready")).toHaveTextContent("Frys,Kyl");

    fireEvent.click(screen.getByRole("button", { name: "Avvisa grädde" }));
    fireEvent.click(screen.getByRole("button", { name: "Avvisa mjölk" }));
    // Every card handled: the first job is closed, and the next result comes.
    await waitFor(() => expect(cardNames()).toEqual(["ärtor"]));
    expect(fakeAi.dismissed).toContain(first.id);
    expect(fakeAi.seen).toEqual([first.id, second.id]);
    expect(screen.getByTestId("ready")).toHaveTextContent("Frys");
  });

  it("shows why a job failed, keeps Hemma working, and closes the job", async () => {
    const job = fakeAi.add({ status: "failed", errorCode: "ai_unavailable", context: context("Kyl") });
    render(<Hemma />);
    expect(await screen.findByRole("alert")).toHaveTextContent("AI-tjänsten svarar inte just nu");
    expect(fakeAi.dismissed).toEqual([job.id]);
    expect(screen.getByRole("button", { name: "Fotografera kylen" })).toBeInTheDocument();
  });

  it("gives a refused start its own message, and keeps the photo for Försök igen", async () => {
    render(<Hemma />);
    const inputs = area().querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(fakeAi.calls).toHaveLength(1));
    await act(async () => fakeAi.calls[0].answer(fail("ai_queue_full")));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
  });
});

describe("Förslag klara on a location card (Story 12.5)", () => {
  const counts = { Kyl: 3, Frys: 1, Skafferi: 0 };

  it("says it on the cards of the locations with suggestions that are not closed, and on no other", () => {
    render(<LocationCards selected="Kyl" counts={counts} ready={["Frys"]} />);
    const cards = screen.getAllByTestId("location-card");
    expect(within(cards[1]).getByText("Förslag klara")).toBeInTheDocument();
    expect(within(cards[0]).queryByText("Förslag klara")).toBeNull();
    expect(within(cards[2]).queryByText("Förslag klara")).toBeNull();
  });

  it("says nothing without suggestions", () => {
    render(<LocationCards selected="Kyl" counts={counts} />);
    expect(screen.queryByText("Förslag klara")).toBeNull();
  });
});
