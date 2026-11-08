import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { readOption } from "@/lib/options";
import { OptionRow, OptionSettings } from "./option-settings";

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

  it("shows the Näringskoll under Näring only with Visa näring on", async () => {
    render(<OptionSettings nutritionNote={<p data-testid="check">Näringen kan räknas för 3 av 4 recept.</p>} />);
    expect(screen.queryByTestId("check")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: /^Visa näring/ }));
    expect(screen.getByTestId("check")).toHaveTextContent("Näringen kan räknas för 3 av 4 recept.");
    await userEvent.click(screen.getByRole("switch", { name: /^Visa näring/ }));
    expect(screen.queryByTestId("check")).not.toBeInTheDocument();
  });

  it("puts the page's group Delade recept last, after the device's note, with the option row for Visa delade recept", () => {
    render(
      <OptionSettings
        after={
          <div data-testid="after">
            <h2>Delade recept</h2>
            <ul>
              <OptionRow id="showShared" />
            </ul>
          </div>
        }
      />,
    );
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["I receptet", "Näring", "Dagens", "Delade recept"]);
    const note = screen.getByText("Gäller bara den här enheten.");
    expect(note.compareDocumentPosition(screen.getByTestId("after")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const show = within(screen.getByTestId("after")).getByRole("switch", { name: /^Visa delade recept/ });
    expect(show).toHaveAttribute("aria-checked", "true");
    expect(show).toHaveAccessibleDescription("Recept som andra hushåll delar, under Recept");
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
