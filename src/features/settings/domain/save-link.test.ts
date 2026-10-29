import { describe, expect, it } from "vitest";
import { bookmarklet, importUrlPrefix } from "./save-link";

describe("save link", () => {
  it("builds the prefix from the origin", () => {
    expect(importUrlPrefix("http://localhost:3297")).toBe("http://localhost:3297/recept/importera?url=");
  });

  it("builds a bookmarklet that opens the import in a new tab with the encoded page address", () => {
    const code = bookmarklet("https://matkoll.example");
    expect(code.startsWith("javascript:")).toBe(true);
    expect(code).toContain('"https://matkoll.example/recept/importera?url="+encodeURIComponent(location.href)');
    expect(code).toContain('"_blank"');
  });
});
