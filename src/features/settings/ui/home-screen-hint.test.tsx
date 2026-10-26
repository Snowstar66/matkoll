import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeScreenHint } from "./home-screen-hint";

// HomeScreenHint (Story 11.6): the row shows in the browser and not in the app
// on the home screen.

const text = "Lägg Matkoll på hemskärmen: tryck Dela och sedan Lägg till på hemskärmen.";

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
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
});

describe("HomeScreenHint", () => {
  it("shows how to put Matkoll on the home screen in the browser", () => {
    mockDisplayMode(false);
    render(<HomeScreenHint />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows nothing when Matkoll runs full screen from the home screen", () => {
    mockDisplayMode(true);
    render(<HomeScreenHint />);
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it("shows nothing when iOS says it runs from the home screen", () => {
    mockDisplayMode(false);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    render(<HomeScreenHint />);
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it("follows a change of display mode", () => {
    const displayMode = mockDisplayMode(false);
    render(<HomeScreenHint />);
    expect(screen.getByText(text)).toBeInTheDocument();
    act(() => displayMode.change(true));
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });
});
