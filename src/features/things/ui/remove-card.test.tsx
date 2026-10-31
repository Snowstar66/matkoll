import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastWithUndoDurationMs, ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { CardSnapshot } from "../domain/thing-edit";
import { RemoveCard } from "./remove-card";

const removeThingCard = vi.fn();
const restoreThingCard = vi.fn();
const finishCardRemoval = vi.fn();
vi.mock("../actions/remove-card", () => ({
  removeThingCard: (id: string) => removeThingCard(id),
  restoreThingCard: (snapshot: CardSnapshot) => restoreThingCard(snapshot),
  finishCardRemoval: (path: string) => finishCardRemoval(path),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const cardId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const snapshot: CardSnapshot = {
  id: cardId,
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
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
  things: [],
};

beforeEach(() => {
  for (const mock of [removeThingCard, restoreThingCard, finishCardRemoval, refresh]) mock.mockReset();
  finishCardRemoval.mockResolvedValue(ok(null));
});
afterEach(() => vi.useRealTimers());

function renderIt() {
  render(
    <ToastProvider>
      <RemoveCard cardId={cardId} takenAt={new Date("2026-10-31T10:00:00Z")} />
    </ToastProvider>,
  );
}

async function confirmRemoval() {
  await userEvent.click(screen.getByRole("button", { name: "Ta bort kortet" }));
  const dialog = screen.getByRole("dialog", { name: "Ta bort kortet" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort kortet" }));
}
describe("Ta bort kortet", () => {
  it("asks first and removes nothing before the question is answered", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Ta bort kortet" }));
    expect(screen.getByText("Ta bort kortet?")).toBeInTheDocument();
    expect(screen.getByText(/alla prylar som lästes från det tas bort/)).toBeInTheDocument();
    expect(removeThingCard).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(removeThingCard).not.toHaveBeenCalled();
  });

  it("removes the card, reads the page again and offers Ångra, which puts the same card back", async () => {
    removeThingCard.mockResolvedValue(ok(snapshot));
    restoreThingCard.mockResolvedValue(ok(null));
    renderIt();
    await confirmRemoval();
    expect((await screen.findAllByText("Tog bort kortet från 31 okt.")).length).toBeGreaterThan(0);
    expect(removeThingCard).toHaveBeenCalledWith(cardId);
    expect(refresh).toHaveBeenCalled();
    refresh.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreThingCard).toHaveBeenCalledWith(snapshot));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // The file stays: the card is back.
    expect(finishCardRemoval).not.toHaveBeenCalled();
  });

  it("removes the file when the time for Ångra is out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    removeThingCard.mockResolvedValue(ok(snapshot));
    renderIt();
    await confirmRemoval();
    expect((await screen.findAllByText("Tog bort kortet från 31 okt.")).length).toBeGreaterThan(0);
    expect(finishCardRemoval).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(toastWithUndoDurationMs + 100);
    });
    expect(finishCardRemoval).toHaveBeenCalledWith(snapshot.objectPath);
  });

  it("says why when the card cannot be put back, and lets go of its file", async () => {
    removeThingCard.mockResolvedValue(ok(snapshot));
    restoreThingCard.mockResolvedValue(fail("things_restore_file_gone"));
    renderIt();
    await confirmRemoval();
    expect((await screen.findAllByText("Tog bort kortet från 31 okt.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("fotot är borta"));
    expect(finishCardRemoval).toHaveBeenCalledWith(snapshot.objectPath);
  });

  it("keeps the card and says so when the removal fails", async () => {
    removeThingCard.mockResolvedValue(fail("things_card_remove_failed"));
    renderIt();
    await confirmRemoval();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ta bort kortet."));
    expect(screen.queryByText(/Tog bort kortet från/)).toBeNull();
    expect(finishCardRemoval).not.toHaveBeenCalled();
  });
});
