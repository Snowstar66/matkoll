import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeAttempts } from "../domain/code-attempts";

const resendMail = vi.fn();
vi.mock("../data/auth", () => ({ resendConfirmation: (email: string, to: string) => resendMail(email, to) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"], SITE_URL: "http://localhost:3000" } }));
let attempts = createCodeAttempts();
vi.mock("./password-attempt-limit", () => ({
  resendAttempts: {
    isBlocked: (key: string) => attempts.isBlocked(key),
    recordFailure: (key: string) => attempts.recordFailure(key),
  },
}));

const { resendConfirmation } = await import("./resend-confirmation");

beforeEach(() => {
  vi.restoreAllMocks();
  resendMail.mockReset().mockResolvedValue({ ok: true });
  attempts = createCodeAttempts();
});

describe("resendConfirmation", () => {
  it("sends the mail again for an allowed address, with a safe next", async () => {
    expect(await resendConfirmation({ email: " Pontus@Example.com ", next: "/matsedel" })).toEqual({ ok: true, data: null });
    expect(resendMail).toHaveBeenCalledWith("pontus@example.com", "http://localhost:3000/auth/confirm?next=%2Fmatsedel");
  });

  it("answers the same and sends nothing for an address outside the list or when Supabase fails", async () => {
    expect(await resendConfirmation({ email: "annan@example.com" })).toEqual({ ok: true, data: null });
    expect(resendMail).not.toHaveBeenCalled();
    resendMail.mockResolvedValue({ ok: false, code: "unexpected_failure" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resendConfirmation({ email: "pontus@example.com" })).toEqual({ ok: true, data: null });
  });

  it("limits to five requests per address and IP, counting every address alike", async () => {
    for (let i = 0; i < 5; i++) await resendConfirmation({ email: "annan@example.com" });
    expect(await resendConfirmation({ email: "annan@example.com" })).toMatchObject({
      ok: false,
      error: { code: "auth_password_rate_limited" },
    });
  });
});
