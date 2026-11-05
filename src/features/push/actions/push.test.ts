import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const pushConfig = vi.fn();
vi.mock("@/lib/push-send", () => ({ pushConfig: () => pushConfig() }));
const db = { id: "db" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const savePreferencesIn = vi.fn();
const saveSubscriptionIn = vi.fn();
const removeSubscriptionIn = vi.fn();
vi.mock("../data/push", () => ({
  PushDataError: class extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
  savePreferencesIn: (...args: unknown[]) => savePreferencesIn(...args),
  saveSubscriptionIn: (...args: unknown[]) => saveSubscriptionIn(...args),
  removeSubscriptionIn: (...args: unknown[]) => removeSubscriptionIn(...args),
}));

const { savePushPreferences, subscribePush, unsubscribePush } = await import("./push");
const { PushDataError } = await import("../data/push");

const device = { endpoint: "https://push.example/abc", p256dh: "key", auth: "secret" };
const choices = { lista: true, forrad: false, matsedel: true, lappar: true };

beforeEach(() => {
  for (const mock of [requireUser, pushConfig, savePreferencesIn, saveSubscriptionIn, removeSubscriptionIn]) mock.mockReset();
  requireUser.mockResolvedValue({ ok: true, data: { id: "u1" } });
  pushConfig.mockReturnValue({ publicKey: "pub", privateKey: "priv", subject: "mailto:me@example.com" });
});

describe("savePushPreferences", () => {
  it("saves the choices with the session client", async () => {
    expect(await savePushPreferences(choices)).toEqual({ ok: true, data: null });
    expect(savePreferencesIn).toHaveBeenCalledWith(db, choices);
  });

  it("fails without a session, on a bad shape and when the database refuses", async () => {
    requireUser.mockResolvedValue({ ok: false, error: { code: "unauthorized" } });
    expect(await savePushPreferences(choices)).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    requireUser.mockResolvedValue({ ok: true, data: { id: "u1" } });
    expect(await savePushPreferences({ lista: "yes" } as never)).toMatchObject({ ok: false, error: { code: "validation" } });
    savePreferencesIn.mockRejectedValue(new PushDataError("save_preferences_failed 42501"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await savePushPreferences(choices)).toMatchObject({ ok: false, error: { code: "push_save_failed" } });
  });
});

describe("subscribePush", () => {
  it("saves the device", async () => {
    expect(await subscribePush(device)).toEqual({ ok: true, data: null });
    expect(saveSubscriptionIn).toHaveBeenCalledWith(db, device);
  });

  it("refuses an http address and says notiser är inte påslagna while the keys are not set", async () => {
    expect(await subscribePush({ ...device, endpoint: "http://push.example/abc" })).toMatchObject({ ok: false, error: { code: "validation" } });
    pushConfig.mockReturnValue(null);
    expect(await subscribePush(device)).toMatchObject({ ok: false, error: { code: "push_not_configured" } });
    expect(saveSubscriptionIn).not.toHaveBeenCalled();
  });

  it("never logs the endpoint or the keys when saving fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    saveSubscriptionIn.mockRejectedValue(new PushDataError("save_subscription_failed 23514"));
    await subscribePush(device);
    expect(JSON.stringify(error.mock.calls)).not.toContain("push.example");
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
  });
});

describe("unsubscribePush", () => {
  it("removes the device", async () => {
    expect(await unsubscribePush(device.endpoint)).toEqual({ ok: true, data: null });
    expect(removeSubscriptionIn).toHaveBeenCalledWith(db, device.endpoint);
    expect(await unsubscribePush("not an address")).toMatchObject({ ok: false, error: { code: "validation" } });
  });
});
