import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiOrb, AiWorking, aiStepMs, pickPlayfulSteps, playfulWords } from "./ai-working";

function mockReduced(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("AiWorking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReduced(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("steps through the phrases and stays on the last one", () => {
    render(<AiWorking steps={["Ett …", "Två …", "Tre …"]} />);
    const text = () => screen.getByTestId("ai-working-text");
    expect(text()).toHaveTextContent("Ett …");
    act(() => vi.advanceTimersByTime(aiStepMs));
    expect(text()).toHaveTextContent("Två …");
    act(() => vi.advanceTimersByTime(aiStepMs));
    expect(text()).toHaveTextContent("Tre …");
    act(() => vi.advanceTimersByTime(aiStepMs * 5));
    expect(text()).toHaveTextContent("Tre …");
  });

  it("has one status role whose text is only the first step", () => {
    render(<AiWorking steps={["Ett …", "Två …"]} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(aiStepMs));
    const status = screen.getByRole("status");
    expect(status.querySelector(".sr-only")).toHaveTextContent("Ett …");
    expect(status.querySelector("[aria-hidden='true'][data-testid='ai-working-text']")).toHaveTextContent("Två …");
  });

  it("adds no role of its own inside a live region", () => {
    render(<AiWorking inLiveRegion label="Läser …" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("ai-working-text")).toHaveTextContent("Läser …");
  });

  it("shows the first step and does not step with reduced motion", () => {
    mockReduced(true);
    render(<AiWorking steps={["Ett …", "Två …"]} />);
    act(() => vi.advanceTimersByTime(aiStepMs * 3));
    expect(screen.getByTestId("ai-working-text")).toHaveTextContent("Ett …");
  });

  it("picks distinct playful words once on mount when no steps are given", () => {
    const random = vi.fn(() => 0);
    const { rerender } = render(<AiWorking random={random} />);
    const first = screen.getByTestId("ai-working-text").textContent;
    expect(playfulWords).toContain(first);
    const calls = random.mock.calls.length;
    rerender(<AiWorking random={random} />);
    expect(random.mock.calls.length).toBe(calls);
    expect(screen.getByTestId("ai-working-text")).toHaveTextContent(first ?? "");
  });

  it("pickPlayfulSteps gives two or three distinct words", () => {
    for (const r of [0, 0.3, 0.99]) {
      const words = pickPlayfulSteps(() => r);
      expect(words.length).toBeGreaterThanOrEqual(2);
      expect(new Set(words).size).toBe(words.length);
    }
    expect(pickPlayfulSteps(() => 0, 3)).toEqual(["Funderar …", "Klurar …", "Grubblar …"]);
  });

  it("renders the orb alone, hidden from a screen reader", () => {
    const { container } = render(<AiOrb />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
