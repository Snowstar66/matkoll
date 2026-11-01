import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { FeedbackInput } from "../domain/feedback";
import { FeedbackSheet, type FeedbackSheetProps } from "./feedback-sheet";

// The Tyck till sheets (Story 20.3), with the Server Action stubbed.

const sendFeedback = vi.fn<(input: FeedbackInput) => Promise<Result<null>>>();
vi.mock("../actions/send-feedback", () => ({ sendFeedback: (input: FeedbackInput) => sendFeedback(input) }));

beforeEach(() => {
  sendFeedback.mockReset();
  sendFeedback.mockResolvedValue(ok());
});

function open(props: Partial<FeedbackSheetProps> = {}) {
  const onClose = vi.fn();
  const view = render(<FeedbackSheet kind="idea" onClose={onClose} ownerName="Pontus" area="inkopslista" page="/lista" {...props} />);
  return { onClose, view };
}

const send = () => screen.getByRole("button", { name: "Skicka" });

describe("FeedbackSheet", () => {
  it("opens Föreslå en funktion with the area it came from chosen, and Skicka dimmed until there is text", async () => {
    const user = userEvent.setup();
    open();
    const dialog = screen.getByRole("dialog", { name: "Föreslå en funktion" });
    expect(within(dialog).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Inköpslista" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("Pontus ser texten, ditt namn och sidan du var på.")).toBeInTheDocument();
    expect(send()).toBeDisabled();

    await user.type(screen.getByLabelText("Vad skulle göra Livskoll bättre för dig?"), "Dela inköpslistan med Anna");
    // One area at a time: another chip takes over, the chosen one again takes it away.
    await user.click(within(dialog).getByRole("button", { name: "Recept" }));
    expect(within(dialog).getByRole("button", { name: "Inköpslista" })).toHaveAttribute("aria-pressed", "false");
    await user.click(within(dialog).getByRole("button", { name: "Recept" }));
    await user.click(within(dialog).getByRole("button", { name: "Matsedel" }));
    await user.click(send());

    expect(sendFeedback).toHaveBeenCalledWith({ kind: "idea", body: "Dela inköpslistan med Anna", area: "matsedel", page: "/lista" });
    expect(await screen.findByRole("heading", { name: "Tack! Det hamnar hos Pontus." })).toBeInTheDocument();
    expect(screen.getByText("Allt som skickas läses. Du kan föreslå något nytt när du vill.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skicka" })).not.toBeInTheDocument();
  });

  it("starts an idea with the search word that found nothing, and closes without asking when it is unchanged", async () => {
    const user = userEvent.setup();
    const { onClose } = open({ initialText: "dela lista" });
    expect(screen.getByLabelText("Vad skulle göra Livskoll bättre för dig?")).toHaveValue("dela lista");
    expect(send()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("asks before throwing away a text that was written", async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.type(screen.getByRole("textbox"), "Något");
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(screen.getByText("Släng ändringarna?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is Något som inte funkar? with its own question and says the page and version go along", async () => {
    const user = userEvent.setup();
    open({ kind: "problem", area: "matvaror", page: "/hemma" });
    expect(screen.getByRole("dialog", { name: "Något som inte funkar?" })).toBeInTheDocument();
    expect(screen.getByText("Sidan du var på och appversionen skickas med, så Pontus kan se vad som hände.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Vad hände? Vad hade du väntat dig?"), "Ångra försvann");
    await user.click(send());
    expect(sendFeedback).toHaveBeenCalledWith({ kind: "problem", body: "Ångra försvann", area: "matvaror", page: "/hemma" });
  });

  it("rates with five stars, asks what could be better at 1–3, and thanks with the stars", async () => {
    const user = userEvent.setup();
    open({ kind: "rate", page: "/hjalp" });
    expect(screen.getByRole("dialog", { name: "Betygsätt Livskoll" })).toBeInTheDocument();
    const stars = screen.getByRole("radiogroup", { name: "Hur tycker du att Livskoll fungerar?" });
    expect(within(stars).getAllByRole("radio")).toHaveLength(5);
    expect(send()).toBeDisabled();
    expect(screen.getByLabelText("Något mer du vill säga?")).toBeInTheDocument();
    // No area chips in a rating.
    expect(screen.queryByRole("button", { name: "Recept" })).not.toBeInTheDocument();

    await user.click(within(stars).getByRole("radio", { name: "2 av 5, Sådär" }));
    expect(screen.getByText("Sådär")).toBeInTheDocument();
    expect(screen.getByLabelText("Vad kan bli bättre?")).toBeInTheDocument();
    await user.click(within(stars).getByRole("radio", { name: "4 av 5, Bra" }));
    expect(within(stars).getByRole("radio", { name: "4 av 5, Bra" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Något mer du vill säga?")).toBeInTheDocument();
    // The arrow keys move the choice.
    await user.keyboard("{ArrowLeft}");
    expect(within(stars).getByRole("radio", { name: "3 av 5, Okej" })).toHaveAttribute("aria-checked", "true");

    await user.click(send());
    expect(sendFeedback).toHaveBeenCalledWith({ kind: "rating", stars: 3, body: "", page: "/hjalp" });
    expect(await screen.findByRole("heading", { name: "Tack för ditt betyg." })).toBeInTheDocument();
    expect(screen.getByText("Det hamnar hos Pontus.")).toBeInTheDocument();
  });

  it("keeps the text and says why when sending fails", async () => {
    const user = userEvent.setup();
    sendFeedback.mockResolvedValue(fail("feedback_rate_limited"));
    open();
    await user.type(screen.getByRole("textbox"), "Ett förslag");
    await user.click(send());
    expect(await screen.findByRole("alert")).toHaveTextContent("Du har skickat många meddelanden på kort tid. Försök igen senare.");
    expect(screen.getByRole("textbox")).toHaveValue("Ett förslag");
    expect(send()).toBeEnabled();
  });

  it("shows nothing when no sheet is asked for", () => {
    open({ kind: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
