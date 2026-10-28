import { describe, expect, it } from "vitest";
import { createCodeAttempts, failedCodeWindowMs, maxFailedCodes } from "./code-attempts";

// The app's limit on wrong login codes (Story 11.6): 5 per address and client
// IP in 15 minutes, in memory.

const start = 1_000_000;

describe("code attempts", () => {
  it("allows 5 wrong codes and blocks the 6th attempt", () => {
    const attempts = createCodeAttempts();
    expect(maxFailedCodes).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(attempts.isBlocked("a|1.2.3.4", start)).toBe(false);
      attempts.recordFailure("a|1.2.3.4", start);
    }
    expect(attempts.isBlocked("a|1.2.3.4", start)).toBe(true);
  });

  it("counts each key on its own", () => {
    const attempts = createCodeAttempts();
    for (let i = 0; i < 5; i++) attempts.recordFailure("a|1.2.3.4", start);
    expect(attempts.isBlocked("a|1.2.3.4", start)).toBe(true);
    expect(attempts.isBlocked("a|5.6.7.8", start)).toBe(false);
    expect(attempts.isBlocked("b|1.2.3.4", start)).toBe(false);
  });

  it("opens again 15 minutes after the first wrong code", () => {
    const attempts = createCodeAttempts();
    expect(failedCodeWindowMs).toBe(15 * 60 * 1000);
    for (let i = 0; i < 5; i++) attempts.recordFailure("a|ip", start + i * 1000);
    expect(attempts.isBlocked("a|ip", start + failedCodeWindowMs - 1)).toBe(true);
    expect(attempts.isBlocked("a|ip", start + failedCodeWindowMs)).toBe(false);
    // A new window starts at the next wrong code.
    attempts.recordFailure("a|ip", start + failedCodeWindowMs);
    expect(attempts.isBlocked("a|ip", start + failedCodeWindowMs)).toBe(false);
  });

  it("forgets a key after a sign-in that worked", () => {
    const attempts = createCodeAttempts();
    for (let i = 0; i < 5; i++) attempts.recordFailure("a|ip", start);
    attempts.reset("a|ip");
    expect(attempts.isBlocked("a|ip", start)).toBe(false);
    expect(attempts.size()).toBe(0);
  });

  it("keeps at most maxKeys keys, dropping expired ones and then the oldest", () => {
    const attempts = createCodeAttempts({ maxKeys: 3, windowMs: 100 });
    attempts.recordFailure("old", start);
    attempts.recordFailure("k1", start + 50);
    attempts.recordFailure("k2", start + 60);
    // "old" has expired by now and goes first.
    attempts.recordFailure("k3", start + 120);
    expect(attempts.size()).toBe(3);
    // Nothing has expired: the oldest window, k1, goes.
    attempts.recordFailure("k4", start + 130);
    expect(attempts.size()).toBe(3);
    attempts.recordFailure("k1", start + 130);
    expect(attempts.size()).toBe(3);
  });
});
