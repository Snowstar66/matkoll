import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const { householdLetsIn } = await import("./household-access");

const db = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) }) as never;
const row = (email: string, isMe = false) => ({ email, is_me: isMe });

describe("householdLetsIn (Story 21.2b)", () => {
  it("lets in a member of a household with someone on the list", async () => {
    expect(await householdLetsIn(db([row("pontus@example.com"), row("martina@example.se", true)]), ["pontus@example.com"])).toBe(true);
  });

  it("does not let in someone alone, or in a household with no one on the list", async () => {
    expect(await householdLetsIn(db([row("martina@example.se", true)]), ["pontus@example.com"])).toBe(false);
    expect(await householdLetsIn(db([row("anna@example.se"), row("martina@example.se", true)]), ["pontus@example.com"])).toBe(false);
  });

  it("lets no one in when the members cannot be read or the list is empty", async () => {
    expect(await householdLetsIn(db(null, { code: "42501" }), ["pontus@example.com"])).toBe(false);
    expect(await householdLetsIn(db([row("pontus@example.com", true)]), [])).toBe(false);
  });
});
