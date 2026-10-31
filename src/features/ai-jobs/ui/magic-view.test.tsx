import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiJob } from "@/lib/ai-job-shape";
import { MagicView } from "./magic-view";

// The magical view (Story 12.8): the cycling line is hidden from a screen
// reader, which gets one steady status; "Minska rörelse" gives one fixed text.

const job = (patch: Partial<AiJob> = {}): AiJob => ({
  id: crypto.randomUUID(),
  kind: "suggest",
  status: "running",
  context: {},
  errorCode: null,
  createdAt: new Date().toISOString(),
  seen: false,
  ahead: 0,
  count: null,
  ...patch,
});

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MagicView", () => {
  it("cycles the status line every 2.5 s, hidden from a screen reader, with a steady status", () => {
    stubMotion(false);
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    render(<MagicView jobs={[job()]} />);
    expect(screen.getByTestId("magic-status")).toHaveTextContent("Läser dina matvaror");
    expect(screen.getByTestId("magic-status")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("AI arbetar med rättförslag.")).toHaveAttribute("aria-live", "polite");
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByTestId("magic-status")).toHaveTextContent("Matchar veckans erbjudanden");
    expect(screen.getByTestId("magic-time")).toHaveTextContent("3 s av ca 35 s");
    expect(screen.getByText("AI arbetar med rättförslag.")).toBeInTheDocument();
  });

  it("shows one fixed text with reduced motion", () => {
    stubMotion(true);
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    render(<MagicView jobs={[job({ kind: "import" })]} />);
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByTestId("magic-status")).toHaveTextContent("Hämtar receptet");
  });

  it("settles with Klart! when nothing runs, and is not there without jobs", () => {
    stubMotion(false);
    const { rerender } = render(<MagicView jobs={[job({ status: "done", count: 3 })]} />);
    expect(screen.getAllByText("Klart!").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("magic-hero")).not.toBeInTheDocument();
    rerender(<MagicView jobs={[]} />);
    expect(screen.queryByTestId("magic-view")).not.toBeInTheDocument();
  });
});
