import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { PantrySiteWithCount, SelectedSite } from "../domain/site";
import { AddSiteButton } from "./add-site-button";
import { AddPantryItemButton, PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { SiteSwitch, SiteSwitchProvider } from "./site-switch";

// Ställesväljaren in Hemma (Story 8.2) with selectPantrySite stubbed. The
// "server" places do not change unless a test says so, so what the pills
// show after a tap comes from the optimistic state and goes back when the
// transition ends.

type Selected = Result<{ site: { id: string; name: string } }>;
const selectPantrySite = vi.fn<(input: { id: string }) => Promise<Selected>>();
vi.mock("../actions/select-pantry-site", () => ({
  selectPantrySite: (input: { id: string }) => selectPantrySite(input),
}));
vi.mock("../actions/save-pantry-site", () => ({ savePantrySite: vi.fn() }));
vi.mock("../actions/delete-pantry-site", () => ({ deletePantrySite: vi.fn() }));
vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const hemma: PantrySiteWithCount = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Hemma",
  isSelected: true,
  itemCount: 12,
};
const stugan: PantrySiteWithCount = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Stugan",
  isSelected: false,
  itemCount: 0,
};
const selectedOf = (sites: readonly PantrySiteWithCount[]): SelectedSite => {
  const site = sites.find((candidate) => candidate.isSelected)!;
  return { id: site.id, name: site.name, siteCount: sites.length };
};

/** Lets a test change the server's places, as the page would after a revalidation. */
let serverSites: (sites: PantrySiteWithCount[]) => void = () => {};

function Hemma({ initial }: { initial: PantrySiteWithCount[] }) {
  const [sites, setSites] = useState(initial);
  useEffect(() => {
    serverSites = setSites;
  }, []);
  const selected = selectedOf(sites);
  return (
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location="Kyl" site={selected}>
          <SiteSwitchProvider>
            <AddPantryItemButton variant="icon" />
            <SiteSwitch sites={sites} selected={selected}>
              <p>Platskorten för {selected.name}</p>
              {selected.siteCount === 1 ? <AddSiteButton /> : null}
            </SiteSwitch>
          </SiteSwitchProvider>
        </PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>
  );
}

const pills = () => screen.queryByRole("radiogroup", { name: "Boende" });
const pill = (name: string) => within(pills()!).getByRole("radio", { name });
const content = () => screen.getByTestId("site-content");
const announcement = () => screen.getByTestId("site-announcement");

