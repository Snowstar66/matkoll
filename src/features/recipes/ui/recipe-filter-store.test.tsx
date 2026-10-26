import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recipeFilterStorageKey, resetRecipeFilterStore, useRecipeFilter } from "./recipe-filter-store";

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetRecipeFilterStore();
});

const blockWrites = () =>
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });

describe("useRecipeFilter", () => {
  it("reads and keeps the choice in localStorage", () => {
    window.localStorage.setItem(recipeFilterStorageKey, "favorites");
    const { result } = renderHook(() => useRecipeFilter());
    expect(result.current[0]).toBe("favorites");
    act(() => result.current[1]("all"));
    expect(result.current[0]).toBe("all");
    expect(window.localStorage.getItem(recipeFilterStorageKey)).toBe("all");
  });

  it("keeps the choice in memory when storage refuses it, and uses storage again once it works", () => {
    const setItem = blockWrites();
    const { result } = renderHook(() => useRecipeFilter());
    act(() => result.current[1]("favorites"));
    expect(result.current[0]).toBe("favorites");
    expect(window.localStorage.getItem(recipeFilterStorageKey)).toBeNull();

    setItem.mockRestore();
    act(() => result.current[1]("favorites"));
    expect(window.localStorage.getItem(recipeFilterStorageKey)).toBe("favorites");
    // Storage is the source again: a change there shows.
    window.localStorage.setItem(recipeFilterStorageKey, "all");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: recipeFilterStorageKey })));
    expect(result.current[0]).toBe("all");
  });

  it("probes storage on read, so the choice made meanwhile is saved when storage works again", () => {
    const setItem = blockWrites();
    const { result } = renderHook(() => useRecipeFilter());
    act(() => result.current[1]("favorites"));
    setItem.mockRestore();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(result.current[0]).toBe("favorites");
    expect(window.localStorage.getItem(recipeFilterStorageKey)).toBe("favorites");
  });

  it("is Alla when localStorage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useRecipeFilter());
    expect(result.current[0]).toBe("all");
  });

  it("follows another tab clearing storage (key null)", () => {
    window.localStorage.setItem(recipeFilterStorageKey, "favorites");
    const { result } = renderHook(() => useRecipeFilter());
    expect(result.current[0]).toBe("favorites");
    window.localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(result.current[0]).toBe("all");
  });
});
