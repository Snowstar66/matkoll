import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import type { ThingSnapshot } from "../domain/thing-edit";
import type { ThingHit } from "../domain/thing-search";
import { RankedHits } from "./hit-rows";

// Pontus 1 Nov: a search hit opens its föremål's sheet (the count, Visa på
// kortet ›, the name, Ta bort föremålet), and its thumbnail opens the card.

const updateThing = vi.fn();
const removeThing = vi.fn();
const restoreThing = vi.fn();
vi.mock("../actions/thing-item", () => ({
  updateThing: (input: unknown) => updateThing(input),
  removeThing: (id: string) => removeThing(id),
  restoreThing: (snapshot: ThingSnapshot) => restoreThing(snapshot),
}));
const changeThingCount = vi.fn();
const loadThingCount = vi.fn();
vi.mock("../actions/thing-count", () => ({
  changeThingCount: (input: unknown) => changeThingCount(input),
  undoThingChange: vi.fn(),
  loadThingCount: (id: string) => loadThingCount(id),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const id = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";
const photoId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04";
const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const hammer: ThingHit = {
  id,
  name: "Hammare",
  category: "Verktyg",
  whereHint: "på väggen",
  seenOn: 1,
  placeId,
  siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
  siteName: "Hemma",
  room: "Boden",
  roomKey: "boden",
  part: null,
  isBox: false,
  photoId,
  takenAt: "2026-10-12T10:00:00Z",
  written: false,
  noted: false,
  score: 1,
  quantity: null,
};
const snapshot: ThingSnapshot = {
  id,
  photoId,
  placeId,
  name: "Hammare",
  category: "Verktyg",
  whereHint: "på väggen",
  confidence: "high",
  position: 0,
  createdAt: "2026-10-12T10:00:00.000Z",
  sameAs: null,
  source: "photo",
  pointedBy: [],
  box: null,
  boxMissed: false,
  quantity: 2,
  changes: [],
};

beforeEach(() => {
  for (const mock of [updateThing, removeThing, restoreThing, changeThingCount, loadThingCount, refresh]) mock.mockReset();
  loadThingCount.mockImplementation(async (itemId: string) => ok({ itemId, quantity: null, changes: [] }));
});

function hits(...found: ThingHit[]) {
  render(
    <ToastProvider>
      <RankedHits best={found} similar={[]} label="Sökträffar" />
    </ToastProvider>,
  );
}

describe("a search hit's sheet", () => {
  it("opens from the row with the count card, Visa på kortet › to the card, and Ta bort föremålet last", async () => {
    hits(hammer);
    await userEvent.click(screen.getByTestId("thing-hit"));
    const sheet = screen.getByRole("dialog", { name: "Hammare" });
    expect(sheet).toHaveTextContent("Boden · på väggen");
    expect(await within(sheet).findByText("· räknas inte")).toBeInTheDocument();
    const link = within(sheet).getByRole("link", { name: "Visa på kortet" });
    expect(link).toHaveAttribute("href", `/prylar/kort/${photoId}?foremal=${id}`);
    const buttons = within(sheet).getAllByRole("button");
    expect(buttons[buttons.length - 1]).toHaveTextContent("Ta bort föremålet");
    expect(buttons[buttons.length - 1]).toHaveClass("text-danger");
  });

  it("is reached with the keyboard, and the thumbnail is a link of its own to the card", async () => {
    hits(hammer);
    await userEvent.tab();
    expect(screen.getByTestId("thing-hit")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Visa Hammare på kortet" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Hammare" })).toBeInTheDocument();
  });

  it("removes the föremål at once with Tog bort Hammare. and Ångra, which brings the hit back", async () => {
    removeThing.mockResolvedValue(ok(snapshot));
    restoreThing.mockResolvedValue(ok(null));
    hits(hammer);
    await userEvent.click(screen.getByTestId("thing-hit"));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Hammare" })).getByRole("button", { name: "Ta bort föremålet" }));
    expect(removeThing).toHaveBeenCalledWith(id);
    expect((await screen.findAllByText("Tog bort Hammare.")).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByTestId("thing-hit")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreThing).toHaveBeenCalledWith(snapshot));
    expect(await screen.findByTestId("thing-hit")).toHaveTextContent("Hammare");
  });

  it("shows a new name in the row once it is saved", async () => {
    updateThing.mockResolvedValue(ok(null));
    hits(hammer);
    await userEvent.click(screen.getByTestId("thing-hit"));
    const sheet = screen.getByRole("dialog", { name: "Hammare" });
    await userEvent.clear(within(sheet).getByLabelText("Byt namn"));
    await userEvent.type(within(sheet).getByLabelText("Byt namn"), "Snickarhammare");
    await userEvent.click(within(sheet).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.getByTestId("thing-hit")).toHaveTextContent("Snickarhammare"));
  });

  it("says Slut på gravljus. when Ta takes the last ones, and keeps the föremål as Slut", async () => {
    changeThingCount.mockResolvedValue(ok({ changeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a99", quantity: 0 }));
    hits({ ...hammer, name: "Gravljus", quantity: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Ta" }));
    await userEvent.click(screen.getByRole("button", { name: "Ta 1" }));
    expect((await screen.findAllByText("Slut på gravljus.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ångra" })).toBeInTheDocument();
    expect(screen.getByTestId("hit-count")).toHaveTextContent("Slut");
    expect(screen.getByTestId("thing-hit")).toBeInTheDocument();
  });

  it("opens Fyll på at once on the amount bought, and one tap fills up (Story 18.24)", async () => {
    changeThingCount.mockResolvedValue(ok({ changeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a99", quantity: 5 }));
    render(
      <ToastProvider>
        <RankedHits best={[{ ...hammer, name: "Gravljus", quantity: 3 }]} similar={[]} label="Träffar" refill={{ itemId: id, amount: 2 }} />
      </ToastProvider>,
    );
    const confirm = screen.getByRole("button", { name: "Fyll på 2" });
    expect(confirm).toHaveFocus();
    await userEvent.click(confirm);
    expect(changeThingCount).toHaveBeenCalledWith({ itemId: id, delta: 2 });
    expect((await screen.findAllByText("Fyllde på 2 gravljus.")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("hit-count")).toHaveTextContent("5 st");
  });

  it("opens a noted föremål's sheet with Visa i rummet ›, and a thing written into a box opens the box's page", async () => {
    hits({ ...hammer, noted: true, photoId: null, part: "Översta byrålådan" }, { ...hammer, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Skarvsladd", written: true, photoId: null, isBox: true, part: "Black box" });
    const [noted, written] = screen.getAllByTestId("thing-hit");
    expect(written).toHaveAttribute("href", `/prylar/lada/${placeId}`);
    await userEvent.click(noted);
    const sheet = screen.getByRole("dialog", { name: "Hammare" });
    expect(sheet).toHaveTextContent("Du skrev in det 12 okt · Översta byrålådan");
    expect(within(sheet).getByRole("link", { name: "Visa i rummet" })).toHaveAttribute("href", `/prylar/${placeId}`);
  });
});
