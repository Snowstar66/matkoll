import { describe, expect, it } from "vitest";
import { compareDomains, domainNameMessage, domainNameSchema, normalizeDomainName } from "./domain-name";

describe("normalizeDomainName", () => {
  it.each([
    ["koket.se", "koket.se"],
    ["  Koket.SE ", "koket.se"],
    ["www.koket.se", "koket.se"],
    ["https://www.koket.se/recept/kladdkaka?x=1#steg", "koket.se"],
    ["http://tasteline.com", "tasteline.com"],
    ["koket.se:443/recept", "koket.se"],
    ["koket.se.", "koket.se"],
    ["recept.ica.se", "recept.ica.se"],
    ["räksmörgås.se", "xn--rksmrgs-5wao1o.se"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDomainName(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "koket",
    "localhost",
    "127.0.0.1",
    "https://127.0.0.1/recept",
    "[::1]",
    "https://[::1]/",
    "ftp://koket.se",
    "javascript:alert(1)",
    "koket..se",
    "-koket.se",
    "kok et.se",
    `${"a".repeat(64)}.se`,
    `${"a.".repeat(126)}se`,
  ])("refuses %j", (input) => {
    expect(normalizeDomainName(input)).toBeNull();
  });
});

describe("domainNameSchema", () => {
  it("gives the stored form", () => {
    expect(domainNameSchema.parse("https://www.Tasteline.com/recept/")).toBe("tasteline.com");
  });

  it("explains what to type", () => {
    const result = domainNameSchema.safeParse("inte en domän");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(domainNameMessage);
  });
});

describe("compareDomains", () => {
  it("sorts by code unit, whatever the locale", () => {
    expect(["tasteline.com", "koket.se", "arla.se", "a-b.se", "a.se", "ica.se"].sort(compareDomains)).toEqual([
      "a-b.se",
      "a.se",
      "arla.se",
      "ica.se",
      "koket.se",
      "tasteline.com",
    ]);
    expect(compareDomains("koket.se", "koket.se")).toBe(0);
  });
});
