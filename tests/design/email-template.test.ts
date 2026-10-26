import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The magic link e-mail (AD-3, Story 11.6): the link first, then the code. The
// same file goes into the cloud (docs/drift.md, step 5).

const root = fileURLToPath(new URL("../../", import.meta.url));
const template = readFileSync(`${root}supabase/templates/magic-link.html`, "utf8");
const config = readFileSync(`${root}supabase/config.toml`, "utf8");

describe("magic link e-mail", () => {
  it("has the link to /auth/confirm as its first link", () => {
    expect(template.match(/href="([^"]+)"/)?.[1]).toBe("{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email");
  });

  it("has the six-digit code after the link, with the text before it", () => {
    const link = template.indexOf("token_hash");
    const text = template.indexOf("Eller skriv in koden i Matkoll:");
    const code = template.indexOf("{{ .Token }}");
    expect(link).toBeGreaterThan(0);
    expect(text).toBeGreaterThan(link);
    expect(code).toBeGreaterThan(text);
  });

  it("is the template local Supabase uses, with six digits that last an hour", () => {
    expect(config).toMatch(/\[auth\.email\.template\.magic_link\][^[]*content_path = "\.\/supabase\/templates\/magic-link\.html"/);
    expect(config).toMatch(/^otp_length = 6$/m);
    expect(config).toMatch(/^otp_expiry = 3600$/m);
  });
});
