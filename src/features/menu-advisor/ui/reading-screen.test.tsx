import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dish } from "../domain/fixtures";
import { emptyReadingView, type ReadingView } from "./journey";
import { ReadingScreen, readingSteps } from "./reading-screen";

const view = (patch: Partial<ReadingView>): ReadingView => ({ ...emptyReadingView, ...patch });

describe("readingSteps", () => {
  it("starts on reading, with nothing done yet", () => {
    expect(readingSteps(emptyReadingView).map((step) => [step.id, step.state])).toEqual([
      ["read", "active"],
      ["explain", "waiting"],
    ]);
  });

  it("adds a translating step when the menu is in another language, and it runs until the first dish", () => {
    expect(readingSteps(view({ language: "es" })).map((step) => [step.id, step.state])).toEqual([
      ["read", "done"],
      ["translate", "active"],
      ["explain", "waiting"],
    ]);
    expect(readingSteps(view({ language: "es" }))[1]!.label).toBe("Översätter från spanska");
    expect(readingSteps(view({ language: "es", dishes: [dish({})] })).map((step) => [step.id, step.state])).toEqual([
      ["read", "done"],
      ["translate", "done"],
      ["explain", "active"],
    ]);
  });

  it("has no translating step for a Swedish menu", () => {
    expect(readingSteps(view({ language: "sv" })).map((step) => step.id)).toEqual(["read", "explain"]);
  });
});

describe("ReadingScreen", () => {
  it("shows the moving ring, the running line and the steps, all hidden from a screen reader that only needs the status", () => {
    render(<ReadingScreen view={view({ language: "es" })} careful={false} onCancel={() => {}} />);
    expect(screen.getByTestId("menu-reading-status")).toHaveTextContent("Översätter från spanska…");
    expect(screen.getByTestId("menu-reading-status")).toHaveClass("ai-shimmer");
    const steps = screen.getByTestId("menu-reading-steps");
    expect(steps).toHaveAttribute("aria-hidden", "true");
    expect(steps).toHaveTextContent("Läser menyn");
    expect(steps).toHaveTextContent("Översätter från spanska");
    expect(steps).toHaveTextContent("Förklarar rätterna");
  });

  it("marks the newest dish so it can glow when it arrives", () => {
    render(<ReadingScreen view={view({ language: "es", dishes: [dish({ originalnamn: "Pulpo" }), dish({ originalnamn: "Paella" })] })} careful={false} onCancel={() => {}} />);
    const rows = screen.getAllByRole("listitem").filter((item) => item.closest("[data-testid=menu-reading-dishes]"));
    expect(rows.map((row) => row.classList.contains("ai-fresh"))).toEqual([false, true]);
  });
});
