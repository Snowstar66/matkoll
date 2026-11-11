import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { cost, fakeSettings, savedSettings, stores } from "./fake-actions";
import { SettingsSheet } from "./settings-sheet";

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });

describe("SettingsSheet", () => {
  it("loads the household's settings when it opens and shows every choice of the sketch", async () => {
    const actions = fakeSettings();
    render(<SettingsSheet open onClose={() => {}} actions={actions} cost={cost} />);
    expect(await screen.findByTestId("week-agent-settings")).toBeInTheDocument();
    expect(actions.load).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Gäller för hela hushållet.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Det som snart går ut/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: /Erbjudanden i veckan/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: /Snabbt på vardagar/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radiogroup", { name: "Budget" })).toBeInTheDocument();
    for (const name of ["Vegetariska dagar", "Hoppa över dagar", "Matlådedagar"]) expect(screen.getByRole("group", { name })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Butiker för erbjudanden" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ICA Nära Sundbyberg" })).toHaveAttribute("aria-checked", "false");
  });

  it("states the cost from the price table it was given, with a link to AI-kostnad", async () => {
    render(<SettingsSheet open onClose={() => {}} actions={fakeSettings()} cost={cost} />);
    const line = await screen.findByTestId("week-agent-cost");
    expect(line).toHaveTextContent("ca 0,01 kr per förslag med Haiku");
    expect(line).toHaveTextContent("ca 0,18 kr");
    expect(within(line).getByRole("link", { name: "Se AI-kostnad" })).toHaveAttribute("href", "/installningar/ai-kostnad");
  });

  it("gives every day a button of its own, named by the weekday, and a day has one role", async () => {
    const user = userEvent.setup();
    const actions = fakeSettings();
    render(<SettingsSheet open onClose={() => {}} actions={actions} cost={cost} />);
    const veg = await screen.findByRole("group", { name: "Vegetariska dagar" });
    const skip = screen.getByRole("group", { name: "Hoppa över dagar" });
    await user.click(within(veg).getByRole("button", { name: "onsdag" }));
    expect(within(veg).getByRole("button", { name: "onsdag" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(skip).getByRole("button", { name: "onsdag" }));
    expect(within(veg).getByRole("button", { name: "onsdag" })).toHaveAttribute("aria-pressed", "false");
    expect(within(skip).getByRole("button", { name: "onsdag" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(skip).getByRole("button", { name: "lördag" }));
    await user.click(screen.getByTestId("week-agent-settings-save"));
    await waitFor(() => expect(actions.save).toHaveBeenCalled());
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ skipDays: [3, 6], vegetarianDays: [] }));
  });

  it("keeps the dinners between 3 and 7", async () => {
    const user = userEvent.setup();
    render(<SettingsSheet open onClose={() => {}} actions={fakeSettings({ settings: savedSettings({ dinners: 7 }), stores })} cost={cost} />);
    const more = await screen.findByRole("button", { name: "Fler middagar" });
    expect(more).toHaveAttribute("aria-disabled", "true");
    await user.click(more);
    expect(screen.getByRole("button", { name: "Färre middagar" })).not.toHaveAttribute("aria-disabled");
  });

  it("saves the budget, the switches and the stores", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const actions = fakeSettings();
    render(<SettingsSheet open onClose={onClose} actions={actions} cost={cost} onSaved={onSaved} />);
    await user.click(await screen.findByRole("radio", { name: "Lågt" }));
    await user.click(screen.getByRole("switch", { name: /Snabbt på vardagar/ }));
    await user.click(screen.getByRole("switch", { name: /Erbjudanden i veckan/ }));
    await user.click(screen.getByRole("checkbox", { name: "Willys Solna" }));
    await user.click(screen.getByTestId("week-agent-settings-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ budget: "low", quickWeekdays: true, favourOffers: false, offerStoreIds: [stores[1]?.id] }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("does not save before something is changed", async () => {
    render(<SettingsSheet open onClose={() => {}} actions={fakeSettings()} cost={cost} />);
    expect(await screen.findByTestId("week-agent-settings-save")).toBeDisabled();
  });

  it("says so when the save fails and stays open", async () => {
    const user = userEvent.setup();
    const actions = fakeSettings();
    actions.save.mockResolvedValue({ status: "error", message: "Det gick inte att spara." });
    const onClose = vi.fn();
    render(<SettingsSheet open onClose={onClose} actions={actions} cost={cost} />);
    await user.click(await screen.findByRole("switch", { name: /Snabbt på vardagar/ }));
    await user.click(screen.getByTestId("week-agent-settings-save"));
    expect(await screen.findByText("Det gick inte att spara.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says so when the settings cannot be read", async () => {
    render(<SettingsSheet open onClose={() => {}} actions={fakeSettings(null)} cost={cost} />);
    expect(await screen.findByText("Det gick inte att läsa valen. Stäng och försök igen.")).toBeInTheDocument();
  });

  it("uses the settings it was given without loading them", async () => {
    const actions = fakeSettings();
    render(<SettingsSheet open onClose={() => {}} actions={actions} cost={cost} preloaded={{ settings: savedSettings({ dinners: 4 }), stores: [] }} />);
    expect(await screen.findByTestId("week-agent-settings")).toBeInTheDocument();
    expect(actions.load).not.toHaveBeenCalled();
    expect(screen.getByText("Inga butiker än.", { exact: false })).toBeInTheDocument();
  });
});
