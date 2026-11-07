import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/eat-soon/notify: without a valid member session nothing is read or sent; with one, the household's due
// items go out as ONE notification, nothing due sends nothing, and the answer holds counts only.

const setSession = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());
const listHouseholdOldItems = vi.hoisted(() => vi.fn());
const pushConfig = vi.hoisted(() => vi.fn());
const sendEatSoonIn = vi.hoisted(() => vi.fn());

vi.mock("@/features/auth/server", () => ({ requireUser }));
vi.mock("@/features/pantry/server", () => ({ listHouseholdOldItems }));
vi.mock("@/lib/push-send", () => ({
  pushConfig,
  sendEatSoonIn,
  webPushSender: () => async () => "sent",
  PushSendError: class PushSendError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createKeyClient: () => ({ auth: { setSession } }), createClient: async () => ({ db: true }) }));

import { POST } from "./route";

const request = (headers: Record<string, string> = {}) => new Request("http://localhost/api/eat-soon/notify", { method: "POST", headers });
const good = { authorization: "Bearer access-token", "x-refresh-token": "refresh-token" };

beforeEach(() => {
  vi.resetAllMocks();
  setSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
  requireUser.mockResolvedValue({ ok: true, data: { id: "u", email: "a@b.se" } });
  pushConfig.mockReturnValue({ publicKey: "p", privateKey: "k", subject: "mailto:a@b.se" });
  listHouseholdOldItems.mockResolvedValue([{ ingredientId: "i1", name: "Köttfärs", days: 2, limit: 2 }]);
  sendEatSoonIn.mockResolvedValue({ devices: 2, sent: 2, failed: 0, dropped: 0 });
});

describe("POST /api/eat-soon/notify", () => {
  it.each([
    ["no headers", {}],
    ["no refresh token", { authorization: "Bearer access-token" }],
    ["no bearer", { "x-refresh-token": "r" }],
  ])("answers 401 and does nothing with %s", async (_name, headers) => {
    expect((await POST(request(headers))).status).toBe(401);
    expect(listHouseholdOldItems).not.toHaveBeenCalled();
    expect(sendEatSoonIn).not.toHaveBeenCalled();
  });

  it("answers 401 when Supabase refuses the session or the app does not let the user in", async () => {
    setSession.mockResolvedValue({ data: { session: null }, error: { code: "bad_jwt" } });
    expect((await POST(request(good))).status).toBe(401);
    setSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
    requireUser.mockResolvedValue({ ok: false, error: { code: "unauthorized", message: "" } });
    expect((await POST(request(good))).status).toBe(401);
    expect(sendEatSoonIn).not.toHaveBeenCalled();
  });

  it("sends one notification about the due items and answers counts only", async () => {
    const response = await POST(request(good));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { outcome: "sent", due: 1, sent: 2, failed: 0, dropped: 0 } });
    expect(sendEatSoonIn).toHaveBeenCalledTimes(1);
    expect(sendEatSoonIn.mock.calls[0][1]).toEqual([{ name: "Köttfärs", today: true }]);
  });

  it("answers already when today's send was made", async () => {
    sendEatSoonIn.mockResolvedValue({ devices: 0, sent: 0, failed: 0, dropped: 0 });
    expect(await (await POST(request(good))).json()).toEqual({ ok: true, data: { outcome: "already", due: 1, sent: 0, failed: 0, dropped: 0 } });
  });

  it("sends nothing when nothing is due", async () => {
    listHouseholdOldItems.mockResolvedValue([]);
    expect(await (await POST(request(good))).json()).toEqual({ ok: true, data: { outcome: "none", due: 0, sent: 0, failed: 0, dropped: 0 } });
    expect(sendEatSoonIn).not.toHaveBeenCalled();
  });

  it("answers unavailable without the push keys or when the items cannot be read", async () => {
    pushConfig.mockReturnValue(null);
    expect(((await (await POST(request(good))).json()) as { data: { outcome: string } }).data.outcome).toBe("unavailable");
    pushConfig.mockReturnValue({ publicKey: "p", privateKey: "k", subject: "s" });
    listHouseholdOldItems.mockRejectedValue(new Error("boom"));
    expect(((await (await POST(request(good))).json()) as { data: { outcome: string } }).data.outcome).toBe("unavailable");
    expect(sendEatSoonIn).not.toHaveBeenCalled();
  });
});
