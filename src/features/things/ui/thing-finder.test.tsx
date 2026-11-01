import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { ThingHit } from "../domain/thing-search";
import { ThingFinder } from "./thing-finder";

const searchThingsAction = vi.fn();
vi.mock("../actions/search-things", () => ({ searchThingsAction: (query: string) => searchThingsAction(query) }));
const askChat = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions/ask-chat", () => ({ askChat: (input: unknown) => askChat(input) }));

const hit: ThingHit = {
  quantity: null,
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
  noted: false,
  score: 1,
};

beforeEach(() => {
  searchThingsAction.mockReset();
  askChat.mockReset();
});

function renderIt() {
  render(
    <ThingFinder>
      <p>Rummen</p>
    </ThingFinder>,
  );
}
const field = () => screen.getByRole("textbox", { name: "Sök eller fråga" });

describe("the one field to search and ask", () => {
  it("has one field above the rooms with a hint, and asks the database for nothing until two characters are typed", async () => {
    searchThingsAction.mockResolvedValue(ok({ hits: [] }));
    renderIt();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText("Skriv för att söka – tryck ↑ för att fråga eller spara var något ligger")).toBeInTheDocument();
    expect(searchThingsAction).not.toHaveBeenCalled();
    await userEvent.type(field(), "h");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchThingsAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId("thing-hits")).not.toBeInTheDocument();
    expect(screen.getByText("Rummen").parentElement).not.toHaveClass("hidden");
  });

  it("sends the text to the chat on Enter and hides the matches while the conversation goes on", async () => {
    searchThingsAction.mockResolvedValue(ok({ hits: [hit] }));
    askChat.mockResolvedValue(ok({ answer: "Ja, i Skräpförrådet.", refs: [] }));
    renderIt();
    await userEvent.type(field(), "hamm");
    expect(await screen.findByTestId("thing-hits")).toBeInTheDocument();
    await userEvent.type(field(), "{Enter}");
    expect(await screen.findByText("Ja, i Skräpförrådet.")).toBeInTheDocument();
    expect(askChat).toHaveBeenCalledWith({ question: "hamm", history: [] });
    expect(screen.queryByTestId("thing-hits")).not.toBeInTheDocument();
    // Typing in a follow-up shows no matches either; "Ny fråga" brings the search back.
    searchThingsAction.mockClear();
    await userEvent.type(field(), "tång");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByTestId("thing-hits")).not.toBeInTheDocument();
    expect(searchThingsAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Ny fråga" }));
    await userEvent.type(field(), "hammare");
    expect(await screen.findByTestId("thing-hits")).toBeInTheDocument();
  });

  it("shows what the database finds as a line with place, boende and date, instead of the chat and the rooms", async () => {
    searchThingsAction.mockResolvedValue(ok({ hits: [hit, { ...hit, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Hammarbor", part: "Black box", isBox: true, photoId: null, written: true, whereHint: null }] }));
    renderIt();
    await userEvent.type(field(), "hamm");
    const hits = await screen.findAllByTestId("thing-hit");
    expect(hits).toHaveLength(2);
    // Story 18.19: the name, then room · part or box, then the card's thumbnail at the right.
    expect(hits[0]).toHaveTextContent("Hammare Skräpförrådet · väggen");
    expect(within(hits[0].closest("li") as HTMLElement).getByTestId("hit-thumbnail")).toHaveAttribute("src", `/api/things/photo/${hit.photoId}`);
    // Story 18.7: the card opens big with the thing marked.
    expect(hits[0]).toHaveAttribute("href", `/prylar/kort/${hit.photoId}?foremal=${hit.id}`);
    // A thing written into a box says so and opens the box's page.
    expect(hits[1]).toHaveTextContent("Hammarbor Skräpförrådet · i Black box · skrivet 31 okt");
    expect(hits[1].closest("li")?.querySelector("img")).toBeNull();
    expect(hits[1]).toHaveAttribute("href", `/prylar/lada/${hit.placeId}`);
    expect(within(hits[1].closest("li") as HTMLElement).queryByTestId("hit-thumbnail")).toBeNull();
    expect(screen.getByText("Rummen").parentElement).toHaveClass("hidden");
    // The last text asked for is the one shown (a typo is the database's business).
    await waitFor(() => expect(searchThingsAction).toHaveBeenLastCalledWith("hamm"));
  });

  it("shows the hits that hold the text first, and the close ones folded in as Liknande, or alone when nothing holds it (Story 18.19)", async () => {
    const close = { ...hit, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a13", name: "Fun Light läsk", category: "Hushåll" as const };
    searchThingsAction.mockResolvedValue(ok({ hits: [close, { ...hit, name: "Coca-Cola" }] }));
    renderIt();
    await userEvent.type(field(), "coca cola");
    await waitFor(() => expect(screen.getAllByTestId("thing-hit")).toHaveLength(1));
    expect(screen.getByTestId("thing-hit")).toHaveTextContent("Coca-Cola");
    await userEvent.click(screen.getByRole("button", { name: "Visa 1 liknande" }));
    expect(within(screen.getByTestId("similar-hits")).getByText("Liknande")).toBeInTheDocument();
    expect(within(screen.getByTestId("similar-hits")).getByTestId("thing-hit")).toHaveTextContent("Fun Light läsk");
    searchThingsAction.mockResolvedValue(ok({ hits: [close] }));
    await userEvent.type(field(), "x");
    await waitFor(() => expect(screen.queryByRole("button", { name: /liknande/ })).not.toBeInTheDocument());
    expect(within(await screen.findByTestId("similar-hits")).getByTestId("thing-hit")).toHaveTextContent("Fun Light läsk");
  });

  it("says when nothing matches, and when the search fails, and brings the rooms back when cleared", async () => {
    searchThingsAction.mockResolvedValue(ok({ hits: [] }));
    renderIt();
    await userEvent.type(field(), "xyz");
    expect(await screen.findByText("Inget matchar ”xyz”.")).toBeInTheDocument();
    // Story 18.19: what ↑ does with a text that finds nothing.
    expect(screen.getByText("Tryck ↑ för att fråga, eller för att spara var det ligger.")).toBeInTheDocument();
    searchThingsAction.mockResolvedValue(fail("things_unavailable"));
    await userEvent.type(field(), "q");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sökningen gick inte");
    await userEvent.clear(field());
    expect(screen.getByText("Rummen").parentElement).not.toHaveClass("hidden");
    expect(screen.queryByTestId("thing-hits")).not.toBeInTheDocument();
  });
});
