import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import type { PantryItem } from "../domain/pantry-item";
import type { PantryRow } from "../domain/pantry-item-form";
import type { AnalyzeResult, PantrySuggestion } from "../domain/pantry-suggestion";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantryPlace } from "./pantry-place";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { SitesSheetContext } from "./site-switching";
import type { SelectedSite } from "../domain/site";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";

const noSheet = () => {};

// "Töm kylen" on Hemma (Story 6.3): the button under the list, the sheet
// that asks first, and what happens around it (focus, lagerförslag). The
// actions, the photo's resizing and the AI jobs are stubbed; the list's
// changes and "Ångra" are tested in pantry-removal.test.tsx.

type Emptied = { removed: number; removedIds: string[] };
const emptyPantryPlace = vi.fn<(location: Location, operationId: string, siteId: string | null) => Promise<Result<Emptied>>>();
vi.mock("../actions/empty-pantry-place", () => ({
  emptyPantryPlace: (location: Location, operationId: string, siteId: string | null) => emptyPantryPlace(location, operationId, siteId),
}));
const restorePantryRemoval = vi.fn();
vi.mock("../actions/restore-pantry-removal", () => ({
  restorePantryRemoval: (operationId: string) => restorePantryRemoval(operationId),
}));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@/lib/ai-jobs-client", async () => (await import("../../../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
vi.mock("@/lib/downscale-image", () => ({
  downscaleImage: async () => ok(new Blob(["small"], { type: "image/jpeg" })),
}));

/** The place Hemma shows: the only one, so the texts are as in 1.0. */
const hemma: SelectedSite = { id: "55555555-5555-4555-8555-555555555555", name: "Hemma", siteCount: 1 };
/** A second place (Story 8.4): the texts name it. */
const stugan: SelectedSite = { id: "66666666-6666-4666-8666-666666666666", name: "Stugan", siteCount: 2 };
/** A photo of Hemma's fridge. */
const photoOfHemma = { id: hemma.id, name: "Hemma" };

const item = (n: number, location: Location = "Kyl"): PantryItem => ({
  id: `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
  siteId: hemma.id,
  ingredientId: `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  name: `Vara ${String(n).padStart(2, "0")}`,
  location,
  amount: 1,
  unit: "st",
  label: null,
  createdAt: "2026-10-20T10:00:00+00:00",
  section: "Mejeri",
});
const items = (count: number, location: Location = "Kyl") => Array.from({ length: count }, (_, n) => item(n + 1, location));
const emptiedOf = (emptied: readonly PantryItem[]): Emptied => ({ removed: emptied.length, removedIds: emptied.map(({ id }) => id) });

