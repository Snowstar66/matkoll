import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { readOption } from "@/lib/options";
import { OptionSettings } from "./option-settings";

beforeEach(() => localStorage.clear());

describe("OptionSettings", () => {
  it("has the groups I receptet, Näring and Dagens, with the Näring switches off by default", () => {
    render(<OptionSettings />);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["I receptet", "Näring", "Dagens"]);
    const show = screen.getByRole("switch", { name: /^Visa näring/ });
    expect(show).toHaveAttribute("aria-checked", "false");
    expect(show).toHaveAccessibleDescription("Tallriken, märken och veckans rad");
    // Visa kcal waits for Visa näring.
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toHaveAccessibleDescription("Kräver Visa näring");
    expect(screen.getByRole("switch", { name: /Timer i receptet/ })).toHaveAttribute("aria-checked", "true");
  });

  it("turns Visa näring on for this device and names the source under the group", async () => {
    render(<OptionSettings />);
    await userEvent.click(screen.getByRole("switch", { name: /^Visa näring/ }));
    expect(readOption("showNutrition")).toBe(true);
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toBeEnabled();
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toHaveAccessibleDescription("kcal och gram per portion");
    expect(within(screen.getByTestId("nutrition-source")).getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", expect.stringContaining("creativecommons.org"));
    expect(screen.getByText("Gäller bara den här enheten.")).toBeInTheDocument();
  });
});
