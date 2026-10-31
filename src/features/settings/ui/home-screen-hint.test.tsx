import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeScreenHint } from "./home-screen-hint";

// HomeScreenHint (Story 11.6): Safari's steps on iPhone and iPad, the browser
// menu on Android, nothing on a computer or in the app on the home screen.

const iosText = "Lägg Livskoll på hemskärmen: tryck Dela och sedan Lägg till på hemskärmen.";
const androidText = "Lägg Livskoll på hemskärmen: välj Installera appen i webbläsarens meny.";

const userAgents = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

function mockDevice(userAgent: string, maxTouchPoints = 0) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
}

function mockDisplayMode(standalone: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: standalone,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      expect(query).toBe("(display-mode: standalone)");
      return media;
    }),
  );
  return {
    change(next: boolean) {
      media.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
  Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
});

describe("HomeScreenHint", () => {
  it.each([
    ["an iPhone", userAgents.iphone, 5],
    ["an iPad, which says Macintosh", userAgents.ipad, 5],
  ])("shows Safari's steps on %s", (_device, userAgent, touchPoints) => {
    mockDisplayMode(false);
    mockDevice(userAgent, touchPoints);
    render(<HomeScreenHint />);
    expect(screen.getByText(iosText)).toBeInTheDocument();
  });

  it("shows the browser menu on Android", () => {
    mockDisplayMode(false);
    mockDevice(userAgents.android, 5);
    render(<HomeScreenHint />);
    expect(screen.getByText(androidText)).toBeInTheDocument();
  });

  it.each([
    ["a Mac", userAgents.mac],
    ["a Windows computer", userAgents.windows],
  ])("shows nothing on %s", (_device, userAgent) => {
    mockDisplayMode(false);
    mockDevice(userAgent);
    render(<HomeScreenHint />);
    expect(screen.queryByTestId("home-screen-hint")).not.toBeInTheDocument();
  });

  it("shows nothing when Matkoll runs full screen from the home screen", () => {
    mockDisplayMode(true);
    mockDevice(userAgents.iphone, 5);
    render(<HomeScreenHint />);
    expect(screen.queryByTestId("home-screen-hint")).not.toBeInTheDocument();
  });

  it("shows nothing when iOS says it runs from the home screen", () => {
    mockDisplayMode(false);
    mockDevice(userAgents.iphone, 5);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    render(<HomeScreenHint />);
    expect(screen.queryByTestId("home-screen-hint")).not.toBeInTheDocument();
  });

  it("follows a change of display mode", () => {
    const displayMode = mockDisplayMode(false);
    mockDevice(userAgents.iphone, 5);
    render(<HomeScreenHint />);
    expect(screen.getByText(iosText)).toBeInTheDocument();
    act(() => displayMode.change(true));
    expect(screen.queryByTestId("home-screen-hint")).not.toBeInTheDocument();
  });
});
