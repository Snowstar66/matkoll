import { describe, expect, it } from "vitest";
import { defaultPushPreferences, isPushEndpoint, pushChoices, pushPreferencesSchema, pushSubscriptionSchema } from "./push";

describe("the choices", () => {
  it("start with the list and the notes on, the rest off", () => {
    expect(defaultPushPreferences).toEqual({ lista: true, forrad: false, matsedel: false, lappar: true, atsnart: true });
  });

  it("offer exactly the four kinds the database queues", () => {
    expect(pushChoices.map((choice) => choice.kind).sort()).toEqual(Object.keys(defaultPushPreferences).sort());
    expect(pushPreferencesSchema.safeParse(defaultPushPreferences).success).toBe(true);
    expect(pushPreferencesSchema.safeParse({ lista: true }).success).toBe(false);
  });

  it("accepts a push service address over https only", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "k", auth: "a" }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://fcm.googleapis.com/fcm/send/abc", p256dh: "k", auth: "a" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "", auth: "a" }).success).toBe(false);
  });

  it("accepts the standard push services and nothing else", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://web.push.apple.com/QX",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://db5p.notify.windows.com/?token=x",
    ]) expect(isPushEndpoint(ok), ok).toBe(true);
    for (const bad of [
      "https://push.example/abc",
      "https://evil.com/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evil.com/?a=.push.apple.com",
      "https://user@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://127.0.0.1/x",
      "not a url",
    ]) expect(isPushEndpoint(bad), bad).toBe(false);
  });
});
