import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { LatestPhoto, type ShownPlacePhoto } from "./latest-photo";
import { PantryCamera } from "./pantry-camera";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionsProvider } from "./pantry-suggestions";

// Senaste foto in Lagersaldo (Story 10.2): the line under the camera button, the
// photo sheet of Story 6.6 with the saved markers, the reading as a
// numbered list, and "Ta bort fotot" with its question. removePlacePhoto and
// fetch are stubbed; the photo itself is never fetched by the test.

const removePlacePhoto = vi.fn<(input: { id: string }) => Promise<Result<{ removed: boolean }>>>();
vi.mock("../actions/remove-place-photo", () => ({ removePlacePhoto: (input: { id: string }) => removePlacePhoto(input) }));
vi.mock("@/lib/ai-client", () => ({ postAiForm: vi.fn() }));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));

const site = { id: "55555555-5555-4555-8555-555555555555", name: "Hemma" };
const id = "66666666-6666-4666-8666-666666666666";

const photo: ShownPlacePhoto = {
  id,
  location: "Kyl",
  takenAt: new Date("2026-10-26T15:42:00+01:00"),
  time: "idag 15:42",
  width: 720,
  height: 900,
  reading: ["Mellanmjölk 1,5 %", "Smör 500 g", "<b>Ägg</b>"],
  points: [
    { n: 1, x: 250, y: 500 },
    { n: 3, x: 750, y: 100 },
  ],
};

const photoB: ShownPlacePhoto = {
  ...photo,
  id: "77777777-7777-4777-8777-777777777777",
  takenAt: new Date("2026-10-26T15:55:00+01:00"),
  time: "idag 15:55",
};

