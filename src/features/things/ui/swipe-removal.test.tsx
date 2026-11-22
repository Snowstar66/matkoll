import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDeleteGrace, startDeleteGrace } from "@/components/confirm-delete";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { CardSnapshot, ThingSnapshot } from "../domain/thing-edit";
import { cardSnapshotSchema } from "../domain/thing-edit";
import { dismissRemovedCard, dismissRemovedThing, undoWindowMs, useRemovedCards, useRemovedThings, RemovedCardRow, RemovedThingRow } from "./removed-things";
import { forradDeleteGraceKey, useSwipeRemoval } from "./swipe-removal";

const removeThing = vi.fn();
const restoreThing = vi.fn();
const removeThingCard = vi.fn();
const restoreThingCard = vi.fn();
const finishCardRemoval = vi.fn();
const refresh = vi.fn();
vi.mock("../actions/thing-item", () => ({ removeThing: (id: string) => removeThing(id), restoreThing: (snapshot: unknown) => restoreThing(snapshot) }));
vi.mock("../actions/remove-card", () => ({
  removeThingCard: (id: string) => removeThingCard(id),
  restoreThingCard: (snapshot: unknown) => restoreThingCard(snapshot),
  finishCardRemoval: (path: string) => finishCardRemoval(path),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const cardId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";
const thingId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";

const starred = {
  id: thingId,
  photoId: cardId,
  placeId,
  name: "Gammal kamera",
  category: "Elektronik",
  whereHint: null,
  confidence: "high",
  position: 0,
  createdAt: "2026-10-31T10:00:00.000Z",
  sameAs: null,
  source: "photo",
  pointedBy: [],
  box: null,
  boxMissed: false,
  worthWhy: "Äldre kameror kan vara samlarobjekt.",
  worthConfidence: "guess",
  worthDetail: "Rekommendation\nJa",
  worthSetByUser: true,
};
const cardSnapshot = {
  id: cardId,
  placeId,
  objectPath: `u/p/${cardId}.jpg`,
  mediaType: "image/jpeg",
  width: 100,
  height: 80,
  takenAt: "2026-10-31T10:00:00.000Z",
  createdAt: "2026-10-31T10:00:00.000Z",
  unseenNote: null,
  status: "done",
  errorCode: null,
  unseenCount: 0,
  userTitle: "Verktygshyllan",
  aiTitle: null,
  summary: null,
  things: [starred],
} as unknown as CardSnapshot;

function Harness() {
  const { removeThingRow, removeCardRow, dialog } = useSwipeRemoval();
  const things = useRemovedThings();
  const cards = useRemovedCards();
  return (
    <>
      <button type="button" onClick={() => removeThingRow({ id: thingId, name: "Gammal kamera" }, "pointer")}>
        ta föremål
      </button>
      <button type="button" onClick={() => removeCardRow({ id: cardId, label: "Verktygshyllan", meta: "31 okt · 2 saker", things: 2, index: 0 }, "pointer")}>
        ta kort
      </button>
      <ul>
        {things.map((thing) => (
          <RemovedThingRow key={thing.id} thing={thing} />
        ))}
      </ul>
      {cards.map((card) => (
        <RemovedCardRow key={card.id} card={card} />
      ))}
      {dialog}
    </>
  );
}

function view() {
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetDeleteGrace();
  for (const mock of [removeThing, restoreThing, removeThingCard, restoreThingCard, finishCardRemoval, refresh]) mock.mockReset();
  removeThing.mockResolvedValue(ok(starred as unknown as ThingSnapshot));
  restoreThing.mockResolvedValue(ok(null));
  removeThingCard.mockResolvedValue(ok(cardSnapshot));
  restoreThingCard.mockResolvedValue(ok(null));
  finishCardRemoval.mockResolvedValue(ok(null));
});

afterEach(() => {
  dismissRemovedThing(thingId);
  dismissRemovedCard(cardId);
  vi.useRealTimers();
});

describe("Ta bort with a swipe in Förråd (UX-E)", () => {
  it("asks the first time, and Avbryt removes nothing", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "ta föremål" }));
    const dialog = screen.getByRole("dialog", { name: "Ta bort föremålet Gammal kamera?" });
    expect(dialog).toHaveTextContent("Du kan ångra strax efteråt.");
    await userEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(removeThing).not.toHaveBeenCalled();
  });

  it("asks the first time, removes after Ta bort, and then everything is removed at once for the 60 s window without asking", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "ta föremål" }));
    await userEvent.click(screen.getByRole("button", { name: /^Ta bort$/ }));
    expect(await screen.findByTestId("thing-removed")).toHaveTextContent("Gammal kamera");
    expect(removeThing).toHaveBeenCalledWith(thingId);

    // Inside the window a card goes at once, too: its row stays with Ångra and no question was asked.
    await userEvent.click(screen.getByRole("button", { name: "ta kort" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByTestId("card-removed")).toHaveTextContent("Verktygshyllan");
    expect(removeThingCard).toHaveBeenCalledWith(cardId);

    // After a pause of more than 60 s the question is back.
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    await userEvent.click(screen.getByRole("button", { name: "ta föremål" }));
    expect(screen.getByRole("dialog", { name: "Ta bort föremålet Gammal kamera?" })).toBeInTheDocument();
  });

  it("has a window of its own: one open for the shopping list does not skip Förråd's question", async () => {
    expect(forradDeleteGraceKey).not.toBe("shopping-list");
    startDeleteGrace("shopping-list");
    view();
    await userEvent.click(screen.getByRole("button", { name: "ta kort" }));
    expect(screen.getByRole("dialog", { name: "Ta bort kortet Verktygshyllan?" })).toHaveTextContent("Kortet och dess 2 saker tas bort.");
    expect(removeThingCard).not.toHaveBeenCalled();
  });

  it("asks nothing when Förråd's own window is open", async () => {
    startDeleteGrace(forradDeleteGraceKey);
    view();
    await userEvent.click(screen.getByRole("button", { name: "ta föremål" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(removeThing).toHaveBeenCalledWith(thingId);
  });

  it("Ångra on a removed card puts back the whole snapshot with its föremål's stars and explanations", async () => {
    startDeleteGrace(forradDeleteGraceKey);
    view();
    await userEvent.click(screen.getByRole("button", { name: "ta kort" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ångra: Verktygshyllan" }));
    expect(screen.queryByTestId("card-removed")).toBeNull();
    expect(restoreThingCard).toHaveBeenCalledTimes(1);
    const restored = restoreThingCard.mock.calls[0]![0] as CardSnapshot;
    expect(restored.userTitle).toBe("Verktygshyllan");
    expect(restored.things[0]).toMatchObject({ worthWhy: "Äldre kameror kan vara samlarobjekt.", worthConfidence: "guess", worthDetail: "Rekommendation\nJa", worthSetByUser: true });
    // The file is not let go of: the card is back.
    expect(finishCardRemoval).not.toHaveBeenCalled();
  });

  it("lets go of the card's photo file only when the time is out without Ångra, and the row then goes", async () => {
    startDeleteGrace(forradDeleteGraceKey);
    view();
    await userEvent.click(screen.getByRole("button", { name: "ta kort" }));
    expect(await screen.findByTestId("card-removed")).toBeInTheDocument();
    expect(finishCardRemoval).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(undoWindowMs + 50);
    });
    expect(screen.queryByTestId("card-removed")).toBeNull();
    expect(finishCardRemoval).toHaveBeenCalledWith(`u/p/${cardId}.jpg`);
  });

  it("says so with a toast and keeps the row out of the list when the removal fails", async () => {
    startDeleteGrace(forradDeleteGraceKey);
    removeThingCard.mockResolvedValue(fail("things_card_remove_failed"));
    view();
    await userEvent.click(screen.getByRole("button", { name: "ta kort" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("card-removed")).toBeNull();
  });
});

describe("a card's snapshot (UX-E)", () => {
  it("keeps the föremål's star, tip and explanation and the card's own words through the server action's check", () => {
    const parsed = cardSnapshotSchema.parse(cardSnapshot);
    expect(parsed.things[0]).toMatchObject({ worthWhy: starred.worthWhy, worthConfidence: "guess", worthDetail: starred.worthDetail, worthSetByUser: true });
    expect(parsed).toMatchObject({ userTitle: "Verktygshyllan", aiTitle: null, summary: null });
  });

  it("still reads a snapshot from before, without stars or words, as having none", () => {
    const { userTitle: _u, aiTitle: _a, summary: _s, ...older } = cardSnapshot as unknown as Record<string, unknown>;
    const parsed = cardSnapshotSchema.parse({ ...older, things: [{ ...starred, worthWhy: undefined, worthConfidence: undefined, worthDetail: undefined, worthSetByUser: undefined }] });
    expect(parsed).toMatchObject({ userTitle: null, aiTitle: null, summary: null });
    expect(parsed.things[0]).toMatchObject({ worthWhy: null, worthConfidence: null, worthDetail: null, worthSetByUser: null });
  });
});
