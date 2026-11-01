import { describe, expect, it } from "vitest";
import { cleanName, heirOf, initialOf, isMemberColor, type Member, memberCountText, memberNamesText } from "./member";

const member = (name: string, joinedAt: string, isMe = false): Member => ({
  userId: name.toLowerCase(),
  name,
  email: `${name.toLowerCase()}@example.se`,
  role: isMe ? "owner" : "member",
  color: "mint",
  joinedAt,
  named: true,
  isMe,
});

describe("the members (Story 21.2b)", () => {
  it("writes names, counts and initials", () => {
    expect(memberNamesText([{ name: "Pontus" }, { name: "Martina" }])).toBe("Pontus, Martina");
    expect(memberCountText(1)).toBe("1 medlem");
    expect(memberCountText(2)).toBe("2 medlemmar");
    expect(initialOf(" åsa")).toBe("Å");
    expect(initialOf("")).toBe("?");
    expect(cleanName("  Anna   Lena ")).toBe("Anna Lena");
  });

  it("knows the four shades", () => {
    expect(isMemberColor("lila")).toBe(true);
    expect(isMemberColor("red")).toBe(false);
  });

  it("gives the ownership to the one who has been there longest", () => {
    const members = [member("Pontus", "2026-01-01", true), member("Kalle", "2026-03-01"), member("Martina", "2026-02-01")];
    expect(heirOf(members)?.name).toBe("Martina");
    expect(heirOf([members[0]!])).toBeNull();
  });
});
