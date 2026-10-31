import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { PantrySiteWithCount, SelectedSite } from "../domain/site";
import { AddSiteButton } from "./add-site-button";
import { BoendeVal } from "./boende-val";
import { AddPantryItemButton, PantrySheetProvider } from "./pantry-item-sheet";
import { PantrySuggestionsProvider } from "./pantry-suggestions";
import { SiteSwitch, SiteSwitchProvider } from "./site-switch";

// The boende switch (Story 8.2, the boende menu since Story 16.14) with
// selectPantrySite stubbed. The "server" places do not change unless a test
// says so, so what the menu shows after a tap comes from the optimistic state
// and goes back when the transition ends. The menu is BoendeVal, the page
// content SiteSwitch, and both share the SiteSwitchProvider.

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

function Hemma({ initial, variant = "side" }: { initial: PantrySiteWithCount[]; variant?: "side" | "page" }) {
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
            <BoendeVal variant={variant} sites={sites} loadCounts={loadCounts} />
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

const loadCounts = vi.fn(async () => ({
  [hemma.id]: { items: 12, things: 0, cards: 0 },
  [stugan.id]: { items: 0, things: 18, cards: 1 },
}));
/** The button that opens the menu, named after the boende shown. */
const opener = (name: string) => screen.getByRole("button", { name: `Boende: ${name}` });
/** Opens the menu and taps `name` in it. */
async function choose(user: ReturnType<typeof userEvent.setup>, shown: string, name: string) {
  await user.click(opener(shown));
  await user.click(await screen.findByRole("menuitemradio", { name: new RegExp(name) }));
}
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

describe("SiteSwitch and the boende menu", () => {
  it("shows no button with one place, and Lägg till boende opens the sheet Boenden", async () => {
    const user = userEvent.setup();
    render(<Hemma initial={[hemma]} />);
    expect(screen.queryByRole("button", { name: /^Boende:/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Lägg till boende" }));
    expect(await screen.findByRole("dialog", { name: "Boenden" })).toBeInTheDocument();
  });

  it("shows the selected boende on a button with its name, and no row of pills", () => {
    render(<Hemma initial={[hemma, stugan]} />);
    expect(opener("Hemma")).toHaveTextContent("Hemma");
    expect(opener("Hemma")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radiogroup", { name: "Boende" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hantera boenden" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lägg till boende" })).toBeNull();
  });

  it("opens a popover with each boende, what is in it, a check on the selected one and Hantera boenden", async () => {
    const user = userEvent.setup();
    render(<Hemma initial={[hemma, stugan]} />);
    await user.click(opener("Hemma"));
    const menu = await screen.findByRole("menu", { name: "Boende" });
    const options = within(menu).getAllByRole("menuitemradio");
    expect(options).toHaveLength(2);
    await waitFor(() => expect(options[0]).toHaveTextContent("12 varor"));
    expect(options[1]).toHaveTextContent("18 föremål");
    expect(options[0]).toHaveAttribute("aria-checked", "true");
    expect(options[1]).toHaveAttribute("aria-checked", "false");
    expect(within(menu).getByRole("menuitem", { name: /Hantera boenden/ })).toHaveAttribute("href", "/installningar/boenden");
  });

  it("says Tomt for a boende with nothing in it", async () => {
    const user = userEvent.setup();
    loadCounts.mockResolvedValueOnce({ [hemma.id]: { items: 0, things: 0, cards: 0 }, [stugan.id]: { items: 5, things: 0, cards: 0 } });
    render(<Hemma initial={[hemma, stugan]} />);
    await user.click(opener("Hemma"));
    const menu = await screen.findByRole("menu", { name: "Boende" });
    expect(await within(menu).findByText("Tomt")).toBeInTheDocument();
    expect(within(menu).getByText("5 varor")).toBeInTheDocument();
  });

  it("opens a bottom sheet with the same content on a phone", async () => {
    const user = userEvent.setup();
    render(<Hemma initial={[hemma, stugan]} variant="page" />);
    await user.click(opener("Hemma"));
    const sheet = await screen.findByRole("dialog", { name: "Boende" });
    expect(await within(sheet).findByText("18 föremål")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /Hemma/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("link", { name: /Hantera boenden/ })).toHaveAttribute("href", "/installningar/boenden");
    await user.click(within(sheet).getByRole("button", { name: /Stugan/ }));
    expect(selectPantrySite).toHaveBeenCalledWith({ id: stugan.id });
  });

  it("selects a place at once, keeps the page inert and + unavailable until it is saved, and announces it", async () => {
    const user = userEvent.setup();
    const pending = deferred<Selected>();
    selectPantrySite.mockImplementationOnce(() => pending.promise);
    render(<Hemma initial={[hemma, stugan]} />);

    await choose(user, "Hemma", "Stugan");
    // The menu closes, and the button already shows the new boende.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(opener("Stugan")).toBeDisabled();
    expect(selectPantrySite).toHaveBeenCalledWith({ id: stugan.id });
    expect(content()).toHaveAttribute("inert");
    expect(content()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Lägg till vara" })).toBeDisabled();

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
    expect(opener("Stugan")).toBeEnabled();
    expect(content()).toHaveTextContent("Platskorten för Stugan");
    expect(announcement()).toHaveTextContent("Valt boende: Stugan.");
    expect(screen.getByRole("button", { name: "Lägg till vara" })).toBeEnabled();
  });

  it("keeps the button unavailable until hydration", () => {
    const html = renderToString(<Hemma initial={[hemma, stugan]} />);
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(within(container).getByRole("button", { name: "Boende: Hemma" })).toBeDisabled();
  });

  it("goes back to the place it was and shows a Notice when the selection fails", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_failed"));
    render(<Hemma initial={[hemma, stugan]} />);

    await choose(user, "Hemma", "Stugan");
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
    await waitFor(() => expect(opener("Hemma")).toBeInTheDocument());
    expect(content()).not.toHaveAttribute("inert");
    expect(announcement()).toHaveTextContent("");
    expect(refresh).toHaveBeenCalled();
  });

  it("treats no answer as a failure", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockRejectedValue(new Error("offline"));
    render(<Hemma initial={[hemma, stugan]} />);
    await choose(user, "Hemma", "Stugan");
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
    await waitFor(() => expect(opener("Hemma")).toBeInTheDocument());
  });

  it("says the place is gone, and reads the page again", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_gone"));
    render(<Hemma initial={[hemma, stugan]} />);
    await choose(user, "Hemma", "Stugan");
    expect(await screen.findByRole("alert")).toHaveTextContent("Boendet finns inte längre. Välj ett annat boende.");
    expect(refresh).toHaveBeenCalled();
  });

  it("does not save the boende that is already selected", async () => {
    const user = userEvent.setup();
    render(<Hemma initial={[hemma, stugan]} />);
    await choose(user, "Hemma", "Hemma");
    expect(selectPantrySite).not.toHaveBeenCalled();
  });

  it("closes the sheet Boenden, dropping a name not saved, when Hemma is hidden", async () => {
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
          <Hemma initial={[hemma]} />
        </Activity>
      );
    }
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "Lägg till boende" }));
    const sheet = await screen.findByRole("dialog", { name: "Boenden" });
    await user.type(within(sheet).getByLabelText("Nytt boende"), "Torpet");

    act(() => setShown(false));
    act(() => setShown(true));
    expect(screen.queryByRole("dialog", { name: "Boenden" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Lägg till boende" }));
    expect(within(await screen.findByRole("dialog", { name: "Boenden" })).getByLabelText("Nytt boende")).toHaveValue("");
  });
});
