import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { handOverPlacePhoto, takeHandedOverPhoto, useHandedOverLocation } from "./photo-handover";

describe("the photo handed over from the welcome tour (Story 20.1)", () => {
  it("is taken once, only by its own location", () => {
    const { result } = renderHook(() => useHandedOverLocation());
    expect(result.current).toBeNull();
    const photo = new File(["x"], "kylen.jpg", { type: "image/jpeg" });
    act(() => handOverPlacePhoto(photo, "Kyl"));
    expect(result.current).toBe("Kyl");
    expect(takeHandedOverPhoto("Frys")).toBeNull();
    act(() => {
      expect(takeHandedOverPhoto("Kyl")).toBe(photo);
    });
    expect(takeHandedOverPhoto("Kyl")).toBeNull();
    expect(result.current).toBeNull();
  });
});
