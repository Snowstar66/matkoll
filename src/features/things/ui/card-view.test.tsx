import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import type { CardView as Card } from "../domain/thing-card";
import { CardView } from "./card-view";

const locateThingOnCard = vi.fn();
vi.mock("./locate-client", () => ({ lookUpBox: (id: string) => locateThingOnCard(id) }));
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }) }));
// Pontus 1 Nov: the föremål's sheet opens from its row; its actions have tests of their own (card-things, thing-sheet).
vi.mock("../actions/thing-item", () => ({ updateThing: vi.fn(), removeThing: vi.fn(), restoreThing: vi.fn() }));
vi.mock("../actions/thing-detail", () => ({ loadThingDetail: async () => ({ ok: false, error: { code: "things_unavailable", message: "x" } }) }));
vi.mock("../actions/thing-count", () => ({
  loadThingCount: async (itemId: string) => ({ ok: true, data: { itemId, quantity: 4, changes: [] } }),
}));
// The card's buttons have tests of their own; here they only need to be there, in order.

const tool = { category: "Verktyg", confidence: "high" } as const;
const hammer = { ...tool, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11", name: "Hammare", whereHint: "på väggen, mitten", box: { left: 0.2, top: 0.15, width: 0.14, height: 0.21 }, boxMissed: false };
const saw = { ...tool, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Cirkelsåg", whereHint: "översta hyllan", box: { left: 0.44, top: 0.1, width: 0.12, height: 0.19 }, boxMissed: false };
const drill = { ...tool, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a13", name: "Skruvdragare", whereHint: null, box: null, boxMissed: false };
const lost = { ...tool, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a14", name: "Tång", whereHint: null, box: null, boxMissed: true };

const card = (things: Card["things"], extra: Partial<Card> = {}): Card => ({
  id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
  siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
  room: "Boden",
  roomKey: "boden",
  part: null,
  kind: "part",
  status: "done",
  takenAt: "2026-10-30T10:00:00Z",
  width: 1200,
  height: 900,
  things,
  ...extra,
});

const renderIt = (things: Card["things"], initialThingId: string | null = null, extra: Partial<Card> = {}) =>
  render(
    <ToastProvider>
      <CardView card={card(things, extra)} initialThingId={initialThingId} />
    </ToastProvider>,
  );
const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  window.localStorage.clear();
  locateThingOnCard.mockReset();
  // A lookup that finds nothing, unless a test says otherwise.
  locateThingOnCard.mockResolvedValue(ok({ box: null }));
});

describe("the card big (Story 18.7)", () => {
  it("moves the mark to the föremål of a new ?foremal when the same card is opened again from another föremål's sheet", () => {
    const view = (initial: string | null) => (
      <ToastProvider>
        <CardView card={card([hammer, saw, drill])} initialThingId={initial} />
      </ToastProvider>
    );
    const { rerender } = render(view(hammer.id));
    expect(screen.getByTestId("card-dot-selected")).toHaveTextContent("1");
    // Client navigation to the same page with another ?foremal keeps the component mounted.
    rerender(view(saw.id));
    expect(screen.getByTestId("card-dot-selected")).toHaveTextContent("2");
    expect(screen.getAllByTestId("card-thing")[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the dots with Dölj siffror (the marked föremål keeps its dot) and shows them again with Visa siffror", async () => {
    window.localStorage.removeItem("livskoll:photo-numbers-hidden");
    renderIt([hammer, saw], hammer.id);
    expect(document.querySelectorAll("[data-number]")).toHaveLength(2);
    await userEvent.click(screen.getByTestId("photo-numbers-toggle"));
    expect(screen.getByTestId("photo-numbers-toggle")).toHaveTextContent("Visa siffror");
    // Only the marked föremål's dot is left; the list keeps its numbers.
    expect(document.querySelectorAll("[data-number]")).toHaveLength(1);
    expect(screen.getByTestId("card-dot-selected")).toHaveTextContent("1");
    await userEvent.click(screen.getByTestId("photo-numbers-toggle"));
    expect(document.querySelectorAll("[data-number]")).toHaveLength(2);
    window.localStorage.removeItem("livskoll:photo-numbers-hidden");
  });

  it("shows the whole photo with a numbered dot at the middle of every föremål that has a box, and the list under it, with the same numbers", () => {
    // The föremål without a box is being looked up by itself.
    locateThingOnCard.mockReturnValue(new Promise(() => {}));
    renderIt([hammer, saw, drill]);
    const photo = screen.getByTestId("card-photo");
    expect(within(photo).getByRole("img", { name: "Kort: Boden" })).toHaveAttribute("src", "/api/things/photo/0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01");
    // The photo is never cropped: it is contained in a frame of its own proportions.
    expect(within(photo).getByRole("img")).toHaveClass("object-contain");
    const dots = within(photo).getAllByTestId("card-dot");
    expect(dots.map((dot) => dot.textContent)).toEqual(["1", "2"]);
    expect(dots[0].style.left).toContain("27%");
    expect(dots[0].style.top).toContain("25.5%");
    // The unmarked föremål have no name chip on the photo; the list has the same numbers.
    expect(within(photo).queryByTestId("card-dot-name")).toBeNull();
    expect(screen.getAllByTestId("marker-badge").map((badge) => badge.textContent)).toEqual(["1", "2"]);
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Letar efter fler placeringar …");
    expect(screen.getAllByTestId("card-thing").map((button) => button.textContent)).toEqual(["1Hammarepå väggen, mitten", "2Cirkelsågöversta hyllan", "Skruvdragare"]);
    // The card's actions are in the ⋯ of its header (card-menu.tsx), no buttons under the list.
    expect(screen.queryByRole("button", { name: "Ta om" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ta bort kortet" })).toBeNull();
    expect(locateThingOnCard).toHaveBeenCalledTimes(1);
    expect(locateThingOnCard).toHaveBeenCalledWith(drill.id);
  });

  it("marks a föremål tapped in the list and dims the rest; a second tap clears the mark", async () => {
    renderIt([hammer, saw]);
    await userEvent.click(row("Cirkelsåg"));
    expect(row("Cirkelsåg")).toHaveAttribute("aria-pressed", "true");
    expect(row("Hammare")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("card-dot-selected")).toHaveTextContent("2");
    expect(screen.getByTestId("card-dot-name")).toHaveTextContent("Cirkelsåg");
    expect(screen.getByTestId("card-spotlight")).toBeInTheDocument();
    // The other dot stays, dimmed and without a name.
    const [other] = screen.getAllByTestId("card-dot");
    expect(other.firstElementChild).toHaveClass("opacity-35");
    expect(other).toHaveTextContent("1");
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Cirkelsåg · översta hyllan");
    await userEvent.click(row("Cirkelsåg"));
    expect(screen.queryByTestId("card-dot-selected")).toBeNull();
    expect(screen.queryByTestId("card-spotlight")).toBeNull();
    expect(screen.getAllByTestId("card-dot")).toHaveLength(2);
  });

  it("opens the föremål's sheet from the › at the end of its row, with its count and Ta bort föremålet, and no Visa på kortet", async () => {
    renderIt([hammer, saw]);
    const open = screen.getByRole("button", { name: "Öppna Cirkelsåg" });
    expect(open).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(open);
    const dialog = screen.getByRole("dialog", { name: "Föremål" });
    expect(await within(dialog).findByTestId("count-number")).toHaveTextContent("4st");
    expect(within(dialog).getByRole("button", { name: "Ta bort föremålet" })).toBeInTheDocument();
    expect(within(dialog).queryByTestId("thing-sheet-link")).not.toBeInTheDocument();
    // Opening is not marking.
    expect(row("Cirkelsåg")).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the photo view zoomed in on the föremål whose dot is nearest to a tap on the photo, and nothing when the tap is far from every dot", async () => {
    renderIt([hammer, saw]);
    const photo = screen.getByTestId("card-photo");
    photo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    await userEvent.pointer({ keys: "[MouseLeft]", target: photo, coords: { clientX: 0.9 * 400, clientY: 0.9 * 300 } });
    expect(screen.queryByTestId("photo-viewer")).toBeNull();
    await userEvent.pointer({ keys: "[MouseLeft]", target: photo, coords: { clientX: 0.52 * 400, clientY: 0.2 * 300 } });
    const viewer = await screen.findByTestId("photo-viewer");
    expect(viewer).toHaveAttribute("data-zoomed", "true");
    expect(within(viewer).getByTestId("photo-viewer-name")).toHaveTextContent("Cirkelsåg");
    // Closing the view leaves the föremål marked on the card page.
    await userEvent.click(screen.getByRole("button", { name: "Klar" }));
    expect(await screen.findByTestId("card-dot-selected")).toHaveTextContent("2");
  });

  it("opens with the föremål of a search hit marked, and ignores one that is not on the card", () => {
    renderIt([hammer, saw], hammer.id);
    expect(screen.getByTestId("card-dot-name")).toHaveTextContent("Hammare");
    expect(row("Hammare")).toHaveAttribute("aria-pressed", "true");
    renderIt([hammer, saw], "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a99");
    expect(screen.getAllByTestId("card-dot-selected")).toHaveLength(1);
  });

  it("looks a föremål without a box up once, with Letar … over the photo, and shows the box it finds", async () => {
    let answer: (value: unknown) => void = () => {};
    locateThingOnCard.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderIt([drill], drill.id);
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Skruvdragare");
    expect(await screen.findByTestId("card-looking")).toHaveTextContent("Letar …");
    expect(locateThingOnCard).toHaveBeenCalledWith(drill.id);
    await act(async () => answer(ok({ box: { left: 0.6, top: 0.15, width: 0.1, height: 0.14 } })));
    expect(screen.queryByTestId("card-looking")).toBeNull();
    expect(screen.getByTestId("card-dot-name")).toHaveTextContent("Skruvdragare");
    // Unmarked and marked again: no second call.
    await userEvent.click(row("Skruvdragare"));
    await userEvent.click(row("Skruvdragare"));
    expect(locateThingOnCard).toHaveBeenCalledTimes(1);
  });

  it("says it could not point it out when the lookup finds nothing or fails, and asks only once", async () => {
    locateThingOnCard.mockResolvedValueOnce(ok({ box: null }));
    renderIt([drill, saw]);
    await waitFor(() => expect(screen.getByTestId("card-hint")).toHaveTextContent("Tryck på ett föremål för att markera det, eller på en siffra på fotot för att zooma in."));
    await userEvent.click(row("Skruvdragare"));
    expect(await screen.findByTestId("card-missed")).toHaveTextContent("Kunde inte peka ut den på bilden.");
    expect(screen.queryByTestId("card-dot-selected")).toBeNull();
    await userEvent.click(row("Skruvdragare"));
    await userEvent.click(row("Skruvdragare"));
    expect(locateThingOnCard).toHaveBeenCalledTimes(1);

    locateThingOnCard.mockResolvedValueOnce(fail("ai_unavailable"));
    renderIt([{ ...drill, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a15" }], "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a15");
    await waitFor(() => expect(screen.getAllByTestId("card-missed")).toHaveLength(2));
  });

  it("looks up every föremål without a box by itself, one at a time, and numbers them as the boxes come", async () => {
    const second = { ...drill, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a16", name: "Hammarborr" };
    const answers: ((value: unknown) => void)[] = [];
    locateThingOnCard.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    renderIt([hammer, drill, second]);
    expect(await screen.findByTestId("card-hint")).toHaveTextContent("Letar efter fler placeringar …");
    // The second one waits for the first.
    expect(locateThingOnCard).toHaveBeenCalledTimes(1);
    expect(locateThingOnCard).toHaveBeenLastCalledWith(drill.id);
    await act(async () => answers[0](ok({ box: { left: 0.6, top: 0.15, width: 0.1, height: 0.14 } })));
    await waitFor(() => expect(locateThingOnCard).toHaveBeenCalledTimes(2));
    expect(locateThingOnCard).toHaveBeenLastCalledWith(second.id);
    await act(async () => answers[1](ok({ box: { left: 0.1, top: 0.6, width: 0.1, height: 0.14 } })));
    await waitFor(() => expect(screen.getAllByTestId("card-dot")).toHaveLength(3));
    expect(screen.getAllByTestId("marker-badge").map((badge) => badge.textContent)).toEqual(["1", "2", "3"]);
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Tryck på ett föremål för att markera det, eller på en siffra på fotot för att zooma in.");
    expect(locateThingOnCard).toHaveBeenCalledTimes(2);
  });

  it("looks the marked föremål up first, and at most twelve by themselves on one visit", async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...drill, id: `0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f7a${String(i).padStart(2, "0")}`, name: `Sak ${i}` }));
    renderIt(many, many[14].id);
    await waitFor(() => expect(locateThingOnCard).toHaveBeenCalledTimes(12));
    expect(locateThingOnCard.mock.calls[0][0]).toBe(many[14].id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(locateThingOnCard).toHaveBeenCalledTimes(12);
    // A föremål marked later is still looked up.
    await userEvent.click(row("Sak 13"));
    await waitFor(() => expect(locateThingOnCard).toHaveBeenCalledTimes(13));
    expect(locateThingOnCard).toHaveBeenLastCalledWith(many[13].id);
  });

  it("never asks again for a föremål an earlier lookup did not find", async () => {
    renderIt([lost], lost.id);
    expect(screen.getByTestId("card-missed")).toHaveTextContent("Kunde inte peka ut den på bilden.");
    expect(screen.queryByTestId("card-looking")).toBeNull();
    expect(locateThingOnCard).not.toHaveBeenCalled();
  });

  it("says how to look one up on an older card without boxes, once the lookups found none", async () => {
    renderIt([drill]);
    await waitFor(() => expect(screen.getByTestId("card-hint")).toHaveTextContent("Tryck på ett föremål för att leta upp det på bilden."));
    expect(screen.queryAllByTestId("card-dot")).toHaveLength(0);
  });

  it("shows a card that is still read without its list or buttons", () => {
    renderIt([], null, { status: "reading" });
    expect(screen.getAllByText("Kortet läses fortfarande.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Ta om" })).toBeNull();
  });

  it("puts a star on the number of a föremål with a tip on the photo and the pill on its row, only with Värdetips on", () => {
    const starred = { ...hammer, worth: { why: "Ser ut som en gammal Fiskars.", confidence: "guess" as const } };
    const { unmount } = renderIt([starred, saw]);
    expect(screen.queryByTestId("photo-star")).toBeNull();
    expect(screen.queryByTestId("worth-marker")).toBeNull();
    unmount();
    saveOption("worthLook", true);
    renderIt([starred, saw]);
    const dots = screen.getAllByTestId("card-dot");
    expect(within(dots[0]).getByTestId("photo-star")).toHaveAttribute("aria-hidden", "true");
    expect(within(dots[1]).queryByTestId("photo-star")).toBeNull();
    expect(within(row("Hammare")).getByTestId("worth-marker")).toHaveTextContent("Kan ha värde, gissning");
  });
});
