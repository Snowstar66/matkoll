import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRefreshScheduler } from "./refresh-scheduler";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(busy = { current: false }) {
  const refresh = vi.fn();
  const scheduler = createRefreshScheduler({ delayMs: 300, isBusy: () => busy.current, refresh });
  return { refresh, scheduler, busy };
}

describe("createRefreshScheduler", () => {
  it("refreshes once, delayMs after a burst of events", () => {
    const { refresh, scheduler } = setup();
    scheduler.notify();
    vi.advanceTimersByTime(100);
    scheduler.notify();
    scheduler.notify();
    vi.advanceTimersByTime(199);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("waits while this device is saving, then refreshes once", () => {
    const { refresh, scheduler, busy } = setup({ current: true });
    scheduler.notify();
    vi.advanceTimersByTime(900);
    expect(refresh).not.toHaveBeenCalled();
    busy.current = false;
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("handles a later event after a refresh", () => {
    const { refresh, scheduler } = setup();
    scheduler.notify();
    vi.advanceTimersByTime(300);
    scheduler.notify();
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshNow refreshes at once, or leaves it to a waiting refresh", () => {
    const { refresh, scheduler } = setup();
    scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.notify();
    scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshNow waits while busy", () => {
    const { refresh, scheduler, busy } = setup({ current: true });
    scheduler.refreshNow();
    expect(refresh).not.toHaveBeenCalled();
    busy.current = false;
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancel drops a waiting refresh", () => {
    const { refresh, scheduler } = setup();
    scheduler.notify();
    scheduler.cancel();
    vi.advanceTimersByTime(1000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
