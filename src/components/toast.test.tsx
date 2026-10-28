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

  it("puts the same message in anew, so it is announced again", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Lagt 8 varor i lagret." }));
    const first = liveRegion().firstElementChild;
    fireEvent.click(screen.getByRole("button", { name: "Lagt 8 varor i lagret." }));
    expect(liveRegion()).toHaveTextContent("Lagt 8 varor i lagret.");
    expect(liveRegion().firstElementChild).not.toBe(first);
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

  it("names the undo button after what it undoes when told to", () => {
    function Labelled() {
      const { showToast } = useToast();
      return (
        <button type="button" onClick={() => showToast("Kylen är uppdaterad.", { onUndo: () => {}, undoLabel: "Ångra borttagning" })}>
          visa
        </button>
      );
    }
    render(
      <ToastProvider>
        <Labelled />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "visa" }));
    expect(screen.getByRole("button", { name: "Ångra borttagning" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ångra" })).toBeNull();
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

  it("calls onClose once when the time runs out or a new toast replaces it, never after Ångra", () => {
    const onClose = vi.fn();
    const onUndo = vi.fn();
    function Closing() {
      const { showToast } = useToast();
      return (
        <>
          <button type="button" onClick={() => showToast("Tog bort koket.se.", { onUndo, onClose })}>
            Ta bort
          </button>
          <button type="button" onClick={() => showToast("Lade till arla.se.")}>
            Lägg till
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Closing />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    act(() => vi.advanceTimersByTime(5_000));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    fireEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(5_000));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    fireEvent.click(screen.getByRole("button", { name: "Ångra" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("announces a failure as an alert, not in the polite region, for 4 s", () => {
    function Failing() {
      const { showToast } = useToast();
      return (
        <button type="button" onClick={() => showToast("Det gick inte att ångra.", { role: "alert" })}>
          Ångra
        </button>
      );
    }
    render(
      <ToastProvider>
        <Failing />
      </ToastProvider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ångra" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(liveRegion()).toBeEmptyDOMElement();
    expect(screen.getByTestId("toast")).toHaveTextContent("Det gick inte att ångra.");
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  describe("with Visa and in the queue behind Ångra (Story 12.4)", () => {
    function Buttons({ onShow, onClose }: { onShow?: () => void; onClose?: () => void }) {
      const { showToast } = useToast();
      return (
        <>
          <button type="button" onClick={() => showToast("3 rättförslag är klara.", { show: { onShow: onShow ?? (() => {}) }, waitForUndo: true, onClose })}>
            Klart
          </button>
          <button type="button" onClick={() => showToast("Tog bort Mjölk.", { onUndo: () => {} })}>
            Ta bort
          </button>
          <button type="button" onClick={() => showToast("Lagt 8 varor i lagret.")}>
            Lagt
          </button>
        </>
      );
    }

    it("shows Visa, stays 8 s, and calls onShow once and closes when Visa is tapped", () => {
      const onShow = vi.fn();
      const onClose = vi.fn();
      render(
        <ToastProvider>
          <Buttons onShow={onShow} onClose={onClose} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Klart" }));
      expect(liveRegion()).toHaveTextContent("3 rättförslag är klara.");
      act(() => vi.advanceTimersByTime(7_999));
      expect(screen.getByTestId("toast")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Visa" }));
      expect(onShow).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("toast")).toBeNull();
      // It went by its own button: the close that follows an ended toast is called once.
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("goes after 8 s without calling onShow", () => {
      const onShow = vi.fn();
      render(
        <ToastProvider>
          <Buttons onShow={onShow} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Klart" }));
      act(() => vi.advanceTimersByTime(8_000));
      expect(screen.queryByTestId("toast")).toBeNull();
      expect(onShow).not.toHaveBeenCalled();
    });

    it("replaces an ordinary toast, as any new one does", () => {
      render(
        <ToastProvider>
          <Buttons />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Lagt" }));
      fireEvent.click(screen.getByRole("button", { name: "Klart" }));
      expect(screen.getByTestId("toast")).toHaveTextContent("3 rättförslag är klara.");
    });

    it("waits for a toast with Ångra, whether it ends by time or by Ångra, and comes with its own 8 s", () => {
      render(
        <ToastProvider>
          <Buttons />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
      fireEvent.click(screen.getByRole("button", { name: "Klart" }));
      expect(screen.getByTestId("toast")).toHaveTextContent("Tog bort Mjölk.");
      act(() => vi.advanceTimersByTime(5_000));
      expect(screen.getByTestId("toast")).toHaveTextContent("3 rättförslag är klara.");
      act(() => vi.advanceTimersByTime(7_999));
      expect(screen.getByTestId("toast")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByTestId("toast")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
      fireEvent.click(screen.getByRole("button", { name: "Klart" }));
      fireEvent.click(screen.getByRole("button", { name: "Ångra" }));
      expect(screen.getByTestId("toast")).toHaveTextContent("3 rättförslag är klara.");
    });

    it("comes in the order it waited when several wait", () => {
      render(
        <ToastProvider>
          <Buttons />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
      fireEvent.click(screen.getByRole("button", { name: "Klart" }));
      fireEvent.click(screen.getByRole("button", { name: "Klart" }));
      act(() => vi.advanceTimersByTime(5_000));
      expect(screen.getByTestId("toast")).toHaveTextContent("3 rättförslag är klara.");
      act(() => vi.advanceTimersByTime(8_000));
      expect(screen.getByTestId("toast")).toHaveTextContent("3 rättförslag är klara.");
      act(() => vi.advanceTimersByTime(8_000));
      expect(screen.queryByTestId("toast")).toBeNull();
    });
  });
});
