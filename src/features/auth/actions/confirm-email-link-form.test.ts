import { beforeEach, describe, expect, it, vi } from "vitest";

// "Logga in" on /auth/confirm (Story 11.6): the token is used only on POST, and
// `next` is handled as before the change.

const confirmEmailLink = vi.fn();
vi.mock("./confirm-email-link", () => ({ confirmEmailLink: (hash: string) => confirmEmailLink(hash) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));

const { confirmEmailLinkForm } = await import("./confirm-email-link-form");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  confirmEmailLink.mockReset();
});

describe("confirmEmailLinkForm", () => {
  it("signs in and goes to next", async () => {
    confirmEmailLink.mockResolvedValue("signed_in");
    await expect(confirmEmailLinkForm(form({ token_hash: "hash", next: "/recept?flik=x" }))).rejects.toThrow(
      "NEXT_REDIRECT /recept?flik=x",
    );
    expect(confirmEmailLink).toHaveBeenCalledWith("hash");
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "/%5Cevil"])("ignores the unsafe next %s", async (next) => {
    confirmEmailLink.mockResolvedValue("signed_in");
    await expect(confirmEmailLinkForm(form({ token_hash: "hash", next }))).rejects.toThrow("NEXT_REDIRECT /recept");
  });

  it("sends an invalid or used link to the login page with fel=lank and next", async () => {
    confirmEmailLink.mockResolvedValue("invalid");
    await expect(confirmEmailLinkForm(form({ token_hash: "hash", next: "/matsedel" }))).rejects.toThrow(
      "NEXT_REDIRECT /logga-in?fel=lank&next=%2Fmatsedel",
    );
  });

  it("does not ask Supabase without a token", async () => {
    await expect(confirmEmailLinkForm(form({ next: "/recept" }))).rejects.toThrow("fel=lank");
    expect(confirmEmailLink).not.toHaveBeenCalled();
  });

  it("sends an address outside the list to fel=atkomst", async () => {
    confirmEmailLink.mockResolvedValue("not_allowed");
    await expect(confirmEmailLinkForm(form({ token_hash: "hash" }))).rejects.toThrow("NEXT_REDIRECT /logga-in?fel=atkomst");
  });
});
