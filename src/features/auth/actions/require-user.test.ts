import { beforeEach, describe, expect, it, vi } from "vitest";

// The checks only depend on getCurrentUser(), which returns null both without a
// session and for a session whose address is not in ALLOWED_EMAILS.
const getCurrentUser = vi.fn();
vi.mock("../data/queries", () => ({ getCurrentUser: () => getCurrentUser() }));

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const { requireUser, requireUserForRoute, requireUserOrRedirect } = await import("./require-user");

const user = { id: "8c1f0b9e-0000-4000-8000-000000000001", email: "pontus@example.com" };

beforeEach(() => {
  getCurrentUser.mockReset();
  redirect.mockClear();
});

describe("requireUser (actions)", () => {
  it("returns the user", async () => {
    getCurrentUser.mockResolvedValue(user);
    expect(await requireUser()).toEqual({ ok: true, data: user });
  });

  it("returns unauthorized without an allowed session", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await requireUser()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: expect.any(String) },
    });
  });
});

describe("requireUserOrRedirect (pages)", () => {
  it("returns the user", async () => {
    getCurrentUser.mockResolvedValue(user);
    expect(await requireUserOrRedirect("/recept")).toEqual(user);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to the login page with next", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireUserOrRedirect("/recept/1?a=b")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/logga-in?next=%2Frecept%2F1%3Fa%3Db");
  });
});

describe("requireUserForRoute (Route Handlers)", () => {
  it("returns the user", async () => {
    getCurrentUser.mockResolvedValue(user);
    expect(await requireUserForRoute()).toEqual({ user });
  });

  it("answers 401 with the unauthorized result", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { response } = await requireUserForRoute();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: expect.any(String) },
    });
  });
});
