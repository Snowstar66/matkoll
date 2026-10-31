import { describe, expect, it } from "vitest";
import { bearerKey, hashApiKey, looksLikeApiKey, newApiKey } from "./api-key";

describe("api key", () => {
  it("makes 32 random bytes as a key with a prefix, and hashes it to 64 hex characters", () => {
    const key = newApiKey();
    expect(looksLikeApiKey(key)).toBe(true);
    expect(newApiKey()).not.toBe(key);
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toContain(key);
  });

  it("reads only a well-formed Bearer key", () => {
    const key = newApiKey();
    expect(bearerKey(`Bearer ${key}`)).toBe(key);
    expect(bearerKey(`bearer ${key}`)).toBe(key);
    expect(bearerKey(`Bearer ${key}x`)).toBeNull();
    expect(bearerKey(`Basic ${key}`)).toBeNull();
    expect(bearerKey(null)).toBeNull();
    expect(bearerKey("Bearer ")).toBeNull();
  });
});
