import { act, fireEvent, render as renderElement, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { CatalogDataError } from "@/features/catalog/server";
import type { PantryItem } from "@/features/pantry";
import { countPantryItems, listPantry, PantryDataError } from "@/features/pantry/server";
import { PantrySheetProvider } from "@/features/pantry/ui/pantry-item-sheet";
import { PantrySuggestionsProvider } from "@/features/pantry/ui/pantry-suggestions";
import type { AiCallResult } from "@/lib/ai-client";
import { ok, type Result } from "@/lib/errors";
import { HomeContent } from "./home-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/pantry/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pantry/server")>()),
  countPantryItems: vi.fn(),
  listPantry: vi.fn(),
}));

vi.mock("@/features/pantry/actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("@/features/pantry/actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/pantry/actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("@/features/pantry/actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));

// The camera's analysis, answered by the test.
let answers: ((result: AiCallResult<unknown>) => void)[] = [];
vi.mock("@/lib/ai-client", () => ({
  postAiForm: () => new Promise<AiCallResult<unknown>>((resolve) => answers.push(resolve)),
}));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: async (file: Blob): Promise<Result<Blob>> => ok(file) }));

/** The list opens the sheet Lagervara and the camera keeps its suggestions, which the page provides. */
const render = (element: ReactElement) =>
  renderElement(
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location="Kyl">{element}</PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>,
  );

const unavailable = "Det gick inte att läsa lagret. Försök igen.";
const mjolk: PantryItem = { id: "1", ingredientId: "m", name: "Mjölk", location: "Kyl", amount: 1, unit: "l" };

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
    render(await HomeContent({ location: "Kyl", next: "/hemma" }));
    const links = within(screen.getByRole("navigation", { name: "Platser" })).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Kyl 1 vara", "Frys 1 vara", "Skafferi 0 varor"]);
    expect(screen.getByText("Mjölk")).toBeInTheDocument();
    expect(listPantry).toHaveBeenCalledWith("Kyl");
    // The camera button comes under the cards and before the list.
    const camera = screen.getByRole("button", { name: "Fotografera kylen" });
    expect(links[2].compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(camera.compareDocumentPosition(screen.getByText("Mjölk")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the chosen location on the camera button, also for an empty location", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 1, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockResolvedValue([]);
    render(await HomeContent({ location: "Skafferi", next: "/hemma?plats=skafferi" }));
    expect(screen.getByRole("button", { name: "Fotografera skafferiet" })).toBeInTheDocument();
    expect(screen.getByText("Inget i skafferiet än.")).toBeInTheDocument();
  });

  it("shows a notice when the pantry cannot be read", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new PantryDataError("query_failed 500"));
    render(await HomeContent({ location: "Frys", next: "/hemma?plats=frys" }));
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 500" });
    // A photo needs no list: the camera is there under the notice.
    expect(screen.getByRole("button", { name: "Fotografera frysen" })).toBeInTheDocument();
  });

  it("shows the camera's suggestions under the notice when the pantry cannot be read", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new PantryDataError("query_failed 500"));
    render(await HomeContent({ location: "Kyl", next: "/hemma" }));
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
    };
    await act(async () => answers[0](ok({ location: "Kyl", suggestions: [suggestion], dropped: 0 })));

    const section = screen.getByRole("region", { name: "Lagerförslag från kylen" });
    expect(within(section).getByTestId("pantry-suggestion")).toHaveTextContent("gurkaNy2 st · Kyl");
    const notice = screen.getByRole("alert");
    expect(notice.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a notice when the catalog's names cannot be read, and logs code and detail", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new CatalogDataError("query_failed", "57014"));
    render(await HomeContent({ location: "Kyl", next: "/hemma" }));
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed", detail: "57014" });
  });

  it("lets other errors through to the error boundary", async () => {
    vi.mocked(countPantryItems).mockRejectedValue(new Error("boom"));
    vi.mocked(listPantry).mockResolvedValue([]);
    await expect(HomeContent({ location: "Kyl", next: "/hemma" })).rejects.toThrow("boom");
  });
});
