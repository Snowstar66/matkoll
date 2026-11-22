import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOption } from "@/lib/options";
import { OptionRow, OptionSettings } from "./option-settings";

const toast = vi.hoisted(() => ({ showToast: vi.fn(), dismissToast: vi.fn() }));
vi.mock("@/components/toast", () => ({ useToast: () => toast }));

beforeEach(() => {
  localStorage.clear();
  toast.showToast.mockClear();
});

describe("OptionSettings", () => {
  it("has Värdetips under Förrådet, off by default, and turning it on is remembered on this device", async () => {
    window.localStorage.clear();
    render(<OptionSettings areasEnabled={false} />);
    const worth = screen.getByRole("switch", { name: /^Värdetips/ });
    expect(worth).toHaveAttribute("aria-checked", "false");
    expect(worth).toHaveAccessibleDescription(/Stjärnmarkerar föremål/);
    await userEvent.click(worth);
    expect(worth).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("livskoll-option-worthLook")).toBe("1");
    window.localStorage.clear();
  });

  it("has Fota med telefonens kamera under Förrådet, off by default, with a plain hint, remembered on this device", async () => {
    render(<OptionSettings areasEnabled={false} />);
    const phone = screen.getByRole("switch", { name: /^Fota med telefonens kamera/ });
    expect(phone).toHaveAttribute("aria-checked", "false");
    expect(phone).toHaveAccessibleDescription(/Använder telefonens egen kamera-app, så din blixt och dina kamerainställningar gäller\. Du tar en bild i taget i stället för flera i rad\./);
    await userEvent.click(phone);
    expect(window.localStorage.getItem("livskoll-option-phoneCamera")).toBe("1");
  });

  it("has the sections Laga mat, Planera veckan, Näring, Äta ute, Förrådet and Dagens, with the Näring switches off by default", () => {
    render(<OptionSettings areasEnabled={false} />);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["Laga mat", "Planera veckan", "Näring", "Äta ute", "Förrådet", "Dagens"]);
    const show = screen.getByRole("switch", { name: /^Visa näring/ });
    expect(show).toHaveAttribute("aria-checked", "false");
    expect(show).toHaveAccessibleDescription("Tallriken, märken och veckans rad");
    // Visa kcal waits for Visa näring.
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toHaveAccessibleDescription("Kräver Visa näring");
    expect(screen.getByRole("switch", { name: /Timer i receptet/ })).toHaveAttribute("aria-checked", "true");
    const fit = screen.getByRole("radiogroup", { name: "Visa vem rätten passar" });
    expect(screen.getByRole("radio", { name: "Prickar" })).toHaveAttribute("aria-checked", "true");
    expect(fit).toBeInTheDocument();
  });

  it("chooses Prickar, Text or Inget for Visa vem rätten passar and remembers it", async () => {
    render(<OptionSettings areasEnabled={false} />);
    await userEvent.click(screen.getByRole("radio", { name: "Text" }));
    expect(screen.getByRole("radio", { name: "Text" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("livskoll-option-showFit")).toBe("text");
    await userEvent.click(screen.getByRole("radio", { name: "Inget" }));
    expect(window.localStorage.getItem("livskoll-option-showFit")).toBe("none");
    window.localStorage.removeItem("livskoll-option-showFit");
  });

  it("shows the Näringskoll under Näring only with Visa näring on", async () => {
    render(<OptionSettings areasEnabled={false} nutritionNote={<p data-testid="check">Näringen kan räknas för 3 av 4 recept.</p>} />);
    expect(screen.queryByTestId("check")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: /^Visa näring/ }));
    expect(screen.getByTestId("check")).toHaveTextContent("Näringen kan räknas för 3 av 4 recept.");
    await userEvent.click(screen.getByRole("switch", { name: /^Visa näring/ }));
    expect(screen.queryByTestId("check")).not.toBeInTheDocument();
  });

  it("puts the page's group Delade recept last, after the device's note, with the option row for Visa delade recept", () => {
    render(
      <OptionSettings areasEnabled={false}
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
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Laga mat", "Planera veckan", "Näring", "Äta ute", "Förrådet", "Dagens", "Delade recept"]);
    const note = screen.getByText("Gäller bara den här enheten.");
    expect(note.compareDocumentPosition(screen.getByTestId("after")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const show = within(screen.getByTestId("after")).getByRole("switch", { name: /^Visa delade recept/ });
    expect(show).toHaveAttribute("aria-checked", "true");
    expect(show).toHaveAccessibleDescription("Recept som andra hushåll delar, under Recept");
  });

  it("keeps Låt agenten söka på webben and Visa sidtider out of Tillval (they live under Avancerat)", () => {
    render(<OptionSettings areasEnabled={false} />);
    expect(screen.queryByRole("switch", { name: /söka på webben/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Visa sidtider/ })).not.toBeInTheDocument();
  });

  it("orders Planera veckan as Veckoagenten, Visa hur ofta, Länge sedan efter, Visa tidigare vecka, the link, Visa vem rätten passar", () => {
    render(<OptionSettings areasEnabled={false} />);
    const section = screen.getByRole("heading", { name: "Planera veckan" }).nextElementSibling as HTMLElement;
    const order = Array.from(section.children).map((li) => li.textContent ?? "");
    const at = (text: string) => order.findIndex((entry) => entry.startsWith(text));
    expect([at("Veckoagenten"), at("Visa hur ofta"), at("Länge sedan efter"), at("Visa tidigare vecka"), at("Öppna tidigare matsedlar"), at("Visa vem rätten passar")]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(screen.getByRole("link", { name: "Öppna tidigare matsedlar" })).toHaveAttribute("href", "/matsedel/tidigare");
  });

  it("greys a switch that needs another one and says Kräver, without changing it; an on switch stays free to turn off", async () => {
    render(<OptionSettings areasEnabled={false} />);
    const ute = screen.getByRole("switch", { name: /^Sök restauranger/ });
    expect(ute).toBeDisabled();
    expect(ute).toHaveAccessibleDescription("Kräver Menyrådgivare");
    expect(screen.getByRole("switch", { name: /^Namnsdag/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("switch", { name: /^Visa Dagens/ }));
    // Namnsdag is off, so it waits; Matdagar is on, so it can still be turned off.
    expect(screen.getByRole("switch", { name: /^Namnsdag/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /^Namnsdag/ })).toHaveAccessibleDescription("Kräver Visa Dagens");
    expect(screen.getByRole("switch", { name: /^Matdagar/ })).toBeEnabled();
    // The greying wrote nothing for them.
    expect(window.localStorage.getItem("livskoll-option-dagensNameDay")).toBeNull();
    expect(window.localStorage.getItem("livskoll-option-dagensFood")).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: /^Menyrådgivare/ }));
    expect(screen.getByRole("switch", { name: /^Sök restauranger/ })).toBeEnabled();
  });

  it("turns Visa näring on for this device and names the source under the group", async () => {
    render(<OptionSettings areasEnabled={false} />);
    await userEvent.click(screen.getByRole("switch", { name: /^Visa näring/ }));
    expect(readOption("showNutrition")).toBe(true);
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toBeEnabled();
    expect(screen.getByRole("switch", { name: /^Visa kcal/ })).toHaveAccessibleDescription("kcal och gram per portion och chippet <500 kcal i Recept");
    expect(within(screen.getByTestId("nutrition-source")).getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", expect.stringContaining("creativecommons.org"));
    expect(screen.getByText("Gäller bara den här enheten.")).toBeInTheDocument();
  });
});
