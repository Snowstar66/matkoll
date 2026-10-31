import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { ThingHit } from "../domain/thing-search";
import { ThingFinder } from "./thing-finder";

const searchThingsAction = vi.fn();
vi.mock("../actions/search-things", () => ({ searchThingsAction: (query: string) => searchThingsAction(query) }));
vi.mock("../actions/ask-chat", () => ({ askChat: vi.fn() }));

const hit: ThingHit = {
  id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11",
  name: "Hammare",
  category: "Verktyg",
  whereHint: "väggen",
  seenOn: 1,
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
  siteName: "Hemma",
  room: "Skräpförrådet",
  roomKey: "skräpförrådet",
  part: null,
  isBox: false,
  photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04",
  takenAt: "2026-10-31T10:00:00Z",
  written: false,
  score: 1,
};

beforeEach(() => searchThingsAction.mockReset());

function renderIt() {
  render(
    <ThingFinder>
      <p>Rummen</p>
    </ThingFinder>,
  );
}
const field = () => screen.getByRole("searchbox", { name: "Sök bland prylar" });

describe("the chat and the search", () => {
  it("has the chat above the rooms and asks the database for nothing until something is typed", () => {
    renderIt();
    expect(screen.getByTestId("chat")).toBeInTheDocument();
    expect(searchThingsAction).not.toHaveBeenCalled();
  });

  it("shows what the database finds as a line with place, boende and date, instead of the chat and the rooms", async () => {
    searchThingsAction.mockResolvedValue(ok({ hits: [hit, { ...hit, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Hammarbor", part: "Black box", isBox: true, photoId: null, written: true, whereHint: null }] }));
    renderIt();
    await userEvent.type(field(), "hamm");
    const hits = await screen.findAllByTestId("thing-hit");
    expect(hits).toHaveLength(2);
    expect(hits[0]).toHaveTextContent("Hammare Skräpförrådet, väggen · Hemma · 31 okt");
    expect(hits[0]).toHaveAttribute("href", `/prylar/${hit.placeId}`);
    // A thing written into a box says so and opens the box's page.
    expect(hits[1]).toHaveTextContent("Hammarbor Skräpförrådet, i Black box · Hemma · skrivet 31 okt");
    expect(hits[1]).toHaveAttribute("href", `/prylar/lada/${hit.placeId}`);
    expect(screen.getByText("Rummen").parentElement).toHaveClass("hidden");
    expect(screen.getByTestId("chat").parentElement).toHaveClass("hidden");
    // The last text asked for is the one shown (a typo is the database's business).
    await waitFor(() => expect(searchThingsAction).toHaveBeenLastCalledWith("hamm"));
  });

  it("says when nothing matches, and when the search fails, and brings the rooms back when cleared", async () => {
    searchThingsAction.mockResolvedValue(ok({ hits: [] }));
    renderIt();
    await userEvent.type(field(), "xyz");
    expect(await screen.findByText('Inga prylar matchar "xyz".')).toBeInTheDocument();
    searchThingsAction.mockResolvedValue(fail("things_unavailable"));
    await userEvent.type(field(), "q");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sökningen gick inte");
    await userEvent.clear(field());
    expect(screen.getByText("Rummen").parentElement).not.toHaveClass("hidden");
    expect(screen.queryByTestId("thing-hits")).not.toBeInTheDocument();
  });
});
