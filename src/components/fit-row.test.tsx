import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FitRow } from "./fit-row";

const notes = [
  { kind: "allergy" as const, text: "Kan innehålla gluten (Anna)" },
  { kind: "dislike" as const, text: "Gunnar undviker vitlök" },
  { kind: "like" as const, text: "Du älskar paprika" },
];

afterEach(() => window.localStorage.clear());

describe("FitRow", () => {
  it("shows dots with the allergen word, replacing the notes, when Visa vem rätten passar is on (the default)", () => {
    render(<FitRow notes={notes} maxNotes={2} />);
    expect(screen.queryByTestId("preference-notes")).toBeNull();
    const dots = screen.getAllByTestId("fit-dot");
    expect(dots.map((dot) => dot.dataset.kind)).toEqual(["allergy", "avoid", "love"]);
    expect(dots.map((dot) => dot.textContent)).toEqual(["A", "G", "D"]);
    expect(screen.getByTestId("fit-allergy-word")).toHaveTextContent("Gluten");
  });

  it("labels each dot for screen readers", () => {
    render(<FitRow notes={notes} />);
    expect(screen.getByRole("img", { name: "Anna: kan innehålla gluten" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gunnar undviker vitlök" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Du älskar paprika" })).toBeInTheDocument();
  });

  it("shows nothing when the dish fits everyone", () => {
    const { container } = render(<FitRow notes={undefined} />);
    expect(container).toBeEmptyDOMElement();
    const none = render(<FitRow notes={[]} />);
    expect(none.container).toBeEmptyDOMElement();
  });

  it("shows today's notes as before when the option is off", () => {
    window.localStorage.setItem("livskoll-option-showFit", "0");
    render(<FitRow notes={notes} maxNotes={2} />);
    expect(screen.queryByTestId("fit-dot")).toBeNull();
    expect(screen.getByTestId("preference-notes")).toHaveTextContent("Kan innehålla gluten (Anna)");
    expect(screen.getByTestId("preference-notes")).toHaveTextContent("Gunnar undviker vitlök");
    expect(screen.queryByText("Du älskar paprika")).toBeNull();
  });

  it("opens the sentences from a button when expandable, at least 44 px tall", async () => {
    const user = userEvent.setup();
    render(<FitRow notes={[{ kind: "like", text: "Anna älskar fetaost" }, { kind: "dislike", text: "Gunnar undviker vitlök" }]} expandable />);
    const button = screen.getByRole("button", { name: /Tryck för mer/ });
    expect(button).toHaveClass("min-h-11");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("fit-details")).toBeNull();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("fit-details")).toHaveTextContent("Gunnar undviker vitlök.Anna älskar fetaost.");
  });
});
