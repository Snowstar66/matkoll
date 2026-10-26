import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMagicLink = vi.fn();
vi.mock("../data/auth", () => ({
  requestMagicLink: (email: string, redirectTo: string) => requestMagicLink(email, redirectTo),
}));
vi.mock("@/server/env", () => ({
  env: { ALLOWED_EMAILS: ["pontus@example.com"], SITE_URL: "http://localhost:3000" },
}));

const { sendMagicLink } = await import("./send-magic-link");

function form(email: string, next?: string) {
  const data = new FormData();
  data.set("email", email);
  if (next !== undefined) data.set("next", next);
  return data;
}

beforeEach(() => {
  requestMagicLink.mockReset();
  vi.restoreAllMocks();
});

describe("sendMagicLink", () => {
  it("sends the link to SITE_URL's /auth/confirm with a safe next", async () => {
    requestMagicLink.mockResolvedValue({ ok: true });
    expect(await sendMagicLink(null, form(" Pontus@Example.com ", "/recept?flik=x"))).toEqual({ ok: true, data: null });
    expect(requestMagicLink).toHaveBeenCalledWith(
      "pontus@example.com",
      "http://localhost:3000/auth/confirm?next=%2Frecept%3Fflik%3Dx",
    );
  });

  it("answers the same when Supabase refuses, and logs the code but not the address", async () => {
    requestMagicLink.mockResolvedValue({ ok: false, code: "over_email_send_rate_limit" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendMagicLink(null, form("pontus@example.com"))).toEqual({ ok: true, data: null });
    expect(log).toHaveBeenCalledWith("auth_magic_link_failed", "over_email_send_rate_limit");
    expect(JSON.stringify(log.mock.calls)).not.toContain("pontus@example.com");
  });

  it("answers the same for an address outside the list without calling Supabase", async () => {
    expect(await sendMagicLink(null, form("stranger@example.com"))).toEqual({ ok: true, data: null });
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("returns a validation error for an invalid address without calling Supabase", async () => {
    const result = await sendMagicLink(null, form("inte-en-adress"));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation", fields: { email: "Ange en giltig e-postadress." } },
    });
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("drops an unsafe next", async () => {
    requestMagicLink.mockResolvedValue({ ok: true });
    await sendMagicLink(null, form("pontus@example.com", "//evil.com"));
    expect(requestMagicLink).toHaveBeenCalledWith(
      "pontus@example.com",
      "http://localhost:3000/auth/confirm?next=%2Frecept",
    );
  });
});
