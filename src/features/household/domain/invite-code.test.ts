import { describe, expect, it } from "vitest";
import { formatInviteCode, inviteCodeAlphabet, inviteLink, inviteShareText, inviteValidUntil, isInviteCodeShape, normalizeInviteCode } from "./invite-code";

describe("the invitation code (Story 21.2b)", () => {
  it("has no characters that are easy to mix up", () => {
    for (const char of "0O1IL") expect(inviteCodeAlphabet).not.toContain(char);
    expect(inviteCodeAlphabet).toHaveLength(31);
  });

  it("reads a code however it is typed", () => {
    expect(normalizeInviteCode(" k7q-4mp ")).toBe("K7Q4MP");
    expect(isInviteCodeShape("k7q 4mp")).toBe(true);
    expect(isInviteCodeShape("K7Q4M")).toBe(false);
    expect(isInviteCodeShape("K7Q4M0")).toBe(false);
    expect(isInviteCodeShape("")).toBe(false);
  });

  it("shows it 3+3 and links to /ga-med with it", () => {
    expect(formatInviteCode("K7Q4MP")).toBe("K7Q 4MP");
    expect(inviteLink("https://livskoll.vercel.app", "k7q 4mp")).toBe("https://livskoll.vercel.app/ga-med?kod=K7Q4MP");
  });

  it("writes the share text and the last valid day", () => {
    expect(inviteShareText({ inviter: "Pontus", household: "Hushållet Hellgren", link: "https://x/ga-med?kod=K7Q4MP", code: "K7Q 4MP", app: "Livskoll" })).toBe(
      "Pontus bjuder in dig till Hushållet Hellgren i Livskoll: https://x/ga-med?kod=K7Q4MP (kod K7Q4MP)",
    );
    expect(inviteValidUntil("2026-11-08T12:00:00Z")).toBe("8 nov");
  });
});
