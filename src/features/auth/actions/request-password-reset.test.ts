import { beforeEach, describe, expect, it, vi } from "vitest";

const requestResetMail = vi.fn();
vi.mock("../data/auth", () => ({
  requestPasswordReset: (email: string, redirectTo: string) => requestResetMail(email, redirectTo),
}));
vi.mock("@/server/env", () => ({
  env: { ALLOWED_EMAILS: ["pontus@example.com"], SITE_URL: "http://localhost:3000" },
}));

const { requestPasswordReset } = await import("./request-password-reset");

beforeEach(() => {
  requestResetMail.mockReset();
  vi.restoreAllMocks();
});

describe("requestPasswordReset", () => {
  it("mails the link to SITE_URL's /auth/confirm with a safe next", async () => {
    requestResetMail.mockResolvedValue({ ok: true });
    expect(await requestPasswordReset({ email: " Pontus@Example.com ", next: "/recept?flik=x" })).toEqual({
      ok: true,
      data: null,
    });
    expect(requestResetMail).toHaveBeenCalledWith(
      "pontus@example.com",
      "http://localhost:3000/auth/confirm?next=%2Frecept%3Fflik%3Dx",
    );
  });

  it("answers the same, and sends nothing, for an address outside the list", async () => {
    expect(await requestPasswordReset({ email: "annan@example.com" })).toEqual({ ok: true, data: null });
    expect(requestResetMail).not.toHaveBeenCalled();
  });

  it("answers the same when Supabase fails, and logs only the reason", async () => {
    requestResetMail.mockResolvedValue({ ok: false, code: "unexpected_failure" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await requestPasswordReset({ email: "pontus@example.com" })).toEqual({ ok: true, data: null });
    expect(JSON.stringify(log.mock.calls)).not.toContain("pontus@example.com");
  });

  it("validates the address", async () => {
    expect(await requestPasswordReset({ email: "inte-en-adress" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
  });
});
