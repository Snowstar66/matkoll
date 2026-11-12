import { act, fireEvent, render as renderElement, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import { toStarterItems, type StarterListRow } from "../domain/starter-recipe";
import { StarterPicker } from "./starter-picker";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const copyStarterRecipe = vi.fn<(itemId: string) => Promise<Result<{ id: string; added: boolean }>>>();
const removeStarterCopies = vi.fn<(ids?: readonly string[]) => Promise<Result<{ removed: string[] }>>>();
const readStarterPreview = vi.fn();
vi.mock("../actions/starter-recipes", () => ({
  copyStarterRecipe: (itemId: string) => copyStarterRecipe(itemId),
  removeStarterCopies: (ids?: readonly string[]) => removeStarterCopies(ids),
  readStarterPreview: (itemId: string) => readStarterPreview(itemId),
  refreshAfterStarterCopies: () => Promise.resolve(),
}));

const render = (element: ReactElement) => renderElement(<ToastProvider>{element}</ToastProvider>);

const row = (itemId: string, title: string, extra: Partial<StarterListRow> = {}): StarterListRow => ({
  itemId,
  title,
  servings: 4,
  totalMinutes: 40,
  imageUrl: null,
  hasImage: false,
  note: null,
  lineTexts: ["500 g köttfärs"],
  copyId: null,
  ...extra,
});

const items = toStarterItems([row("a", "Köttbullar"), row("b", "Pytt i panna"), row("c", "Tacopaj", { copyId: "copy-c" })]);
const room = { count: 3, cap: 400 };

beforeEach(() => {
  localStorage.clear();
  saveOption("starterRecipes", true);
  copyStarterRecipe.mockReset();
  removeStarterCopies.mockReset();
  readStarterPreview.mockReset().mockResolvedValue(fail("recipe_starter_unavailable"));
  refresh.mockReset();
});

afterEach(() => vi.useRealTimers());

const cards = () => screen.getAllByTestId("starter-card");
const circle = (title: string) => screen.getByRole("checkbox", { name: `Välj ${title}` });

describe("StarterPicker", () => {
  it("starts with nothing chosen and a grey button, and shows what is there already as Finns redan", () => {
    render(<StarterPicker items={items} room={room} untouchedCopies={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Startrecept" })).toBeTruthy();
    expect(screen.getByText("1 finns redan i er lista.")).toBeTruthy();
    expect(screen.getByTestId("starter-count").textContent).toBe("Inget valt");
    const add = screen.getByTestId("starter-add") as HTMLButtonElement;
    expect(add.textContent).toBe("Välj minst ett recept");
    expect(add.disabled).toBe(true);
    expect(screen.getByText("Tryck på ett recept för att välja det.")).toBeTruthy();
    expect(cards()).toHaveLength(3);
    expect(within(cards()[2]!).getByText("Finns redan")).toBeTruthy();
    expect((circle("Tacopaj") as HTMLButtonElement).disabled).toBe(true);
  });

  it("chooses with the circle and Välj alla, and Rensa empties the choice", () => {
    render(<StarterPicker items={items} room={room} untouchedCopies={0} />);
    fireEvent.click(circle("Köttbullar"));
    expect(screen.getByTestId("starter-count").textContent).toBe("1 valt");
    expect(screen.getByTestId("starter-add").textContent).toBe("Lägg till 1 recept");
    fireEvent.click(screen.getByRole("button", { name: "Välj alla 2" }));
    expect(screen.getByTestId("starter-count").textContent).toBe("2 valda");
    fireEvent.click(screen.getByRole("button", { name: "Rensa" }));
    expect(screen.getByTestId("starter-count").textContent).toBe("Inget valt");
  });

  it("stops at the room left, says how many fit, and dims the rest", () => {
    render(<StarterPicker items={items} room={{ count: 399, cap: 400 }} untouchedCopies={0} />);
    expect(screen.getByTestId("starter-room").textContent).toContain("Ni har 399, så 1 får plats.");
    fireEvent.click(circle("Köttbullar"));
    expect(screen.getByTestId("starter-count").textContent).toBe("1 av 1 valt");
    expect((circle("Pytt i panna") as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds the chosen ones one at a time and ends on Klart, with a bin and Ångra per recipe", async () => {
    copyStarterRecipe.mockImplementation(async (id) => ok({ id: `copy-${id}`, added: true }));
    removeStarterCopies.mockResolvedValue(ok({ removed: ["copy-a"] }));
    render(<StarterPicker items={items} room={room} untouchedCopies={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Välj alla 2" }));
    await act(async () => fireEvent.click(screen.getByTestId("starter-add")));
    expect(copyStarterRecipe.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    expect(screen.getByRole("heading", { level: 1, name: "2 recept tillagda" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Visa i Recept" }).getAttribute("href")).toBe("/recept");
    // Nothing is left to choose: no "Välj fler startrecept".
    expect(screen.queryByRole("button", { name: "Välj fler startrecept" })).toBeNull();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Köttbullar" }));
    expect(screen.getByRole("heading", { level: 1, name: "1 recept tillagt" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ångra" }));
    expect(screen.getByRole("heading", { level: 1, name: "2 recept tillagda" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Köttbullar" }));
    await act(async () => vi.advanceTimersByTime(6500));
    expect(removeStarterCopies).toHaveBeenCalledWith(["copy-a"]);
  });

  it("says the connection broke, keeps what was added and goes on with the rest", async () => {
    copyStarterRecipe.mockResolvedValueOnce(ok({ id: "copy-a", added: true })).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<StarterPicker items={items} room={room} untouchedCopies={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Välj alla 2" }));
    await act(async () => fireEvent.click(screen.getByTestId("starter-add")));
    expect(screen.getByRole("heading", { level: 1, name: "Anslutningen bröts" })).toBeTruthy();
    expect(screen.getByText("1 av 2 recept hann läggas till. De ligger kvar i er lista.")).toBeTruthy();
    copyStarterRecipe.mockResolvedValueOnce(ok({ id: "copy-b", added: true }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fortsätt med det sista" })));
    expect(copyStarterRecipe.mock.calls.map(([id]) => id)).toEqual(["a", "b", "b"]);
    expect(screen.getByRole("heading", { level: 1, name: "2 recept tillagda" })).toBeTruthy();
  });

  it("stops when the list becomes full, and says so on Klart", async () => {
    copyStarterRecipe.mockResolvedValueOnce(ok({ id: "copy-a", added: true })).mockResolvedValueOnce(fail("recipe_starter_cap"));
    render(<StarterPicker items={items} room={room} untouchedCopies={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Välj alla 2" }));
    await act(async () => fireEvent.click(screen.getByTestId("starter-add")));
    expect(screen.getByRole("heading", { level: 1, name: "1 recept tillagt" })).toBeTruthy();
    expect(screen.getByText("Receptlistan blev full, så resten lades inte till.")).toBeTruthy();
  });

  it("has a stop for each case before anything is chosen", () => {
    const { unmount } = render(<StarterPicker items={null} room={room} untouchedCopies={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Kunde inte hämta recepten" })).toBeTruthy();
    unmount();
    const all = toStarterItems([row("a", "Köttbullar", { copyId: "x" })]);
    const second = render(<StarterPicker items={all} room={room} untouchedCopies={1} />);
    expect(screen.getByRole("heading", { level: 1, name: "Ni har redan alla startrecept" })).toBeTruthy();
    expect(screen.getByTestId("starter-remove-copies").textContent).toBe("Ta bort 1 orörda startrecept");
    second.unmount();
    const third = render(<StarterPicker items={items} room={{ count: 400, cap: 400 }} untouchedCopies={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Receptlistan är full" })).toBeTruthy();
    third.unmount();
    const fourth = render(<StarterPicker items={[]} room={room} untouchedCopies={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Inga startrecept än" })).toBeTruthy();
    fourth.unmount();
    saveOption("starterRecipes", false);
    render(<StarterPicker items={items} room={room} untouchedCopies={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Startrecept är avstängt" })).toBeTruthy();
  });

  it("copies nothing in the owner's preview, also with the switch off", async () => {
    saveOption("starterRecipes", false);
    render(<StarterPicker items={toStarterItems([row("a", "Köttbullar")])} room={{ count: 0, cap: 400 }} untouchedCopies={0} preview />);
    expect(screen.getByText(/Förhandsvisning: så ser ett nytt hushåll startrecepten/)).toBeTruthy();
    fireEvent.click(circle("Köttbullar"));
    await act(async () => fireEvent.click(screen.getByTestId("starter-add")));
    expect(copyStarterRecipe).not.toHaveBeenCalled();
    expect(screen.getAllByText("Förhandsvisning: inget kopieras.").length).toBeGreaterThan(0);
  });
});
