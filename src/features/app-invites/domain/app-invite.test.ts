import { describe, expect, it } from "vitest";
import { appInviteLink, appInviteShareText, appInviteStatusText, formatAppInviteCode, isAppInviteCodeShape, isPlausibleEmail } from "./app-invite";

describe("app invitation codes", () => {
  it("accepts 8 characters of the alphabet, with spaces, dashes and small letters", () => {
    expect(isAppInviteCodeShape("K7Q4MP2X")).toBe(true);
    expect(isAppInviteCodeShape("k7q4 mp2x")).toBe(true);
    expect(isAppInviteCodeShape("k7q4-mp2x")).toBe(true);
  });

  it("refuses other lengths and the characters that are left out", () => {
    for (const raw of ["", "K7Q4MP", "K7Q4MP2XA", "K7Q4MP0X", "K7Q4MP1X", "K7Q4MPOX"]) expect(isAppInviteCodeShape(raw), raw).toBe(false);
  });

  it("shows a code 4+4 and links to the join page", () => {
    expect(formatAppInviteCode("k7q4mp2x")).toBe("K7Q4 MP2X");
    expect(appInviteLink("https://livskoll.vercel.app", "k7q4 mp2x")).toBe("https://livskoll.vercel.app/inbjudan?kod=K7Q4MP2X");
  });

  it("writes the share text with the link and the code", () => {
    const text = appInviteShareText({ inviter: "Pontus", link: "https://x.se/inbjudan?kod=K7Q4MP2X", code: "K7Q4 MP2X", app: "Livskoll" });
    expect(text).toContain("Pontus bjuder in dig till Livskoll: https://x.se/inbjudan?kod=K7Q4MP2X (kod K7Q4MP2X)");
  });
});

describe("isPlausibleEmail", () => {
  it("accepts an address and refuses what is not one", () => {
    expect(isPlausibleEmail(" anna@example.se ")).toBe(true);
    for (const raw of ["", "anna", "anna@", "@example.se", "anna@example", "a b@example.se", "a@example.se, b@example.se"]) expect(isPlausibleEmail(raw), raw).toBe(false);
  });
});

describe("appInviteStatusText", () => {
  const invite = { id: "1", email: "a@b.se", createdAt: "2026-11-07T10:00:00Z", expiresAt: "2026-11-14T10:00:00Z", accepted: false };
  const until = () => "14 nov";
  it("says what the invitation waits for", () => {
    expect(appInviteStatusText(invite, new Date("2026-11-08T10:00:00Z"), until)).toBe("Väntar på konto · gäller till 14 nov");
    expect(appInviteStatusText(invite, new Date("2026-11-20T10:00:00Z"), until)).toBe("Koden har gått ut");
    expect(appInviteStatusText({ ...invite, accepted: true }, new Date("2026-11-20T10:00:00Z"), until)).toBe("Har konto");
  });
});