function Hemma({ shown = photo, location = "Kyl" }: { shown?: ShownPlacePhoto | null; location?: Location }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={site}>
          <PantryCamera site={site} location={location} />
          <LatestPhoto photo={shown} location={location} />
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

const line = () => screen.queryByTestId("pantry-latest-photo");
const visa = () => screen.getByRole("button", { name: "Visa senaste foto av kylen" });
const photoSheet = () => screen.getByRole("dialog", { name: "Fotot av kylen" });
const question = () => screen.getByRole("dialog", { name: "Ta bort fotot" });
const largePhoto = () => within(photoSheet()).getByRole("img", { name: "Senaste fotot av kylen" });
const markers = () => within(photoSheet()).queryAllByTestId("pantry-photo-marker");
const decode = () => {
  const image = largePhoto();
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: 720 });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: 900 });
  fireEvent.load(image);
};

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // Only Date: the line writes its time again in the browser, counted from this.
  vi.useFakeTimers({ now: new Date("2026-10-26T16:00:00+01:00"), toFake: ["Date"] });
  refresh.mockReset();
  removePlacePhoto.mockReset().mockResolvedValue(ok({ removed: true }));
  fetchSpy = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LatestPhoto", () => {
  it("shows the line with Visa under the camera button, and fetches nothing", () => {
    render(<Hemma />);
    expect(line()).toHaveTextContent(/^Senaste idag 15:42\s*·\s*Visa$/);
    expect(visa()).toHaveTextContent("Visa");
    // The dot between them is only seen.
    expect(within(line()!).getByText("·")).toHaveAttribute("aria-hidden", "true");
    expect(visa()).toHaveAttribute("aria-haspopup", "dialog");
    // No thumbnail, and the line is not announced.
    expect(within(line()!).queryByRole("img")).toBeNull();
    expect(line()!.closest("[role=status], [aria-live]")).toBeNull();
    expect(document.querySelector(`img[src*="${id}"]`)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("has no line without a photo", () => {
    render(<Hemma shown={null} />);
    expect(line()).toBeNull();
    expect(screen.getByTestId("pantry-no-photo")).toHaveTextContent("Inget foto än");
  });

  it("opens the sheet with the photo from the route, the time, the markers and the reading as a numbered list", async () => {
    render(<Hemma />);
    fireEvent.click(visa());
    expect(photoSheet()).toHaveAccessibleDescription("Taget idag 15:42. Numren visar vad AI:n läste av.");
    expect(largePhoto()).toHaveAttribute("src", `/api/pantry/photo/${id}`);
    expect(markers()).toEqual([]);
    decode();
    expect(markers().map((marker) => marker.textContent)).toEqual(["1", "3"]);
    for (const marker of markers()) expect(marker).toHaveAttribute("aria-hidden", "true");
    expect(within(photoSheet()).getByRole("heading", { name: "AI:n läste av:" })).toBeInTheDocument();
    const items = within(within(photoSheet()).getByRole("list", { name: "AI:n läste av:" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["11. Mellanmjölk 1,5 %", "22. Smör 500 g", "33. <b>Ägg</b>"]);
    // Text, never HTML.
    expect(within(photoSheet()).queryByText("Ägg", { selector: "b" })).toBeNull();
    // Full size, and the markers come along.
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Visa i full storlek" }));
    expect(within(photoSheet()).getByRole("button", { name: "Visa i full storlek" })).toHaveAttribute("aria-pressed", "true");
    expect(markers()).toHaveLength(2);
  });

  it("says only when it was taken for a photo without points, with no markers but the whole list", () => {
    render(<Hemma shown={{ ...photo, points: null }} />);
    fireEvent.click(visa());
    expect(photoSheet()).toHaveAccessibleDescription("Taget idag 15:42.");
    decode();
    expect(markers()).toEqual([]);
    expect(within(photoSheet()).getAllByRole("listitem")).toHaveLength(3);
  });

  it("gives focus back to Visa when the sheet closes", async () => {
    render(<Hemma />);
    visa().focus();
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Stäng" }));
    await waitFor(() => expect(visa()).toHaveFocus());
  });

  it("says the photo is gone when the route answers 404", async () => {
    const { rerender } = render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.error(largePhoto());
    expect(await within(photoSheet()).findByText(errorMessages.pantry_photo_gone)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(`/api/pantry/photo/${id}`, expect.objectContaining({ method: "HEAD" }));
    // Said by VoiceOver, and the dead line goes when the page is read again.
    expect(within(photoSheet()).getByRole("status")).toHaveTextContent(errorMessages.pantry_photo_gone);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Read again without the photo, the sheet stays and still says so.
    rerender(<Hemma shown={null} />);
    expect(within(photoSheet()).getByRole("status")).toHaveTextContent(errorMessages.pantry_photo_gone);
    expect(line()).toBeNull();
  });

  it("says the photo cannot be shown when the route has it but the browser cannot show it", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.error(largePhoto());
    expect(await within(photoSheet()).findByText("Fotot kunde inte visas.")).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(within(photoSheet()).queryByText(errorMessages.pantry_photo_gone)).toBeNull();
    expect(markers()).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks before removing, and Avbryt brings the photo back", async () => {
    render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    // The question replaces the sheet: they never stack.
    expect(screen.queryByRole("dialog", { name: "Fotot av kylen" })).toBeNull();
    expect(within(question()).getByText("Ta bort fotot av kylen? Det går inte att ångra.")).toBeInTheDocument();
    await waitFor(() => expect(within(question()).getByRole("button", { name: "Avbryt" })).toHaveFocus());
    fireEvent.click(within(question()).getByRole("button", { name: "Avbryt" }));
    expect(photoSheet()).toBeInTheDocument();
    expect(removePlacePhoto).not.toHaveBeenCalled();
  });

  it("removes the photo: the sheet closes, the line goes, the confirmation says so and the camera button has focus", async () => {
    render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    await act(async () => {
      fireEvent.click(within(question()).getByRole("button", { name: "Ta bort" }));
    });
    expect(removePlacePhoto).toHaveBeenCalledWith({ id });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(line()).toBeNull();
    expect(await screen.findByTestId("toast")).toHaveTextContent("Fotot av kylen är borttaget.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Fotografera kylen" })).toHaveFocus());
  });

  it("says the photo is gone, not removed, when it was gone already", async () => {
    removePlacePhoto.mockResolvedValue(ok({ removed: false }));
    render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    await act(async () => {
      fireEvent.click(within(question()).getByRole("button", { name: "Ta bort" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(line()).toBeNull();
    expect(await screen.findByTestId("toast")).toHaveTextContent(errorMessages.pantry_photo_gone);
    expect(screen.getByTestId("toast")).not.toHaveTextContent("borttaget");
  });

  it("closes the sheet and the question when a newer photo comes, and never removes it", async () => {
    const { rerender } = render(<Hemma />);
    fireEvent.click(visa());
    // A photo saved in the background while the sheet is open: the page is read again.
    rerender(<Hemma shown={photoB} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(line()).toHaveTextContent("Senaste idag 15:55");

    rerender(<Hemma />);
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    rerender(<Hemma shown={photoB} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(removePlacePhoto).not.toHaveBeenCalled();

    // Opened again, the sheet shows B and removes B.
    fireEvent.click(visa());
    expect(largePhoto()).toHaveAttribute("src", `/api/pantry/photo/${photoB.id}`);
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    await act(async () => {
      fireEvent.click(within(question()).getByRole("button", { name: "Ta bort" }));
    });
    expect(removePlacePhoto.mock.calls).toEqual([[{ id: photoB.id }]]);
  });

  it("removes the photo it opened, also when the same photo is read again meanwhile", async () => {
    const { rerender } = render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    rerender(<Hemma shown={{ ...photo }} />);
    await act(async () => {
      fireEvent.click(within(question()).getByRole("button", { name: "Ta bort" }));
    });
    expect(removePlacePhoto.mock.calls).toEqual([[{ id }]]);
  });

  it("writes the time again in the browser, and when the page becomes visible", async () => {
    render(<Hemma />);
    // The server's text first, as rendered on the server.
    expect(line()).toHaveTextContent("idag 15:42");
    vi.setSystemTime(new Date("2026-10-27T08:00:00+01:00"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(line()).toHaveTextContent("Senaste igår 15:42"));
  });

  it("keeps the photo and says so in the question when removing fails", async () => {
    removePlacePhoto.mockResolvedValue(fail("pantry_photo_remove_failed"));
    render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    await act(async () => {
      fireEvent.click(within(question()).getByRole("button", { name: "Ta bort" }));
    });
    expect(within(question()).getByRole("alert")).toHaveTextContent("Det gick inte att ta bort fotot. Försök igen.");
    expect(line()).toBeInTheDocument();
  });

  it("says the same when the action cannot be reached", async () => {
    removePlacePhoto.mockRejectedValue(new Error("Failed to fetch"));
    render(<Hemma />);
    fireEvent.click(visa());
    fireEvent.click(within(photoSheet()).getByRole("button", { name: "Ta bort fotot" }));
    await act(async () => {
      fireEvent.click(within(question()).getByRole("button", { name: "Ta bort" }));
    });
    expect(within(question()).getByRole("alert")).toHaveTextContent(errorMessages.pantry_photo_remove_failed);
  });

  it("names the location everywhere: frysen", () => {
    render(
      <Hemma
        shown={{ ...photo, location: "Frys", takenAt: new Date("2026-10-24T15:42:00+02:00"), time: "24 okt 15:42" }}
        location="Frys"
      />,
    );
    expect(line()).toHaveTextContent("Senaste 24 okt 15:42");
    fireEvent.click(screen.getByRole("button", { name: "Visa senaste foto av frysen" }));
    expect(screen.getByRole("dialog", { name: "Fotot av frysen" })).toBeInTheDocument();
  });
});
