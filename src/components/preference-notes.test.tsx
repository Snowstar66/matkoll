import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreferenceNotes } from "./preference-notes";

describe("PreferenceNotes", () => {
  it("renders nothing without notes", () => {
    const { container } = render(<PreferenceNotes notes={undefined} />);
    expect(container).toBeEmptyDOMElement();
    const empty = render(<PreferenceNotes notes={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("says each note in words, an allergy in red and bold, a like in green, an Undviker calm", () => {
    render(
      <PreferenceNotes
        notes={[
          { kind: "allergy", text: "Kan innehålla gluten (Anna)" },
          { kind: "dislike", text: "Anna undviker koriander" },
          { kind: "like", text: "Anna älskar paprika" },
        ]}
      />,
    );
    expect(screen.getByText("Kan innehålla gluten (Anna)")).toHaveClass("text-danger", "font-semibold");
    expect(screen.getByText("Anna undviker koriander")).toHaveClass("text-ink-2");
    expect(screen.getByText("Anna älskar paprika")).toHaveClass("text-mint-ink");
  });

  it("cuts the list at max, keeping the first (the allergy)", () => {
    render(
      <PreferenceNotes
        max={1}
        notes={[
          { kind: "allergy", text: "Kan innehålla gluten (Anna)" },
          { kind: "like", text: "Anna älskar paprika" },
        ]}
      />,
    );
    expect(screen.getByText("Kan innehålla gluten (Anna)")).toBeInTheDocument();
    expect(screen.queryByText("Anna älskar paprika")).not.toBeInTheDocument();
  });
});
