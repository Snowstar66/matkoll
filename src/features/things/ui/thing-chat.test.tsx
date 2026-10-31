import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { ChatAnswer } from "../actions/ask-chat";
import type { ChatTurn } from "../domain/thing-ask";
import type { RememberInput, Remembered } from "../domain/thing-noted";
import { ThingChat } from "./thing-chat";

const askChat = vi.fn<(input: { question: string; history: ChatTurn[]; siteId?: string }) => Promise<Result<ChatAnswer>>>();
vi.mock("../actions/ask-chat", () => ({ askChat: (input: { question: string; history: ChatTurn[] }) => askChat(input) }));
const rememberThing = vi.fn<(input: RememberInput) => Promise<Result<Remembered>>>();
vi.mock("../actions/remember-thing", () => ({ rememberThing: (input: RememberInput) => rememberThing(input) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const photoId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04";
const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";

beforeEach(() => {
  askChat.mockReset();
  rememberThing.mockReset();
  refresh.mockReset();
});

async function ask(text: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Sök eller fråga" }), `${text}{Enter}`);
}

describe("the chat", () => {
  it("has the field Sök eller fråga …, the hint while it is empty and a send button", () => {
    render(<ThingChat />);
    expect(screen.getByPlaceholderText("Sök eller fråga …")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skicka" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ny fråga" })).not.toBeInTheDocument();
    expect(screen.getByText("Skriv för att söka – tryck ↑ för att fråga eller spara var något ligger")).toBeInTheDocument();
  });

  it("shows the question, then the answer with a card to tap: place, date and the card's thumbnail", async () => {
    askChat.mockResolvedValue(
      ok({ answer: "Ja – på väggen i Skräpförrådet.", refs: [{ href: `/prylar/${placeId}`, photoId, title: "Skräpförrådet · Väggen", sub: "Kort från 31 okt" }] }),
    );
    render(<ThingChat />);
    await ask("Har du sett min skiftnyckel?");
    expect(screen.getByTestId("chat-question")).toHaveTextContent("Har du sett min skiftnyckel?");
    expect(await screen.findByText("Ja – på väggen i Skräpförrådet.")).toBeInTheDocument();
    const ref = screen.getByTestId("chat-ref");
    expect(ref).toHaveAttribute("href", `/prylar/${placeId}`);
    expect(ref).toHaveTextContent("Skräpförrådet · Väggen");
    expect(ref).toHaveTextContent("Kort från 31 okt");
    expect(within(ref).getByRole("presentation", { hidden: true })).toHaveAttribute("src", `/api/things/photo/${photoId}`);
    expect(askChat).toHaveBeenCalledWith({ question: "Har du sett min skiftnyckel?", history: [] });
    // The field is empty again for the next question.
    expect(screen.getByRole("textbox", { name: "Sök eller fråga" })).toHaveValue("");
  });

  it("shows a thing written into a box without a thumbnail", async () => {
    askChat.mockResolvedValue(ok({ answer: "I Black box.", refs: [{ href: `/prylar/lada/${placeId}`, photoId: null, title: "Garaget · Black box", sub: "Låda · Skrivet 31 okt" }] }));
    render(<ThingChat />);
    await ask("Julgransbelysning?");
    const ref = await screen.findByTestId("chat-ref");
    expect(ref).toHaveTextContent("Låda · Skrivet 31 okt");
    expect(ref.querySelector("img")).toBeNull();
  });

  it("sends the earlier turns with a follow-up, at most six", async () => {
    askChat.mockResolvedValue(ok({ answer: "Svar.", refs: [] }));
    render(<ThingChat />);
    for (let index = 1; index <= 8; index++) {
      await ask(`Fråga ${index}`);
      await waitFor(() => expect(screen.getAllByTestId("chat-answer")).toHaveLength(index));
    }
    const lastCall = askChat.mock.calls.at(-1)?.[0];
    expect(lastCall?.question).toBe("Fråga 8");
    expect(lastCall?.history).toHaveLength(6);
    expect(lastCall?.history[0]).toEqual({ question: "Fråga 2", answer: "Svar." });
  });

  it("does not send an empty question or a second one while the first is answered", async () => {
    let finish: (result: Result<ChatAnswer>) => void = () => undefined;
    askChat.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ThingChat />);
    await userEvent.click(screen.getByRole("button", { name: "Skicka" }));
    expect(askChat).not.toHaveBeenCalled();
    await ask("Hammare?");
    expect(screen.getByTestId("ai-working")).toBeInTheDocument();
    await ask("Tång?");
    expect(askChat).toHaveBeenCalledTimes(1);
    finish(ok({ answer: "Ja.", refs: [] }));
    expect(await screen.findByText("Ja.")).toBeInTheDocument();
  });

  it("says when the AI does not answer, and keeps the question", async () => {
    askChat.mockResolvedValue(fail("ai_unavailable"));
    render(<ThingChat />);
    await ask("Hammare?");
    expect(await screen.findByRole("alert")).toHaveTextContent("AI-tjänsten svarar inte just nu");
    expect(screen.getByTestId("chat-question")).toHaveTextContent("Hammare?");
  });

  it("is cleared by 'Ny fråga', and an answer that was on its way is dropped", async () => {
    let finish: (result: Result<ChatAnswer>) => void = () => undefined;
    askChat.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ThingChat />);
    await ask("Hammare?");
    await userEvent.click(screen.getByRole("button", { name: "Ny fråga" }));
    expect(screen.queryByTestId("chat-turn")).not.toBeInTheDocument();
    finish(ok({ answer: "Sent svar.", refs: [] }));
    await Promise.resolve();
    expect(screen.queryByText("Sent svar.")).not.toBeInTheDocument();
    askChat.mockResolvedValue(ok({ answer: "Nytt svar.", refs: [] }));
    await ask("Tång?");
    expect(await screen.findByText("Nytt svar.")).toBeInTheDocument();
    expect(askChat).toHaveBeenLastCalledWith({ question: "Tång?", history: [] });
  });

  it("shows a plain search's answer from the database: the hits as rows with place and thumbnail, and Liknande folded in (Story 18.19)", async () => {
    const found = {
      id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a41",
      name: "Coca-Cola",
      category: "Hushåll" as const,
      whereHint: "mitten",
      seenOn: 1,
      placeId,
      siteId,
      siteName: "Hemma",
      room: "Boden",
      roomKey: "boden",
      part: "Nedersta hyllan",
      isBox: false,
      photoId,
      takenAt: "2026-10-31T10:00:00Z",
      written: false,
      noted: false,
      score: 1,
    };
    askChat.mockResolvedValue(
      ok({ answer: "Coca-Cola finns i Boden · Nedersta hyllan · mitten.", refs: [], hits: [found], similar: [{ ...found, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a42", name: "Fun Light läsk" }] }),
    );
    render(<ThingChat siteId={siteId} />);
    await ask("coca-cola");
    expect(await screen.findByText("Coca-Cola finns i Boden · Nedersta hyllan · mitten.")).toBeInTheDocument();
    const [row] = screen.getAllByTestId("thing-hit");
    expect(row).toHaveTextContent("Coca-Cola Boden · Nedersta hyllan · mitten");
    expect(row).toHaveAttribute("href", `/prylar/${placeId}`);
    expect(row.closest("li")?.querySelector("img")).toHaveAttribute("src", `/api/things/photo/${photoId}`);
    expect(screen.queryByText("Fun Light läsk")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Visa 1 liknande" }));
    expect(screen.getByText("Fun Light läsk")).toBeInTheDocument();
  });

  describe("something to remember (Story 18.19)", () => {
    const proposal = {
      name: "Pass",
      room: "Sovrummet",
      part: "Översta byrålådan",
      category: "Övrigt" as const,
      newRoom: false,
      moves: null,
    };
    const remembered: Remembered = {
      id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a21",
      title: "Sovrummet · Översta byrålådan",
      href: `/prylar/rum/${siteId}/sovrummet`,
      notedAt: "2026-10-31T21:00:00Z",
    };

    it("sends the boende with the text, and shows the proposal: the thing, room and part, Kom ihåg and Ändra; nothing is saved yet", async () => {
      askChat.mockResolvedValue(ok({ answer: "Ska jag komma ihåg var det ligger?", refs: [], proposal }));
      render(<ThingChat siteId={siteId} rooms={["Skräpförrådet", "Sovrummet"]} />);
      await ask("Passen ligger i översta byrålådan i sovrummet");
      expect(askChat).toHaveBeenCalledWith({ question: "Passen ligger i översta byrålådan i sovrummet", history: [], siteId });
      expect(await screen.findByText("Ska jag komma ihåg var det ligger?")).toBeInTheDocument();
      expect(screen.getByTestId("proposal-name")).toHaveTextContent("Pass");
      expect(screen.getByTestId("proposal-where")).toHaveTextContent("Sovrummet · Översta byrålådan");
      expect(screen.queryByTestId("proposal-new-room")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Kom ihåg" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ändra" })).toBeInTheDocument();
      expect(rememberThing).not.toHaveBeenCalled();
    });

    it("saves on one tap: the bubble says where it is, with the room to tap, and the page is read again", async () => {
      askChat.mockResolvedValue(ok({ answer: "Ska jag komma ihåg var det ligger?", refs: [], proposal }));
      rememberThing.mockResolvedValue(ok(remembered));
      render(<ThingChat siteId={siteId} rooms={["Sovrummet"]} />);
      await ask("Passen ligger i översta byrålådan i sovrummet");
      await userEvent.click(await screen.findByRole("button", { name: "Kom ihåg" }));
      expect(rememberThing).toHaveBeenCalledWith({ siteId, name: "Pass", room: "Sovrummet", part: "Översta byrålådan", category: "Övrigt", replaces: null });
      expect(await screen.findByText("Klart. Pass ligger i Sovrummet · Översta byrålådan.")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-proposal")).not.toBeInTheDocument();
      const ref = screen.getByTestId("chat-ref");
      expect(ref).toHaveAttribute("href", `/prylar/rum/${siteId}/sovrummet`);
      expect(ref).toHaveTextContent("Du skrev in det 31 okt");
      expect(ref.querySelector("img")).toBeNull();
      expect(refresh).toHaveBeenCalled();
      // The next question carries what was saved, so a follow-up is understood.
      askChat.mockResolvedValue(ok({ answer: "Svar.", refs: [] }));
      await ask("och nyckeln?");
      expect(askChat.mock.calls.at(-1)?.[0].history).toEqual([
        { question: "Passen ligger i översta byrålådan i sovrummet", answer: "Klart. Pass ligger i Sovrummet · Översta byrålådan." },
      ]);
    });

    it("marks a new room, says what it moves, and passes the moved thing on", async () => {
      askChat.mockResolvedValue(
        ok({
          answer: "Ska jag komma ihåg var det ligger?",
          refs: [],
          proposal: { ...proposal, room: "Vinden", part: null, newRoom: true, moves: { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a31", title: "Hallen · Byrån", notedAt: "2026-10-12T10:00:00Z" } },
        }),
      );
      rememberThing.mockResolvedValue(ok({ ...remembered, title: "Vinden" }));
      render(<ThingChat siteId={siteId} />);
      await ask("Passen ligger på vinden");
      expect(await screen.findByTestId("proposal-new-room")).toHaveTextContent("nytt rum");
      expect(screen.getByText("Låg förut i Hallen · Byrån (skrivet 12 okt).")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Kom ihåg" }));
      expect(rememberThing).toHaveBeenCalledWith(expect.objectContaining({ room: "Vinden", part: "", replaces: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a31" }));
    });

    it("changes the proposal in a sheet named after the thing: name, room by chip, part (valfritt), and Kom ihåg saves it", async () => {
      askChat.mockResolvedValue(ok({ answer: "Ska jag komma ihåg var det ligger?", refs: [], proposal }));
      rememberThing.mockResolvedValue(ok({ ...remembered, title: "Skräpförrådet" }));
      render(<ThingChat siteId={siteId} rooms={["Skräpförrådet", "Sovrummet"]} />);
      await ask("Passen ligger i översta byrålådan i sovrummet");
      await userEvent.click(await screen.findByRole("button", { name: "Ändra" }));
      const sheet = screen.getByRole("dialog", { name: "Pass" });
      expect(within(sheet).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
      expect(within(sheet).getByRole("button", { name: "Sovrummet" })).toHaveAttribute("aria-pressed", "true");
      expect(within(sheet).getByLabelText("Del av rummet (valfritt)")).toHaveValue("Översta byrålådan");
      await userEvent.clear(within(sheet).getByLabelText("Föremål"));
      await userEvent.type(within(sheet).getByLabelText("Föremål"), "Pass och id-kort");
      await userEvent.click(within(sheet).getByRole("button", { name: "Skräpförrådet" }));
      expect(within(sheet).getByLabelText("Rum")).toHaveValue("Skräpförrådet");
      expect(within(sheet).getByRole("button", { name: "Skräpförrådet" })).toHaveAttribute("aria-pressed", "true");
      await userEvent.clear(within(sheet).getByLabelText("Del av rummet (valfritt)"));
      await userEvent.click(within(sheet).getByRole("button", { name: "Kom ihåg" }));
      expect(rememberThing).toHaveBeenCalledWith({ siteId, name: "Pass och id-kort", room: "Skräpförrådet", part: "", category: "Övrigt", replaces: null });
      expect(await screen.findByText("Klart. Pass och id-kort ligger i Skräpförrådet.")).toBeInTheDocument();
    });

    it("without a room the button is Välj rum and opens the sheet, and a refused room is said under its field", async () => {
      askChat.mockResolvedValue(ok({ answer: "Ska jag komma ihåg var det ligger?", refs: [], proposal: { ...proposal, room: null, part: null } }));
      rememberThing.mockResolvedValue(fail("validation", { room: "Ange ett rum, till exempel Skräpförrådet." }));
      render(<ThingChat siteId={siteId} />);
      await ask("Jag har lagt passen i en låda");
      expect(await screen.findByTestId("proposal-where")).toHaveTextContent("Välj rum");
      await userEvent.click(screen.getByRole("button", { name: "Välj rum" }));
      const sheet = screen.getByRole("dialog", { name: "Pass" });
      await userEvent.click(within(sheet).getByRole("button", { name: "Kom ihåg" }));
      expect(await within(sheet).findByText("Ange ett rum, till exempel Skräpförrådet.")).toBeInTheDocument();
      expect(within(sheet).getByLabelText("Rum")).toHaveAttribute("aria-invalid", "true");
    });

    it("says when saving fails and keeps the buttons", async () => {
      askChat.mockResolvedValue(ok({ answer: "Ska jag komma ihåg var det ligger?", refs: [], proposal }));
      rememberThing.mockResolvedValue(fail("things_noted_failed"));
      render(<ThingChat siteId={siteId} />);
      await ask("Passen ligger i översta byrålådan i sovrummet");
      await userEvent.click(await screen.findByRole("button", { name: "Kom ihåg" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara. Försök igen.");
      expect(screen.getByRole("button", { name: "Kom ihåg" })).toBeInTheDocument();
    });

    it("shows a noted thing in an answer with a note instead of a thumbnail", async () => {
      askChat.mockResolvedValue(
        ok({
          answer: "Passen ligger i översta byrålådan i Sovrummet. Det skrev du in själv 31 okt.",
          refs: [{ href: `/prylar/${placeId}`, photoId: null, title: "Sovrummet · Översta byrålådan", sub: "Du skrev in det 31 okt", noted: true }],
        }),
      );
      render(<ThingChat siteId={siteId} />);
      await ask("var är passen?");
      const ref = await screen.findByTestId("chat-ref");
      expect(ref).toHaveTextContent("Du skrev in det 31 okt");
      expect(ref).toHaveTextContent("📝");
      expect(ref.querySelector("img")).toBeNull();
    });
  });
});
