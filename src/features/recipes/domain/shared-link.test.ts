import { describe, expect, it } from "vitest";
import { extractHttpsUrl, readSharedLink, validImportUrl } from "./shared-link";

describe("extractHttpsUrl", () => {
  it("takes the first https address out of shared text", () => {
    expect(extractHttpsUrl("Kolla: https://www.koket.se/pasta. Gott!")).toBe("https://www.koket.se/pasta");
    expect(extractHttpsUrl("http://a.se https://b.se/x https://c.se")).toBe("https://b.se/x");
  });
  it("finds nothing without one", () => {
    expect(extractHttpsUrl("ingen länk här")).toBeNull();
  });
});

describe("validImportUrl", () => {
  it("accepts https", () => expect(validImportUrl(" https://www.koket.se/a?b=1 ")).toBe("https://www.koket.se/a?b=1"));
  it.each(["http://www.koket.se/a", "https://u:p@www.koket.se/a", "javascript:alert(1)", "koket.se", "", "https://"])(
    "rejects %s",
    (value) => expect(validImportUrl(value)).toBeNull(),
  );
  it("rejects a link over 2 048 characters", () => {
    expect(validImportUrl(`https://www.koket.se/${"a".repeat(2048)}`)).toBeNull();
  });
});

describe("readSharedLink", () => {
  it("uses url first", () => {
    expect(readSharedLink({ url: "https://www.koket.se/a", text: "https://b.se" })).toEqual({
      status: "ok",
      url: "https://www.koket.se/a",
    });
  });
  it("falls back to the address in text", () => {
    expect(readSharedLink({ text: "Pasta https://www.koket.se/a" })).toEqual({ status: "ok", url: "https://www.koket.se/a" });
  });
  it("says none or invalid", () => {
    expect(readSharedLink({})).toEqual({ status: "none" });
    expect(readSharedLink({ url: "http://x.se" })).toEqual({ status: "invalid", value: "http://x.se" });
  });
});
