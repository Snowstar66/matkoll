import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { FeedbackItem } from "../domain/feedback";
import { Inbox } from "./inbox";

// Inkorg (Story 20.3), with the Server Action stubbed.

const markFeedbackRead = vi.fn<(id: string) => Promise<Result<null>>>();
vi.mock("../actions/mark-feedback-read", () => ({ markFeedbackRead: (id: string) => markFeedbackRead(id) }));

beforeEach(() => {
  markFeedbackRead.mockReset();
  markFeedbackRead.mockResolvedValue(ok());
});

const now = "2026-11-01T20:30:00Z";
const items: FeedbackItem[] = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "idea", stars: null, body: "Att kunna dela inköpslistan.", area: "inkopslista", page: "/lista", appVersion: "0.1.0", senderEmail: "anna@example.se", userId: "a", createdAt: "2026-11-01T20:14:00Z", readAt: null },
  { id: "22222222-2222-4222-8222-222222222222", kind: "rating", stars: 3, body: "Långsamt när jag fotar kylen.", area: null, page: "/hjalp", appVersion: "0.1.0", senderEmail: "erik@example.se", userId: "e", createdAt: "2026-11-01T17:02:00Z", readAt: null },
  { id: "33333333-3333-4333-8333-333333333333", kind: "rating", stars: 5, body: "", area: null, page: null, appVersion: "0.1.0", senderEmail: "anna@example.se", userId: "a", createdAt: "2026-10-28T10:00:00Z", readAt: "2026-10-28T11:00:00Z" },
  { id: "44444444-4444-4444-8444-444444444444", kind: "problem", stars: null, body: "Ångra försvann.", area: "matvaror", page: "/hemma", appVersion: "0.1.0", senderEmail: "sara@example.se", userId: "s", createdAt: "2026-10-31T12:00:00Z", readAt: "2026-10-31T13:00:00Z" },
];

const group = (name: string) => screen.getByRole("list", { name });

describe("Inbox", () => {
  it("shows the average of each person's latest rating, the kinds with counts, and Nya before Tidigare", () => {
    render(<Inbox items={items} now={now} />);
    expect(screen.getByTestId("inbox-average")).toHaveTextContent("4,0");
    expect(screen.getByTestId("inbox-average")).toHaveTextContent("Snittbetyg, 2 betyg senaste 30 dagarna");
    const chips = screen.getByRole("group", { name: "Visa" });
    expect(within(chips).getByRole("button", { name: "Förslag 1" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Betyg 2" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Fel 1" })).toBeInTheDocument();

    const fresh = within(group("Nya")).getAllByRole("listitem");
    expect(fresh.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Anna21:14Förslag · InköpslistaAtt kunna dela inköpslistan."),
      expect.stringContaining("Erik18:02Betyg"),
    ]);
    expect(within(group("Tidigare")).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Anna28 okt"),
      expect.stringContaining("Sarai gårFel · Matvaror"),
    ]);
  });

  it("filters on one kind at a time, and shows everything again when the chip is tapped once more", async () => {
    const user = userEvent.setup();
    render(<Inbox items={items} now={now} />);
    await user.click(screen.getByRole("button", { name: "Betyg 2" }));
    expect(screen.getAllByTestId("inbox-message")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Fel 1" }));
    expect(screen.getAllByTestId("inbox-message")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Fel 1" }));
    expect(screen.getAllByTestId("inbox-message")).toHaveLength(4);
  });

  it("opens a message in full and marks it read, which moves it to Tidigare", async () => {
    const user = userEvent.setup();
    render(<Inbox items={items} now={now} />);
    await user.click(within(group("Nya")).getByText("Att kunna dela inköpslistan."));
    const dialog = screen.getByRole("dialog", { name: "Anna" });
    expect(within(dialog).getByText("/lista")).toBeInTheDocument();
    expect(within(dialog).getByText("0.1.0")).toBeInTheDocument();
    expect(within(dialog).getByText("anna@example.se · 21:14")).toBeInTheDocument();
    expect(markFeedbackRead).toHaveBeenCalledWith(items[0]!.id);
    expect(within(group("Nya")).getAllByRole("listitem")).toHaveLength(1);
    expect(within(group("Tidigare")).getAllByRole("listitem")).toHaveLength(3);
    // A message already read is not marked again.
    await user.click(within(dialog).getByRole("button", { name: "Klar" }));
    await user.click(within(group("Tidigare")).getByText("Ångra försvann."));
    expect(markFeedbackRead).toHaveBeenCalledTimes(1);
  });

  it("puts a message back among Nya and says so when it cannot be marked read", async () => {
    const user = userEvent.setup();
    markFeedbackRead.mockResolvedValue(fail("feedback_mark_failed"));
    render(<Inbox items={items} now={now} />);
    await user.click(within(group("Nya")).getByText("Att kunna dela inköpslistan."));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att markera som läst.");
    expect(within(group("Nya")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("says when the inbox is empty", () => {
    render(<Inbox items={[]} now={now} />);
    expect(screen.getByText("Inkorgen är tom.")).toBeInTheDocument();
  });
});
