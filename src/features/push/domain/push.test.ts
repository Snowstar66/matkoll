import { describe, expect, it } from "vitest";
import { defaultPushPreferences, pushChoices, pushPreferencesSchema, pushSubscriptionSchema } from "./push";

describe("the choices", () => {
  it("start with the list and the notes on, the rest off", () => {
    expect(defaultPushPreferences).toEqual({ lista: true, forrad: false, matsedel: false, lappar: true });
  });

  it("offer exactly the four kinds the database queues", () => {
    expect(pushChoices.map((choice) => choice.kind).sort()).toEqual(Object.keys(defaultPushPreferences).sort());
    expect(pushPreferencesSchema.safeParse(defaultPushPreferences).success).toBe(true);
    expect(pushPreferencesSchema.safeParse({ lista: true }).success).toBe(false);
  });

  it("accepts a push service address over https only", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://push.example/abc", p256dh: "k", auth: "a" }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://push.example/abc", p256dh: "k", auth: "a" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://push.example/abc", p256dh: "", auth: "a" }).success).toBe(false);
  });
});
