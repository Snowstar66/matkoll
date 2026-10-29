import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { keyedItemId } = await import("./keyed-item-id");

describe("keyedItemId", () => {
  it("gives the same uuid for the same key and another for another key", () => {
    const id = keyedItemId("offer-1");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(keyedItemId("offer-1")).toBe(id);
    expect(keyedItemId("offer-2")).not.toBe(id);
  });
});
