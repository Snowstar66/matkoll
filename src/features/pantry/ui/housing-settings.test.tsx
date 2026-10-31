import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok, type Result } from "@/lib/errors";
import type { PantrySiteWithCount } from "../domain/site";
import { HousingSettings } from "./housing-settings";
import { SiteSwitchProvider } from "./site-switching";

// Inställningar → Boenden as an overview (Story 16.14), with the actions stubbed.

type Selected = Result<{ site: { id: string; name: string } }>;
const selectPantrySite = vi.fn<(input: { id: string }) => Promise<Selected>>();
vi.mock("../actions/select-pantry-site", () => ({ selectPantrySite: (input: { id: string }) => selectPantrySite(input) }));
const deletePantrySite = vi.fn();
vi.mock("../actions/delete-pantry-site", () => ({ deletePantrySite: (input: { id: string }) => deletePantrySite(input) }));
vi.mock("../actions/save-pantry-site", () => ({ savePantrySite: vi.fn() }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const hemma: PantrySiteWithCount = { id: "11111111-1111-4111-8111-111111111111", name: "Hemma", isSelected: true, itemCount: 30 };
const duved: PantrySiteWithCount = { id: "22222222-2222-4222-8222-222222222222", name: "Duved", isSelected: false, itemCount: 5 };
const nordan: PantrySiteWithCount = { id: "33333333-3333-4333-8333-333333333333", name: "Nordan", isSelected: false, itemCount: 0 };
const tomt: PantrySiteWithCount = { id: "44444444-4444-4444-8444-444444444444", name: "Tomt", isSelected: false, itemCount: 0 };
const thingCounts = {
  [hemma.id]: { things: 0, cards: 0 },
  [duved.id]: { things: 0, cards: 0 },
  [nordan.id]: { things: 18, cards: 1 },
  [tomt.id]: { things: 0, cards: 0 },
};

function renderPage(sites: PantrySiteWithCount[], counts: typeof thingCounts | null = thingCounts) {
  return render(
    <ToastProvider>
      <SiteSwitchProvider>
        <HousingSettings sites={sites} thingCounts={counts} />
      </SiteSwitchProvider>
    </ToastProvider>,
  );
}
const card = (name: string) => screen.getAllByTestId("housing-card").find((element) => within(element).queryByText(name))!;

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  deletePantrySite.mockReset().mockResolvedValue(ok({ removed: true }));
  selectPantrySite.mockReset().mockImplementation(async ({ id }) => {
    const site = [hemma, duved, nordan, tomt].find((candidate) => candidate.id === id)!;
    return ok({ site: { id: site.id, name: site.name } });
  });
});

describe("HousingSettings", () => {
  it("shows a card per boende with what is in it, and Vald with a green border on the selected one", () => {
    renderPage([hemma, duved, nordan]);
    expect(screen.getByText("Det valda boendet gäller i hela appen.")).toBeInTheDocument();
    expect(within(card("Hemma")).getByText("30 matvaror · inga föremål än")).toBeInTheDocument();
    expect(within(card("Duved")).getByText("5 matvaror · inga föremål än")).toBeInTheDocument();
    expect(within(card("Nordan")).getByText("Inga matvaror · 18 föremål · 1 kort")).toBeInTheDocument();
    expect(within(card("Hemma")).getByText("Vald")).toBeInTheDocument();
    expect(card("Hemma")).toHaveClass("border-accent");
    expect(within(card("Duved")).queryByText("Vald")).toBeNull();
    expect(card("Duved")).not.toHaveClass("border-accent");
    expect(screen.getByRole("button", { name: "Lägg till boende" })).toBeInTheDocument();
  });

  it("leaves the föremål out when Förråd could not be read", () => {
    renderPage([hemma, duved], null);
    expect(within(card("Hemma")).getByText("30 matvaror")).toBeInTheDocument();
  });

  it("selects a boende with a tap on its card, without leaving the page", async () => {
    const user = userEvent.setup();
    renderPage([hemma, duved]);
    await user.click(within(card("Duved")).getByRole("button", { name: "Välj Duved" }));
    expect(selectPantrySite).toHaveBeenCalledWith({ id: duved.id });
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("site-announcement")).toHaveTextContent("Valt boende: Duved."));
  });

  it("selects the boende and goes to Förråd with Förråd ›", async () => {
    const user = userEvent.setup();
    renderPage([hemma, duved]);
    await user.click(within(card("Duved")).getByRole("button", { name: "Förråd i Duved" }));
    expect(selectPantrySite).toHaveBeenCalledWith({ id: duved.id });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/prylar"));
  });

  it("goes to Matvaror with Matvaror ›, and does not save the boende that is already selected", async () => {
    const user = userEvent.setup();
    renderPage([hemma, duved]);
    await user.click(within(card("Hemma")).getByRole("button", { name: "Matvaror i Hemma" }));
    expect(selectPantrySite).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/hemma");
  });

  it("stays where it is when the selection fails", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue({ ok: false, error: { code: "pantry_site_failed", message: "Det gick inte att spara boendet. Försök igen." } });
    renderPage([hemma, duved]);
    await user.click(within(card("Duved")).getByRole("button", { name: "Förråd i Duved" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara boendet");
    expect(push).not.toHaveBeenCalled();
  });

  it("opens Byt namn from ⋯ in the sheet Boenden, with the name field for that boende", async () => {
    const user = userEvent.setup();
    renderPage([hemma, duved]);
    await user.click(within(card("Duved")).getByRole("button", { name: "Fler val för Duved" }));
    await user.click(screen.getByRole("menuitem", { name: "Byt namn" }));
    const sheet = await screen.findByRole("dialog", { name: "Boenden" });
    expect(within(sheet).getByLabelText("Namn")).toHaveValue("Duved");
  });

  it("offers Ta bort only for an empty boende that is not selected, and removes it at once", async () => {
    const user = userEvent.setup();
    renderPage([hemma, duved, nordan, tomt]);
    for (const name of ["Hemma", "Duved", "Nordan"]) {
      await user.click(within(card(name)).getByRole("button", { name: `Fler val för ${name}` }));
      expect(screen.queryByRole("menuitem", { name: "Ta bort" })).toBeNull();
      await user.keyboard("{Escape}");
    }
    await user.click(within(card("Tomt")).getByRole("button", { name: "Fler val för Tomt" }));
    await user.click(screen.getByRole("menuitem", { name: "Ta bort" }));
    expect(deletePantrySite).toHaveBeenCalledWith({ id: tomt.id });
    expect((await screen.findAllByText("Tog bort Tomt.")).length).toBeGreaterThan(0);
  });
});
