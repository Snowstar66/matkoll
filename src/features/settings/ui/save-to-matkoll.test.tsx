import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { SaveToMatkoll } from "./save-to-matkoll";

afterEach(() => vi.unstubAllGlobals());

describe("SaveToMatkoll", () => {
  it("keeps a space between 'öppnas' and the app name in the computer guide", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", maxTouchPoints: 0 });
    render(
      <ToastProvider>
        <SaveToMatkoll />
      </ToastProvider>,
    );
    const text = screen.getByTestId("guide-computer").textContent ?? "";
    expect(text).toMatch(/så öppnas \S+ i en ny flik/);
  });
});