function Hemma({ location = "Kyl", initial, site = hemma }: { location?: Location; initial: PantryItem[]; site?: SelectedSite }) {
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location={location} site={site}>
          {/* "Lägg till boende" with one place needs the sheet Boenden; it is not opened here. */}
          <SitesSheetContext.Provider value={noSheet}>
            <PantryPlace
              site={site}
              location={location}
              counts={{ Kyl: 0, Frys: 3, Skafferi: 0, [location]: initial.length }}
              items={initial}
            />
          </SitesSheetContext.Provider>
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

const emptyButton = (name = "Töm kylen") => screen.queryByRole("button", { name });
const sheet = () => screen.getByRole("dialog", { name: "Töm kylen" });
const sheetConfirm = () => within(sheet()).getByRole("button", { name: /^(Töm kylen|Tar bort …)$/ });

/** A promise resolved from the test, to see the sheet while the action waits. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  fakeAi.reset();
  refresh.mockReset();
  restorePantryRemoval.mockReset();
  emptyPantryPlace.mockReset().mockImplementation(async () => ok({ removed: 0, removedIds: [] }));
});

describe("the button", () => {
  it("is under the list while the location has items, named after the location", () => {
    const { unmount } = render(<Hemma initial={items(2)} />);
    expect(emptyButton()).toBeInTheDocument();
    unmount();
    render(<Hemma location="Skafferi" initial={items(1, "Skafferi")} />);
    expect(emptyButton("Töm skafferiet")).toBeInTheDocument();
  });

  it("is not there for an empty location, which shows its empty state as before", () => {
    render(<Hemma location="Frys" initial={[]} />);
    expect(emptyButton("Töm frysen")).toBeNull();
    expect(screen.getByText("Inget i frysen än.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg till vara" })).toBeInTheDocument();
  });
});

describe("the sheet", () => {
  it("asks about all the items, with focus on Avbryt", () => {
    render(<Hemma initial={items(14)} />);
    fireEvent.click(emptyButton()!);
    expect(within(sheet()).getByText("Ta bort alla 14 varor i kylen?")).toBeInTheDocument();
    expect(within(sheet()).getByText("Du kan ångra direkt efteråt.")).toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "Avbryt" })).toHaveFocus();
    expect(sheetConfirm()).toHaveTextContent("Töm kylen");
  });

  it("asks about the one item", () => {
    render(<Hemma initial={items(1)} />);
    fireEvent.click(emptyButton()!);
    expect(within(sheet()).getByText("Ta bort 1 vara i kylen?")).toBeInTheDocument();
  });

  it("removes nothing on Avbryt, and gives focus back to the button", () => {
    render(<Hemma initial={items(3)} />);
    const button = emptyButton()!;
    button.focus();
    fireEvent.click(button);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull();
    expect(emptyPantryPlace).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("pantry-row")).toHaveLength(3);
    expect(button).toHaveFocus();
  });

  it("removes nothing on Esc", () => {
    render(<Hemma initial={items(3)} />);
    fireEvent.click(emptyButton()!);
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull();
    expect(emptyPantryPlace).not.toHaveBeenCalled();
  });

  it("says Tar bort … and cannot be closed while the location is emptied, then closes", async () => {
    const pending = deferred<Result<Emptied>>();
    emptyPantryPlace.mockImplementationOnce(() => pending.promise);
    const kyl = items(3);
    render(<Hemma initial={kyl} />);
    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());

    expect(await within(sheet()).findByRole("button", { name: "Tar bort …" })).toBeDisabled();
    expect(within(sheet()).getByRole("button", { name: "Avbryt" })).toBeDisabled();
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(sheet()).toBeInTheDocument();
    // A second tap sends nothing more.
    fireEvent.click(sheetConfirm());
    expect(emptyPantryPlace).toHaveBeenCalledTimes(1);
    expect(emptyPantryPlace).toHaveBeenCalledWith("Kyl", expect.any(String), hemma.id);

    await act(async () => pending.resolve(ok(emptiedOf(kyl))));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull());
    expect(screen.getByText("Inget i kylen än.")).toBeInTheDocument();
    expect(screen.getByTestId("toast")).toHaveTextContent("Tog bort 3 varor ur kylen.");
    expect(emptyButton()).toBeNull();
  });

  it("shows a failure in the sheet, which stays with the items kept, and can try again", async () => {
    emptyPantryPlace.mockResolvedValueOnce(fail("pantry_empty_failed"));
    render(<Hemma initial={items(2)} />);
    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());

    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att ta bort varorna. Försök igen.");
    expect(screen.getAllByTestId("pantry-row")).toHaveLength(2);
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(await within(sheet()).findByRole("button", { name: "Töm kylen" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull());
    expect(emptyPantryPlace).toHaveBeenCalledTimes(2);
  });

  it("moves focus to the camera button afterwards", async () => {
    const kyl = items(2);
    emptyPantryPlace.mockResolvedValueOnce(ok(emptiedOf(kyl)));
    render(<Hemma initial={kyl} />);
    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());
    await waitFor(() => expect(screen.getByRole("button", { name: "Fotografera kylen" })).toHaveFocus());
  });
});

describe("the sheet when the location changes meanwhile", () => {
  function Changing({ items }: { items: PantryItem[] }) {
    return <Hemma initial={items} />;
  }

  it("keeps the question it asked when it opened (Story 8.4), and closes when none are left", () => {
    const { rerender } = render(<Changing items={items(3)} />);
    fireEvent.click(emptyButton()!);
    expect(within(sheet()).getByText("Ta bort alla 3 varor i kylen?")).toBeInTheDocument();
    rerender(<Changing items={items(2)} />);
    expect(within(sheet()).getByText("Ta bort alla 3 varor i kylen?")).toBeInTheDocument();
    rerender(<Changing items={[]} />);
    expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull();
    expect(emptyPantryPlace).not.toHaveBeenCalled();
  });

  it("sends a new operation id for each time it asks, and the same one when trying again", async () => {
    emptyPantryPlace.mockResolvedValue(fail("pantry_empty_failed"));
    render(<Hemma initial={items(2)} />);
    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());
    await within(sheet()).findByRole("alert");
    fireEvent.click(await within(sheet()).findByRole("button", { name: "Töm kylen" }));
    await waitFor(() => expect(emptyPantryPlace).toHaveBeenCalledTimes(2));
    expect(emptyPantryPlace.mock.calls[1][1]).toBe(emptyPantryPlace.mock.calls[0][1]);
    await waitFor(() => expect(within(sheet()).getByRole("button", { name: "Avbryt" })).toBeEnabled());
    fireEvent.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull();
    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());
    await waitFor(() => expect(emptyPantryPlace).toHaveBeenCalledTimes(3));
    expect(emptyPantryPlace.mock.calls[2][1]).not.toBe(emptyPantryPlace.mock.calls[0][1]);
  });
});

describe("lagerförslag when the location is emptied", () => {
  const mjolkId = "10000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const suggestion = (id: string, name: string, location: Location, change: Partial<PantrySuggestion> = {}) =>
    ({
      id,
      name,
      ingredient: { kind: "existing", ingredientId: id === "1" ? mjolkId : `${id}0000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa` },
      location,
      amount: 1,
      unit: "förp",
      current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
      change: null,
      replaces: [],
      ...change,
    }) satisfies PantrySuggestion;

  it("keeps the suggestions, without I kylen nu for the emptied location", async () => {
    const result: AnalyzeResult = {
      site: photoOfHemma,
      location: "Kyl",
      dropped: 0,
      inventory: { kind: "empty" },
      suggestions: [suggestion("1", "mjölk", "Kyl"), suggestion("2", "ärtor", "Frys")],
    };
    const kyl = items(2);
    emptyPantryPlace.mockResolvedValueOnce(ok(emptiedOf(kyl)));
    render(<Hemma initial={kyl} />);
    const pickers = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(pickers[pickers.length - 1], {
      target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_1.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByText("Du kan göra annat under tiden.")).toBeInTheDocument());
    await act(async () => fakeAi.calls[fakeAi.calls.length - 1].answer(ok(result)));
    expect(await screen.findByText("I kylen nu: 2 förp")).toBeInTheDocument();
    expect(screen.getByText("I frysen nu: 2 förp")).toBeInTheDocument();

    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());
    await waitFor(() => expect(screen.queryByText("I kylen nu: 2 förp")).toBeNull());
    expect(screen.getAllByTestId("pantry-suggestion")).toHaveLength(2);
    expect(screen.getByText("I frysen nu: 2 förp")).toBeInTheDocument();

    // Ångra gives the rows back, and I kylen nu with them.
    restorePantryRemoval.mockResolvedValueOnce(
      ok({
        restoredIds: [kyl[0].id],
        rows: [{ id: kyl[0].id, ingredientId: mjolkId, location: "Kyl", amount: 3, unit: "förp" }] satisfies PantryRow[],
        skipped: 0,
      }),
    );
    await act(async () => fireEvent.click(within(screen.getByTestId("toast")).getByRole("button", { name: "Ångra" })));
    expect(await screen.findByText("I kylen nu: 3 förp")).toBeInTheDocument();
  });

  it("turns a photo compared with the emptied location into the plain list, without Syns inte längre", async () => {
    const yoghurtId = "40000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const result: AnalyzeResult = {
      site: photoOfHemma,
      location: "Kyl",
      dropped: 0,
      inventory: {
        kind: "compared",
        incomplete: false,
        missing: [
          {
            id: "m1",
            ingredientId: yoghurtId,
            name: "yoghurt",
            location: "Kyl",
            rows: [{ id: "41000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa", amount: 2, unit: "förp" }],
            stock: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
          },
        ],
      },
      suggestions: [
        suggestion("1", "mjölk", "Kyl", { change: "changed" }),
        suggestion("3", "smör", "Kyl", { change: "unchanged", current: { unlimited: false, amounts: [{ amount: 1, unit: "förp" }] } }),
      ],
    };
    const kyl = items(2);
    emptyPantryPlace.mockResolvedValueOnce(ok(emptiedOf(kyl)));
    render(<Hemma initial={kyl} />);
    const pickers = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(pickers[pickers.length - 1], {
      target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_1.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByText("Du kan göra annat under tiden.")).toBeInTheDocument());
    await act(async () => fakeAi.calls[fakeAi.calls.length - 1].answer(ok(result)));
    expect(await screen.findByText("nu: 2 förp → bilden: 1 förp")).toBeInTheDocument();
    expect(screen.getAllByTestId("pantry-missing")).toHaveLength(1);
    expect(screen.getAllByTestId("pantry-suggestion")).toHaveLength(1);

    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());
    // Every suggestion is a card again, as for an empty place, and nothing is offered for removal.
    await waitFor(() => expect(screen.getAllByTestId("pantry-suggestion")).toHaveLength(2));
    expect(screen.queryByTestId("pantry-missing")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Ändrat" })).toBeNull();
    expect(screen.queryByText(/stämmer med matvarorna/)).toBeNull();
    expect(screen.queryByText(/→/)).toBeNull();

    // Ångra puts the rows back, but not the ones the photo was compared with: the list says so.
    restorePantryRemoval.mockResolvedValueOnce(ok({ restoredIds: [kyl[0].id], rows: [], skipped: 0 }));
    await act(async () => fireEvent.click(within(screen.getByTestId("toast")).getByRole("button", { name: "Ångra" })));
    expect(await screen.findByText("Matvarorna i kylen har ändrats sedan bilden togs.")).toBeInTheDocument();
    expect(screen.getAllByTestId("pantry-suggestion")).toHaveLength(2);
    expect(screen.queryByTestId("pantry-missing")).toBeNull();
  });
});

describe("Töm kylen on a place (Story 8.4)", () => {
  it("empties the place Hemma shows, and names it from two places", async () => {
    const kyl = items(14).map((one) => ({ ...one, siteId: stugan.id }));
    emptyPantryPlace.mockResolvedValueOnce(ok(emptiedOf(kyl)));
    render(<Hemma initial={kyl} site={stugan} />);
    fireEvent.click(emptyButton()!);
    expect(within(sheet()).getByText("Ta bort alla 14 varor i kylen för Stugan?")).toBeInTheDocument();
    fireEvent.click(sheetConfirm());
    await waitFor(() => expect(screen.getByTestId("toast")).toHaveTextContent("Tog bort 14 varor ur kylen för Stugan."));
    expect(emptyPantryPlace).toHaveBeenCalledWith("Kyl", expect.any(String), stugan.id);
  });

  it("keeps the place the sheet opened for when trying again", async () => {
    emptyPantryPlace.mockResolvedValueOnce(fail("pantry_site_gone"));
    render(<Hemma initial={items(2)} site={stugan} />);
    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Boendet finns inte längre. Välj ett annat boende.");
    expect(screen.getAllByTestId("pantry-row")).toHaveLength(2);
    fireEvent.click(await within(sheet()).findByRole("button", { name: "Töm kylen" }));
    await waitFor(() => expect(emptyPantryPlace).toHaveBeenCalledTimes(2));
    expect(emptyPantryPlace.mock.calls[1]).toEqual(emptyPantryPlace.mock.calls[0]);
  });

  it("leaves a photo of another place as it is", async () => {
    const result: AnalyzeResult = {
      site: photoOfHemma,
      location: "Kyl",
      dropped: 0,
      inventory: { kind: "compared", incomplete: false, missing: [] },
      suggestions: [
        {
          id: "1",
          name: "mjölk",
          ingredient: { kind: "existing", ingredientId: "10000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          location: "Kyl",
          amount: 1,
          unit: "förp",
          current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
          change: "changed",
          replaces: [],
        },
      ],
    };
    const hemmaOfTwo: SelectedSite = { ...hemma, siteCount: 2 };
    const kyl = items(2).map((one) => ({ ...one, siteId: stugan.id }));
    emptyPantryPlace.mockResolvedValueOnce(ok(emptiedOf(kyl)));
    // The photo is taken on Hemma, and then Stugan is selected.
    const { rerender } = render(<Hemma initial={items(1)} site={hemmaOfTwo} />);
    const pickers = screen.getByTestId("pantry-camera").querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(pickers[pickers.length - 1], {
      target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_1.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByText("Du kan göra annat under tiden.")).toBeInTheDocument());
    await act(async () => fakeAi.calls[fakeAi.calls.length - 1].answer(ok(result)));
    expect(await screen.findByText("nu: 2 förp → bilden: 1 förp")).toBeInTheDocument();
    rerender(<Hemma initial={kyl} site={stugan} />);
    expect(screen.getByText("Förslagen gäller Hemma.")).toBeInTheDocument();

    fireEvent.click(emptyButton()!);
    fireEvent.click(sheetConfirm());
    await waitFor(() => expect(screen.getByTestId("toast")).toHaveTextContent("Tog bort 2 varor ur kylen för Stugan."));
    // Hemma's fridge was not emptied: the comparison with it stands.
    expect(screen.getByText("nu: 2 förp → bilden: 1 förp")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ändrat" })).toBeInTheDocument();

    // Ångra puts Stugan's rows back, the same ingredient among them: the Hemma photo's "I kylen nu" is unchanged.
    restorePantryRemoval.mockResolvedValueOnce(
      ok({
        restoredIds: [kyl[0].id],
        rows: [
          { id: kyl[0].id, siteId: stugan.id, ingredientId: "10000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa", location: "Kyl", amount: 5, unit: "förp" },
        ] satisfies PantryRow[],
        skipped: 0,
      }),
    );
    await act(async () => fireEvent.click(within(screen.getByTestId("toast")).getByRole("button", { name: "Ångra" })));
    await waitFor(() => expect(restorePantryRemoval).toHaveBeenCalledTimes(1));
    expect(screen.getByText("nu: 2 förp → bilden: 1 förp")).toBeInTheDocument();
    expect(screen.queryByText(/5 förp/)).toBeNull();
    expect(screen.queryByText("Matvarorna i kylen har ändrats sedan bilden togs.")).toBeNull();
  });

  it("closes the sheet when Hemma shows another place, and keeps the question it asked", () => {
    const { rerender } = render(<Hemma initial={items(3)} site={stugan} />);
    fireEvent.click(emptyButton()!);
    expect(within(sheet()).getByText("Ta bort alla 3 varor i kylen för Stugan?")).toBeInTheDocument();
    rerender(<Hemma initial={items(2)} site={stugan} />);
    expect(within(sheet()).getByText("Ta bort alla 3 varor i kylen för Stugan?")).toBeInTheDocument();
    rerender(<Hemma initial={items(2)} site={{ ...hemma, siteCount: 2 }} />);
    expect(screen.queryByRole("dialog", { name: "Töm kylen" })).toBeNull();
    expect(emptyPantryPlace).not.toHaveBeenCalled();
  });
});
