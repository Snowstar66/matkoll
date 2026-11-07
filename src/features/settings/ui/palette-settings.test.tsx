import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PaletteSettings } from "./palette-settings";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.style.removeProperty("--hue");
});

describe("Utseende", () => {
  it("is a radio group of seven named themes with Grön chosen from the start", () => {
    render(<PaletteSettings />);
    const group = screen.getByRole("radiogroup", { name: "Färgtema" });
    const names = Array.from(group.querySelectorAll("[role=radio]")).map((el) => el.getAttribute("aria-label"));
    expect(names).toEqual(["Grön", "Blå", "Lavendel", "Persika", "Sand", "Rosa", "Egen"]);
    expect(screen.getByRole("radio", { name: "Grön" })).toBeChecked();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Återställ till Grön" })).toBeDisabled();
  });

  it("applies a chosen theme at once and remembers it on this device", async () => {
    const user = userEvent.setup();
    render(<PaletteSettings />);
    await user.click(screen.getByRole("radio", { name: "Blå" }));
    expect(screen.getByRole("radio", { name: "Blå" })).toBeChecked();
    expect(document.documentElement.getAttribute("data-palette")).toBe("bla");
    expect(localStorage.getItem("livskoll-palette")).toBe("bla");
  });

  it("shows the Ton slider for Egen and sets --hue as it moves", async () => {
    const user = userEvent.setup();
    render(<PaletteSettings />);
    await user.click(screen.getByRole("radio", { name: "Egen" }));
    const slider = screen.getByRole("slider", { name: "Ton" });
    fireEvent.change(slider, { target: { value: "210" } });
    expect(document.documentElement.getAttribute("data-palette")).toBe("custom");
    expect(document.documentElement.style.getPropertyValue("--hue")).toBe("210");
    expect(localStorage.getItem("livskoll-hue")).toBe("210");
  });

  it("shows a preview and goes back to Grön with Återställ", async () => {
    const user = userEvent.setup();
    render(<PaletteSettings />);
    expect(screen.getByTestId("palette-preview")).toHaveTextContent("Kan lagas nu");
    await user.click(screen.getByRole("radio", { name: "Rosa" }));
    await user.click(screen.getByRole("button", { name: "Återställ till Grön" }));
    expect(screen.getByRole("radio", { name: "Grön" })).toBeChecked();
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
    expect(localStorage.getItem("livskoll-palette")).toBeNull();
  });
});
