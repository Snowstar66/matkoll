import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpView } from "./help-view";

vi.mock("next/link", () => ({
  // `scroll` is Link's own, not an attribute of <a>.
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => {
    delete rest.scroll;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

// Hjälp och tips (Story 20.2): search, the tour card, one area at a time, its steps and questions, and Tyck till.

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

function chip(name: string) {
  return within(screen.getByRole("group", { name: "Område" })).getByRole("button", { name });
}

describe("HelpView", () => {
  it("chooses the area of the tab it was opened from, scrolls the chip row to it and goes back to the tab", () => {
    window.history.replaceState(null, "", "/hjalp#forrad");
    // jsdom lays nothing out: the row is 350 px wide, Förråd's chip sits at 400–480 px and the others inside it.
    const box = (left: number, right: number) => ({ left, right, top: 0, bottom: 32, width: right - left, height: 32, x: left, y: 0, toJSON: () => ({}) });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.getAttribute("role") === "group") return box(0, 350);
      return this.textContent === "Förråd" ? box(400, 480) : box(0, 80);
    });
    render(<HelpView version="0.1" />);
    expect(chip("Förråd")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Recept")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Förråd")).toHaveClass("bg-accent");
    expect(screen.getByRole("group", { name: "Område" }).scrollLeft).toBe(172);
    expect(screen.getByRole("heading", { level: 3, name: "Börja med ett rum" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Förråd" })).toHaveAttribute("href", "/prylar");
  });

  it("shows one area at a time: a chip swaps the steps and the questions and names the area in the address", async () => {
    window.history.replaceState(null, "", "/hjalp#matsedel");
    render(<HelpView version="0.1" />);
    const area = screen.getByRole("region", { name: "Matsedel" });
    expect(within(area).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Välj vecka", "Lägg till rätt", "Se vad som finns"]);
    await userEvent.click(chip("Konto"));
    expect(chip("Konto")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Välj vecka" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Siri" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#konto");
  });

  it("has the questions as <details> with ⊕ that open on a tap", async () => {
    render(<HelpView version="0.1" />);
    const question = screen.getByText("Kan jag ändra antal portioner?");
    const details = question.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    await userEvent.click(question);
    expect(details).toHaveAttribute("open");
    expect(within(details).getByText(/Mängderna räknas om/)).toBeVisible();
  });

  it("has the tour card, the Tyck till rows with their test ids and the version line", () => {
    render(<HelpView version="0.1" />);
    expect(screen.getByRole("link", { name: /Så funkar Livskoll/ })).toHaveAttribute("href", "/valkomst?fran=hjalp");
    expect(screen.getByTestId("feedback-idea")).toHaveTextContent("Föreslå en funktion");
    expect(screen.getByTestId("feedback-rate")).toHaveTextContent("Betygsätt Livskoll");
    expect(screen.getByTestId("feedback-problem")).toHaveTextContent("Något som inte funkar?");
    expect(screen.getByTestId("feedback-rate")).toHaveAttribute("href", "/hjalp?tyck=rate");
    expect(screen.getByText("Livskoll 0.1 · uppdaterad 1 nov")).toBeInTheDocument();
  });

  it("searches every area while typing, hides the rest, and with no hit offers Föreslå with the word", async () => {
    render(<HelpView version="0.1" />);
    const field = screen.getByRole("searchbox", { name: "Sök i hjälpen" });
    await userEvent.type(field, "FÖRRÅD");
    expect(screen.getByRole("status")).toHaveTextContent(/träff/);
    expect(screen.getByRole("list", { name: "Träffar" })).toHaveTextContent("Ska maten in här?");
    expect(screen.queryByRole("group", { name: "Område" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("feedback-rate")).not.toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.tagName === "MARK").length).toBeGreaterThan(0);

    await userEvent.clear(field);
    await userEvent.type(field, "zebra fink");
    expect(screen.getByRole("status")).toHaveTextContent("0 träffar");
    expect(screen.getByTestId("feedback-idea")).toHaveAttribute("href", "/hjalp?tyck=idea&q=zebra%20fink");
    expect(screen.getByTestId("feedback-idea")).toHaveTextContent("Berätta vad du letar efter");

    await userEvent.clear(field);
    expect(chip("Recept")).toHaveAttribute("aria-pressed", "true");
  });
});
