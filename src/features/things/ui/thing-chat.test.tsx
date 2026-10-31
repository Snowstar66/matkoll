import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { ChatAnswer } from "../actions/ask-chat";
import type { ChatTurn } from "../domain/thing-ask";
import { ThingChat } from "./thing-chat";

const askChat = vi.fn<(input: { question: string; history: ChatTurn[] }) => Promise<Result<ChatAnswer>>>();
vi.mock("../actions/ask-chat", () => ({ askChat: (input: { question: string; history: ChatTurn[] }) => askChat(input) }));

const photoId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04";
const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";

beforeEach(() => askChat.mockReset());

async function ask(text: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Sök eller fråga" }), `${text}{Enter}`);
}

describe("the chat", () => {
  it("has the field Sök eller fråga …, the hint while it is empty and a send button", () => {
    render(<ThingChat />);
    expect(screen.getByPlaceholderText("Sök eller fråga …")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skicka" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ny fråga" })).not.toBeInTheDocument();
    expect(screen.getByText("Skriv för att söka – tryck ↑ för att fråga")).toBeInTheDocument();
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
});
