import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./use-wake-lock";

// useWakeLock against a fake navigator.wakeLock: jsdom has none, which is the
// "no support" case.

class FakeSentinel extends EventTarget {
  readonly type = "screen";
  released = false;
  release = vi.fn(async () => this.systemRelease());
  /** What the browser does when it lets go of the lock, e.g. when the page is hidden. */
  systemRelease() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}

type Pending = { resolve: (sentinel: FakeSentinel) => void; reject: (error: unknown) => void };

/**
 * Installs navigator.wakeLock. By default every request is granted at once;
 * with `manual`, each waits in `pending` until the test answers it.
 */
function installWakeLock({ manual = false } = {}) {
  const sentinels: FakeSentinel[] = [];
  const pending: Pending[] = [];
  const request = vi.fn(
    (type: string) =>
      new Promise<FakeSentinel>((resolve, reject) => {
        expect(type).toBe("screen");
        const grant = (sentinel: FakeSentinel) => {
          sentinels.push(sentinel);
          resolve(sentinel);
        };
        if (manual) pending.push({ resolve: grant, reject });
        else grant(new FakeSentinel());
      }),
  );
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels, pending };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets the hook's awaited request settle. */
const settle = () => act(async () => {});

afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  delete (document as { visibilityState?: unknown }).visibilityState;
});

describe("useWakeLock", () => {
  it("requests the screen lock when active, and says nothing when it is granted", async () => {
    const { request } = installWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.unavailable).toBe(false);
  });

  it("requests nothing while not active", async () => {
    const { request } = installWakeLock();
    const { result } = renderHook(() => useWakeLock(false));
    await settle();
    expect(request).not.toHaveBeenCalled();
    expect(result.current.unavailable).toBe(false);
  });

  it("releases the lock when it stops being active and when it unmounts", async () => {
    const { sentinels } = installWakeLock();
    const { rerender, unmount } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    await settle();
    rerender({ active: false });
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    rerender({ active: true });
    await settle();
    expect(sentinels).toHaveLength(2);
    unmount();
    expect(sentinels[1].release).toHaveBeenCalledTimes(1);
  });

  it("requests the lock again when the page becomes visible after the browser let go of it", async () => {
    const { request, sentinels } = installWakeLock();
    renderHook(() => useWakeLock(true));
    await settle();
    // The browser lets go of the lock as the page is hidden.
    setVisibility("hidden");
    sentinels[0].systemRelease();
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("asks for no second lock while it holds one, and stops listening once inactive", async () => {
    const { request } = installWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await settle();
    setVisibility("visible");
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    unmount();
    setVisibility("hidden");
    setVisibility("visible");
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("asks once more when the system lets go while the page is visible, and shows no line when that works", async () => {
    const { request, sentinels } = installWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await settle();
    sentinels[0].systemRelease();
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(sentinels[1].released).toBe(false);
    expect(result.current.unavailable).toBe(false);
  });

  it("shows the line when the system lets go again before the page is next shown, and asks again when it is", async () => {
    const { request, sentinels } = installWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await settle();
    sentinels[0].systemRelease();
    await settle();
    sentinels[1].systemRelease();
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.unavailable).toBe(true);
    setVisibility("hidden");
    setVisibility("visible");
    await settle();
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.current.unavailable).toBe(false);
  });

  it("shows the line when the request after the system let go is refused", async () => {
    const { pending } = installWakeLock({ manual: true });
    const { result } = renderHook(() => useWakeLock(true));
    const first = new FakeSentinel();
    await act(async () => pending[0].resolve(first));
    await act(async () => first.systemRelease());
    expect(pending).toHaveLength(2);
    await act(async () => pending[1].reject(new DOMException("Not allowed", "NotAllowedError")));
    expect(result.current.unavailable).toBe(true);
  });

  it("asks again after a refused request when the page became visible while it was under way", async () => {
    const { pending } = installWakeLock({ manual: true });
    const { result } = renderHook(() => useWakeLock(true));
    setVisibility("hidden");
    setVisibility("visible");
    expect(pending).toHaveLength(1);
    await act(async () => pending[0].reject(new DOMException("Not allowed", "NotAllowedError")));
    expect(pending).toHaveLength(2);
    await act(async () => pending[1].resolve(new FakeSentinel()));
    expect(result.current.unavailable).toBe(false);
  });

  it("asks nothing more when the request under way is granted", async () => {
    const { request, pending } = installWakeLock({ manual: true });
    renderHook(() => useWakeLock(true));
    setVisibility("hidden");
    setVisibility("visible");
    await act(async () => pending[0].resolve(new FakeSentinel()));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not show the line for a refusal while the page is hidden, and asks again when it shows", async () => {
    const { pending } = installWakeLock({ manual: true });
    const { result } = renderHook(() => useWakeLock(true));
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => pending[0].reject(new DOMException("Not allowed", "NotAllowedError")));
    expect(result.current.unavailable).toBe(false);
    expect(pending).toHaveLength(1);
    setVisibility("visible");
    expect(pending).toHaveLength(2);
    await act(async () => pending[1].resolve(new FakeSentinel()));
    expect(result.current.unavailable).toBe(false);
  });

  it("is unavailable without support, and does not fail", async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await settle();
    expect("wakeLock" in navigator).toBe(false);
    expect(result.current.unavailable).toBe(true);
  });

  it("is unavailable when the request is refused, without logging, and available again once a later one succeeds", async () => {
    const error = vi.spyOn(console, "error");
    const { pending } = installWakeLock({ manual: true });
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => pending[0].reject(new DOMException("Not allowed", "NotAllowedError")));
    expect(result.current.unavailable).toBe(true);
    setVisibility("hidden");
    setVisibility("visible");
    expect(pending).toHaveLength(2);
    await act(async () => pending[1].resolve(new FakeSentinel()));
    expect(result.current.unavailable).toBe(false);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("asks nothing while the page is hidden, and asks when it shows", async () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const { request } = installWakeLock();
    renderHook(() => useWakeLock(true));
    await settle();
    expect(request).not.toHaveBeenCalled();
    setVisibility("visible");
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("releases a lock granted after it stopped being active at once, and shows no line", async () => {
    const { pending } = installWakeLock({ manual: true });
    const { result, rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    rerender({ active: false });
    const late = new FakeSentinel();
    await act(async () => pending[0].resolve(late));
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(result.current.unavailable).toBe(false);
  });

  it("ignores a refusal that comes after it stopped being active", async () => {
    const { pending } = installWakeLock({ manual: true });
    const { result, rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    rerender({ active: false });
    await act(async () => pending[0].reject(new DOMException("Not allowed", "NotAllowedError")));
    expect(result.current.unavailable).toBe(false);
  });

  it("ignores a release that fails", async () => {
    const { sentinels } = installWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await settle();
    sentinels[0].release.mockRejectedValueOnce(new Error("gone"));
    expect(() => unmount()).not.toThrow();
    await settle();
  });
});
