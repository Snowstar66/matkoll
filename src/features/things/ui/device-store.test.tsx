import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastRoomKey, openCategoriesKey, resetDeviceStore, useLastRoom, useOpenCategories } from "./device-store";

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetDeviceStore();
});

describe("the last used room", () => {
  it("is kept per boende on the device", () => {
    const { result } = renderHook(() => useLastRoom("site-1"));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]("Garaget"));
    expect(result.current[0]).toBe("Garaget");
    expect(window.localStorage.getItem(lastRoomKey("site-1"))).toBe("Garaget");
    expect(renderHook(() => useLastRoom("site-2")).result.current[0]).toBeNull();
  });

  it("lives in memory when storage refuses it", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useLastRoom("site-1"));
    act(() => result.current[1]("Boden"));
    expect(result.current[0]).toBe("Boden");
  });
});

describe("the open categories", () => {
  it("are a list kept per room, and unknown until chosen", () => {
    const { result } = renderHook(() => useOpenCategories("s", "garaget"));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1](["Verktyg"]));
    expect(result.current[0]).toEqual(["Verktyg"]);
    expect(window.localStorage.getItem(openCategoriesKey("s", "garaget"))).toBe('["Verktyg"]');
  });

  it("reads a broken value as none open", () => {
    window.localStorage.setItem(openCategoriesKey("s", "garaget"), "{oops");
    expect(renderHook(() => useOpenCategories("s", "garaget")).result.current[0]).toEqual([]);
  });
});
