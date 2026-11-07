import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepText } from "./step-text";
import { TimerBar } from "./timer-bar";
import { useStepTimers } from "./use-step-timers";
import { useWakeLock } from "./use-wake-lock";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StepText", () => {
  it("makes each time a button that starts a timer", () => {
    const onStart = vi.fn();
    render(<p><StepText text="Koka i 10 minuter och rör i 30 sek." stepKey="s1" label="Steg 2" onStart={onStart} /></p>);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Starta timer 10 minuter" }));
    expect(onStart).toHaveBeenCalledWith({ key: "s1:1", label: "Steg 2", seconds: 600 });
  });

  it("shows plain text when there is no time, or no way to start", () => {
    render(<p><StepText text="Ugnen på 180 grader, 2 dl grädde." stepKey="s1" label="Steg 1" onStart={vi.fn()} /></p>);
    expect(screen.queryByRole("button")).toBeNull();
    render(<p><StepText text="Koka 10 min" stepKey="s1" label="Steg 1" /></p>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("TimerBar", () => {
  const timer = (overrides = {}) => ({ id: "a", label: "Steg 2", endsAt: Date.now() + 600_000, done: false, ...overrides });

  it("renders nothing without timers", () => {
    const { container } = render(<TimerBar timers={[]} onFinish={vi.fn()} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts down from the end time and calls onFinish once it is reached", () => {
    const onFinish = vi.fn();
    render(<TimerBar timers={[timer({ endsAt: Date.now() + 3000 })]} onFinish={onFinish} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("timer-time")).toHaveTextContent("0:03");
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("timer-time")).toHaveTextContent("0:02");
    expect(onFinish).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2000));
    expect(onFinish).toHaveBeenCalledWith("a");
    expect(screen.getByText("Klar")).toBeInTheDocument();
  });

  it("shows the right time after a long pause without ticks", () => {
    render(<TimerBar timers={[timer()]} onFinish={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("timer-time")).toHaveTextContent("10:00");
    // A locked phone: the clock moves on, the interval does not run, the page shows again.
    vi.setSystemTime(Date.now() + 240_000);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByTestId("timer-time")).toHaveTextContent("6:00");
  });

  it("stops and dismisses a timer from its button", () => {
    const onDismiss = vi.fn();
    render(<TimerBar timers={[timer(), timer({ id: "b", label: "Sås", done: true })]} onFinish={vi.fn()} onDismiss={onDismiss} />);
    const rows = screen.getAllByTestId("timer-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText("Klar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stoppa timer Steg 2" }));
    expect(onDismiss).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Stäng timer Sås" }));
    expect(onDismiss).toHaveBeenCalledWith("b");
  });
});

describe("useStepTimers", () => {
  it("starts, restarts the same time, finishes with a vibration once, and dismisses", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const { result } = renderHook(() => useStepTimers("recipe-1"));
    act(() => result.current.start({ key: "s1:0", label: "Steg 1", seconds: 60 }));
    act(() => result.current.start({ key: "s2:0", label: "Steg 2", seconds: 120 }));
    expect(result.current.timers.map((timer) => timer.id)).toEqual(["s1:0", "s2:0"]);
    act(() => result.current.start({ key: "s1:0", label: "Steg 1", seconds: 90 }));
    expect(result.current.timers.map((timer) => timer.id)).toEqual(["s2:0", "s1:0"]);

    act(() => result.current.finish("s2:0"));
    act(() => result.current.finish("s2:0"));
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(result.current.timers.find((timer) => timer.id === "s2:0")?.done).toBe(true);

    act(() => result.current.dismiss("s2:0"));
    expect(result.current.timers.map((timer) => timer.id)).toEqual(["s1:0"]);
  });

  it("keeps the timers per recipe in sessionStorage", () => {
    const first = renderHook(() => useStepTimers("recipe-1"));
    act(() => first.result.current.start({ key: "s1:0", label: "Steg 1", seconds: 60 }));
    first.unmount();
    const again = renderHook(() => useStepTimers("recipe-1"));
    expect(again.result.current.timers).toHaveLength(1);
    const other = renderHook(() => useStepTimers("recipe-2"));
    expect(other.result.current.timers).toEqual([]);
    act(() => again.result.current.dismiss("s1:0"));
    expect(sessionStorage.getItem("livskoll:step-timers:recipe-1")).toBeNull();
  });
});

describe("useWakeLock", () => {
  it("does nothing where wake lock is missing", () => {
    expect(() => renderHook(() => useWakeLock()).unmount()).not.toThrow();
  });

  it("holds a screen lock, asks again when the page shows, and releases on unmount", async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ released: false, release }));
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const { unmount } = renderHook(() => useWakeLock());
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");
    expect(request).toHaveBeenCalledTimes(1);

    // The browser released it while the page was hidden.
    request.mockImplementation(async () => ({ released: false, release }));
    const first = await request.mock.results[0]!.value;
    first.released = true;
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(request).toHaveBeenCalledTimes(2);

    unmount();
    expect(release).toHaveBeenCalled();
  });
});