/** A promise resolved from the test, to see the switch while the action waits. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  refresh.mockReset();
  selectPantrySite.mockReset().mockImplementation(async ({ id }) => {
    const site = [hemma, stugan].find((candidate) => candidate.id === id)!;
    return ok({ site: { id: site.id, name: site.name } });
  });
});

describe("SiteSwitch", () => {
  it("shows no switch with one place, and Lägg till boende opens the sheet Boenden", async () => {
    const user = userEvent.setup();
    render(<Hemma initial={[hemma]} />);
    expect(pills()).toBeNull();
    expect(screen.queryByRole("button", { name: "Boenden" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Lägg till boende" }));
    expect(await screen.findByRole("dialog", { name: "Boenden" })).toBeInTheDocument();
  });

  it("shows the places as pills in the order given, the selected one checked, and Boenden last", () => {
    render(<Hemma initial={[hemma, stugan]} />);
    const radios = within(pills()!).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual(["Hemma", "Stugan"]);
    expect(pill("Hemma")).toHaveAttribute("aria-checked", "true");
    expect(pill("Stugan")).toHaveAttribute("aria-checked", "false");
    const sites = screen.getByRole("button", { name: "Hantera boenden" });
    expect(radios[1].compareDocumentPosition(sites) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lägg till boende" })).toBeNull();
  });

  it("selects a place at once, keeps the page inert and + unavailable until it is saved, and announces it", async () => {
    const user = userEvent.setup();
    const pending = deferred<Selected>();
    selectPantrySite.mockImplementationOnce(() => pending.promise);
    render(<Hemma initial={[hemma, stugan]} />);

    await user.click(pill("Stugan"));
    expect(pill("Stugan")).toHaveAttribute("aria-checked", "true");
    expect(selectPantrySite).toHaveBeenCalledWith({ id: stugan.id });
    expect(content()).toHaveAttribute("inert");
    expect(content()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Lägg till vara" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hantera boenden" })).toBeDisabled();

    // The server's answer, and the page with Stugan selected.
    await act(async () => {
      pending.resolve(ok({ site: { id: stugan.id, name: "Stugan" } }));
      serverSites([
        { ...hemma, isSelected: false },
        { ...stugan, isSelected: true },
      ]);
    });
    await waitFor(() => expect(content()).not.toHaveAttribute("inert"));
    expect(content()).not.toHaveAttribute("aria-busy");
    expect(pill("Stugan")).toHaveAttribute("aria-checked", "true");
    expect(content()).toHaveTextContent("Platskorten för Stugan");
    expect(announcement()).toHaveTextContent("Valt boende: Stugan.");
    expect(screen.getByRole("button", { name: "Lägg till vara" })).toBeEnabled();
  });

  it("keeps the pills and Boenden unavailable until hydration", () => {
    const html = renderToString(<Hemma initial={[hemma, stugan]} />);
    const container = document.createElement("div");
    container.innerHTML = html;
    const radios = within(container).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    for (const radio of radios) expect(radio).toBeDisabled();
    expect(within(container).getByRole("button", { name: "Hantera boenden" })).toBeDisabled();
  });

  it("goes back to the place it was and shows a Notice when the selection fails", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_failed"));
    render(<Hemma initial={[hemma, stugan]} />);

    await user.click(pill("Stugan"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
    await waitFor(() => expect(pill("Hemma")).toHaveAttribute("aria-checked", "true"));
    expect(content()).not.toHaveAttribute("inert");
    expect(announcement()).toHaveTextContent("");
    expect(refresh).toHaveBeenCalled();
  });

  it("treats no answer as a failure", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockRejectedValue(new Error("offline"));
    render(<Hemma initial={[hemma, stugan]} />);
    await user.click(pill("Stugan"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
    await waitFor(() => expect(pill("Hemma")).toHaveAttribute("aria-checked", "true"));
  });

  it("says the place is gone, and reads the page again", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_gone"));
    render(<Hemma initial={[hemma, stugan]} />);
    await user.click(pill("Stugan"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Boendet finns inte längre. Välj ett annat boende.");
    expect(refresh).toHaveBeenCalled();
  });

  it("lets the last of two quick taps win: an answer for the earlier one changes nothing", async () => {
    const user = userEvent.setup();
    const first = deferred<Selected>();
    const second = deferred<Selected>();
    selectPantrySite.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    render(<Hemma initial={[hemma, stugan]} />);

    await user.click(pill("Stugan"));
    await user.click(pill("Hemma"));
    expect(pill("Hemma")).toHaveAttribute("aria-checked", "true");
    expect(selectPantrySite.mock.calls.map(([input]) => input.id)).toEqual([stugan.id, hemma.id]);

    // The earlier tap fails late: no Notice, no announcement.
    await act(async () => first.resolve(fail("pantry_site_failed")));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => second.resolve(ok({ site: { id: hemma.id, name: "Hemma" } })));
    await waitFor(() => expect(content()).not.toHaveAttribute("inert"));
    expect(announcement()).toHaveTextContent("Valt boende: Hemma.");
    expect(pill("Hemma")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the sheet Boenden with Boenden, and closes it, dropping a name not saved, when Hemma is hidden", async () => {
    const user = userEvent.setup();
    let setShown: (shown: boolean) => void = () => {};
    // A client navigation hides the page with Activity instead of unmounting it.
    function Page() {
      const [shown, show] = useState(true);
      useEffect(() => {
        setShown = show;
      }, []);
      return (
        <Activity mode={shown ? "visible" : "hidden"}>
          <Hemma initial={[hemma, stugan]} />
        </Activity>
      );
    }
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "Hantera boenden" }));
    const sheet = await screen.findByRole("dialog", { name: "Boenden" });
    await user.type(within(sheet).getByLabelText("Nytt boende"), "Torpet");

    act(() => setShown(false));
    act(() => setShown(true));
    expect(screen.queryByRole("dialog", { name: "Boenden" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hantera boenden" }));
    expect(within(await screen.findByRole("dialog", { name: "Boenden" })).getByLabelText("Nytt boende")).toHaveValue("");
  });
});
