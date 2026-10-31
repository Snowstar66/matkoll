import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { errorMessages, fail, ok, type ErrorCode, type Result } from "@/lib/errors";
import { PantryCamera } from "./pantry-camera";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";

/** The place Hemma shows (Story 8.2). */
const testSite = { id: "55555555-5555-4555-8555-555555555555" };
/** The place a photo was taken for (Story 8.4): the one Hemma shows. */
const photoSite = { id: testSite.id, name: "Hemma" };

// Kameraknappen on Hemma: its text per location, the camera on a phone and
// the file picker on a desktop, the progress with "Avbryt", and the notices
// for errors and an empty answer. The AI jobs and the resizing are stubbed.

vi.mock("@/lib/ai-jobs-client", async () => (await import("../../../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
const downscaled = vi.hoisted(() => [] as { maxSide?: number }[]);
vi.mock("@/lib/downscale-image", () => ({
  downscaleImage: async (file: Blob, options: { maxSide?: number } = {}): Promise<Result<Blob>> => {
    downscaled.push(options);
    return ok(file);
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));

/** A phone (coarse pointer) or a desktop, as matchMedia says. */
function pointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: coarse && query === "(pointer: coarse)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function Hemma({ location = "Kyl" }: { location?: Location }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={testSite}>
          {/* Keyed like Hemma's <Suspense>: another card mounts it anew under the same provider. */}
          <PantryCamera key={location} site={photoSite} location={location} />
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

const area = () => screen.getByTestId("pantry-camera");
const fileInputs = () => [...area().querySelectorAll<HTMLInputElement>('input[type="file"]')];
const choose = () =>
  fireEvent.change(fileInputs().at(-1)!, { target: { files: [new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })] } });
const answer = async (result: Result<unknown>) => {
  await act(async () => fakeAi.calls[fakeAi.calls.length - 1].answer(result));
};
/** Chooses a photo and waits for the analysis call. */
async function photograph() {
  choose();
  await vi.waitFor(() => expect(fakeAi.calls.length).toBeGreaterThan(0));
}

beforeEach(() => {
  fakeAi.reset();
  downscaled.length = 0;
  pointer(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PantryCamera", () => {
  it.each([
    ["Kyl", "Fotografera kylen"],
    ["Frys", "Fotografera frysen"],
    ["Skafferi", "Fotografera skafferiet"],
  ] as const)("names %s on a quiet row with the camera tile and a chevron", (location, text) => {
    render(<Hemma location={location} />);
    const button = within(area()).getByRole("button", { name: text });
    expect(button.parentElement?.parentElement).toHaveClass("bg-surface", "rounded-lg");
    expect(button.parentElement?.parentElement).toHaveTextContent("\u{1F4F7}");
    expect(button.parentElement?.parentElement).toHaveTextContent("›");
  });

  it("opens the file picker on a desktop, without capture and without Välj bild", () => {
    render(<Hemma />);
    const inputs = fileInputs();
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveAttribute("accept", "image/*");
    expect(inputs[0]).not.toHaveAttribute("capture");
    const click = vi.spyOn(inputs[0], "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Fotografera kylen" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Välj bild" })).toBeNull();
  });

  it("opens the back camera on a phone, and Välj bild opens the library", () => {
    pointer(true);
    render(<Hemma />);
    const [camera, library] = fileInputs();
    expect(camera).toHaveAttribute("capture", "environment");
    expect(library).not.toHaveAttribute("capture");
    const cameraClick = vi.spyOn(camera, "click").mockImplementation(() => {});
    const libraryClick = vi.spyOn(library, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Fotografera kylen" }));
    expect(cameraClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Välj bild" }));
    expect(libraryClick).toHaveBeenCalledTimes(1);
  });

  it("resizes the photo of a place to at most 2048 px (Story 6.5)", async () => {
    render(<Hemma />);
    await photograph();
    expect(downscaled).toEqual([{ maxSide: 2048 }]);
  });

  it("shows Tittar på bilden … with Avbryt in the button's place, and the button takes focus after Avbryt", async () => {
    render(<Hemma />);
    // The status region is there empty before, so the text is announced.
    expect(within(area()).getByRole("status")).toBeEmptyDOMElement();
    await photograph();
    expect(within(area()).getByRole("status")).toHaveTextContent("Tittar på bilden …");
    expect(within(area()).getByText("Du kan göra annat under tiden.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fotografera kylen" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    // The photo was still on its way: the job is cancelled as soon as the server has made it (Story 12.5).
    await answer(ok({ site: photoSite, location: "Kyl", suggestions: [], dropped: 0, inventory: { kind: "empty" } }));
    expect(fakeAi.cancelled).toEqual([fakeAi.calls[0].job.id]);
    const button = await screen.findByRole("button", { name: "Fotografera kylen" });
    expect(button).toHaveFocus();
    expect(within(area()).getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not take focus for an earlier Avbryt when it mounts again under another card", async () => {
    const { rerender } = render(<Hemma />);
    await photograph();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    await screen.findByRole("button", { name: "Fotografera kylen" });
    screen.getByRole("button", { name: "Fotografera kylen" }).blur();
    rerender(<Hemma location="Frys" />);
    expect(screen.getByRole("button", { name: "Fotografera frysen" })).not.toHaveFocus();
  });

  it.each<[ErrorCode, string]>([
    ["ai_unavailable", errorMessages.ai_unavailable],
    ["ai_invalid", errorMessages.ai_invalid],
    ["ai_rejected", "AI-tjänsten tog inte emot bilden. Ta en ny bild eller försök igen senare."],
    ["catalog_unavailable", errorMessages.catalog_unavailable],
  ])("shows %s in a notice with Försök igen, above the camera button", async (code, message) => {
    render(<Hemma />);
    await photograph();
    await answer(fail(code));
    const alert = await within(area()).findByRole("alert");
    expect(alert).toHaveTextContent(message);
    const retry = within(area()).getByRole("button", { name: "Försök igen" });
    const camera = within(area()).getByRole("button", { name: "Fotografera kylen" });
    expect(retry.compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each<ErrorCode>(["image_too_large", "image_unsupported", "validation"])("offers no Försök igen for %s", async (code) => {
    render(<Hemma />);
    await photograph();
    await answer(fail(code));
    expect(await within(area()).findByRole("alert")).toHaveTextContent(errorMessages[code]);
    expect(within(area()).queryByRole("button", { name: "Försök igen" })).toBeNull();
  });

  it("says when the photo shows no food, with Lägg till vara opening the sheet Lagervara", async () => {
    render(<Hemma />);
    await photograph();
    await answer(ok({ site: photoSite, location: "Kyl", suggestions: [], dropped: 0, inventory: { kind: "unread" } }));
    const status = within(area())
      .getAllByRole("status")
      .find((element) => element.textContent !== "");
    expect(status).toHaveTextContent("Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand.");
    fireEvent.click(within(area()).getByRole("button", { name: "Lägg till vara" }));
    expect(await screen.findByRole("dialog", { name: "Lagervara" })).toBeInTheDocument();
  });

  it("clears the notice when the next photo is sent", async () => {
    render(<Hemma />);
    await photograph();
    await answer(fail("ai_unavailable"));
    await within(area()).findByRole("alert");
    choose();
    await vi.waitFor(() => expect(fakeAi.calls).toHaveLength(2));
    expect(within(area()).queryByRole("alert")).toBeNull();
  });
});
