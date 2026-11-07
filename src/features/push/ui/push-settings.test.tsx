import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPushPreferences } from "../domain/push";

// Inställningar → Notiser (Story 23.3): says so when the keys are not set, shows
// the iPhone hint outside the home screen, asks for permission when turned on,
// and saves the choices.

const savePushPreferences = vi.fn();
const subscribePush = vi.fn();
const unsubscribePush = vi.fn();
vi.mock("../actions/push", () => ({
  savePushPreferences: (...args: unknown[]) => savePushPreferences(...args),
  subscribePush: (...args: unknown[]) => subscribePush(...args),
  unsubscribePush: (...args: unknown[]) => unsubscribePush(...args),
}));

const { PushSettings, notSetUpText, iosInstallText } = await import("./push-settings");

function stubPush({ permission = "default", subscribed = false }: { permission?: NotificationPermission; subscribed?: boolean } = {}) {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/device",
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/device", keys: { p256dh: "key", auth: "secret" } }),
    unsubscribe: vi.fn(async () => true),
  };
  const pushManager = {
    getSubscription: vi.fn(async () => (subscribed ? subscription : null)),
    subscribe: vi.fn(async () => {
      subscribed = true;
      return subscription;
    }),
  };
  const registration = { pushManager };
  const requestPermission = vi.fn(async () => "granted" as const);
  vi.stubGlobal("Notification", { permission, requestPermission });
  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) },
  });
  return { subscription, pushManager, requestPermission };
}

beforeEach(() => {
  savePushPreferences.mockReset().mockResolvedValue({ ok: true, data: null });
  subscribePush.mockReset().mockResolvedValue({ ok: true, data: null });
  unsubscribePush.mockReset().mockResolvedValue({ ok: true, data: null });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("Notiser", () => {
  it("says that notiser är inte påslagna än, with no button, when the VAPID keys are not set", () => {
    stubPush();
    render(<PushSettings publicKey={null} preferences={defaultPushPreferences} />);
    expect(screen.getByTestId("push-status")).toHaveTextContent(notSetUpText);
    expect(screen.getByTestId("push-status")).toHaveTextContent("Notiser är inte påslagna än");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tells iPhone users outside the home screen to add the app there", async () => {
    // Safari in a tab has no PushManager: unsupported, and the platform is iOS.
    vi.stubGlobal("navigator", Object.create(navigator, { userAgent: { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" } }));
    render(<PushSettings publicKey="BKey" preferences={defaultPushPreferences} />);
    expect(await screen.findByTestId("push-status")).toHaveTextContent(iosInstallText);
    expect(screen.queryByRole("button", { name: "Slå på notiser" })).not.toBeInTheDocument();
  });

  it("asks for permission when turned on, saves the device, and then offers the four choices with the list and notes on", async () => {
    const user = userEvent.setup();
    const { requestPermission } = stubPush();
    render(<PushSettings publicKey="BEl6" preferences={defaultPushPreferences} />);
    await user.click(await screen.findByRole("button", { name: "Slå på notiser" }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribePush).toHaveBeenCalledWith({ endpoint: "https://fcm.googleapis.com/fcm/send/device", p256dh: "key", auth: "secret" });
    expect(await screen.findByText("Notiser är på, på den här enheten.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Nya varor på listan" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Lappar" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Nya kort i Förråd" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ändrad matsedel" })).not.toBeChecked();
  });

  it("saves a changed choice, and turns the device off with Stäng av", async () => {
    const user = userEvent.setup();
    const { subscription } = stubPush({ subscribed: true });
    render(<PushSettings publicKey="BEl6" preferences={defaultPushPreferences} />);
    await user.click(await screen.findByRole("checkbox", { name: "Ändrad matsedel" }));
    expect(savePushPreferences).toHaveBeenCalledWith({ lista: true, forrad: false, matsedel: true, lappar: true, atsnart: true });
    await user.click(screen.getByRole("button", { name: "Stäng av på den här enheten" }));
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(unsubscribePush).toHaveBeenCalledWith("https://fcm.googleapis.com/fcm/send/device");
    expect(await screen.findByRole("button", { name: "Slå på notiser" })).toBeInTheDocument();
  });

  it("says where to turn notifications back on when the browser has blocked them", async () => {
    stubPush({ permission: "denied" });
    render(<PushSettings publicKey="BEl6" preferences={defaultPushPreferences} />);
    expect(await screen.findByTestId("push-status")).toHaveTextContent("Notiser är avstängda");
    expect(screen.queryByRole("button", { name: "Slå på notiser" })).not.toBeInTheDocument();
  });

  it("takes the device back out when saving it fails, and says so", async () => {
    const user = userEvent.setup();
    const { subscription } = stubPush();
    subscribePush.mockResolvedValue({ ok: false, error: { code: "push_save_failed" } });
    render(<PushSettings publicKey="BEl6" preferences={defaultPushPreferences} />);
    await user.click(await screen.findByRole("button", { name: "Slå på notiser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara");
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});
