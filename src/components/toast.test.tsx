import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

function Trigger({ message, onUndo }: { message: string; onUndo?: () => void }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message, onUndo ? { onUndo } : undefined)}>
      {message}
    </button>
  );
}

function renderToasts(onUndo?: () => void) {
  return render(
    <ToastProvider>
      <Trigger message="Lagt 8 varor i lagret." />
      <Trigger message="Inköpslistan är kopierad." />
      <Trigger message="Tog bort Mjölk." onUndo={onUndo ?? (() => {})} />
    </ToastProvider>,
  );
}

const liveRegion = () => screen.getByRole("status");

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("announces the message in a live region that is always there", () => {
    renderToasts();
    expect(liveRegion()).toHaveAttribute("aria-live", "polite");
    expect(liveRegion()).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Lagt 8 varor i lagret." }));
    expect(liveRegion()).toHaveTextContent("Lagt 8 varor i lagret.");
  });

  it("stays 4 s without undo", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Lagt 8 varor i lagret." }));
    act(() => vi.advanceTimersByTime(3_999));
    expect(liveRegion()).toHaveTextContent("Lagt 8 varor i lagret.");
    act(() => vi.advanceTimersByTime(1));
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it("stays 5 s with Ångra", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Tog bort Mjölk." }));
    act(() => vi.advanceTimersByTime(4_999));
    expect(liveRegion()).toHaveTextContent("Tog bort Mjölk.");
    act(() => vi.advanceTimersByTime(1));
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it("shows at most one: a new one replaces the old and gets its own time", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Lagt 8 varor i lagret." }));
    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.click(screen.getByRole("button", { name: "Inköpslistan är kopierad." }));
    expect(liveRegion()).toHaveTextContent("Inköpslistan är kopierad.");
    expect(liveRegion()).not.toHaveTextContent("Lagt 8 varor i lagret.");
    act(() => vi.advanceTimersByTime(3_999));
    expect(liveRegion()).toHaveTextContent("Inköpslistan är kopierad.");
    act(() => vi.advanceTimersByTime(1));
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it("calls the undo callback once and closes on Ångra", () => {
    const onUndo = vi.fn();
    renderToasts(onUndo);
    fireEvent.click(screen.getByRole("button", { name: "Tog bort Mjölk." }));
    fireEvent.click(screen.getByRole("button", { name: "Ångra" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it("keeps only the message in the live region, with Ångra outside it", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Tog bort Mjölk." }));
    expect(liveRegion()).toHaveTextContent(/^Tog bort Mjölk\.$/);
    expect(liveRegion()).not.toContainElement(screen.getByRole("button", { name: "Ångra" }));
  });

  it("stands still while hovered and runs on afterwards", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Tog bort Mjölk." }));
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.pointerEnter(screen.getByTestId("toast"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(liveRegion()).toHaveTextContent("Tog bort Mjölk.");
    fireEvent.pointerLeave(screen.getByTestId("toast"));
    act(() => vi.advanceTimersByTime(2_999));
    expect(liveRegion()).toHaveTextContent("Tog bort Mjölk.");
    act(() => vi.advanceTimersByTime(1));
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it("stands still while Ångra has focus", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Tog bort Mjölk." }));
    act(() => screen.getByRole("button", { name: "Ångra" }).focus());
    act(() => vi.advanceTimersByTime(10_000));
    expect(liveRegion()).toHaveTextContent("Tog bort Mjölk.");
    act(() => screen.getByRole("button", { name: "Ångra" }).blur());
    act(() => vi.advanceTimersByTime(5_000));
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it("has no Ångra without an undo callback", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Lagt 8 varor i lagret." }));
    expect(screen.queryByRole("button", { name: "Ångra" })).not.toBeInTheDocument();
  });
});
