import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/offer-ideas/prepare: without a valid member session (both tokens, accepted by Supabase) nothing is
// claimed and the model is never asked; with one, the run is the app's and the answer is the outcome only.

const prepare = vi.hoisted(() => vi.fn());
const setSession = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());

vi.mock("@/features/suggestions/server", () => ({ prepareOfferIdeasNow: prepare }));
vi.mock("@/features/auth/server", () => ({ requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createKeyClient: () => ({ auth: { setSession } }) }));

import { POST } from "./route";

const request = (headers: Record<string, string> = {}) => new Request("http://localhost/api/offer-ideas/prepare", { method: "POST", headers });
const good = { authorization: "Bearer access-token", "x-refresh-token": "refresh-token" };

beforeEach(() => {
  vi.resetAllMocks();
  setSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
  requireUser.mockResolvedValue({ ok: true, data: { id: "u", email: "a@b.se" } });
  prepare.mockResolvedValue("prepared");
});

describe("POST /api/offer-ideas/prepare", () => {
  it.each([
    ["no headers", {}],
    ["no refresh token", { authorization: "Bearer access-token" }],
    ["no bearer", { "x-refresh-token": "r" }],
    ["a wrong scheme", { authorization: "Basic abc", "x-refresh-token": "r" }],
  ])("answers 401 and runs nothing with %s", async (_name, headers) => {
    const response = await POST(request(headers));
    expect(response.status).toBe(401);
    expect(setSession).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("answers 401 and runs nothing when Supabase refuses the session", async () => {
    setSession.mockResolvedValue({ data: { session: null }, error: { code: "bad_jwt" } });
    expect((await POST(request(good))).status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("answers 401 and runs nothing for a user the app does not let in", async () => {
    requireUser.mockResolvedValue({ ok: false, error: { code: "unauthorized", message: "" } });
    expect((await POST(request(good))).status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("prepares the set and answers the outcome only", async () => {
    const response = await POST(request(good));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { outcome: "prepared" } });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("answers a set that is there already as skipped", async () => {
    prepare.mockResolvedValue("skipped");
    expect(await (await POST(request(good))).json()).toEqual({ ok: true, data: { outcome: "skipped" } });
  });
});
