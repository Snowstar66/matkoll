import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TextSettings } from "./text-settings";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-text");
  document.documentElement.removeAttribute("data-bold");
});

describe("Textstorlek and Fetare text", () => {
  it("starts on Standard with no attribute, applies a choice, remembers it, and Standard removes it", async () => {
    const user = userEvent.setup();
    render(<TextSettings />);
    expect(screen.getByRole("radio", { name: "Standard" })).toBeChecked();
    expect(document.documentElement.hasAttribute("data-text")).toBe(false);
    await user.click(screen.getByRole("radio", { name: "Störst" }));
    expect(document.documentElement.getAttribute("data-text")).toBe("xl");
    expect(localStorage.getItem("livskoll-text")).toBe("xl");
    await user.click(screen.getByRole("switch", { name: /Fetare text/ }));
    expect(document.documentElement.hasAttribute("data-bold")).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Standard" }));
    expect(document.documentElement.hasAttribute("data-text")).toBe(false);
    expect(localStorage.getItem("livskoll-text")).toBeNull();
    await user.click(screen.getByRole("switch", { name: /Fetare text/ }));
    expect(document.documentElement.hasAttribute("data-bold")).toBe(false);
  });
});
