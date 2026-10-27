import { act, fireEvent, render as renderElement, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { CatalogDataError } from "@/features/catalog/server";
import type { PantryItem } from "@/features/pantry";
import { countPantryItems, listPantry, needsPlacePhotoSweep, PantryDataError } from "@/features/pantry/server";
import { PantrySheetProvider } from "@/features/pantry/ui/pantry-item-sheet";
import { PantrySuggestionsProvider } from "@/features/pantry/ui/pantry-suggestions";
import { SiteSwitch, SiteSwitchProvider } from "@/features/pantry/ui/site-switch";
import type { AiCallResult } from "@/lib/ai-client";
import { ok, type Result } from "@/lib/errors";
import { HomeContent } from "./home-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/pantry/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pantry/server")>()),
  countPantryItems: vi.fn(),
  listPantry: vi.fn(),
  needsPlacePhotoSweep: vi.fn(async () => false),
}));

vi.mock("@/features/pantry/actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("@/features/pantry/actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/pantry/actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("@/features/pantry/actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("@/features/pantry/actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("@/features/pantry/actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("@/features/pantry/actions/select-pantry-site", () => ({ selectPantrySite: vi.fn() }));
vi.mock("@/features/pantry/actions/save-pantry-site", () => ({ savePantrySite: vi.fn() }));
vi.mock("@/features/pantry/actions/delete-pantry-site", () => ({ deletePantrySite: vi.fn() }));
const sweepPlacePhotos = vi.fn();
vi.mock("@/features/pantry/actions/sweep-place-photos", () => ({ sweepPlacePhotos: () => sweepPlacePhotos() }));
const confirmPantrySuggestions = vi.fn();
vi.mock("@/features/pantry/actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));
vi.mock("@/features/pantry/actions/confirm-pantry-suggestions", () => ({
  confirmPantrySuggestions: (...args: unknown[]) => confirmPantrySuggestions(...args),
}));

// The camera's analysis, answered by the test.
let answers: ((result: AiCallResult<unknown>) => void)[] = [];
vi.mock("@/lib/ai-client", () => ({
  postAiForm: () => new Promise<AiCallResult<unknown>>((resolve) => answers.push(resolve)),
}));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: async (file: Blob): Promise<Result<Blob>> => ok(file) }));

/** The place Hemma shows (Story 8.2), one of two, so the page has the site switch and no "Lägg till ställe". */
const site = { id: "55555555-5555-4555-8555-555555555555", name: "Hemma", siteCount: 2 };

/** The list opens the sheet Lagervara and the camera keeps its suggestions, which the page provides. */
const render = (element: ReactElement) =>
  renderElement(
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location="Kyl" site={site}>
          {element}
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>,
  );

const unavailable = "Det gick inte att läsa lagret. Försök igen.";
const mjolk: PantryItem = { id: "1", siteId: site.id, ingredientId: "m", name: "Mjölk", location: "Kyl", amount: 1, unit: "l", label: null, createdAt: "2026-10-20T10:00:00+00:00", section: "Mejeri" };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  answers = [];
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  logged.mockRestore();
});

