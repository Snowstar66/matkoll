import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdvancedSettings } from "./advanced-settings";
import type { SettingsGroupData } from "./settings-menu";

vi.mock("next/navigation", () => ({ usePathname: () => "/installningar/avancerat" }));

const sites: SettingsGroupData = {
  label: "Hushållet",
  rows: [{ href: "/installningar/receptsajter", icon: "globe", tile: "sky", title: "Receptsajter", value: "3 sajter" }],
};
const ai: SettingsGroupData = {
  label: "AI",
  rows: [
    { href: "/installningar/ai", icon: "sparkle", tile: "sand", title: "Modell", value: "Claude Haiku · Medel" },
    { href: null, icon: "coin", tile: "sand", title: "Kostnad i november", value: "4,20 kr" },
  ],
};

beforeEach(() => localStorage.clear());

describe("Avancerat", () => {
  it("has only Receptsajter for someone who does not see the AI row", () => {
    render(<AdvancedSettings sites={sites} ai={null} />);
    expect(screen.getByText("Det här behöver de flesta aldrig röra.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Receptsajter/ })).toHaveAttribute("href", "/installningar/receptsajter");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Felsökning" })).not.toBeInTheDocument();
  });

  it("adds the AI group with the web search, and Felsökning with Visa sidtider, for those who see the AI row", async () => {
    render(<AdvancedSettings sites={sites} ai={ai} />);
    expect(screen.getByRole("link", { name: /Modell/ })).toHaveAttribute("href", "/installningar/ai");
    expect(screen.getByText("4,20 kr")).toBeInTheDocument();
    const web = screen.getByRole("switch", { name: /^Låt agenten söka på webben/ });
    expect(web).toHaveAttribute("aria-checked", "false");
    await userEvent.click(web);
    // The same key as before, so someone who had it on keeps it.
    expect(localStorage.getItem("livskoll-option-restaurantAgentWeb")).toBe("1");
    await userEvent.click(screen.getByRole("switch", { name: /^Visa sidtider/ }));
    expect(localStorage.getItem("livskoll-option-showTimings")).toBe("1");
    expect(screen.getByRole("heading", { name: "Felsökning" })).toBeInTheDocument();
  });
});
