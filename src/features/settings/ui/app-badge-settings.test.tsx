import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppBadgeSettings } from "./app-badge-settings";

// Siffra på appikonen (Story 23.2): a quiet opt-in that asks for notifications
// once and says why, and says so where the browser has no Badging API.

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  Reflect.deleteProperty(navigator, "setAppBadge");
  Reflect.deleteProperty(navigator, "clearAppBadge");
});

describe("Siffra på appikonen", () => {
  it("says where it works when the browser cannot show a number", () => {
    render(<AppBadgeSettings />);
    expect(screen.getByTestId("app-badge-status")).toHaveTextContent("Den här webbläsaren kan inte visa en siffra");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks for notifications once when turned on, explains why, and clears the icon when turned off", async () => {
    const user = userEvent.setup();
    const setAppBadge = vi.fn(async () => {});
    const clearAppBadge = vi.fn(async () => {});
    Object.assign(navigator, { setAppBadge, clearAppBadge });
    const requestPermission = vi.fn(async () => "granted" as const);
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    render(<AppBadgeSettings />);
    expect(screen.getByText(/skickar inga notiser, tillåtelsen gäller bara siffran/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Slå på siffran" }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Siffran är på, på den här enheten.")).toBeInTheDocument();
    expect(localStorage.getItem("livskoll.app-badge")).toBe("on");
    await user.click(screen.getByRole("button", { name: "Stäng av" }));
    expect(await screen.findByRole("button", { name: "Slå på siffran" })).toBeInTheDocument();
    expect(clearAppBadge).toHaveBeenCalled();
  });
});
