import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "./new-id";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newId", () => {
  it("gives a version 4 UUID", () => {
    expect(newId()).toMatch(uuidV4);
    expect(newId()).not.toBe(newId());
  });

  it("makes one from random bytes where randomUUID is missing", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });
    expect(newId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
});
