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
  it("refreshNow refreshes at once when not busy", () => {
    const { refresh, scheduler } = setup();
    scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshNow waits while busy, then refreshes once", () => {
    const { refresh, scheduler, busy } = setup({ current: true });
    scheduler.refreshNow();
    scheduler.refreshNow();
    vi.advanceTimersByTime(900);
    expect(refresh).not.toHaveBeenCalled();
    busy.current = false;
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancel drops a waiting refresh", () => {
    const { refresh, scheduler, busy } = setup({ current: true });
    scheduler.refreshNow();
    scheduler.cancel();
    busy.current = false;
    vi.advanceTimersByTime(1000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
