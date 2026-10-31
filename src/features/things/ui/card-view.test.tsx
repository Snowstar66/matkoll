import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { CardView as Card } from "../domain/thing-card";
import { CardView } from "./card-view";

const locateThingOnCard = vi.fn();
vi.mock("../actions/locate-thing", () => ({ locateThingOnCard: (id: string) => locateThingOnCard(id) }));
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }) }));
// The card's buttons have tests of their own; here they only need to be there, in order.
vi.mock("./retake-card", () => ({ RetakeCard: () => <button type="button">Ta om</button> }));
vi.mock("./add-card-things", () => ({ AddCardThings: () => <button type="button">Lägg till föremål</button> }));
vi.mock("./remove-card", () => ({ RemoveCard: () => <button type="button">Ta bort kortet</button> }));

const hammer = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11", name: "Hammare", whereHint: "på väggen, mitten", box: { left: 0.2, top: 0.15, width: 0.14, height: 0.21 }, boxMissed: false };
const saw = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Cirkelsåg", whereHint: "översta hyllan", box: { left: 0.44, top: 0.1, width: 0.12, height: 0.19 }, boxMissed: false };
const drill = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a13", name: "Skruvdragare", whereHint: null, box: null, boxMissed: false };
const lost = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a14", name: "Tång", whereHint: null, box: null, boxMissed: true };

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
  render(<CardView card={card(things, extra)} initialThingId={initialThingId} roomHref="/prylar/rum/s/boden" />);
const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  locateThingOnCard.mockReset();
});

describe("the card big (Story 18.7)", () => {
  it("shows the whole photo with a thin box and the name of every föremål that has one, and the list under it", () => {
    renderIt([hammer, saw, drill]);
    const photo = screen.getByTestId("card-photo");
    expect(within(photo).getByRole("img", { name: "Kort: Boden" })).toHaveAttribute("src", "/api/things/photo/0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01");
    // The photo is never cropped: it is contained in a frame of its own proportions.
    expect(within(photo).getByRole("img")).toHaveClass("object-contain");
    const boxes = within(photo).getAllByTestId("card-box");
    expect(boxes.map((box) => box.textContent)).toEqual(["Hammare", "Cirkelsåg"]);
    expect(boxes[0]).toHaveStyle({ left: "20%", top: "15%", width: "14%" });
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Tryck på ett föremål eller en ruta för att markera det.");
    expect(screen.getAllByTestId("card-thing").map((button) => button.textContent)).toEqual(["Hammarepå väggen, mitten", "Cirkelsågöversta hyllan", "Skruvdragare"]);
    // The card's buttons, Ta bort kortet last.
    expect(screen.getAllByRole("button").slice(-3).map((button) => button.textContent)).toEqual(["Ta om", "Lägg till föremål", "Ta bort kortet"]);
    expect(locateThingOnCard).not.toHaveBeenCalled();
  });

  it("marks a föremål tapped in the list and dims the rest; a second tap clears the mark", async () => {
    renderIt([hammer, saw]);
    await userEvent.click(row("Cirkelsåg"));
    expect(row("Cirkelsåg")).toHaveAttribute("aria-pressed", "true");
    expect(row("Hammare")).toHaveAttribute("aria-pressed", "false");
    const selected = screen.getByTestId("card-box-selected");
    expect(selected).toHaveTextContent("Cirkelsåg");
    // The other box stays, dimmed and without its name.
    const [other] = screen.getAllByTestId("card-box");
    expect(other).toHaveClass("opacity-35");
    expect(other).toHaveTextContent("");
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Cirkelsåg · översta hyllan");
    await userEvent.click(row("Cirkelsåg"));
    expect(screen.queryByTestId("card-box-selected")).toBeNull();
    expect(screen.getAllByTestId("card-box")).toHaveLength(2);
  });

  it("marks the föremål under a tap on the photo", async () => {
    renderIt([hammer, saw]);
    const photo = screen.getByTestId("card-photo");
    photo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    await userEvent.pointer({ keys: "[MouseLeft]", target: photo, coords: { clientX: 0.5 * 400, clientY: 0.2 * 300 } });
    expect(screen.getByTestId("card-box-selected")).toHaveTextContent("Cirkelsåg");
  });

  it("opens with the föremål of a search hit marked, and ignores one that is not on the card", () => {
    renderIt([hammer, saw], hammer.id);
    expect(screen.getByTestId("card-box-selected")).toHaveTextContent("Hammare");
    expect(row("Hammare")).toHaveAttribute("aria-pressed", "true");
    renderIt([hammer, saw], "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a99");
    expect(screen.getAllByTestId("card-box-selected")).toHaveLength(1);
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
    expect(screen.getByTestId("card-box-selected")).toHaveTextContent("Skruvdragare");
    // Unmarked and marked again: no second call.
    await userEvent.click(row("Skruvdragare"));
    await userEvent.click(row("Skruvdragare"));
    expect(locateThingOnCard).toHaveBeenCalledTimes(1);
  });

  it("says it could not point it out when the lookup finds nothing or fails, and asks only once", async () => {
    locateThingOnCard.mockResolvedValueOnce(ok({ box: null }));
    renderIt([drill, saw]);
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Tryck på ett föremål eller en ruta för att markera det.");
    await userEvent.click(row("Skruvdragare"));
    expect(await screen.findByTestId("card-missed")).toHaveTextContent("Kunde inte peka ut den på bilden.");
    expect(screen.queryByTestId("card-box-selected")).toBeNull();
    await userEvent.click(row("Skruvdragare"));
    await userEvent.click(row("Skruvdragare"));
    expect(locateThingOnCard).toHaveBeenCalledTimes(1);

    locateThingOnCard.mockResolvedValueOnce(fail("ai_unavailable"));
    renderIt([{ ...drill, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a15" }], "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a15");
    await waitFor(() => expect(screen.getAllByTestId("card-missed")).toHaveLength(2));
  });

  it("never asks again for a föremål an earlier lookup did not find", async () => {
    renderIt([lost], lost.id);
    expect(screen.getByTestId("card-missed")).toHaveTextContent("Kunde inte peka ut den på bilden.");
    expect(screen.queryByTestId("card-looking")).toBeNull();
    expect(locateThingOnCard).not.toHaveBeenCalled();
  });

  it("says how to look one up on an older card without boxes", () => {
    renderIt([drill]);
    expect(screen.getByTestId("card-hint")).toHaveTextContent("Tryck på ett föremål för att leta upp det på bilden.");
    expect(screen.queryAllByTestId("card-box")).toHaveLength(0);
  });

  it("shows a card that is still read without its list or buttons", () => {
    renderIt([], null, { status: "reading" });
    expect(screen.getAllByText("Kortet läses fortfarande.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Ta om" })).toBeNull();
  });
});
