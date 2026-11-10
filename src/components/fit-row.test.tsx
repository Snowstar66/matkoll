import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FitRow } from "./fit-row";

const notes = [
  { kind: "allergy" as const, text: "Kan innehålla gluten (Anna)", people: [{ id: "anna", name: "Anna" }], terms: ["gluten"] },
  { kind: "dislike" as const, text: "Gunnar undviker vitlök", people: [{ id: "gunnar", name: "Gunnar" }], terms: ["vitlök"] },
  { kind: "like" as const, text: "Du älskar paprika", people: [{ id: "du", name: "Du" }], terms: ["paprika"] },
];

afterEach(() => window.localStorage.clear());

describe("FitRow", () => {
  it("shows dots with the allergen word, replacing the notes, in the default mode (Prickar)", () => {
    render(<FitRow notes={notes} maxNotes={2} />);
    expect(screen.queryByTestId("preference-notes")).toBeNull();
    const dots = screen.getAllByTestId("fit-dot");
    expect(dots.map((dot) => dot.dataset.kind)).toEqual(["allergy", "avoid", "love"]);
    expect(dots.map((dot) => dot.textContent)).toEqual(["A", "G", "D"]);
    expect(screen.getByTestId("fit-allergy-word")).toHaveTextContent("Gluten");
  });

  it("labels each dot for screen readers", () => {
    render(<FitRow notes={notes} />);
    expect(screen.getByRole("button", { name: "Anna: kan innehålla gluten" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Gunnar undviker vitlök" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Du älskar paprika" })).toBeInTheDocument();
  });

  it("shows nothing when the dish fits everyone", () => {
    const { container } = render(<FitRow notes={undefined} />);
    expect(container).toBeEmptyDOMElement();
    const none = render(<FitRow notes={[]} />);
    expect(none.container).toBeEmptyDOMElement();
  });

  it("shows the notes as lines in Text mode, allergy in red", () => {
    window.localStorage.setItem("livskoll-option-showFit", "text");
    render(<FitRow notes={notes} maxNotes={2} />);
    expect(screen.queryByTestId("fit-dot")).toBeNull();
    expect(screen.getByTestId("preference-notes")).toHaveTextContent("Kan innehålla gluten (Anna)");
    expect(screen.getByTestId("preference-notes")).toHaveTextContent("Gunnar undviker vitlök");
    expect(screen.queryByText("Du älskar paprika")).toBeNull();
  });

  it("shows nothing in Inget mode, and reads the old switch value 0 as Inget", () => {
    window.localStorage.setItem("livskoll-option-showFit", "none");
    const none = render(<FitRow notes={notes} />);
    expect(none.container).toBeEmptyDOMElement();
    none.unmount();
    window.localStorage.setItem("livskoll-option-showFit", "0");
    const legacy = render(<FitRow notes={notes} />);
    expect(legacy.container).toBeEmptyDOMElement();
    legacy.unmount();
    window.localStorage.setItem("livskoll-option-showFit", "1");
    render(<FitRow notes={notes} />);
    expect(screen.getAllByTestId("fit-dot")).toHaveLength(3);
  });

  it("opens a bubble on tap without following the card link, and closes on a second tap, outside tap and Escape", async () => {
    const user = userEvent.setup();
    let followed = false;
    render(
      <a
        href="#kort"
        onClick={() => {
          followed = true;
        }}
      >
        <FitRow notes={[{ kind: "like", text: "Anna älskar fetaost", people: [{ id: "anna", name: "Anna" }], terms: ["fetaost"] }, { kind: "dislike", text: "Gunnar undviker vitlök", people: [{ id: "gunnar", name: "Gunnar" }], terms: ["vitlök"] }]} />
      </a>,
    );
    expect(screen.queryByText("Tryck för mer")).toBeNull();
    const dot = screen.getByRole("button", { name: "Anna älskar fetaost" });
    fireEvent.click(dot);
    expect(followed).toBe(false);
    expect(dot).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("fit-bubble")).toHaveTextContent("Anna älskar fetaost");
    fireEvent.click(dot);
    expect(screen.queryByTestId("fit-bubble")).toBeNull();
    fireEvent.click(dot);
    await user.click(document.body);
    expect(screen.queryByTestId("fit-bubble")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Gunnar undviker vitlök" }));
    expect(screen.getByTestId("fit-bubble")).toHaveTextContent("Gunnar undviker vitlök");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("fit-bubble")).toBeNull();
  });

  it("gives each dot a tap target of at least 32 px by padding", () => {
    render(<FitRow notes={notes} />);
    const dot = screen.getAllByTestId("fit-dot")[0];
    expect(dot).toHaveClass("p-[3px]");
  });
});
