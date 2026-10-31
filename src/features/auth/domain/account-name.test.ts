import { describe, expect, it } from "vitest";
import { accountOf } from "./account-name";

describe("accountOf", () => {
  it("takes the first part of the address as the name and its first letter as the initial", () => {
    expect(accountOf("pontus@matkoll.local")).toEqual({ name: "Pontus", email: "pontus@matkoll.local", initial: "P" });
    expect(accountOf("pontus.hellgren@cgi.com")).toMatchObject({ name: "Pontus", initial: "P" });
    expect(accountOf("åsa_k@example.se")).toMatchObject({ name: "Åsa", initial: "Å" });
  });

  it("falls back to the whole address and a question mark for an address with no readable start", () => {
    expect(accountOf("@example.se")).toMatchObject({ name: "@example.se", initial: "@" });
  });
});
