import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { busyWaitMs, idleAfterMs, idleRefreshMs, listRefreshMs, liveRefreshMs, useLiveRefresh } from "./use-live-refresh";

const refresh = vi.fn();
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let visibility: DocumentVisibilityState = "visible";
let online = true;

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function setOnline(next: boolean) {
  online = next;
  act(() => {
    window.dispatchEvent(new Event(next ? "online" : "offline"));
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  visibility = "visible";
  online = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useLiveRefresh", () => {
  it("reads the page again every interval while visible and online, not at mount", () => {
    renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    expect(refresh).not.toHaveBeenCalled();
    advance(listRefreshMs - 1);
    expect(refresh).not.toHaveBeenCalled();
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(listRefreshMs * 3);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("uses 10 s when no interval is given", () => {
    renderHook(() => useLiveRefresh({ busy: false }));
    advance(liveRefreshMs - 1);
    expect(refresh).not.toHaveBeenCalled();
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops while the tab is hidden and reads at once when it is shown again", () => {
    renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    setVisibility("hidden");
    advance(listRefreshMs * 5);
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(listRefreshMs);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops while offline and reads at once when the connection is back", () => {
    renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    setOnline(false);
    advance(listRefreshMs * 5);
    expect(refresh).not.toHaveBeenCalled();
    // Shown again while still offline: nothing, the read would fail.
    setVisibility("hidden");
    setVisibility("visible");
    advance(listRefreshMs * 2);
    expect(refresh).not.toHaveBeenCalled();
    setOnline(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(listRefreshMs);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("never reads offline when it starts offline", () => {
    online = false;
    renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    advance(listRefreshMs * 3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not read while paused (queued offline ticks wait) and resumes after", () => {
    const { rerender } = renderHook(({ paused }) => useLiveRefresh({ intervalMs: listRefreshMs, busy: false, paused }), {
      initialProps: { paused: true },
    });
    advance(listRefreshMs * 3);
    expect(refresh).not.toHaveBeenCalled();
    rerender({ paused: false });
    advance(listRefreshMs);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("waits while this device saves, so its optimistic state is not read over", () => {
    const { rerender } = renderHook(({ busy }) => useLiveRefresh({ intervalMs: listRefreshMs, busy }), {
      initialProps: { busy: true },
    });
    advance(listRefreshMs + busyWaitMs * 4);
    expect(refresh).not.toHaveBeenCalled();
    rerender({ busy: false });
    advance(busyWaitMs);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops when the page goes away", () => {
    const { unmount } = renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    unmount();
    advance(listRefreshMs * 3);
    setVisibility("visible");
    setOnline(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("slows to once a minute after five minutes without use, and reads at once on the next touch", () => {
    renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    advance(idleAfterMs);
    expect(refresh).toHaveBeenCalledTimes(idleAfterMs / listRefreshMs);
    refresh.mockClear();
    // Idle now: the next reads come a minute apart.
    advance(idleRefreshMs - 1);
    expect(refresh).not.toHaveBeenCalled();
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(idleRefreshMs);
    expect(refresh).toHaveBeenCalledTimes(2);
    // A touch: read at once, then the normal pace again.
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(refresh).toHaveBeenCalledTimes(3);
    advance(listRefreshMs);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("stays at the normal pace while the page is used, and a key, touch or scroll counts", () => {
    renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    for (const type of ["keydown", "touchstart", "scroll", "pointerdown"]) {
      advance(idleAfterMs - listRefreshMs);
      act(() => {
        window.dispatchEvent(new Event(type));
      });
    }
    refresh.mockClear();
    // Not idle: a touch reads nothing extra, and the next read comes on time.
    act(() => {
      window.dispatchEvent(new Event("keydown"));
    });
    expect(refresh).not.toHaveBeenCalled();
    advance(listRefreshMs);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the idle pace off while hidden or offline, and showing the tab again counts as use", () => {
    renderHook(() => useLiveRefresh({ intervalMs: listRefreshMs, busy: false }));
    setVisibility("hidden");
    advance(idleAfterMs * 2);
    // A touch while hidden reads nothing.
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(listRefreshMs);
    expect(refresh).toHaveBeenCalledTimes(2);
    // Idle and offline: a touch reads nothing until the connection is back.
    advance(idleAfterMs);
    refresh.mockClear();
    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    advance(idleRefreshMs * 2);
    expect(refresh).not.toHaveBeenCalled();
    setOnline(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("an idle read still waits while this device saves", () => {
    const { rerender } = renderHook(({ busy }) => useLiveRefresh({ intervalMs: listRefreshMs, busy }), {
      initialProps: { busy: false },
    });
    advance(idleAfterMs);
    rerender({ busy: true });
    refresh.mockClear();
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(refresh).not.toHaveBeenCalled();
    rerender({ busy: false });
    advance(busyWaitMs);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