describe("HomeContent", () => {
  it("shows the cards and the list, with the chosen card counting the listed items", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 5, Frys: 1, Skafferi: 0 });
    vi.mocked(listPantry).mockResolvedValue([mjolk]);
    render(await HomeContent({ site, location: "Kyl", next: "/hemma" }));
    const links = within(screen.getByRole("navigation", { name: "Platser" })).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Kyl 1 vara", "Frys 1 vara", "Skafferi 0 varor"]);
    expect(screen.getByText("Mjölk")).toBeInTheDocument();
    expect(listPantry).toHaveBeenCalledWith("Kyl", site.id);
    expect(countPantryItems).toHaveBeenCalledWith(site.id);
    // The camera button comes under the cards and before the list.
    const camera = screen.getByRole("button", { name: "Fotografera kylen" });
    expect(links[2].compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(camera.compareDocumentPosition(screen.getByText("Mjölk")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the chosen location on the camera button, also for an empty location", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 1, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockResolvedValue([]);
    render(await HomeContent({ site, location: "Skafferi", next: "/hemma?plats=skafferi" }));
    expect(screen.getByRole("button", { name: "Fotografera skafferiet" })).toBeInTheDocument();
    expect(screen.getByText("Inget i skafferiet än.")).toBeInTheDocument();
  });

  it("shows a notice when the pantry cannot be read", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new PantryDataError("query_failed 500"));
    render(await HomeContent({ site, location: "Frys", next: "/hemma?plats=frys" }));
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 500" });
    // A photo needs no list: the camera is there under the notice.
    expect(screen.getByRole("button", { name: "Fotografera frysen" })).toBeInTheDocument();
  });

  it("shows the camera's suggestions with their buttons under the notice when the pantry cannot be read", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new PantryDataError("query_failed 500"));
    render(await HomeContent({ site, location: "Kyl", next: "/hemma" }));
    const picker = screen.getByTestId("pantry-camera").querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(picker, { target: { files: [new File(["x"], "IMG_1.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(answers).toHaveLength(1));
    const suggestion = {
      id: "s1",
      name: "gurka",
      ingredient: { kind: "new", proposalId: "n1", name: "gurka", section: "Frukt och grönt", location: "Kyl", defaultUnit: "st" },
      location: "Kyl",
      amount: 2,
      unit: "st",
      current: null,
      change: null,
      replaces: [],
    };
    await act(async () => answers[0](ok({ site: { id: site.id, name: site.name }, location: "Kyl", suggestions: [suggestion], dropped: 0, inventory: { kind: "unread" } })));

    const section = screen.getByRole("region", { name: "Lagerförslag från kylen" });
    expect(within(section).getByTestId("pantry-suggestion")).toHaveTextContent("gurkaNy2 st · Kyl");
    const notice = screen.getByRole("alert");
    expect(notice.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const name of ["Bekräfta alla", "Bekräfta gurka", "Rätta gurka", "Avvisa gurka"]) {
      expect(within(section).getByRole("button", { name })).toBeEnabled();
    }

    // Confirming still works: the suggestion goes, and the notice stays.
    confirmPantrySuggestions.mockResolvedValue(ok({ count: 1 }));
    await act(async () => fireEvent.click(within(section).getByRole("button", { name: "Bekräfta gurka" })));
    expect(confirmPantrySuggestions).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
  });

  it("shows a notice when the catalog's names cannot be read, and logs code and detail", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new CatalogDataError("query_failed", "57014"));
    render(await HomeContent({ site, location: "Kyl", next: "/hemma" }));
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed", detail: "57014" });
  });

  it("says the place is gone when it was deleted before it was read", async () => {
    vi.mocked(countPantryItems).mockRejectedValue(new PantryDataError("site_gone"));
    vi.mocked(listPantry).mockResolvedValue([]);
    render(await HomeContent({ site, location: "Kyl", next: "/hemma" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Stället finns inte längre. Välj ett annat ställe.");
    expect(logged).toHaveBeenCalledWith("pantry_site_gone", { reason: "site_gone" });
  });

  it("puts Lägg till ställe last, under Töm kylen, while there is only one place", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 1, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockResolvedValue([mjolk]);
    const only = { ...site, siteCount: 1 };
    render(
      <SiteSwitchProvider>
        <SiteSwitch sites={[{ id: only.id, name: only.name, isSelected: true, itemCount: 1 }]} selected={only}>
          {await HomeContent({ site: only, location: "Kyl", next: "/hemma" })}
        </SiteSwitch>
      </SiteSwitchProvider>,
    );
    expect(screen.queryByRole("radiogroup", { name: "Ställe" })).toBeNull();
    const add = await screen.findByRole("button", { name: "Lägg till ställe" });
    const empty = screen.getByRole("button", { name: "Töm kylen" });
    expect(empty.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps Lägg till ställe with one place when the pantry cannot be read, so the sheet Ställen can be reached", async () => {
    vi.mocked(countPantryItems).mockRejectedValue(new PantryDataError("query_failed 500"));
    vi.mocked(listPantry).mockResolvedValue([]);
    const only = { ...site, siteCount: 1 };
    render(
      <SiteSwitchProvider>
        <SiteSwitch sites={[{ id: only.id, name: only.name, isSelected: true, itemCount: null }]} selected={only}>
          {await HomeContent({ site: only, location: "Kyl", next: "/hemma" })}
        </SiteSwitch>
      </SiteSwitchProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    fireEvent.click(await screen.findByRole("button", { name: "Lägg till ställe" }));
    expect(await screen.findByRole("dialog", { name: "Ställen" })).toBeInTheDocument();
  });

  it("has no Lägg till ställe with two places", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 1, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockResolvedValue([mjolk]);
    render(await HomeContent({ site, location: "Kyl", next: "/hemma" }));
    expect(screen.queryByRole("button", { name: "Lägg till ställe" })).toBeNull();
  });

  it("starts the photo sweep once, showing nothing, only when there is something to sweep (Story 10.3)", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 1, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockResolvedValue([mjolk]);
    sweepPlacePhotos.mockResolvedValue(ok({ removed: 1 }));

    const quiet = render(await HomeContent({ site, location: "Kyl", next: "/hemma" }));
    expect(needsPlacePhotoSweep).toHaveBeenCalled();
    await screen.findByText("Mjölk");
    expect(sweepPlacePhotos).not.toHaveBeenCalled();
    quiet.unmount();

    vi.mocked(needsPlacePhotoSweep).mockResolvedValueOnce(true);
    render(await HomeContent({ site, location: "Kyl", next: "/hemma" }));
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Mjölk")).toBeInTheDocument();
  });

  it("lets other errors through to the error boundary", async () => {
    vi.mocked(countPantryItems).mockRejectedValue(new Error("boom"));
    vi.mocked(listPantry).mockResolvedValue([]);
    await expect(HomeContent({ site, location: "Kyl", next: "/hemma" })).rejects.toThrow("boom");
  });
});
