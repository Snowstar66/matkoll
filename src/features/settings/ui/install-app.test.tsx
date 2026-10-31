import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallApp } from "./install-app";

afterEach(() => vi.unstubAllGlobals());

function setBrowser(userAgent: string, standalone = false) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints: 0 });
  vi.stubGlobal(
    "matchMedia",
    () => ({ matches: standalone, addEventListener: () => {}, removeEventListener: () => {} }),
  );
}

describe("InstallApp (Story 14.7)", () => {
  it("says how in Safari on an iPhone", () => {
    setBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    render(<InstallApp />);
    expect(screen.getByTestId("install-text")).toHaveTextContent("Tryck Dela i Safari och sedan Lägg till på hemskärmen");
  });

  it("says it is installed already when it runs from the home screen", () => {
    setBrowser("Mozilla/5.0 (Linux; Android 15)", true);
    render(<InstallApp />);
    expect(screen.getByTestId("install-text")).toHaveTextContent("redan på hemskärmen");
  });

  it("has words for a computer too", () => {
    setBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130");
    render(<InstallApp />);
    expect(screen.getByTestId("install-text")).toHaveTextContent("På en dator");
  });
});
